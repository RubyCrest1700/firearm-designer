// The price index the share service and the price alert cron read (dist/og/index.json, written by
// scripts/og-cards.tsx): each platform's name, and each part's name and best price.
import { bestOffer } from '../src/engine';
import type { Platform } from '../src/types';

export function priceIndex(platforms: Platform[]) {
  return {
    platforms: Object.fromEntries(platforms.map((p) => [p.id, {
      name: p.name,
      // A part with no price (sold only by a paused retailer) is left out, so a price alert never reads it as a drop to $0.
      parts: Object.fromEntries(p.parts.flatMap((part) => { const o = bestOffer(part); return o ? [[part.id, [`${part.brand} ${part.name}`, o.price] as [string, number]]] : []; })),
    }])),
  };
}
