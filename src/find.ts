import { PLATFORMS } from './data';
import { productKey } from './data/helpers';
import type { Part, Platform } from './types';

/**
 * Finding a part the builder already owns. They can type what's on the box (brand, model, a part number or a
 * spec like "RMR cut"), or paste the product link from any store we track, which finds the exact part.
 */

export interface Found { part: Part; platform: Platform; byLink: boolean }

/** Query parameters that only say where a visitor came from (our own "View" links add utm_source and utm_medium). Every other one (?sku=...) can pick the product. */
const TRACKING = /^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|srsltid)$/i;

/**
 * A product link as two texts to compare. `path` is the host and path alone, so http or https, a leading "www." and a
 * trailing slash don't matter. `exact` adds the parameters that can pick the product, in a fixed order, with tracking
 * codes left out. The fragment is ignored.
 */
function linkKeys(raw: string): { exact: string; path: string } | null {
  try {
    const u = new URL(raw.trim());
    const path = (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
    const kept = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort();
    return { path, exact: kept.length ? `${path}?${kept.join('&')}` : path };
  } catch {
    return null;
  }
}

/** One product: a main copy and its copies (productKey), or listings with one brand and name. */
const oneProduct = (hits: Found[]) =>
  new Set(hits.map((h) => productKey(h.part))).size <= 1 || new Set(hits.map((h) => `${h.part.brand} ${h.part.name}`)).size <= 1;

/**
 * The parts a pasted product link names. A link that matches a tracked one exactly (parameters included) finds those
 * parts. Otherwise the host and path alone decide, but only when they name a single product: a store page that sells
 * several of our parts, told apart by a parameter the pasted link lacks, finds nothing rather than the wrong part.
 */
function byLink(key: { exact: string; path: string }): Found[] {
  const exact: Found[] = [];
  const path: Found[] = [];
  for (const platform of PLATFORMS)
    for (const part of platform.parts) {
      const keys = part.offers.map((o) => (o.url ? linkKeys(o.url) : null));
      if (keys.some((k) => k?.exact === key.exact)) exact.push({ part, platform, byLink: true });
      else if (keys.some((k) => k?.path === key.path)) path.push({ part, platform, byLink: true });
    }
  if (exact.length) return exact;
  return oneProduct(path) ? path : [];
}

/** The mark a length in inches is kept under while matching, in the query and in the part's text alike. */
const INCH = '″';
/** A number, then an inch mark, "inch" or "inches", or "in" written against it (16", 16 inch, 16-inch, 16in, 16in.). */
const MARKED = /(^|[^\d./])(\d*\.?\d+)(?:\s*["”″]|\s*-?\s*inch(?:es)?\.?(?![a-z0-9])|in\.?(?![a-z0-9]))/g;
/** The same, and "in" after a space or dash too (16 in, 16-in): in a query that can also be the plain word "in". */
const SPACED = /(^|[^\d./])(\d*\.?\d+)(?:\s*["”″]|\s*-?\s*(?:inch(?:es)?|in)\.?(?![a-z0-9]))/g;

/**
 * Lower-case text with every length in inches written one way, however it was typed: 16", 16 ", 16”, 16″, 16in,
 * 16 in, 16in., 16 inch, 16-inch and 16 inches all become 16″, and 10.3" and 10.3 inch become 10.3″. Used on the
 * query and on the part's text, so the two agree. A number that is part of a fraction or a longer figure (the 16 in
 * 1-7/16") is left alone, and so is an "in" that doesn't follow a number (Drop-In, built in).
 */
function inches(s: string, spaced = true): string {
  return s.toLowerCase().replace(spaced ? SPACED : MARKED, (_, before: string, n: string) => `${before}${parseFloat(n)}${INCH} `);
}

const words = (s: string) => s.split(/[^a-z0-9.″]+/).filter(Boolean);
/** The lengths in normalised text: 16″, 10.3″. */
const lengths = (s: string) => s.match(/[\d.]+″/g) ?? [];
const isLength = (w: string) => /^[\d.]+″$/.test(w);
/** A typed length names a whole length (6" is not 16"); one typed with a decimal also names a longer figure it starts (4.6" for 4.61"). */
const hasLength = (text: string, w: string) => lengths(text).some((l) => l === w || (w.includes('.') && l.startsWith(w.slice(0, -1))));

function haystack(platform: Platform, part: Part): string {
  const slot = platform.slots.find((s) => s.id === part.slot)?.name ?? '';
  return inches([part.brand, part.name, slot, part.mpn ?? '', ...part.specs].join(' '));
}

/** Every query word appears in the part's brand, name, slot, part number or specs. Brand and name hits rank first. */
function score(platform: Platform, part: Part, q: string[]): number {
  const hay = haystack(platform, part);
  const compact = hay.replace(/[^a-z0-9]/g, '');
  const named = `${part.brand} ${part.name}`.toLowerCase();
  let total = 0;
  for (const w of q) {
    const bare = w.replace(/[^a-z0-9]/g, '');
    if (isLength(w)) {
      if (hasLength(inches(named), w)) total += 2;
      else if (hasLength(hay, w)) total += 1;
      else return 0;
    } else if (hay.includes(w)) total += named.includes(w) ? 2 : 1;
    // Part numbers are typed with or without dashes and spaces.
    else if (bare.length >= 3 && compact.includes(bare)) total += 1;
    else return 0;
  }
  return total;
}

/** Parts on `platform` that match, best first. Other platforms' matches come back separately. */
export function findParts(query: string, platform: Platform): { here: Found[]; elsewhere: Found[] } {
  const key = isLink(query) ? linkKeys(query) : null;
  if (key) {
    const hits = byLink(key);
    return { here: hits.filter((h) => h.platform.id === platform.id), elsewhere: hits.filter((h) => h.platform.id !== platform.id) };
  }
  const found = byWords(words(inches(query)), platform);
  if (found.here.length || found.elsewhere.length) return found;
  // "19 in black" reads as a 19" length first; when nothing has that length, "in" is taken as the plain word it may be.
  const plain = words(inches(query, false));
  return plain.join(' ') === words(inches(query)).join(' ') ? found : byWords(plain, platform);
}

function byWords(q: string[], platform: Platform): { here: Found[]; elsewhere: Found[] } {
  if (!q.length) return { here: [], elsewhere: [] };
  const rank = (p: Platform) => p.parts.map((part) => ({ part, platform: p, byLink: false, s: score(p, part, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const here = rank(platform);
  // Glock frames, slides and many accessories are listed under each model, so only count other platforms' parts we don't already show.
  const shown = new Set(here.map((h) => `${h.part.brand} ${h.part.name}`));
  const elsewhere = PLATFORMS.filter((p) => p.id !== platform.id).flatMap(rank).filter((h) => !shown.has(`${h.part.brand} ${h.part.name}`));
  return { here, elsewhere };
}

/** True when the text looks like a link but no store we track has that product page. */
export const isLink = (query: string) => /^https?:\/\//i.test(query.trim());
