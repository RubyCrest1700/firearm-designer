import { SHARE_BASE } from './config';
import { PLATFORMS } from './data';
import { MOUNT_CODE, bestOffer, placementOf, presetSelection, selectionTokens, toBuild, type Selection } from './engine';
import { worthShowing } from './data/history';
import type { Build, Part, Platform, Tier } from './types';

/* ---------------------------------------------------------------- saved builds */

export interface SavedBuild {
  id: string;
  name: string;
  platform: string;
  selection: Selection;
  savedAt: string;
  /** Best price of each part when it went into the saved build, for "price dropped since you saved". */
  prices?: Record<string, number>;
}

const SAVED_KEY = 'firearm-designer:saved:v1';

export function loadSavedBuilds(): SavedBuild[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as SavedBuild[]) : [];
    // Builds saved before price tracking start from today's prices.
    return list.filter((s) => PLATFORMS.some((p) => p.id === s.platform)).map((s) => ({ ...s, prices: priceSnapshot(s.platform, s.selection, s.prices) }));
  } catch {
    return [];
  }
}

export function storeSavedBuilds(list: SavedBuild[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: saved builds last for this visit only */
  }
}

/**
 * Best price of each part in a selection. Parts already in `keep` hold their earlier price, so editing a
 * saved build doesn't reset the drop on parts that stayed.
 */
export function priceSnapshot(platformId: string, sel: Selection, keep: Record<string, number> = {}) {
  const { build } = buildOf(platformId, sel);
  const out: Record<string, number> = {};
  for (const part of Object.values(build)) {
    const price = part && bestOffer(part)?.price;
    if (part && price !== undefined) out[part.id] = keep[part.id] ?? price;
  }
  return out;
}

export interface PriceChange { part: Part; was: number; now: number }

/** Parts in a saved build whose best price moved since it was saved, biggest drop first, and the net change. */
export function priceChanges(s: SavedBuild): { changes: PriceChange[]; drop: number } {
  const { build } = buildOf(s.platform, s.selection);
  const changes: PriceChange[] = [];
  for (const part of Object.values(build)) {
    const was = part && s.prices?.[part.id];
    const now = part && bestOffer(part)?.price;
    if (part && was !== undefined && now !== undefined && Math.abs(was - now) >= 0.01) changes.push({ part, was, now });
  }
  changes.sort((a, b) => (b.was - b.now) - (a.was - a.now));
  return { changes, drop: changes.reduce((sum, c) => sum + c.was - c.now, 0) };
}

/** Saved builds that cost less now than when they were saved. */
export const droppedBuilds = (list: SavedBuild[]) => list.filter((s) => { const { drop, changes } = priceChanges(s); return drop > 0 && changes.some((c) => worthShowing(c.was, c.now)); });

export const newId = () => Math.random().toString(36).slice(2, 10);

/* ----------------------------------------------------------------- share links */

let shareLinksLive = false;

/** Checks once that the share service answers, so links never point at it before it's set up. */
export async function checkShareLinks() {
  if (!SHARE_BASE) return;
  try {
    shareLinksLive = (await fetch(`${SHARE_BASE}/health`, { signal: AbortSignal.timeout(5000) })).ok;
  } catch {
    /* plain links */
  }
}

/**
 * `<platform>~<part>.<part>…` — part ids and placement tokens never contain `.` or `~`.
 * Goes through the share service when it's up, so the link shows a picture card where it's posted;
 * otherwise a plain `?b=` link to this page. A community build gets its short `/c/<id>` link.
 */
export function shareUrl(platformId: string, sel: Selection, communityId?: string) {
  const code = encodeURIComponent(`${platformId}~${selectionTokens(sel).join('.')}`);
  if (shareLinksLive) return communityId ? `${SHARE_BASE}/c/${communityId}` : `${SHARE_BASE}/b/${code}`;
  return `${location.origin}${location.pathname}?b=${code}`;
}

export function readSharedBuild(): { platform: string; selection: Selection } | null {
  try {
    const raw = new URLSearchParams(location.search).get('b');
    if (!raw) return null;
    const [pid, ids = ''] = raw.split('~');
    return PLATFORMS.some((p) => p.id === pid) ? { platform: pid, selection: selectionFromParts(pid, ids.split('.')) } : null;
  } catch {
    return null;
  }
}

/** Turns part ids and placement tokens back into a selection, skipping ids the catalog no longer has. */
export function selectionFromParts(platformId: string, ids: string[]): Selection {
  const platform = PLATFORMS.find((p) => p.id === platformId);
  const selection: Selection = {};
  for (const id of ids) {
    const at = id.match(/^at-([a-z]+)-(\w+)$/);
    if (at) {
      if (MOUNT_CODE.test(at[2]) && platform?.slots.some((s) => s.id === at[1])) selection['@' + at[1]] = at[2];
      continue;
    }
    const part = platform?.parts.find((p) => p.id === id);
    if (part) selection[part.slot] = part.id;
  }
  return selection;
}

/* ------------------------------------------------------------- featured builds */

export interface FeaturedBuild {
  id: string;
  platform: Platform;
  tier: Tier;
  name: string;
  summary: string;
  selection: Selection;
}

/** Our own starter builds: three tiers for every platform. */
export const TIER_LABEL: Record<Tier, string> = { budget: 'Budget', value: 'Best Value', premium: 'Premium' };

const TIER_SUMMARY: Record<Tier, (p: Platform) => string> = {
  budget: (p) => `The lowest total for a ${p.name} that still runs reliably. Proven parts, no extras.`,
  value: (p) => `Spends where it counts on a ${p.name}: barrel, trigger and sighting. The build most people should start from.`,
  premium: (p) => `Top-tier parts throughout. A ${p.name} set up for duty use or competition.`,
};

export const FEATURED: FeaturedBuild[] = PLATFORMS.flatMap((p) =>
  (['budget', 'value', 'premium'] as Tier[]).map((tier) => ({
    id: `${p.id}-${tier}`,
    platform: p,
    tier,
    name: `${TIER_LABEL[tier]} ${p.name}`,
    summary: TIER_SUMMARY[tier](p),
    selection: presetSelection(p, tier),
  })),
);

/* ----------------------------------------------------------------- build facts */

export function totalOf(platform: Platform, build: Build) {
  return platform.slots.reduce((sum, s) => sum + (build[s.id] ? bestOffer(build[s.id]!)?.price ?? 0 : 0), 0);
}

export function buildOf(platformId: string, sel: Selection) {
  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  return { platform, build: toBuild(platform, sel), place: placementOf(sel) };
}
