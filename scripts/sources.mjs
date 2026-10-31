// Which product links the scripts may read. data/sources.json keeps every link, and its "paused" object lists
// retailers we've stopped reading for now ({ "PA": { "since": "2026-10-22", "reason": "why" } }). The price job, the
// link check and the weight reader all go through here (see "linksOnly" below for which reader each uses), so a paused
// retailer's pages and search links are never fetched. The site leaves the same retailers' prices out
// (src/data/helpers.ts), and the price history up to the pause date for the parts they priced (src/data/history.ts).
// Delete an entry from "paused" to resume.
//
// Its "linksOnly" object lists retailers that are not paused but that we don't request at all
// ({ "CTD": { "since": "2026-10-31", "reason": "why" } }). The site keeps their links and Sample prices exactly as it
// would for any active retailer, and nothing about them reaches the app (scripts/price-table.mjs). The three fetching
// scripts stay off their whole sites, robots.txt and subdomains included: update-prices and read-weights read
// readFetchableSources, check-links skips readNoFetchHosts, and the politeFetch in all three refuses a request to
// readNoFetchHosts, redirect hops and robots.txt included. pausedIds, activeSources and pausedHosts stay paused-only.
// Delete an entry from "linksOnly" to resume.

import { readFileSync } from 'node:fs';
import { registrableDomain } from './domains.mjs';

/** Retailer ids, names and search-link templates, read from src/data/retailers.ts (the scripts don't bundle TypeScript). */
export function retailersFrom(text) {
  const out = {};
  for (const m of text.matchAll(/(\w+): \{ id: '(\w+)', name: (?:'([^']*)'|"([^"]*)"), search: '(https:[^']+)' \}/g)) out[m[2]] = { id: m[2], name: m[3] ?? m[4], search: m[5] };
  return out;
}

export const readRetailers = () => retailersFrom(readFileSync('src/data/retailers.ts', 'utf8'));

/** A real calendar day written YYYY-MM-DD. */
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * One retailer list of data/sources.json ("paused" or "linksOnly"). Left out, it's empty. Anything but a plain object
 * throws, so a null or a list can't read as "nobody is listed" and leave a store running.
 */
function retailerList(sources, key) {
  const list = sources[key];
  if (list === undefined) return {};
  if (list === null || typeof list !== 'object' || Array.isArray(list)) throw new Error(`data/sources.json "${key}" must be an object keyed by retailer id`);
  return list;
}

/**
 * The paused retailer ids. Throws on an id that isn't a retailer, so a typo can't leave a store running, and on an
 * entry without a pause date ("since", YYYY-MM-DD) and a reason, since the site needs the date to drop old history.
 */
export function pausedIds(sources, retailers) {
  const list = retailerList(sources, 'paused');
  const ids = Object.keys(list);
  const unknown = ids.filter((id) => !Object.hasOwn(retailers, id));
  if (unknown.length) throw new Error(`data/sources.json "paused" names unknown retailer${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} (see src/data/retailers.ts)`);
  const bad = ids.filter((id) => { const e = list[id]; return !e || !isDay(e.since) || typeof e.reason !== 'string' || !e.reason.trim(); });
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

/**
 * The links-only retailer ids. Throws on an id that isn't a retailer, on an entry without a date ("since", YYYY-MM-DD)
 * and a reason, and on an id that is also paused, since a retailer can't both keep its prices and lose them.
 */
export function linksOnlyIds(sources, retailers) {
  const list = retailerList(sources, 'linksOnly');
  const ids = Object.keys(list);
  const unknown = ids.filter((id) => !Object.hasOwn(retailers, id));
  if (unknown.length) throw new Error(`data/sources.json "linksOnly" names unknown retailer${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')} (see src/data/retailers.ts)`);
  const bad = ids.filter((id) => { const e = list[id]; return !e || !isDay(e.since) || typeof e.reason !== 'string' || !e.reason.trim(); });
  if (bad.length) throw new Error(`data/sources.json "linksOnly" entry for ${bad.join(', ')} needs { "since": "YYYY-MM-DD", "reason": "..." }`);
  const both = ids.filter((id) => Object.hasOwn(retailerList(sources, 'paused'), id));
  if (both.length) throw new Error(`data/sources.json lists ${both.join(', ')} under both "paused" and "linksOnly"`);
  return new Set(ids);
}

/** The links a script may fetch: activeSources without the links-only retailers. */
export function fetchableSources(sources, retailers) {
  const linksOnly = linksOnlyIds(sources, retailers);
  const out = {};
  for (const [partId, byRetailer] of Object.entries(activeSources(sources, retailers))) {
    const kept = Object.entries(byRetailer).filter(([r]) => !linksOnly.has(r));
    if (kept.length) out[partId] = Object.fromEntries(kept);
  }
  return out;
}

/** Hosts no script may request: pausedHosts plus the links-only retailers' search and product link hosts, and their whole sites. */
export function noFetchHosts(sources, retailers) {
  const linksOnly = linksOnlyIds(sources, retailers);
  const hosts = new SiteHosts(pausedHosts(sources, retailers));
  for (const id of linksOnly) hosts.add(new URL(retailers[id].search).host);
  for (const byRetailer of Object.values(sources.parts ?? {}))
    for (const [r, url] of Object.entries(byRetailer)) if (linksOnly.has(r)) hosts.add(new URL(url).host);
  return hosts;
}

/** data/sources.json as written: every link, paused and links-only retailers included. Scripts that fetch must use readFetchableSources, not this. */
export const readSources = () => JSON.parse(readFileSync('data/sources.json', 'utf8'));

/** data/sources.json without the paused retailers. Links-only retailers are still in it, so nothing that fetches reads this. */
export const readActiveSources = () => activeSources(readSources(), readRetailers());

/** The paused retailers' sites alone. The link check uses readNoFetchHosts. */
export const readPausedHosts = () => pausedHosts(readSources(), readRetailers());

/** The links the price job and the weight reader may fetch: data/sources.json without the paused and links-only retailers. */
export const readFetchableSources = () => fetchableSources(readSources(), readRetailers());

/** The paused and links-only retailers' sites: the link check skips them, and all three scripts refuse any request to them. */
export const readNoFetchHosts = () => noFetchHosts(readSources(), readRetailers());
