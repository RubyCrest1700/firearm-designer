import type { Build, Issue, Offer, Part, Placement, Platform, Severity, Side, Tier } from './types';

/**
 * Slot id -> part id. Accessory placements ride along under `@slot` keys, encoded as a side letter and
 * tenths of an inch from the receiver: `{ light: 'r-light-hlx', '@light': 'r45' }`.
 * Parts the builder already owns are marked under `+slot` keys: `own` for the chosen catalog part, `other`
 * for one of their own that isn't in our catalog (the slot then has no part id).
 */
export type Selection = Record<string, string>;

/** Keys that name a slot's part, as opposed to `@` placements and `+` owned marks. */
const isSlotKey = (k: string) => !k.startsWith('@') && !k.startsWith('+');

export interface Owned {
  /** Slots whose chosen catalog part the builder already has. */
  owned: Set<string>;
  /** Slots filled with a part of their own that isn't in our catalog. */
  other: Set<string>;
}

export function ownedOf(sel: Selection): Owned {
  const out: Owned = { owned: new Set(), other: new Set() };
  for (const [k, v] of Object.entries(sel)) {
    if (!k.startsWith('+')) continue;
    const slot = k.slice(1);
    if (v === 'own' && sel[slot]) out.owned.add(slot);
    else if (v === 'other' && !sel[slot]) out.other.add(slot);
  }
  return out;
}

export const ownsAny = (sel: Selection) => Object.keys(sel).some((k) => k.startsWith('+'));

/** The selection without owned marks: what a build looks like to someone else, e.g. on the Community page. */
export const withoutOwned = (sel: Selection): Selection => Object.fromEntries(Object.entries(sel).filter(([k]) => !k.startsWith('+')));

const SIDE_CODE: Record<string, Side> = { t: 'top', r: 'right', l: 'left', b: 'bottom' };
export const MOUNT_CODE = /^([trlb])(\d{1,3})$/;

export const encodeMount = (side: Side, at: number) => `${side[0]}${Math.round(at * 10)}`;

export function placementOf(sel: Selection): Placement {
  const out: Placement = {};
  for (const [k, v] of Object.entries(sel)) {
    const m = k.startsWith('@') ? v.match(MOUNT_CODE) : null;
    if (m) out[k.slice(1)] = { side: SIDE_CODE[m[1]], at: Number(m[2]) / 10 };
  }
  return out;
}

/** Part ids only, without placements or owned marks. */
export const partIds = (sel: Selection) => Object.entries(sel).filter(([k]) => isSlotKey(k)).map(([, v]) => v);

/** Part ids still to buy: the selection's parts minus the ones the builder already owns. */
export const toBuyIds = (sel: Selection) => {
  const { owned } = ownedOf(sel);
  return Object.entries(sel).filter(([k]) => isSlotKey(k) && !owned.has(k)).map(([, v]) => v);
};

/**
 * Part ids plus `at-<slot>-<code>` placement tokens and `own-<slot>` / `has-<slot>` owned marks, for share
 * links and community builds. Older pages skip tokens they don't know, so links stay readable everywhere.
 */
export const selectionTokens = (sel: Selection) =>
  Object.entries(sel).map(([k, v]) => (k.startsWith('@') ? `at-${k.slice(1)}-${v}` : k.startsWith('+') ? `${v === 'other' ? 'has' : 'own'}-${k.slice(1)}` : v));

const RANK: Record<Severity, number> = { info: 1, warn: 2, error: 3 };

export function worst(issues: Issue[]): Severity | undefined {
  let w: Severity | undefined;
  for (const i of issues) if (!w || RANK[i.severity] > RANK[w]) w = i.severity;
  return w;
}

export function toBuild(platform: Platform, sel: Selection): Build {
  const byId = new Map(platform.parts.map((p) => [p.id, p]));
  const b: Build = {};
  for (const [slot, id] of Object.entries(sel)) if (isSlotKey(slot)) b[slot] = byId.get(id);
  return b;
}

export function issuesFor(platform: Platform, build: Build, place: Placement = {}): Issue[] {
  return platform.rules(build, place).sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

/** Issues the candidate would cause, given everything else in the build. */
export function candidateIssues(platform: Platform, build: Build, part: Part, place: Placement = {}): Issue[] {
  const trial = { ...build, [part.slot]: part };
  return platform.rules(trial, place).filter((i) => i.slots.includes(part.slot));
}

export function bestOffer(part: Part): Offer | undefined {
  const inStock = part.offers.filter((o) => o.inStock);
  const pool = inStock.length ? inStock : part.offers;
  return pool.reduce<Offer | undefined>((m, o) => (!m || o.price < m.price ? o : m), undefined);
}

/** The small label beside a price that isn't a live store price: Sample, List Price or Factory Part. */
export function priceLabel(o: Offer): string {
  if (o.basis === 'list') return 'List Price';
  if (o.basis === 'factory') return 'Factory Part';
  return o.checkedAt ? '' : 'Sample';
}

/** A price as shown: "From" in front when it's a holster's base price before the light option. */
export const priceText = (o: Offer) => (o.basis === 'from' ? 'From ' : '') + money(o.price);

export function priceRange(part: Part): [number, number] {
  const ps = part.offers.map((o) => o.price);
  return [Math.min(...ps), Math.max(...ps)];
}

export function presetSelection(platform: Platform, tier: Tier): Selection {
  return selectionOf(platform, platform.presets[tier]);
}

/** The plain factory build a builder opens on (see Platform.base). */
export function baseSelection(platform: Platform): Selection {
  return selectionOf(platform, platform.base ?? platform.presets.budget);
}

function selectionOf(platform: Platform, ids: string[]): Selection {
  const sel: Selection = {};
  for (const id of ids) {
    const p = platform.parts.find((x) => x.id === id);
    if (p) sel[p.slot] = p.id;
  }
  return sel;
}

export interface RetailerCart {
  retailer: string;
  carried: number;
  total: number;
  missing: Part[];
}

/** What it costs to buy every selected part from a single retailer. */
export function singleRetailerCarts(parts: Part[]): RetailerCart[] {
  const ids = new Set(parts.flatMap((p) => p.offers.map((o) => o.retailer)));
  return [...ids]
    .map((r) => {
      let total = 0;
      const missing: Part[] = [];
      for (const p of parts) {
        const o = p.offers.find((x) => x.retailer === r && x.inStock);
        if (o) total += o.price;
        else missing.push(p);
      }
      return { retailer: r, carried: parts.length - missing.length, total, missing };
    })
    .sort((a, b) => b.carried - a.carried || a.total - b.total);
}

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
