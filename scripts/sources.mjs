// Which product links the scripts may read. data/sources.json keeps every link, and its "paused" object lists
// retailers we've stopped reading for now ({ "PA": "2026-10-22: why" }). The price job, the link check and the
// weight reader all go through here, so a paused retailer's pages and search links are never fetched. The site
// leaves the same retailers' prices out (src/data/helpers.ts). Delete an entry from "paused" to resume.

import { readFileSync } from 'node:fs';

/** Retailer ids and search-link templates, read from src/data/retailers.ts (the scripts don't bundle TypeScript). */
export function retailersFrom(text) {
  const out = {};
  for (const m of text.matchAll(/(\w+): \{ id: '(\w+)', name: (?:'[^']*'|"[^"]*"), search: '(https:[^']+)' \}/g)) out[m[2]] = { id: m[2], search: m[3] };
  return out;
}

export const readRetailers = () => retailersFrom(readFileSync('src/data/retailers.ts', 'utf8'));

/** The paused retailer ids. Throws on an id that isn't a retailer, so a typo can't leave a store running. */
export function pausedIds(sources, retailers) {
  const ids = Object.keys(sources.paused ?? {});
  const unknown = ids.filter((id) => !retailers[id]);
  if (unknown.length) throw new Error(`data/sources.json "paused" names unknown retailer${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} (see src/data/retailers.ts)`);
  return new Set(ids);
}

/** sources.parts without the paused retailers' links: { "<partId>": { "<retailer>": url } }. */
export function activeSources(sources, retailers) {
  const paused = pausedIds(sources, retailers);
  const out = {};
  for (const [partId, byRetailer] of Object.entries(sources.parts ?? {})) {
    const kept = Object.entries(byRetailer).filter(([r]) => !paused.has(r));
    if (kept.length) out[partId] = Object.fromEntries(kept);
  }
  return out;
}

/** Hosts of the paused retailers: their search links and every product link we hold for them. */
export function pausedHosts(sources, retailers) {
  const paused = pausedIds(sources, retailers);
  const hosts = new Set([...paused].map((id) => new URL(retailers[id].search).host));
  for (const byRetailer of Object.values(sources.parts ?? {}))
    for (const [r, url] of Object.entries(byRetailer)) if (paused.has(r)) hosts.add(new URL(url).host);
  return hosts;
}
