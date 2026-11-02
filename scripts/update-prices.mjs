// Nightly price job. Reads product page URLs from data/sources.json, fetches each page
// politely (robots.txt respected, one request per host every few seconds, a few hosts at a time),
// extracts the price, and writes data/prices.json. Run by .github/workflows/deploy.yml on a schedule.
//
//   node scripts/update-prices.mjs            # update everything
//   node scripts/update-prices.mjs --dry-run  # print results, don't write

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { extractPrice, implausiblePrice } from './extract-price.mjs';
import { firstReadHold, formatHolds, holdKey, holdsSummary, mergeHolds, readEstimates, readHolds, readJsonObject } from './first-read-guard.mjs';
import { robotsGate } from './robots.mjs';
import { readPage } from './robots.mjs';
import { recordHistory, formatHistory } from './price-history.mjs';
import { readFetchableSources } from './sources.mjs';
import { readNoFetchHosts } from './sources.mjs';
import { readPausedIds } from './sources.mjs';

const USER_AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const HOST_DELAY_MS = 5000;
const HOSTS_AT_ONCE = 6;
const KEEP_STALE_DAYS = 7;
const dryRun = process.argv.includes('--dry-run');

// Paused retailers ("paused" in data/sources.json) are left out: their pages aren't read and their prices drop out.
// Links-only retailers ("linksOnly") are left out too: no request goes to them, and the site keeps their Sample prices.
const sources = readFetchableSources();
// A second lock at request time: no request, redirect hop or robots.txt reaches these hosts (scripts/sources.mjs).
const NO_FETCH_HOSTS = readNoFetchHosts();
const previous = JSON.parse(readFileSync('data/prices.json', 'utf8'));
const now = new Date();

// What the first-read guard needs. None of these can stop the night: a file that's missing or broken gets a warning,
// and any pair left with no baseline is held and logged, which is the cautious outcome (scripts/first-read-guard.mjs).
const warnings = [];
function loaded(file, reader) {
  const { value, problem } = reader(() => readFileSync(file, 'utf8'));
  if (problem) {
    warnings.push(`${file} ${problem}. Pairs that needed it may be held.`);
    console.log(`::warning::${warnings.at(-1)}`);
  }
  return value;
}
const guardData = {
  approvals: loaded('data/price-approvals.json', readJsonObject),
  history: loaded('data/price-history.json', readJsonObject),
  listPrices: loaded('data/list-prices.json', readJsonObject),
  estimates: loaded('data/estimates.json', readEstimates),
  paused: readPausedIds(),
};
const previousHolds = loaded('data/price-holds.json', readHolds);
const held = [];
const passed = new Set();

const lastHit = new Map();

/** One request per host every HOST_DELAY_MS, every redirect hop and robots.txt included. robotsGate sets `redirect`. */
async function politeFetch(url, init = {}) {
  const u = new URL(url);
  if (NO_FETCH_HOSTS.has(u.host)) throw new Error(`no-fetch host ${u.host}`);
  // A loop, since a busy event loop can fire a timer a few ms early.
  for (let wait; (wait = (lastHit.get(u.host) ?? 0) + HOST_DELAY_MS - Date.now()) > 0; ) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  return fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, ...init, signal: AbortSignal.timeout(20000) });
}

// robots.txt is checked for every page and every redirect hop before it's requested; an unreadable robots.txt (5xx,
// 401, 403, 429, unreachable, timeout) blocks the host (scripts/robots.mjs).
const { safeGet } = robotsGate({ get: politeFetch, agent: USER_AGENT });

const report = { ok: 0, blocked: 0, offsite: 0, failed: 0, kept: 0, rejected: 0, held: 0 };

async function readOffer(partId, retailer, url) {
  let entry = null;
  try {
    const got = await safeGet(url);
    if (got.blocked) {
      report.blocked++;
      console.log(`${got.why}: ${got.blocked}${got.blocked !== url ? ` (redirected from ${url})` : ''}`);
    } else if (got.offsite) {
      // Another site's page isn't this retailer's price: nothing is recorded from it.
      report.offsite++;
      console.log(`${partId} @ ${retailer}: ${got.why} (${got.offsite}), not read`);
    } else {
      const { res } = got;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const found = extractPrice(await readPage(res));
      if (!found) throw new Error('no price found on page');
      const before = previous.offers?.[partId] ?? {};
      const odd = implausiblePrice(found.price, {
        last: before[retailer]?.price,
        others: Object.entries(before).filter(([r]) => r !== retailer).map(([, o]) => o.price),
      });
      if (odd) { report.rejected++; throw new Error(`ignored, looks like a misread: ${odd}`); }
      const hold = firstReadHold({ part: partId, store: retailer, price: found.price, hadOffer: Boolean(before[retailer]) }, guardData);
      if (hold) {
        held.push(hold);
        report.held++;
        console.log(`${partId} @ ${retailer}: $${found.price} held for review, ${hold.baseline === null ? 'no baseline' : `more than 40% from its ${hold.baselineType} baseline $${hold.baseline}`}`);
      } else {
        entry = { price: found.price, inStock: found.inStock, url, checkedAt: now.toISOString() };
        passed.add(holdKey(partId, retailer));
        report.ok++;
        console.log(`${partId} @ ${retailer}: $${found.price}${found.inStock ? '' : ' (out of stock)'}`);
      }
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
// Only links we may read count as tracked, so a hold whose link is gone, paused or links only drops out.
const holds = mergeHolds(previousHolds, { held, passed, tracked: new Set(jobs.map((j) => holdKey(j.partId, j.retailer))), day: now.toISOString().slice(0, 10) });
const summary = holdsSummary(holds, warnings);
console.log(`\nDone: ${report.ok} updated, ${report.kept} kept from last run, ${report.held} held for review, ${report.failed} failed (${report.rejected} of them ignored as likely misreads), ${report.blocked} blocked by robots.txt, ${report.offsite} redirected off-site`);
if (summary) console.log(`\n${summary}`);
if (!dryRun) {
  writeFileSync('data/prices.json', JSON.stringify(out, null, 2) + '\n');
  writeFileSync('data/price-holds.json', formatHolds(holds));
  // The owner's nightly notice in the Actions run. Losing it is no reason to lose the night's prices.
  if (summary && process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary); } catch (err) { console.log(`::warning::step summary not written: ${err.message}`); }
  }
  // History records what the site shows: the lowest over every offer written, kept ones included. Leaving out a
  // kept price would log a false rise whenever the cheapest store's read fails for a night.
  let history = null;
  try { history = JSON.parse(readFileSync('data/price-history.json', 'utf8')); } catch { /* first run */ }
  writeFileSync('data/price-history.json', formatHistory(recordHistory(history, offers, now)));
}
