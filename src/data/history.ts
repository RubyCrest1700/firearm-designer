import history from '../../data/price-history.json';
import { bestOffer, isEstimate } from '../engine';
import type { Part } from '../types';

/** Days each part's lowest live price changed, written nightly by scripts/price-history.mjs. */
const SERIES = (history as unknown as { parts: Record<string, [string, number][]> }).parts;

/**
 * A part's recorded price changes that we can still show. The file keeps only each part's lowest price, not which
 * store had it, so for a part a paused retailer priced, every point on or before the pause date (Part.pausedThrough)
 * is dropped: its low may be that retailer's. Until the part's price next changes it has no history to show.
 */
export function seriesOf(part: Part): [string, number][] {
  const series = SERIES[part.id] ?? [];
  return part.pausedThrough ? series.filter(([d]) => d > part.pausedThrough!) : series;
}

/**
 * The first day the file records a live price for a part, if it ever has. Unlike seriesOf this keeps a paused retailer's
 * points: it asks when a live price first existed, not which prices we can show.
 */
export const firstLiveDay = (part: Part): string | undefined => SERIES[part.id]?.[0]?.[0];

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n: number, from = new Date()) => new Date(from.getTime() - n * 864e5).toISOString().slice(0, 10);

/** Smallest change worth a badge, either way: a dollar, and 3% of the price. */
export const worthShowing = (was: number, now: number) => Math.abs(was - now) >= Math.max(1, was * 0.03);

/** Lowest sample (untracked) price, which doesn't move, so a live price only counts when it's lower. */
function sampleFloor(part: Part) {
  const sample = part.offers.filter((o) => !o.checkedAt);
  const inStock = sample.filter((o) => o.inStock);
  const pool = inStock.length ? inStock : sample;
  return pool.length ? Math.min(...pool.map((o) => o.price)) : Infinity;
}

/**
 * The best price we'd have shown for a part on a day (YYYY-MM-DD). Before its history starts, the first
 * recorded price stands in; a part with no history is at today's price throughout.
 */
export function priceOn(part: Part, day: string): number {
  if (!hasHistory(part)) return bestOffer(part)?.price ?? 0;
  const series = seriesOf(part);
  const live = (series.filter(([d]) => d <= day).pop() ?? series[0])[1];
  return Math.min(live, sampleFloor(part));
}

/** Days any of these parts changed price between `from` and `to`, with both ends included. */
function changeDays(parts: Part[], from: string, to: string) {
  const days = new Set([from, to]);
  for (const p of parts) for (const [d] of seriesOf(p)) if (d > from && d < to) days.add(d);
  return [...days].sort();
}

export type Point = [day: string, price: number];

/** A part's best price from `from` to today, one point per change. */
export const partSeries = (part: Part, from: string, to = today()): Point[] => changeDays([part], from, to).map((d) => [d, priceOn(part, d)]);

/**
 * A part's figure on the Build Total chart on a day. Only a live price moves: a part shown at an estimate or a
 * hand-checked price holds that shown price every day, whatever its history says. On the chart's last day (`to`) every
 * part is at its shown price, so the line ends on the card's total. A part with no price adds nothing, as in totalOf.
 */
function chartPriceOn(part: Part, day: string, to: string): number {
  const best = bestOffer(part);
  if (!best) return 0;
  if (!best.checkedAt || day >= to || !hasHistory(part)) return best.price;
  const series = seriesOf(part);
  return (series.filter(([d]) => d <= day).pop() ?? series[0])[1];
}

/** A build's total from `from` to today, one point per change. Pass the parts the total adds up (totalParts). */
export const totalSeries = (parts: Part[], from: string, to = today()): Point[] =>
  changeDays(parts, from, to).map((d) => [d, parts.reduce((sum, p) => sum + chartPriceOn(p, d, to), 0)]);

export interface Change { was: number; now: number; by: number }

/**
 * How a part's best price moved over the last `days`: `by` is positive for a drop, negative for a rise. Nothing for a
 * part at an estimate today: going to an estimate isn't a price change.
 */
export function recentChange(part: Part, days = 30): Change | undefined {
  const best = bestOffer(part);
  if (!hasHistory(part) || (best && isEstimate(best))) return undefined;
  const was = priceOn(part, daysAgo(days));
  const now = best?.price ?? priceOn(part, today());
  return worthShowing(was, now) ? { was, now, by: was - now } : undefined;
}

/**
 * Whether a part has any price history yet (sample-priced parts never do). A part with no offers now (sold only by
 * a paused retailer) has none to show either: its recorded prices came from that retailer. Nor does a part whose only
 * points date from before a paused retailer's pause (seriesOf).
 */
export function hasHistory(part: Part) {
  return part.offers.length > 0 && seriesOf(part).length > 0;
}

/** A drop big enough for the home page: $5, and 5% of the price. */
const bigDrop = (was: number, now: number) => was - now >= Math.max(5, was * 0.05);

/**
 * Parts whose live best price fell the most over the last `days`, biggest dollar drop first. A part listed for
 * several platforms (same id, or same brand and name) counts once.
 */
export function biggestDrops(parts: Part[], days = 7, max = 6): (Change & { part: Part })[] {
  const seen = new Set<string>();
  const drops: (Change & { part: Part })[] = [];
  for (const part of parts) {
    const name = `${part.brand} ${part.name}`;
    if (seen.has(part.id) || seen.has(name) || !hasHistory(part) || !bestOffer(part)?.checkedAt) continue;
    seen.add(part.id).add(name);
    const was = priceOn(part, daysAgo(days));
    const now = bestOffer(part)!.price;
    if (bigDrop(was, now)) drops.push({ part, was, now, by: was - now });
  }
  return drops.sort((a, b) => b.by - a.by).slice(0, max);
}
