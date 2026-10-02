import type { Build, Issue, Offer, Part, Platform, Severity, Tier } from './types';

export type Selection = Record<string, string>;

const RANK: Record<Severity, number> = { info: 1, warn: 2, error: 3 };

export function worst(issues: Issue[]): Severity | undefined {
  let w: Severity | undefined;
  for (const i of issues) if (!w || RANK[i.severity] > RANK[w]) w = i.severity;
  return w;
}

export function toBuild(platform: Platform, sel: Selection): Build {
  const byId = new Map(platform.parts.map((p) => [p.id, p]));
  const b: Build = {};
  for (const [slot, id] of Object.entries(sel)) b[slot] = byId.get(id);
  return b;
}

export function issuesFor(platform: Platform, build: Build): Issue[] {
  return platform.rules(build).sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

/** Issues the candidate would cause, given everything else in the build. */
export function candidateIssues(platform: Platform, build: Build, part: Part): Issue[] {
  const trial = { ...build, [part.slot]: part };
  return platform.rules(trial).filter((i) => i.slots.includes(part.slot));
}

export function bestOffer(part: Part): Offer | undefined {
  const inStock = part.offers.filter((o) => o.inStock);
  const pool = inStock.length ? inStock : part.offers;
  return pool.reduce<Offer | undefined>((m, o) => (!m || o.price < m.price ? o : m), undefined);
}

export function priceRange(part: Part): [number, number] {
  const ps = part.offers.map((o) => o.price);
  return [Math.min(...ps), Math.max(...ps)];
}

export function presetSelection(platform: Platform, tier: Tier): Selection {
  const sel: Selection = {};
  for (const id of platform.presets[tier]) {
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
