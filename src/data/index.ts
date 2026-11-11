import { ar15 } from './ar15';
import { ar10 } from './ar10';
import { glock9 } from './glock';
import { glockSlim } from './glockslim';
import { glockLarge } from './glocklarge';
import { mp } from './mp';
import { hellcat } from './hellcat';
import { ar9 } from './ar9';
import { p320 } from './p320';
import { p365 } from './p365';
import { liveCheckedAts } from './helpers';
import type { Platform } from '../types';

export const PLATFORMS: Platform[] = [ar15, ar10, ar9, glock9, glockSlim, glockLarge, p320, p365, mp, hellcat];

/**
 * Old platform ids that now open inside another builder: the Glock 17, 19 and 26 are models of the double-stack 9mm Glock builder.
 * Shared links, saved builds and community builds made before the merge still carry the old ids.
 */
export const PLATFORM_ALIASES: Record<string, string> = Object.fromEntries(PLATFORMS.flatMap((p) => (p.models ?? []).map((m) => [m.id, p.id])));
export const canonicalPlatform = (id: string) => PLATFORM_ALIASES[id] ?? id;

/**
 * Part ids the catalog dropped, and the part that stands in for each. Share links, community builds, saved builds and
 * the builds kept for a tab made before the change still carry the old ids.
 */
export const RETIRED_IDS: Record<string, string> = { 'gs-rsa-43x': 'gs-rsa-48' };
export const currentId = (id: string) => (Object.prototype.hasOwnProperty.call(RETIRED_IDS, id) ? RETIRED_IDS[id] : id);
/** A stored selection (slot to part id) with retired part ids swapped for the current ones. */
export const currentSelection = (sel: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, currentId(v)]));

/**
 * When most prices were read: the latest moment (a full ISO time) with at least half of these read times at or after
 * it. Null when there are none, or when fewer than half can be read: a time that can't be read counts as a price
 * never read.
 */
export function readAtInstant(checkedAts: string[]): string | null {
  const times = checkedAts
    .map((iso) => Date.parse(iso))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a);
  const at = times[Math.ceil(checkedAts.length / 2) - 1];
  return at === undefined ? null : new Date(at).toISOString();
}

/**
 * When most live prices were read (readAtInstant over every live price the site can show), or null if every price is
 * still an estimate. The nightly job's own run time (updatedAt in data/prices.json) moves on even when most reads
 * failed, so the pages show this time instead.
 */
export const PRICES_READ_AT: string | null = readAtInstant(liveCheckedAts());
