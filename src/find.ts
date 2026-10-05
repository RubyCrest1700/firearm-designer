import { PLATFORMS } from './data';
import type { Part, Platform } from './types';

/**
 * Finding a part the builder already owns. They can type what's on the box (brand, model, a part number or a
 * spec like "RMR cut"), or paste the product link from any store we track, which finds the exact part.
 */

export interface Found { part: Part; platform: Platform; byLink: boolean }

/** A product link reduced to host and path, so tracking codes and a trailing slash don't matter. */
function linkKey(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return null;
  }
}

const words = (s: string) => s.toLowerCase().replace(/["”″]/g, ' in ').split(/[^a-z0-9.]+/).filter(Boolean);

function haystack(platform: Platform, part: Part): string {
  const slot = platform.slots.find((s) => s.id === part.slot)?.name ?? '';
  return [part.brand, part.name, slot, part.mpn ?? '', ...part.specs].join(' ').toLowerCase();
}

/** Every query word appears in the part's brand, name, slot, part number or specs. Brand and name hits rank first. */
function score(platform: Platform, part: Part, q: string[]): number {
  const hay = haystack(platform, part);
  const compact = hay.replace(/[^a-z0-9]/g, '');
  let total = 0;
  for (const w of q) {
    const bare = w.replace(/[^a-z0-9]/g, '');
    if (hay.includes(w)) total += `${part.brand} ${part.name}`.toLowerCase().includes(w) ? 2 : 1;
    // Part numbers are typed with or without dashes and spaces.
    else if (bare.length >= 3 && compact.includes(bare)) total += 1;
    else return 0;
  }
  return total;
}

/** Parts on `platform` that match, best first. Other platforms' matches come back separately. */
export function findParts(query: string, platform: Platform): { here: Found[]; elsewhere: Found[] } {
  const key = /^https?:\/\//i.test(query.trim()) ? linkKey(query) : null;
  if (key) {
    const hits = PLATFORMS.flatMap((p) => p.parts.filter((part) => part.offers.some((o) => o.url && linkKey(o.url) === key)).map((part) => ({ part, platform: p, byLink: true })));
    return { here: hits.filter((h) => h.platform.id === platform.id), elsewhere: hits.filter((h) => h.platform.id !== platform.id) };
  }
  const q = words(query);
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
