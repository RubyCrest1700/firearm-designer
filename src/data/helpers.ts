import type { Offer, OfferTuple, Part, Tier } from '../types';
import prices from '../../data/prices.json';

type PartInput = Omit<Part, 'offers'> & { offers: OfferTuple[] };

/** Live prices written by scripts/update-prices.mjs, keyed by part id, then retailer id. */
const LIVE = (prices as { offers: Record<string, Record<string, Offer>> }).offers;

/**
 * Builds parts from inline sample offers, then overlays any live prices from data/prices.json.
 * A live price replaces the sample price for the same retailer; new retailers are added.
 */
export function parts(slot: string, list: Omit<PartInput, 'slot'>[]): Part[] {
  return list.map((p) => {
    const byRetailer = new Map<string, Offer>(
      p.offers.map(([retailer, price, inStock]) => [retailer, { retailer, price, inStock: inStock ?? true }]),
    );
    for (const [retailer, live] of Object.entries(LIVE[p.id] ?? {})) byRetailer.set(retailer, { ...live, retailer });
    return { ...p, slot, offers: [...byRetailer.values()] };
  });
}

export const pick = (tier: Tier, note: string) => ({ tier, note });
