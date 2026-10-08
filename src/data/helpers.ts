import type { Issue, Offer, OfferTuple, Part, Tier } from '../types';
import prices from '../../data/prices.json';
import sources from '../../data/sources.json';
import weights from '../../data/weights.json';

type PartInput = Omit<Part, 'offers'> & { offers: OfferTuple[] };

/** Live prices written by scripts/update-prices.mjs, keyed by part id, then retailer id. */
const LIVE = (prices as unknown as { offers: Record<string, Record<string, Offer>> }).offers;
/** Known product page URLs, so "View" links go to the product even before a live price exists. */
const URLS = (sources as unknown as { parts: Record<string, Record<string, string>> }).parts;
/** Part weights in ounces: the maker's or a retailer's listed figure where found, otherwise a typical-figure estimate. */
const WEIGHTS = (weights as unknown as { parts: Record<string, { oz: number; basis: 'published' | 'estimate'; src: string | null }> }).parts;

/**
 * Builds parts from inline sample offers, then overlays any live prices from data/prices.json.
 * A live price replaces the sample price for the same retailer; new retailers are added.
 */
export function parts(slot: string, list: Omit<PartInput, 'slot'>[]): Part[] {
  return list.map((p) => {
    const byRetailer = new Map<string, Offer>(
      p.offers.map(([retailer, price, inStock]) => [retailer, { retailer, price, inStock: inStock ?? true, url: URLS[p.id]?.[retailer] }]),
    );
    for (const [retailer, live] of Object.entries(LIVE[p.id] ?? {})) byRetailer.set(retailer, { ...live, retailer });
    const w = WEIGHTS[p.id];
    return { ...p, slot, offers: [...byRetailer.values()], ...(w ? { weight: { oz: w.oz, published: w.basis === 'published', src: w.src ?? undefined } } : {}) };
  });
}

export const pick = (tier: Tier, note: string) => ({ tier, note });

/**
 * Muzzle threads must match exactly: diameter, pitch and hand. A 1/2x28 device will not go on a
 * 5/8x24 or an M13.5x1 left-hand barrel, even when both parts are sold for the same gun.
 */
/**
 * A muzzle device's bore must be bigger than the bullet. A 5.56 device (.224") on a .30 caliber barrel can
 * thread on when both are 5/8x24, and the bullet then strikes the device.
 */
export function boreIssue(barrel?: Part, muzzle?: Part): Issue | undefined {
  const bullet = barrel?.attrs.bullet as number | undefined;
  const bore = muzzle?.attrs.bore as number | undefined;
  if (bullet === undefined || bore === undefined || bore >= bullet) return undefined;
  return { severity: 'error', slots: ['muzzle', 'barrel'], message: `This muzzle device is made for ${bore.toFixed(3).slice(1)}" bullets but the barrel fires ${bullet.toFixed(3).slice(1)}" bullets. The bullet would strike the device.` };
}

/**
 * Iron sights too short to aim with once a red dot or a suppressor is on, shared by every pistol. An empty sights slot
 * means the slide's own factory sights, which are standard height. A threaded barrel only gets a note: the builder has
 * no suppressors to pick, so it can't know one is coming.
 */
export function sightHeightIssues(sights: Part | undefined, optic: Part | undefined, threaded: { slot: string } | false): Issue[] {
  if (sights?.attrs.height === 'suppressor') return [];
  const what = sights ? 'standard-height sights' : 'factory sights';
  const out: Issue[] = [];
  if (optic)
    out.push({ severity: 'warn', slots: ['optic', 'sights'], message: `The ${what} sit below the red dot, so you can't aim with them if it fails. Choose suppressor-height sights to see them through the window.` });
  if (threaded)
    out.push({ severity: 'info', slots: [threaded.slot, 'sights'], message: `A suppressor on this threaded barrel will block the ${what}. Choose suppressor-height sights if you plan to run one.` });
  return out;
}

export function threadIssue(barrel?: Part, muzzle?: Part): Issue | undefined {
  if (!barrel || !muzzle) return undefined;
  const bt = barrel.attrs.thread as string | undefined;
  const mt = muzzle.attrs.thread as string;
  if (!bt)
    return { severity: 'error', slots: ['muzzle', 'barrel'], message: `This barrel isn't threaded, so the ${mt} muzzle device has nothing to screw onto. Choose a threaded barrel.` };
  if (bt !== mt)
    return { severity: 'error', slots: ['muzzle', 'barrel'], message: `The barrel is threaded ${bt} but the muzzle device is ${mt}. They won't screw together.` };
  return undefined;
}
