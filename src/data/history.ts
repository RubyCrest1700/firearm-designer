import history from '../../data/price-history.json';
import { bestOffer } from '../engine';
import type { Part } from '../types';

/** Days each part's lowest live price changed, written nightly by scripts/price-history.mjs. */
const SERIES = (history as unknown as { parts: Record<string, [string, number][]> }).parts;

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
  const series = SERIES[part.id];
  if (!series?.length) return bestOffer(part)?.price ?? 0;
  const live = (series.filter(([d]) => d <= day).pop() ?? series[0])[1];
  return Math.min(live, sampleFloor(part));
}

/** Days any of these parts changed price between `from` and `to`, with both ends included. */
function changeDays(parts: Part[], from: string, to: string) {
  const days = new Set([from, to]);
  for (const p of parts) for (const [d] of SERIES[p.id] ?? []) if (d > from && d < to) days.add(d);
  return [...days].sort();
}

export type Point = [day: string, price: number];

/** A part's best price from `from` to today, one point per change. */
export const partSeries = (part: Part, from: string, to = today()): Point[] => changeDays([part], from, to).map((d) => [d, priceOn(part, d)]);

/** A build's total at best prices from `from` to today, one point per change. */
export const totalSeries = (parts: Part[], from: string, to = today()): Point[] =>
  changeDays(parts, from, to).map((d) => [d, parts.reduce((sum, p) => sum + priceOn(p, d), 0)]);

export interface Change { was: number; now: number; by: number }

/** How a part's best price moved over the last `days`: `by` is positive for a drop, negative for a rise. */
export function recentChange(part: Part, days = 30): Change | undefined {
  if (!SERIES[part.id]?.length) return undefined;
  const was = priceOn(part, daysAgo(days));
  const now = bestOffer(part)?.price ?? priceOn(part, today());
  return worthShowing(was, now) ? { was, now, by: was - now } : undefined;
}

/** Whether a part has any price history yet (sample-priced parts never do). */
export const hasHistory = (part: Part) => (SERIES[part.id]?.length ?? 0) > 0;
