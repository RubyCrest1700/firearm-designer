// Temporary: verifies candidate product links from GitHub's runners. Not merged.
import { readFileSync } from 'node:fs';
import { extractPrice } from '../scripts/extract-price.mjs';
import { parseRobots, isAllowed } from '../scripts/robots.mjs';
const UA = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const get = (u) => fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
const cand = JSON.parse(readFileSync('probe/candidates.json', 'utf8'));
const jobs = Object.entries(cand).flatMap(([id, by]) => Object.entries(by).map(([r, url]) => ({ id, r, url })));
const byHost = new Map();
for (const j of jobs) { const h = new URL(j.url).host; if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(j); }
const robots = new Map();
await Promise.all([...byHost.entries()].map(async ([host, list]) => {
  for (const { id, r, url } of list) {
    const u = new URL(url);
    const out = { id, r, url };
    try {
      if (!robots.has(u.origin)) {
        const rr = await get(`${u.origin}/robots.txt`).catch(() => null);
        robots.set(u.origin, rr?.ok ? parseRobots(await rr.text(), UA) : []);
        await new Promise((s) => setTimeout(s, 3000));
      }
      out.allowed = isAllowed(robots.get(u.origin), u.pathname + u.search);
      if (out.allowed) {
        const res = await get(url);
        out.status = res.status; out.final = res.url;
        const html = await res.text();
        out.title = (html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim().slice(0, 140);
        out.price = extractPrice(html);
      }
    } catch (e) { out.error = e.message; }
    console.log('PROBE ' + JSON.stringify(out));
    await new Promise((s) => setTimeout(s, 3000));
  }
}));
