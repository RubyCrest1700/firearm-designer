// Nightly price job. Reads product page URLs from data/sources.json, fetches each page
// politely (robots.txt respected, one request per host every few seconds), extracts the
// price, and writes data/prices.json. Run by .github/workflows/deploy.yml on a schedule.
//
//   node scripts/update-prices.mjs            # update everything
//   node scripts/update-prices.mjs --dry-run  # print results, don't write

import { readFileSync, writeFileSync } from 'node:fs';
import { extractPrice } from './extract-price.mjs';
import { parseRobots, isAllowed } from './robots.mjs';
import { recordHistory, formatHistory } from './price-history.mjs';

const USER_AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const HOST_DELAY_MS = 5000;
const KEEP_STALE_DAYS = 7;
const dryRun = process.argv.includes('--dry-run');

const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')).parts ?? {};
const previous = JSON.parse(readFileSync('data/prices.json', 'utf8'));
const now = new Date();

const robotsCache = new Map();
const lastHit = new Map();

async function politeFetch(url) {
  const u = new URL(url);
  const wait = (lastHit.get(u.host) ?? 0) + HOST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  return fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
}

async function allowedByRobots(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const res = await politeFetch(`${u.origin}/robots.txt`);
      if (res.ok) rules = parseRobots(await res.text(), USER_AGENT);
    } catch {
      /* unreachable robots.txt: treat as no rules */
    }
    robotsCache.set(u.origin, rules);
  }
  return isAllowed(robotsCache.get(u.origin), u.pathname + u.search);
}

const offers = {};
const report = { ok: 0, blocked: 0, failed: 0, kept: 0 };

for (const [partId, byRetailer] of Object.entries(sources)) {
  for (const [retailer, url] of Object.entries(byRetailer)) {
    let entry = null;
    try {
      if (!(await allowedByRobots(url))) {
        report.blocked++;
        console.log(`robots.txt disallows ${url}`);
      } else {
        const res = await politeFetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const found = extractPrice(await res.text());
        if (!found) throw new Error('no price found on page');
        entry = { price: found.price, inStock: found.inStock, url, checkedAt: now.toISOString() };
        report.ok++;
        console.log(`${partId} @ ${retailer}: $${found.price}${found.inStock ? '' : ' (out of stock)'}`);
      }
    } catch (err) {
      report.failed++;
      console.log(`${partId} @ ${retailer}: ${err.message}`);
    }
    if (!entry) {
      // Keep a recent previous price rather than dropping back to sample data.
      const old = previous.offers?.[partId]?.[retailer];
      if (old && now - new Date(old.checkedAt) < KEEP_STALE_DAYS * 864e5) {
        entry = old;
        report.kept++;
      }
    }
    if (entry) (offers[partId] ??= {})[retailer] = entry;
  }
}

const out = { updatedAt: report.ok ? now.toISOString() : previous.updatedAt ?? null, offers };
console.log(`\nDone: ${report.ok} updated, ${report.kept} kept from last run, ${report.failed} failed, ${report.blocked} blocked by robots.txt`);
if (!dryRun) {
  writeFileSync('data/prices.json', JSON.stringify(out, null, 2) + '\n');
  // Only fresh reads go into the history; a price kept from an earlier night is already recorded.
  const fresh = Object.fromEntries(
    Object.entries(offers).map(([id, byR]) => [id, Object.fromEntries(Object.entries(byR).filter(([, o]) => o.checkedAt === now.toISOString()))]),
  );
  let history = null;
  try { history = JSON.parse(readFileSync('data/price-history.json', 'utf8')); } catch { /* first run */ }
  writeFileSync('data/price-history.json', formatHistory(recordHistory(history, fresh, now)));
}
