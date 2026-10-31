// Types for scripts/sources.mjs, so unit.test.ts can import it under tsc.
export function retailersFrom(text: string): Record<string, { id: string; name: string; search: string }>;
