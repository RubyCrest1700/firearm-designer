// Types for scripts/same-name-guard.mjs, so check-presets.ts can import it under tsc.
export interface NamedPart {
  id: string;
  sameAs?: string;
  brand: string;
  name: string;
}
export function nameKey(part: { brand: string; name: string }): string;
export function linkKey(url: string): string;
export function sameNameProblems(parts: readonly NamedPart[], sources: unknown, list: unknown): string[];
export function sameNameCounts(list: unknown): { unchecked: number; different: number };
