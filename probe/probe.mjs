// Temporary: checks which stores the price job can read from GitHub's runners. Not merged.
import { readFileSync } from 'node:fs';
import { extractPrice } from '../scripts/extract-price.mjs';
import { parseRobots, isAllowed } from '../scripts/robots.mjs';
const UA = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const get = (u) => fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
for (const url of readFileSync('probe/urls.txt', 'utf8').split('\n').filter(Boolean)) {
  const u = new URL(url);
  let line = u.host;
  try {
    let rules = [];
    const r = await get(`${u.origin}/robots.txt`).catch(() => null);
    if (r?.ok) rules = parseRobots(await r.text(), UA);
    line += ` robots=${r?.status ?? 'err'} allowed=${isAllowed(rules, u.pathname + u.search)}`;
    const res = await get(url);
    const html = await res.text();
    const p = extractPrice(html);
    const ld = (html.match(/application\/ld\+json/g) ?? []).length;
    line += ` http=${res.status} len=${html.length} ld=${ld} price=${p ? p.price + (p.inStock ? '' : ' OOS') : 'none'}`;
    if (!p && res.ok) {
      const i = html.search(/"price"|itemprop="price"|price:amount|data-price/i);
      line += ` hint=${i < 0 ? 'no price markers' : JSON.stringify(html.slice(Math.max(0, i - 120), i + 120))}`;
    }
  } catch (e) { line += ` error=${e.message}`; }
  console.log(line);
  await new Promise((r) => setTimeout(r, 1500));
}
