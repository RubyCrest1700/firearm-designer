// Types for scripts/first-read-guard.mjs, so check-presets.ts can import it under tsc.
export function approvalProblems(
  approvals: unknown,
  known: { partIds: Set<string>; links?: Record<string, Record<string, string>> },
): string[];
