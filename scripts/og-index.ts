// The price index the share service and the price alert cron read (dist/og/index.json, written by
// scripts/og-cards.tsx): each platform's name, each part's name and best price, and which of those prices are estimates.
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
