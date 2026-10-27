// Types for scripts/pause-guard.mjs, so check-presets.ts can import it under tsc.
export function pausedPriceProblems(
  paused: Record<string, { since: string }> | undefined,
  prices: { offers?: Record<string, Record<string, { price: number; checkedAt?: string }>> },
  history: { parts?: Record<string, (string | number)[][]> },
): string[];
