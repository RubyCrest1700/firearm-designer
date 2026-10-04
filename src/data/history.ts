import history from '../../data/price-history.json';
import { bestOffer } from '../engine';
import type { Part } from '../types';

/** Days each part's lowest live price changed, written nightly by scripts/price-history.mjs. */
const SERIES = (history as unknown as { parts: Record<string, [string, number][]> }).parts;

export interface Drop { was: number; now: number; by: number }

/** Smallest change worth a badge: a dollar, and 3% of the price. */
export const worthShowing = (was: number, now: number) => was - now >= Math.max(1, was * 0.03);

/**
 * How far a part's lowest live price has fallen from its high over the last `days`, when the best price we
 * show is that live price. Nothing for sample-priced parts or parts that haven't dropped.
 */
export function recentDrop(part: Part, days = 30, today = new Date()): Drop | undefined {
  const series = SERIES[part.id];
  const best = bestOffer(part);
  if (!series?.length || !best?.checkedAt) return undefined;
  const now = series[series.length - 1][1];
  if (best.price !== now) return undefined;
  const start = new Date(today.getTime() - days * 864e5).toISOString().slice(0, 10);
  // The price in effect when the window opened counts too, so a drop on day 2 of the window shows.
  const inEffect = series.filter(([d]) => d <= start).pop();
  const was = Math.max(...series.filter(([d]) => d > start).map(([, p]) => p), inEffect?.[1] ?? 0);
  return worthShowing(was, now) ? { was, now, by: was - now } : undefined;
}
