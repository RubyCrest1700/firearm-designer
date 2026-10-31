// Types for scripts/retailer-list.mjs, so check-presets.ts can import it under tsc.
export function advanceChecks(
  ledger: Record<string, string>,
  prices: { offers?: Record<string, Record<string, { checkedAt?: string }>> },
): Record<string, string>;
export function renderRetailerList(
  retailers: Record<string, { id: string; name: string; search: string }>,
  sources: {
    parts?: Record<string, Record<string, string>>;
    paused?: Record<string, { since: string; reason: string }>;
    linksOnly?: Record<string, { since: string; reason: string }>;
  },
  checks: Record<string, string>,
): string;
export function retailerListProblems(rendered: string, committed: string | null): string[];
