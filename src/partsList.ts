import { retailerName } from './data/retailers';
import { ESTIMATE_LABEL, bestOffer, isEstimate, money, noPriceNote, type Owned } from './engine';
import { totalOf } from './store';
import type { Build, Issue, Offer, Part, Platform, Slot } from './types';

/** Owner-approved wording (2026-11-27). */
export const WHERE_TO_BUY_TITLE = 'Where to Buy';
/** Owner-approved wording (2026-11-27). */
export const CONFIRM_PRICE_NOTE = 'Always confirm the price at the retailer.';
/** Owner-approved wording (2026-11-27). The slots a one-store cart leaves out follow it: "Not listed here: barrel, gas block". */
export const NOT_LISTED_PREFIX = 'Not listed here:';
/** Owner-approved wording (2026-11-27). */
export const COPY_PARTS_LABEL = 'Copy Parts List';
/** Owner-approved wording (2026-11-28). */
export const PARTS_COPIED = 'Parts list copied';
/** Owner-approved wording (2026-11-28). The label over the list when the browser won't copy it. */
export const COPY_BY_HAND_LABEL = 'Copy this list:';
/** Owner-approved wording (2026-11-27). The copied list's first line: "My AR-15 build: $1,234.56 at the best prices we found". */
const firstLine = (name: string, total: string) => `My ${name} build: ${total} at the best prices we found`;

export interface BuyRow {
  slot: Slot;
  part: Part;
  /** The part's best price, as the parts list shows it; none for a part with no price. */
  offer?: Offer;
}

/** The parts still to buy, in build order, each with its best price. Parts the builder owns are left out. */
export function buyRows(platform: Platform, build: Build, owned: Owned): BuyRow[] {
  return platform.slots.flatMap((slot) => {
    const part = build[slot.id];
    return part && !owned.owned.has(slot.id) ? [{ slot, part, offer: bestOffer(part) }] : [];
  });
}

/** The line under an opened one-store cart naming the slots it leaves out, or '' when it has every part. */
export function notListedLine(platform: Platform, missing: Part[]): string {
  if (!missing.length) return '';
  const name = (p: Part) => (platform.slots.find((s) => s.id === p.slot)?.name ?? p.slot).toLowerCase();
  return `${NOT_LISTED_PREFIX} ${missing.map(name).join(', ')}`;
}

/**
 * The build as plain text for Copy Parts List: the total as the summary shows it; then, when the build raises a
 * Legal notice, each of its messages whole and unchanged (the owner-approved wording in helpers.ts), one per line in
 * the summary's order, with no label (owner decision 2026-11-28); one line for each part still to buy; the no-price
 * note when it applies; and the line about confirming prices.
 */
export function partsListText(platform: Platform, build: Build, owned: Owned, issues: Issue[]): string {
  const rows = buyRows(platform, build, owned);
  const name = platform.modelOf?.(build)?.name ?? platform.name;
  const noPrice = noPriceNote(rows.filter((r) => !r.offer).length);
  // The same messages, in the same order, as the summary's Legal notice (LegalNotice in ui.tsx).
  const legal = [...new Set(issues.filter((i) => i.legal).map((i) => i.message))];
  return [
    firstLine(name, money(totalOf(platform, build, owned.owned))),
    ...legal,
    ...rows.map(({ slot, part, offer }) =>
      `${slot.name}: ${part.brand} ${part.name}` + (offer ? `, ${money(offer.price)} at ${retailerName(offer.retailer)}${isEstimate(offer) ? ` (${ESTIMATE_LABEL})` : ''}` : '')),
    ...(noPrice ? [noPrice] : []),
    CONFIRM_PRICE_NOTE,
  ].join('\n');
}

/** Puts text on the clipboard. False when the browser refuses or has no clipboard; the page then shows the text to copy by hand. */
export async function copyText(text: string, clipboard: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard): Promise<boolean> {
  try {
    await clipboard!.writeText(text);
    return true;
  } catch {
    return false;
  }
}
