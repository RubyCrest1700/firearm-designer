// Reads listed product weights from the tracked product pages in data/sources.json, with the same manners as
// the price job (robots.txt respected, one request per host every few seconds). It only reports what it finds:
// weights are reviewed and moved into data/weights.json by hand through a pull request.
//
//   node scripts/read-weights.mjs   # prints one line per page and writes weights-found.json

import { readFileSync, writeFileSync } from 'node:fs';
import { extractWeight } from './extract-price.mjs';
import { parseRobots, isAllowed } from './robots.mjs';

const USER_AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const HOST_DELAY_MS = 5000;
const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')).parts ?? {};
const current = JSON.parse(readFileSync('data/weights.json', 'utf8')).parts ?? {};

const robotsCache = new Map();
const lastHit = new Map();
async function politeFetch(url) {
  const u = new URL(url);
  const wait = (lastHit.get(u.host) ?? 0) + HOST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  return fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
}
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const res = await politeFetch(`${u.origin}/robots.txt`);
      if (res.ok) rules = parseRobots(await res.text(), USER_AGENT);
    } catch { /* no robots.txt */ }
    robotsCache.set(u.origin, rules);
  }
  return isAllowed(robotsCache.get(u.origin), u.pathname + u.search);
}

const found = {};
for (const [partId, byRetailer] of Object.entries(sources)) {
  for (const url of Object.values(byRetailer)) {
    if (found[partId]) break;
    try {
      if (!(await allowed(url))) { console.log(`${partId}\tblocked by robots.txt\t${url}`); continue; }
      const res = await politeFetch(url);
      if (!res.ok) { console.log(`${partId}\tHTTP ${res.status}\t${url}`); continue; }
      const oz = extractWeight(await res.text());
      if (oz) found[partId] = { oz, basis: 'published', src: url };
      console.log(`${partId}\t${oz ? `${oz} oz (estimate was ${current[partId]?.oz ?? '?'})` : 'no weight on page'}\t${url}`);
    } catch (err) {
      console.log(`${partId}\t${err.message}\t${url}`);
    }
  }
}
writeFileSync('weights-found.json', JSON.stringify(found, null, 1) + '\n');
console.log(`\nFound listed weights for ${Object.keys(found).length} of ${Object.keys(sources).length} tracked parts.`);
console.log('WEIGHTS_JSON ' + JSON.stringify(found));
