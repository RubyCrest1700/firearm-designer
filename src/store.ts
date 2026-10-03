import { PLATFORMS } from './data';
import { bestOffer, presetSelection, toBuild, type Selection } from './engine';
import type { Build, Platform, Tier } from './types';

/* ---------------------------------------------------------------- saved builds */

export interface SavedBuild {
  id: string;
  name: string;
  platform: string;
  selection: Selection;
  savedAt: string;
}

const SAVED_KEY = 'firearm-designer:saved:v1';

export function loadSavedBuilds(): SavedBuild[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as SavedBuild[]) : [];
    return list.filter((s) => PLATFORMS.some((p) => p.id === s.platform));
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

export const newId = () => Math.random().toString(36).slice(2, 10);

/* ----------------------------------------------------------------- share links */

/** `?b=<platform>~<part>.<part>…` — part ids never contain `.` or `~`. */
export function shareUrl(platformId: string, sel: Selection) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}?b=${encodeURIComponent(`${platformId}~${Object.values(sel).join('.')}`)}`;
}

export function readSharedBuild(): { platform: string; selection: Selection } | null {
  try {
    const raw = new URLSearchParams(location.search).get('b');
    if (!raw) return null;
    const [pid, ids = ''] = raw.split('~');
    const platform = PLATFORMS.find((p) => p.id === pid);
    if (!platform) return null;
    const selection: Selection = {};
    for (const id of ids.split('.')) {
      const part = platform.parts.find((p) => p.id === id);
      if (part) selection[part.slot] = part.id;
    }
    return { platform: platform.id, selection };
  } catch {
    return null;
  }
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

export const TIER_LABEL: Record<Tier, string> = { budget: 'Budget', value: 'Best value', premium: 'Premium' };

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
  return { platform, build: toBuild(platform, sel) };
}
