import { SHARE_BASE } from './config';
import { PLATFORMS, canonicalPlatform } from './data';
import { MOUNT_CODE, baseSelection, bestOffer, estimatedCount, isEstimate, ownedOf, placementOf, presetSelection, selectionTokens, toBuild, unpricedCount, type Selection } from './engine';
import { firstLiveDay, worthShowing } from './data/history';
import ESTIMATE_ERA_PARTS from '../data/estimate-era-parts.json';
import type { Build, Part, Platform, Tier } from './types';

/* ---------------------------------------------------------------- saved builds */

export interface SavedBuild {
  id: string;
  name: string;
  platform: string;
  selection: Selection;
  savedAt: string;
  /** Best live price of each part when it went into the saved build, for "price dropped since you saved". Never an estimate. */
  prices?: Record<string, number>;
  /** When some of `prices` were last reset to that day's prices, because they may have been a paused retailer's (pausedPrice) or an estimate (estimateFigure). */
  pricesAt?: string;
  /** True once estimateFigure has judged this build's prices: on its first load, or from the start for a build saved since then. Never judged again. */
  pricesChecked?: boolean;
  /** True once the one-time estimate-era clear has run on this build, or from the start for a build saved since then. Never run again. */
  estimateEraCleared?: boolean;
}

const SAVED_KEY = 'firearm-designer:saved:v1';

/**
 * Parts with no live price when estimates were kept out of saved builds for good. A figure stored for one may be an
 * estimate that estimateFigure passed, saved after a pause while the part was already at one, so it's dropped once
 * (SavedBuild.estimateEraCleared). A fixed list, as a browser may first load after a nightly has priced these parts.
 */
const ESTIMATE_ERA = new Set<string>(ESTIMATE_ERA_PARTS);

