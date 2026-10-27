// Which product links the scripts may read. data/sources.json keeps every link, and its "paused" object lists
// retailers we've stopped reading for now ({ "PA": { "since": "2026-10-22", "reason": "why" } }). The price job, the
// link check and the weight reader all go through here (readActiveSources, readPausedHosts), so a paused retailer's
// pages and search links are never fetched. The site leaves the same retailers' prices out (src/data/helpers.ts), and
// the price history up to the pause date for the parts they priced (src/data/history.ts). Delete an entry from
// "paused" to resume.

import { readFileSync } from 'node:fs';
import { registrableDomain } from './domains.mjs';

/** Retailer ids and search-link templates, read from src/data/retailers.ts (the scripts don't bundle TypeScript). */
export function retailersFrom(text) {
  const out = {};
  for (const m of text.matchAll(/(\w+): \{ id: '(\w+)', name: (?:'[^']*'|"[^"]*"), search: '(https:[^']+)' \}/g)) out[m[2]] = { id: m[2], search: m[3] };
  return out;
}

export const readRetailers = () => retailersFrom(readFileSync('src/data/retailers.ts', 'utf8'));

/** A real calendar day written YYYY-MM-DD. */
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * The paused retailer ids. Throws on an id that isn't a retailer, so a typo can't leave a store running, and on an
 * entry without a pause date ("since", YYYY-MM-DD) and a reason, since the site needs the date to drop old history.
 */
export function pausedIds(sources, retailers) {
  const ids = Object.keys(sources.paused ?? {});
  const unknown = ids.filter((id) => !retailers[id]);
  if (unknown.length) throw new Error(`data/sources.json "paused" names unknown retailer${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} (see src/data/retailers.ts)`);
  const bad = ids.filter((id) => { const e = sources.paused[id]; return !e || !isDay(e.since) || typeof e.reason !== 'string' || !e.reason.trim(); });
  if (bad.length) throw new Error(`data/sources.json "paused" entry for ${bad.join(', ')} needs { "since": "YYYY-MM-DD", "reason": "..." }`);
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

/**
 * The hosts we hold links for, where `has(host)` is also true for any other host on the same registrable domain, so a
 * paused retailer's blog or help pages (blog.primaryarms.com) are skipped like its store.
 */
class SiteHosts extends Set {
  has(host) {
    if (super.has(host)) return true;
    const site = registrableDomain(host);
    for (const h of this) if (registrableDomain(h) === site) return true;
    return false;
  }
}

/** Hosts of the paused retailers: their search links and every product link we hold for them, and their whole sites. */
export function pausedHosts(sources, retailers) {
  const paused = pausedIds(sources, retailers);
  const hosts = new SiteHosts([...paused].map((id) => new URL(retailers[id].search).host));
  for (const byRetailer of Object.values(sources.parts ?? {}))
    for (const [r, url] of Object.entries(byRetailer)) if (paused.has(r)) hosts.add(new URL(url).host);
  return hosts;
}

/** data/sources.json as written: every link, paused retailers included. Only this file reads it. */
const readSources = () => JSON.parse(readFileSync('data/sources.json', 'utf8'));

/** The links the price job and the weight reader may fetch: data/sources.json without the paused retailers. */
export const readActiveSources = () => activeSources(readSources(), readRetailers());

/** The hosts the link check skips: the paused retailers' sites. */
export const readPausedHosts = () => pausedHosts(readSources(), readRetailers());
