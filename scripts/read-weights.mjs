// Reads listed product weights from the tracked product pages in data/sources.json, with the same manners as
// the price job (robots.txt respected, one request per host every few seconds). It only reports what it finds:
// weights are reviewed and moved into data/weights.json by hand through a pull request.
//
//   node scripts/read-weights.mjs   # prints one line per page and writes weights-found.json

import { readFileSync, writeFileSync } from 'node:fs';
import { extractWeight } from './extract-price.mjs';
import { robotsGate } from './robots.mjs';
import { readActiveSources } from './sources.mjs';

const USER_AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const HOST_DELAY_MS = 5000;
// Paused retailers ("paused" in data/sources.json) are left out.
const sources = readActiveSources();
const current = JSON.parse(readFileSync('data/weights.json', 'utf8')).parts ?? {};

const lastHit = new Map();
/** One request per host every HOST_DELAY_MS, redirect hops and robots.txt included. robotsGate sets `redirect`. */
async function politeFetch(url, init = {}) {
  const u = new URL(url);
  const wait = (lastHit.get(u.host) ?? 0) + HOST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  return fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }, ...init, signal: AbortSignal.timeout(20000) });
}
// robots.txt is checked for every page and redirect hop; an unreadable one blocks the host (scripts/robots.mjs).
const { safeGet } = robotsGate({ get: politeFetch, agent: USER_AGENT });

const found = {};
for (const [partId, byRetailer] of Object.entries(sources)) {
  for (const url of Object.values(byRetailer)) {
    if (found[partId]) break;
    try {
      const got = await safeGet(url);
      if (got.blocked) { console.log(`${partId}\tblocked (${got.why})\t${got.blocked}${got.blocked !== url ? ` (redirected from ${url})` : ''}`); continue; }
      const { res } = got;
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