const isText = (v: unknown): v is string => typeof v === 'string';
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The stored entries as they are, or null when there's nothing stored or it can't be read at all. */
function readStored(): unknown[] | null {
  const raw = localStorage.getItem(SAVED_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

/** One stored entry as a saved build to show, or null when it's damaged or for a shelved platform. */
function savedEntry(e: unknown): SavedBuild | null {
  try {
    if (!isRecord(e) || !isText(e.id) || !isText(e.name) || !isText(e.platform) || !isText(e.savedAt)) return null;
    const { selection, prices } = e;
    if (!isRecord(selection) || !Object.values(selection).every(isText)) return null;
    if (prices !== undefined && (!isRecord(prices) || !Object.values(prices).every((v) => typeof v === 'number'))) return null;
    const platform = canonicalPlatform(e.platform);
    if (!PLATFORMS.some((p) => p.id === platform)) return null;
    // Builds saved before price tracking start from today's prices, and so does a part whose saved price may be a
    // paused retailer's (pausedPrice) or, on a build's first load, an estimate (estimateFigure, ESTIMATE_ERA).
    const sel = selection as Selection;
    const { pricesAt, pricesChecked, estimateEraCleared, ...entry } = e as unknown as SavedBuild;
    const at = isText(pricesAt) ? { pricesAt } : {};
    const stored = prices as Record<string, number> | undefined;
    const kept = stored && trustedPrices(platform, sel, pricedAt({ savedAt: entry.savedAt, ...at }), stored, pricesChecked === true, estimateEraCleared === true);
    const reset = !!stored && Object.keys(kept!).length < Object.keys(stored).length;
    return { ...entry, platform, selection: sel, prices: priceSnapshot(platform, sel, kept), pricesChecked: true, estimateEraCleared: true, ...(reset ? { pricesAt: new Date().toISOString() } : at) };
  } catch {
    return null;
  }
}

/** Saved builds to show. A damaged entry is skipped on its own, so it can't hide the others. */
export function loadSavedBuilds(): SavedBuild[] {
  try {
    return (readStored() ?? []).map(savedEntry).filter((s): s is SavedBuild => !!s);
  } catch {
    return [];
  }
}

export function storeSavedBuilds(list: SavedBuild[]) {
  try {
    // Entries that aren't shown (a shelved platform's builds, or one that can't be read) stay stored as they
    // are, so a platform that comes back brings its builds and a save never wipes what it couldn't read.
    const stored = readStored();
    if (!stored) {
      // Not a list at all: keep a copy aside before starting a new list.
      const backup = SAVED_KEY + ':unreadable';
      if (!localStorage.getItem(backup)) localStorage.setItem(backup, localStorage.getItem(SAVED_KEY) ?? '');
    }
    const kept = (stored ?? []).filter((e) => !savedEntry(e));
    localStorage.setItem(SAVED_KEY, JSON.stringify([...list, ...kept]));
  } catch {
    /* storage unavailable: saved builds last for this visit only */
  }
}

/**
 * Best price of each part in a selection, leaving out estimates: they're never stored to compare with. Parts already
 * in `keep` hold their earlier price, so editing a saved build doesn't reset the drop on parts that stayed, and a part
 * that fell back to an estimate keeps its last live price for when a live one returns.
 */
export function priceSnapshot(platformId: string, sel: Selection, keep: Record<string, number> = {}) {
  const { build } = buildOf(platformId, sel);
  const { owned } = ownedOf(sel);
  const out: Record<string, number> = {};
  for (const part of Object.values(build)) {
    const best = part && !owned.has(part.slot) ? bestOffer(part) : undefined;
    if (!part || !best) continue;
    const price = keep[part.id] ?? (isEstimate(best) ? undefined : best.price);
    if (price !== undefined) out[part.id] = price;
  }
  return out;
}

/** The price fields of a new save or a re-save, as of now. `keep` is priceSnapshot's. */
export const savedPrices = (platformId: string, sel: Selection, keep?: Record<string, number>) => ({
  savedAt: new Date().toISOString(),
  prices: priceSnapshot(platformId, sel, keep),
  pricesChecked: true,
  estimateEraCleared: true,
});

/**
 * Whether a saved build's price for this part may be a paused retailer's: the build was saved on or before the pause
 * date of a retailer that priced the part (Part.pausedThrough). Such a price isn't compared with today's, or the pause
 * would read as a price rise. A save with no readable date counts as before.
 */
export const pausedPrice = (part: Part, savedAt: string) => !!part.pausedThrough && !(savedAt.slice(0, 10) > part.pausedThrough);

/** When a saved build's prices were taken: its save, or a later reset (SavedBuild.pricesAt). */
const pricedAt = (s: Pick<SavedBuild, 'savedAt' | 'pricesAt'>) => (s.pricesAt && s.pricesAt > s.savedAt ? s.pricesAt : s.savedAt);

/**
 * Whether a saved build's price for this part can't be trusted as a live one, because it may be an estimate from before
 * estimates were kept out of saved builds: it was taken on or before the first day the part had a live price
 * (firstLiveDay), or the part has never had one and is an estimate today. A hand-checked price with no history is left
 * alone: it was never an estimate. Asked once per build (SavedBuild.pricesChecked): a price stored later is live whatever
 * its date says, and the first live day moves as the history file is trimmed.
 */
function estimateFigure(part: Part, pricedOn: string) {
  const day = pricedOn.slice(0, 10);
  const first = firstLiveDay(part);
  const best = bestOffer(part);
  return first ? first >= day : !!best && isEstimate(best);
}

/**
 * A saved build's prices without the ones that may be a paused retailer's (pausedPrice) or, unless the build has been
 * checked or cleared, an estimate (estimateFigure, ESTIMATE_ERA). Owned parts are left to priceSnapshot, which drops them
 * without it being a reset.
 */
function trustedPrices(platformId: string, sel: Selection, savedAt: string, prices: Record<string, number>, checked: boolean, cleared: boolean) {
  const { build } = buildOf(platformId, sel);
  const { owned } = ownedOf(sel);
  const stale = new Set(Object.values(build).filter((p): p is Part => !!p && !owned.has(p.slot) && (pausedPrice(p, savedAt) || (!checked && estimateFigure(p, savedAt)) || (!cleared && ESTIMATE_ERA.has(p.id)))).map((p) => p.id));
  return Object.fromEntries(Object.entries(prices).filter(([id]) => !stale.has(id)));
}

export interface PriceChange { part: Part; was: number; now: number }

/**
 * Parts still to buy in a saved build whose best price moved since it was saved, biggest drop first, and the net change.
 * A part at an estimate today is left out: going to or from an estimate isn't a price change.
 */
export function priceChanges(s: SavedBuild): { changes: PriceChange[]; drop: number } {
  const { build } = buildOf(s.platform, s.selection);
  const { owned } = ownedOf(s.selection);
  const changes: PriceChange[] = [];
  for (const part of Object.values(build)) {
    const was = part && !owned.has(part.slot) && !pausedPrice(part, pricedAt(s)) ? s.prices?.[part.id] : undefined;
    const best = part && bestOffer(part);
    const now = best && !isEstimate(best) ? best.price : undefined;
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
    const [old, ids = ''] = raw.split('~');
    const pid = canonicalPlatform(old);
    const platform = PLATFORMS.find((p) => p.id === pid);
    if (!platform) return null;
    const selection = selectionFromParts(pid, ids.split('.'));
    // A link with no parts opens the plain factory build, of the model it names (`glock26~`) if it names one.
    const model = platform.models?.find((m) => m.id === old);
    return { platform: pid, selection: Object.keys(selection).length ? selection : baseSelection(model ? { ...platform, presets: model.presets, base: model.base } : platform) };
  } catch {
    return null;
  }
}

/** Turns part ids and placement tokens back into a selection, skipping ids the catalog no longer has. */
export function selectionFromParts(platformId: string, ids: string[]): Selection {
  const platform = PLATFORMS.find((p) => p.id === canonicalPlatform(platformId));
  const selection: Selection = {};
  for (const id of ids) {
    const at = id.match(/^at-([a-z]+)-(\w+)$/);
    if (at) {
      if (MOUNT_CODE.test(at[2]) && platform?.slots.some((s) => s.id === at[1])) selection['@' + at[1]] = at[2];
      continue;
    }
    const own = id.match(/^(own|has)-([a-z]+)$/);
    if (own) {
      if (platform?.slots.some((s) => s.id === own[2])) selection['+' + own[2]] = own[1] === 'has' ? 'other' : 'own';
      continue;
    }
    const part = platform?.parts.find((p) => p.id === id);
    if (part) selection[part.slot] = part.id;
  }
  // Drop owned marks that don't match the slot: `own` needs a part, `other` stands in for one.
  for (const k of Object.keys(selection)) {
    if (!k.startsWith('+')) continue;
    const filled = !!selection[k.slice(1)];
    if ((selection[k] === 'own') !== filled) delete selection[k];
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

/** A builder with models (the double-stack 9mm Glocks) gets starter builds for each model, under the model's name and old ids. */
export const FEATURED: FeaturedBuild[] = PLATFORMS.flatMap((p) =>
  (p.models ?? [{ id: p.id, name: p.name, blurb: p.blurb, presets: p.presets }]).flatMap((m) =>
    (['budget', 'value', 'premium'] as Tier[]).map((tier) => ({
      id: `${m.id}-${tier}`,
      platform: p,
      tier,
      name: `${TIER_LABEL[tier]} ${m.name}`,
      summary: TIER_SUMMARY[tier]({ ...p, name: m.name }),
      selection: presetSelection({ ...p, presets: m.presets }, tier),
    })),
  ),
);

/* ----------------------------------------------------------------- build facts */

/** Best-price total of the build's parts, leaving out slots in `skip` (the parts the builder already owns). */
export function totalOf(platform: Platform, build: Build, skip?: Set<string>) {
  return platform.slots.reduce((sum, s) => sum + (build[s.id] && !skip?.has(s.id) ? bestOffer(build[s.id]!)?.price ?? 0 : 0), 0);
}

/** The parts totalOf adds up, in its order, so the Build Total chart ends on the same figure as the card. */
export const totalParts = (platform: Platform, build: Build, skip?: Set<string>) =>
  platform.slots.filter((s) => build[s.id] && !skip?.has(s.id)).map((s) => build[s.id]!);

/** How many parts totalOf leaves out for having no price, for the note beside the total (noPriceNote). */
export const unpricedOf = (platform: Platform, build: Build, skip?: Set<string>) =>
  unpricedCount(platform.slots.filter((s) => !skip?.has(s.id)).map((s) => build[s.id]));

/** How many prices in totalOf are estimates, for the note beside the total (estimateNote). */
export const estimatedOf = (platform: Platform, build: Build, skip?: Set<string>) =>
  estimatedCount(platform.slots.filter((s) => !skip?.has(s.id)).map((s) => build[s.id]));

export function buildOf(platformId: string, sel: Selection) {
  const platform = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];
  return { platform, build: toBuild(platform, sel), place: placementOf(sel) };
}
