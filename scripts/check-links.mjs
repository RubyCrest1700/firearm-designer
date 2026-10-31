// Checks every outbound link on the site: retailer product pages, retailer search links, and the sources
// cited in warnings and FAQ pages. Run by .github/workflows/check-links.yml after `npm run build`.
// Same manners as the price job: robots.txt respected, one request per host every few seconds.
// Fails only on links that are really gone (404/410, or the address no longer exists). Retailers that block
// bots (403/429), and store search pages that answer the checker with a 404, can't be checked from here and are
// listed separately.
//
//   node scripts/check-links.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { robotsGate } from './robots.mjs';
import { blockedKind } from './robots.mjs';
import { readNoFetchHosts } from './sources.mjs';

const USER_AGENT = 'FirearmDesignerLinkCheck/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const HOST_DELAY_MS = 3000;
/** Our own services and third-party assets aren't outbound links. */
const SKIP = /^https:\/\/(dropinbuilds\.com|share\.dropinbuilds\.com|[^/]*\.workers\.dev|fonts\.(googleapis|gstatic)\.com|static\.cloudflareinsights\.com|schema\.org|www\.w3\.org|github\.com\/RubyCrest1700)/;
const URL_RE = /https:\/\/[^\s'"`<>)\\]+/g;
/** Paused and links-only retailers in data/sources.json aren't fetched at all, search links included (scripts/sources.mjs). */
const NO_FETCH_HOSTS = readNoFetchHosts();

/** Store search pages (src/data/retailers.ts) always exist; a 404 there means the store turned the checker away. */
const SEARCH_PREFIXES = [...readFileSync('src/data/retailers.ts', 'utf8').matchAll(/search: '(https:[^']+)'/g)].map((m) => m[1]);
const isSearch = (url) => SEARCH_PREFIXES.some((p) => url.startsWith(p));

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const decode = (s) => s.replace(/&amp;/g, '&');

const where = new Map();
const add = (url, from) => {
  url = decode(url).replace(/[.,;]+$/, '');
  if (SKIP.test(url) || /\$\{|=$/.test(url) || !/^https:\/\/[^/]+\.[a-z]{2,}/.test(url)) return; // template pieces, bare search prefixes, examples in comments
  if (NO_FETCH_HOSTS.has(new URL(url).host)) return;
  if (!where.has(url)) where.set(url, new Set());
  where.get(url).add(from);
};
for (const f of [...files('src'), ...files('data')].filter((f) => /\.(ts|tsx|json)$/.test(f)))
  for (const m of readFileSync(f, 'utf8').matchAll(URL_RE)) add(m[0], f);
for (const f of files('dist').filter((f) => f.endsWith('.html')))
  for (const m of readFileSync(f, 'utf8').matchAll(/href="(https:\/\/[^"]+)"/g)) add(m[1], f.replace(/^dist/, 'site'));

const lastHit = new Map();
/** One request per host every HOST_DELAY_MS, redirect hops and robots.txt included. robotsGate sets `redirect`. */
async function politeFetch(url, init = {}) {
  const u = new URL(url);
  // A loop, since a busy event loop can fire a timer a few ms early.
  for (let wait; (wait = (lastHit.get(u.host) ?? 0) + HOST_DELAY_MS - Date.now()) > 0; ) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  return fetch(url, { method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' }, ...init, signal: AbortSignal.timeout(20000) });
}
// robots.txt is checked for every link and redirect hop; an unreadable one (5xx, 401, 403, 429, unreachable, timeout)
// means the link is skipped, not fetched (scripts/robots.mjs).
const { safeGet } = robotsGate({ get: politeFetch, agent: USER_AGENT });

const result = { ok: [], broken: [], home: [], blocked: [], unreadable: [], offsite: [], skipped: [] };
// One queue per host, run side by side.
const byHost = new Map();
for (const url of where.keys()) {
  const h = new URL(url).host;
  byHost.set(h, [...(byHost.get(h) ?? []), url]);
}
await Promise.all([...byHost.values()].map(async (urls) => {
  for (const url of urls) {
    try {
      const got = await safeGet(url);
      if (got.blocked) {
        // A host that no longer exists can't serve robots.txt either: that link is broken, not skipped. A robots.txt
        // that can't be read (403, 5xx, timeout) is listed apart from a plain Disallow.
        const kind = blockedKind(got);
        if (kind === 'broken') result.broken.push([url, 'site no longer exists']);
        else if (kind === 'unreadable') result.unreadable.push([url, `${new URL(got.blocked).host}: ${got.why}`]);
        else result.skipped.push(url);
        continue;
      }
      if (got.offsite) { result.offsite.push([url, `${got.why} (${got.offsite})`]); continue; }
      const { res } = got;
      res.body?.cancel();
      const landed = new URL(got.url);
      if ((res.status === 404 || res.status === 410) && !isSearch(url)) result.broken.push([url, `HTTP ${res.status}`]);
      else if (!res.ok) result.blocked.push([url, `HTTP ${res.status}`]);
      else if (landed.pathname === '/' && new URL(url).pathname !== '/') result.home.push([url, `lands on ${landed.origin}/`]);
      else result.ok.push(url);
    } catch (err) {
      const code = err.cause?.code ?? (err.name === 'Error' ? err.message : err.name);
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
console.log(`Not checked, paused or links only in data/sources.json: ${[...NO_FETCH_HOSTS].join(', ') || 'none'}.`);
console.log(`Checked ${where.size} outbound links: ${result.ok.length} work, ${result.broken.length} broken, ${result.home.length} land on a home page, ${result.blocked.length} couldn't be checked (site blocks bots or timed out), ${result.unreadable.length} not checked because robots.txt couldn't be read, ${result.offsite.length} redirect off-site, ${result.skipped.length} skipped by robots.txt.`);
show('Broken', result.broken);
show('Land on the home page (product may be gone)', result.home);
show("Couldn't check", result.blocked);
show("robots.txt couldn't be read (treated as Disallow)", result.unreadable);
show('Redirect to another site (not followed)', result.offsite);
if (result.skipped.length) console.log(`\nSkipped by robots.txt (${result.skipped.length}): mostly retailer search links, which open fine for people.`);
// On GitHub, also list each broken link as an error on the run, so it shows on the pull request itself.
if (process.env.GITHUB_ACTIONS) for (const [url, why] of result.broken) console.log(`::error title=Broken link::${url} (${why}) used in ${[...where.get(url)].slice(0, 3).join(', ')}`);
process.exitCode = result.broken.length ? 1 : 0;
