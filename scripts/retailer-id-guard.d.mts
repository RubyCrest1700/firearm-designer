// Types for scripts/retailer-id-guard.mjs, so check-presets.ts can import it under tsc.
export function unknownRetailerProblems(
  retailerIds: Iterable<string>,
  data: {
    sources?: unknown;
    prices?: unknown;
    listPrices?: unknown;
    approvals?: unknown;
    catalog?: { part: string; retailer: string }[];
  },
): string[];
