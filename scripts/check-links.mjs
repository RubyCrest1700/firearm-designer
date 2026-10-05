// Checks every outbound link on the site: retailer product pages, retailer search links, and the sources
// cited in warnings and FAQ pages. Run by .github/workflows/check-links.yml after `npm run build`.
// Same manners as the price job: robots.txt respected, one request per host every few seconds.
// Fails only on links that are really gone (404/410, or the address no longer exists). Retailers that block
// bots (403/429) can't be checked from here and are listed separately.
//
//   node scripts/check-links.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseRobots, isAllowed } from './robots.mjs';

const USER_AGENT = 'FirearmDesignerLinkCheck/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const HOST_DELAY_MS = 3000;
/** Our own services and third-party assets aren't outbound links. */
const SKIP = /^https:\/\/(dropinbuilds\.com|share\.dropinbuilds\.com|[^/]*\.workers\.dev|fonts\.(googleapis|gstatic)\.com|static\.cloudflareinsights\.com|schema\.org|www\.w3\.org|github\.com\/RubyCrest1700)/;
const URL_RE = /https:\/\/[^\s'"`<>)\\]+/g;

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const decode = (s) => s.replace(/&amp;/g, '&');

const where = new Map();
const add = (url, from) => {
  url = decode(url).replace(/[.,;]+$/, '');
  if (SKIP.test(url) || /\$\{|=$/.test(url) || !/^https:\/\/[^/]+\.[a-z]{2,}/.test(url)) return; // template pieces, bare search prefixes, examples in comments
  if (!where.has(url)) where.set(url, new Set());
  where.get(url).add(from);
};
for (const f of [...files('src'), ...files('data')].filter((f) => /\.(ts|tsx|json)$/.test(f)))
  for (const m of readFileSync(f, 'utf8').matchAll(URL_RE)) add(m[0], f);
for (const f of files('dist').filter((f) => f.endsWith('.html')))
  for (const m of readFileSync(f, 'utf8').matchAll(/href="(https:\/\/[^"]+)"/g)) add(m[1], f.replace(/^dist/, 'site'));

const robotsCache = new Map();
const lastHit = new Map();
async function politeFetch(url, method = 'GET') {
  const u = new URL(url);
  const wait = (lastHit.get(u.host) ?? 0) + HOST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  return fetch(url, { method, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
}
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const res = await politeFetch(`${u.origin}/robots.txt`);
      if (res.ok) rules = parseRobots(await res.text(), USER_AGENT);
    } catch { /* no robots.txt: no rules */ }
    robotsCache.set(u.origin, rules);
  }
  return isAllowed(robotsCache.get(u.origin), u.pathname + u.search);
}

const result = { ok: [], broken: [], home: [], blocked: [], skipped: [] };
// One queue per host, run side by side.
const byHost = new Map();
for (const url of where.keys()) {
  const h = new URL(url).host;
  byHost.set(h, [...(byHost.get(h) ?? []), url]);
}
await Promise.all([...byHost.values()].map(async (urls) => {
  for (const url of urls) {
    try {
      if (!(await allowed(url))) { result.skipped.push(url); continue; }
      const res = await politeFetch(url);
      res.body?.cancel();
      const landed = new URL(res.url);
      if (res.status === 404 || res.status === 410) result.broken.push([url, `HTTP ${res.status}`]);
      else if (!res.ok) result.blocked.push([url, `HTTP ${res.status}`]);
      else if (landed.pathname === '/' && new URL(url).pathname !== '/') result.home.push([url, `lands on ${landed.origin}/`]);
      else result.ok.push(url);
    } catch (err) {
      const code = err.cause?.code ?? err.name;
      if (code === 'ENOTFOUND') result.broken.push([url, 'site no longer exists']);
      else result.blocked.push([url, String(code)]);
    }
  }
}));

const show = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title} (${list.length})`);
  for (const [url, why] of list) console.log(`  ${url}\n    ${why}; used in ${[...where.get(url)].join(', ')}`);
};
console.log(`Checked ${where.size} outbound links: ${result.ok.length} work, ${result.broken.length} broken, ${result.home.length} land on a home page, ${result.blocked.length} couldn't be checked (site blocks bots or timed out), ${result.skipped.length} skipped by robots.txt.`);
show('Broken', result.broken);
show('Land on the home page (product may be gone)', result.home);
show("Couldn't check", result.blocked);
if (result.skipped.length) console.log(`\nSkipped by robots.txt (${result.skipped.length}): mostly retailer search links, which open fine for people.`);
process.exitCode = result.broken.length ? 1 : 0;
