import { PLATFORMS } from './data';
import { productKey } from './data/helpers';
import type { Part, Platform } from './types';

/**
 * Finding a part the builder already owns. They can type what's on the box (brand, model, a part number or a
 * spec like "RMR cut"), or paste the product link from any store we track, which finds the exact part.
 */

export interface Found { part: Part; platform: Platform; byLink: boolean }

/** The most typed text the word search reads; anything after it is ignored. No part's name and number come near it. */
export const QUERY_MAX = 200;
/** The longest pasted link that is looked up. A longer one finds nothing. */
export const LINK_MAX = 2000;

/**
 * Query parameters that only say where a visitor came from (our own "View" links add utm_source and utm_medium). They
 * never pick a product, even if a tracked link carries one. Any other parameter counts only where the tracked links
 * for that page use it (see byLink), so this list need not be complete.
 */
const TRACKING = /^(utm_.*|gclid|fbclid|msclkid|mc_cid|mc_eid|srsltid)$/i;

/**
 * A product link in the two parts that are compared. `path` is the host and path alone, so http or https, a leading
 * "www." and a trailing slash don't matter. `params` are its query parameters with tracking codes left out. The
 * fragment is ignored.
 */
interface Link { path: string; params: [string, string][] }

function parseLink(raw: string): Link | null {
  try {
    const u = new URL(raw.trim());
    return { path: (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase(), params: [...u.searchParams].filter(([k]) => !TRACKING.test(k)) };
  } catch {
    return null;
  }
}

/** A link's values for the named parameters, in a fixed order, so the order they were written in doesn't matter. */
const valuesFor = (link: Link, names: Set<string>) =>
  link.params.filter(([k]) => names.has(k)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');

/**
 * The parts a pasted product link names. The host and path pick the store page. A parameter on the pasted link counts
 * only when a tracked link for that page uses a parameter of that name (Brownells' ?sku=); every other one is ignored,
 * so an advert or referral code we have never seen can't hide the part. Where no tracked link for the page has a
 * parameter, every part tracked there is found. Where some do, the pasted link finds the parts whose link has the same
 * values; if none has, the page finds its parts only when they are a single product (a main copy and its copies), and
 * otherwise nothing rather than the wrong part.
 */
function byLink(pasted: Link): Found[] {
  const onPage: { found: Found; links: Link[] }[] = [];
  for (const platform of PLATFORMS)
    for (const part of platform.parts) {
      const links = part.offers.flatMap((o) => { const l = o.url ? parseLink(o.url) : null; return l && l.path === pasted.path ? [l] : []; });
      if (links.length) onPage.push({ found: { part, platform, byLink: true }, links });
    }
  const names = new Set(onPage.flatMap((x) => x.links.flatMap((l) => l.params.map(([k]) => k))));
  const wanted = valuesFor(pasted, names);
  const same = onPage.filter((x) => x.links.some((l) => valuesFor(l, names) === wanted));
  if (same.length) return same.map((x) => x.found);
  return new Set(onPage.map((x) => productKey(x.found.part))).size <= 1 ? onPage.map((x) => x.found) : [];
}

/** The mark a length in inches is kept under while matching, in the query and in the part's text alike. */
const INCH = '″';
/*
 * Three ways to read a length, widest first. Each starts at a number that is not part of a fraction or a longer
 * figure (the 16 in 1-7/16" is left alone) and has at most 4 digits and 3 decimal places, so no input can make the
 * pattern slow. Curly and double-prime marks are turned into a straight one first, so the three marks read alike.
 */
/** A number and an inch mark (16", 16 "). The only form read in a part's own text. */
const MARK = /(^|[^\d./])(\d{1,4}(?:\.\d{1,3})?|\.\d{1,3})\s*"/g;
/** The same, and "inch" or "inches", or "in" written against the number (16 inch, 16-inch, 16in, 16in.). */
const ATTACHED = /(^|[^\d./])(\d{1,4}(?:\.\d{1,3})?|\.\d{1,3})(?:\s*"|\s*-?\s*inch(?:es)?\.?(?![a-z0-9])|in\.?(?![a-z0-9]))/g;
/** The same, and "in" after a space or dash too (16 in, 16-in), which can also be the plain word "in". */
const SPACED = /(^|[^\d./])(\d{1,4}(?:\.\d{1,3})?|\.\d{1,3})(?:\s*"|\s*-?\s*(?:inch(?:es)?|in)\.?(?![a-z0-9]))/g;

/**
 * Lower-case text with the lengths in inches that `form` reads written one way: 16", 16 ", 16” and 16″ always become
 * 16″ (and 10.3" becomes 10.3″); in a query 16in, 16 in, 16in., 16 inch, 16-inch and 16 inches do too. An "in" that
 * doesn't follow a number (Drop-In, built in) is left alone.
 */
function inches(s: string, form: RegExp): string {
  return s.toLowerCase().replace(/[”″]/g, '"').replace(form, (_, before: string, n: string) => `${before}${parseFloat(n)}${INCH} `);
}

const words = (s: string) => s.split(/[^a-z0-9.″]+/).filter(Boolean);
/** The lengths in normalised text: 16″, 10.3″. */
const lengths = (s: string): string[] => s.match(/[\d.]+″/g) ?? [];
const isLength = (w: string) => /^[\d.]+″$/.test(w);
/**
 * How well text carries a typed length: 2 for the whole figure (6" is not 16"), 1 when the length was typed with a
 * decimal and starts a longer figure (4.6" for 4.61"), 0 when it isn't there.
 */
function lengthFit(text: string, w: string): number {
  const all = lengths(text);
  if (all.includes(w)) return 2;
  return w.includes('.') && all.some((l) => l.startsWith(w.slice(0, -1))) ? 1 : 0;
}

/**
 * A part's text as the search reads it. Only a marked length (16") is read as one: "in" or "inch" inside a part's own
 * name, specs or part number stays as written, so "Glock 19 in FDE" is not 19 inches and BAR16IN556 typed bare is still found. Typed with its dashes and no brand,
 * such a part number is read as a length first and is only found when no part matches that length.
 */
function haystack(platform: Platform, part: Part): string {
  const slot = platform.slots.find((s) => s.id === part.slot)?.name ?? '';
  return inches([part.brand, part.name, slot, part.mpn ?? '', ...part.specs].join(' '), MARK);
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
      const inName = lengthFit(inches(named, MARK), w);
      const fit = inName || lengthFit(hay, w);
      if (!fit) return 0;
      // The exact figure comes before a longer one it starts (9.2" before 9.25"), without moving anything else.
      total += (inName ? 2 : 1) - (fit === 1 ? 0.01 : 0);
    } else if (hay.includes(w)) total += named.includes(w) ? 2 : 1;
    // Part numbers are typed with or without dashes and spaces.
    else if (bare.length >= 3 && compact.includes(bare)) total += 1;
    else return 0;
  }
  return total;
}

/** Parts on `platform` that match, best first. Other platforms' matches come back separately. */
export function findParts(query: string, platform: Platform): { here: Found[]; elsewhere: Found[] } {
  const text = query.trim();
  if (isLink(text)) {
    if (text.length > LINK_MAX) return { here: [], elsewhere: [] };
    const link = parseLink(text);
    if (link) {
      const hits = byLink(link);
      return { here: hits.filter((h) => h.platform.id === platform.id), elsewhere: hits.filter((h) => h.platform.id !== platform.id) };
    }
  }
  const typed = text.slice(0, QUERY_MAX);
  // "19 in black" reads as a 19" length first. When nothing has that length, "in" is taken as the plain word it may be,
  // and last the text is read as typed, for a part whose own name or number says "16 inch" or "16IN".
  let last = '';
  for (const form of [SPACED, ATTACHED, MARK]) {
    const q = words(inches(typed, form));
    if (q.join(' ') === last) continue;
    last = q.join(' ');
    const found = byWords(q, platform);
    if (found.here.length || found.elsewhere.length) return found;
  }
  return { here: [], elsewhere: [] };
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
