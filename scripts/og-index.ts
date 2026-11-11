// The price index the share service and the price alert cron read (dist/og/index.json, written by
// scripts/og-cards.tsx): each platform's name, each part's name and best price, and which of those prices are estimates.
import { RETIRED_IDS } from '../src/data/index';
import { bestOffer, estimatedCount } from '../src/engine';
import { estimatedOf } from '../src/store';
import type { Build, Platform } from '../src/types';

/** The words after a community card's total. Owner-approved wording (2026-10-31). */
export const cardTotalWords = (platform: Platform, build: Build) => (estimatedOf(platform, build) ? 'WITH ESTIMATES' : 'BEST-PRICE TOTAL');

export function priceIndex(platforms: Platform[]) {
  return {
    platforms: Object.fromEntries(platforms.map((p) => [p.id, {
      name: p.name,
      // A part with no price (sold only by a paused retailer) is left out, so a price alert never reads it as a drop to $0.
      parts: Object.fromEntries(p.parts.flatMap((part) => { const o = bestOffer(part); return o ? [[part.id, [`${part.brand} ${part.name}`, o.price] as [string, number]]] : []; })),
      // A separate list, so the two-item part entries the Worker reads stay as they are.
      estimates: [...new Set(p.parts.filter((part) => estimatedCount([part])).map((part) => part.id))],
    }])),
  };
}

/**
 * The index as published: priceIndex, plus each retired part id as a copy of the entry of the part that stands in for
 * it, on that part's platform. The share service and the alert cron only look up the ids a build carries, so a share
 * link or stored alert build made before the id was retired keeps its part. A copy is never a second catalog part.
 */
export function publishedIndex(platforms: Platform[], retired: Record<string, string> = RETIRED_IDS) {
  const index = priceIndex(platforms);
  for (const entry of Object.values(index.platforms)) {
    for (const [old, now] of Object.entries(retired)) {
      const own = (id: string) => Object.prototype.hasOwnProperty.call(entry.parts, id);
      if (!own(now) || own(old)) continue; // not this platform's part (or it has no price); never over a real part
      entry.parts[old] = [entry.parts[now][0], entry.parts[now][1]];
      if (entry.estimates.includes(now)) entry.estimates.push(old);
    }
  }
  return index;
}
