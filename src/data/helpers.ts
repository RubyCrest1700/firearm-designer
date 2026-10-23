import type { Issue, Offer, OfferTuple, Part, Tier } from '../types';
import prices from '../../data/prices.json';
import sources from '../../data/sources.json';
import weights from '../../data/weights.json';
import listPrices from '../../data/list-prices.json';

type PartInput = Omit<Part, 'offers'> & { offers: OfferTuple[] };

/** Live prices written by scripts/update-prices.mjs, keyed by part id, then retailer id. */
const LIVE = (prices as unknown as { offers: Record<string, Record<string, Offer>> }).offers;
/** Known product page URLs, so "View" links go to the product even before a live price exists. */
const URLS = (sources as unknown as { parts: Record<string, Record<string, string>> }).parts;
/**
 * Retailers paused in data/sources.json ("paused"), while we review their terms on automated price collection.
 * Their prices, live or sample, are left out of every part here, so no page shows them or counts them in a best
 * price or total. The price scripts skip the same list (scripts/sources.mjs). Delete an entry there to resume.
 */
export const PAUSED = new Set(Object.keys((sources as unknown as { paused?: Record<string, string> }).paused ?? {}));
/**
 * Parts no tracked store sells or prices: holsters whose live price is the base page's ("From"), Glock factory parts
 * with only an estimate ("Factory Part"), and hand-checked list prices, each shown with its label and the day it was checked.
 */
const LISTED = listPrices as unknown as {
  from: string[];
  factory: string[];
  parts: Record<string, { basis: 'list' | 'factory'; retailer: string; price: number; url?: string; asOf: string }>;
};
const FROM = new Set(LISTED.from);
const FACTORY = new Set(LISTED.factory);
/** Part weights in ounces: the maker's or a retailer's listed figure where found, otherwise a typical-figure estimate. */
const WEIGHTS = (weights as unknown as { parts: Record<string, { oz: number; basis: 'published' | 'estimate'; src: string | null }> }).parts;

/**
 * Builds parts from inline sample offers, then overlays any live prices from data/prices.json.
 * A live price replaces the sample price for the same retailer; new retailers are added. Once a part has any live
 * price, its remaining sample prices are dropped, so a made-up figure never undercuts a real one. A part with no live
 * price but a hand-checked list price (data/list-prices.json) shows that instead of its samples. Paused retailers'
 * offers are dropped first, so a part sold only there has no offers and shows no price.
 */
export function parts(slot: string, list: Omit<PartInput, 'slot'>[]): Part[] {
  return list.map((p) => {
    const byRetailer = new Map<string, Offer>(
      p.offers.filter(([retailer]) => !PAUSED.has(retailer)).map(([retailer, price, inStock]) => [retailer, { retailer, price, inStock: inStock ?? true, url: URLS[p.id]?.[retailer] }]),
    );
    const live = Object.entries(LIVE[p.id] ?? {}).filter(([retailer]) => !PAUSED.has(retailer));
    const listed = PAUSED.has(LISTED.parts[p.id]?.retailer ?? '') ? undefined : LISTED.parts[p.id];
    if (live.length || listed) byRetailer.clear();
    for (const [retailer, offer] of live) byRetailer.set(retailer, { ...offer, retailer, ...(FROM.has(p.id) ? { basis: 'from' as const } : {}) });
    if (!live.length && listed) byRetailer.set(listed.retailer, { retailer: listed.retailer, price: listed.price, inStock: true, url: listed.url, basis: listed.basis, asOf: listed.asOf });
    else if (!live.length && FACTORY.has(p.id)) for (const o of byRetailer.values()) o.basis = 'factory';
    const w = WEIGHTS[p.id];
    return { ...p, slot, offers: [...byRetailer.values()], ...(w ? { weight: { oz: w.oz, published: w.basis === 'published', src: w.src ?? undefined } } : {}) };
  });
}

export const pick = (tier: Tier, note: string) => ({ tier, note });

/** Owner-approved wording (2026-10-22). */
export const SBR_MESSAGE = 'A barrel under 16" with a stock may be regulated under the National Firearms Act and can require ATF approval before assembly. Some states ban it. Not legal advice: check federal, state and local law before you build.';

/**
 * A rifle barrel under 16" with a stock is a conflict, so the build can't count as complete or be posted to
 * Community. Interim rule pending legal advice (2026-10-22). A brace is not a stock. Used by the AR-15, AR-9 and AR-10.
 */
export function shortBarrelStockIssue(barrel?: Part, stock?: Part): Issue | undefined {
  if (!barrel || !stock || stock.attrs.brace || (barrel.attrs.length as number) >= 16) return undefined;
  return { severity: 'error', slots: ['barrel', 'stock'], message: SBR_MESSAGE };
}

/** An AR gas system length for a sentence: "carbine-length", but "midlength" already says it. */
export const gasLength = (len: unknown) => (len === 'midlength' ? 'midlength' : `${len}-length`);

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
 * no suppressors to pick, so it can't know one is coming. `stripped`: the slides come without sights (the Glocks),
 * so an empty slot means no sights yet and there's nothing to check.
 */
export function sightHeightIssues(sights: Part | undefined, optic: Part | undefined, threaded: { slot: string } | false, stripped = false): Issue[] {
  if (sights?.attrs.height === 'suppressor' || (stripped && !sights)) return [];
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
