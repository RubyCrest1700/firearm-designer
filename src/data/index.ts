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
import prices from '../../data/prices.json';
import type { Platform } from '../types';

export const PLATFORMS: Platform[] = [ar15, ar10, ar9, glock9, glockSlim, glockLarge, p320, p365, mp, hellcat];

/**
 * Old platform ids that now open inside another builder: the Glock 17, 19 and 26 are models of the double-stack 9mm Glock builder.
 * Shared links, saved builds and community builds made before the merge still carry the old ids.
 */
export const PLATFORM_ALIASES: Record<string, string> = Object.fromEntries(PLATFORMS.flatMap((p) => (p.models ?? []).map((m) => [m.id, p.id])));
export const canonicalPlatform = (id: string) => PLATFORM_ALIASES[id] ?? id;

/** When the nightly job last ran, or null if every price is still sample data. */
export const PRICES_UPDATED_AT: string | null = (prices as unknown as { updatedAt: string | null }).updatedAt;
