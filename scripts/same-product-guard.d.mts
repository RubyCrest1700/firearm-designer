// Types for scripts/same-product-guard.mjs, so check-presets.ts and unit.test.ts can import it under tsc.
export interface CatalogEntry {
  id: string;
  sameAs?: string;
  brand: string;
  name: string;
  mpn?: string;
  /** The FFL mark. Missing means not serialized. */
  serialized?: boolean;
  /** The estimate offers as written in src/data: [store, price, in stock?]. */
  offers?: readonly (readonly [string, number, boolean?])[];
}
export function sameProductProblems(
  parts: readonly CatalogEntry[],
  data: {
    sources?: unknown;
    listPrices?: unknown;
    approvals?: unknown;
    weights?: unknown;
  },
): string[];
export function missingWeightProblem(part: { id: string; sameAs?: string }, weights: unknown): string | undefined;
export function sameProductLeftovers(parts: readonly CatalogEntry[], files: Record<string, unknown>): { file: string; parts: string[] }[];
