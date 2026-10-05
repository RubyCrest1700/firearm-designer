import { ar15 } from './ar15';
import { ar10 } from './ar10';
import { glock17, glock19, glock26 } from './glock';
import { glockSlim } from './glockslim';
import { glockLarge } from './glocklarge';
import { mp } from './mp';
import { hellcat } from './hellcat';
import { p320 } from './p320';
import { p365 } from './p365';
import prices from '../../data/prices.json';
import type { Platform } from '../types';

export const PLATFORMS: Platform[] = [ar15, ar10, glock17, glock19, glock26, glockSlim, glockLarge, p320, p365, mp, hellcat];

/** When the nightly job last ran, or null if every price is still sample data. */
export const PRICES_UPDATED_AT: string | null = (prices as unknown as { updatedAt: string | null }).updatedAt;
