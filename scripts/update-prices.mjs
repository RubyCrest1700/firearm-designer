// Nightly price job. Reads product page URLs from data/sources.json, fetches each page
// politely (robots.txt respected, one request per host every few seconds, a few hosts at a time),
// extracts the price, and writes data/prices.json. Run by .github/workflows/deploy.yml on a schedule.
//
//   node scripts/update-prices.mjs            # update everything
//   node scripts/update-prices.mjs --dry-run  # print results, don't write

import { readFileSync, writeFileSync } from 'node:fs';
import { extractPrice, implausiblePrice } from './extract-price.mjs';
import { parseRobots, isAllowed } from './robots.mjs';
import { recordHistory, formatHistory } from './price-history.mjs';

const USER_AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const HOST_DELAY_MS = 5000;
const HOSTS_AT_ONCE = 6;
const KEEP_STALE_DAYS = 7;
const dryRun = process.argv.includes('--dry-run');

const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')).parts ?? {};
const previous = JSON.parse(readFileSync('data/prices.json', 'utf8'));
const now = new Date();

const robotsCache = new Map();
const lastHit = new Map();

async function politeFetch(url) {
  const u = new URL(url);
  // A loop, since a busy event loop can fire a timer a few ms early.
  for (let wait; (wait = (lastHit.get(u.host) ?? 0) + HOST_DELAY_MS - Date.now()) > 0; ) await new Promise((r) => setTimeout(r, wait));
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

const report = { ok: 0, blocked: 0, failed: 0, kept: 0, rejected: 0 };

async function readOffer(partId, retailer, url) {
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
      const before = previous.offers?.[partId] ?? {};
      const odd = implausiblePrice(found.price, {
        last: before[retailer]?.price,
        others: Object.entries(before).filter(([r]) => r !== retailer).map(([, o]) => o.price),
      });
      if (odd) { report.rejected++; throw new Error(`ignored, looks like a misread: ${odd}`); }
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
  return entry;
}

// Each host gets its own queue, read one page at a time with HOST_DELAY_MS between requests. Up to
// HOSTS_AT_ONCE hosts run side by side, busiest first, so the longest queue starts right away.
const jobs = Object.entries(sources).flatMap(([partId, byRetailer]) => Object.entries(byRetailer).map(([retailer, url]) => ({ partId, retailer, url })));
const byHost = new Map();
for (const job of jobs) {
  const host = new URL(job.url).host;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(job);
}
const queues = [...byHost.values()].sort((a, b) => b.length - a.length);
await Promise.all(Array.from({ length: Math.min(HOSTS_AT_ONCE, queues.length) }, async () => {
  for (let queue; (queue = queues.shift()); ) for (const job of queue) job.entry = await readOffer(job.partId, job.retailer, job.url);
}));

// Written in sources.json order, so the nightly diff only shows real changes.
const offers = {};
for (const { partId, retailer, entry } of jobs) if (entry) (offers[partId] ??= {})[retailer] = entry;

const out = { updatedAt: report.ok ? now.toISOString() : previous.updatedAt ?? null, offers };
console.log(`\nDone: ${report.ok} updated, ${report.kept} kept from last run, ${report.failed} failed (${report.rejected} of them ignored as likely misreads), ${report.blocked} blocked by robots.txt`);
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
