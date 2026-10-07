import type { RegionState } from './Blueprint';
import { issuesFor, worst } from './engine';
import type { Build, Issue, Part, Placement, Platform } from './types';

/* Fit state of each slot and of the whole build, shared by the builder, build cards and the Compare page. */

/** Slots a complete pistol in the build already fills with its factory parts, and that pistol. */
export function factoryParts(build: Build): Map<string, Part> {
  const out = new Map<string, Part>();
  for (const p of Object.values(build)) for (const s of p?.fills ?? []) if (!build[s]) out.set(s, p!);
  return out;
}

function slotState(build: Build, issues: Issue[], slotId: string, factory: Map<string, Part>): RegionState {
  if (!build[slotId] && !factory.has(slotId)) return 'empty';
  const w = worst(issues.filter((i) => i.slots.includes(slotId)));
  return w === 'error' ? 'error' : w === 'warn' ? 'warn' : 'ok';
}

export function statesFor(platform: Platform, build: Build, place: Placement = {}) {
  const issues = issuesFor(platform, build, place);
  const factory = factoryParts(build);
  const states = Object.fromEntries(platform.slots.map((s) => [s.id, slotState(build, issues, s.id, factory)])) as Record<string, RegionState>;
  return { issues, states };
}

/** `other` holds slots filled with the builder's own part that isn't in our catalog: present, but not checked. */
export function buildStatus(platform: Platform, build: Build, issues: Issue[], other?: Set<string>) {
  const factory = factoryParts(build);
  const missing = platform.slots.filter((s) => s.required && !build[s.id] && !other?.has(s.id) && !factory.has(s.id)).length;
  const errors = issues.filter((i) => i.severity === 'error').length;
  if (errors) return { cls: 'error', text: `${errors} conflict${errors > 1 ? 's' : ''} to fix` };
  if (missing) return { cls: 'warn', text: `${missing} required part${missing > 1 ? 's' : ''} missing` };
  return { cls: 'ok', text: 'Complete and compatible' };
}
