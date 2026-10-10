import type { RegionState } from './Blueprint';
import { issuesFor, worst } from './engine';
import type { Build, Issue, Placement, Platform } from './types';

/* Fit state of each slot and of the whole build, shared by the builder, build cards and the Compare page. */

function slotState(build: Build, issues: Issue[], slotId: string): RegionState {
  if (!build[slotId]) return 'empty';
  const w = worst(issues.filter((i) => i.slots.includes(slotId)));
  return w === 'error' ? 'error' : w === 'warn' ? 'warn' : 'ok';
}

export function statesFor(platform: Platform, build: Build, place: Placement = {}) {
  const issues = issuesFor(platform, build, place);
  const states = Object.fromEntries(platform.slots.map((s) => [s.id, slotState(build, issues, s.id)])) as Record<string, RegionState>;
  return { issues, states };
}

/**
 * `other` holds slots filled with the builder's own part that isn't in our catalog: present, but not checked.
 * `complete` means every required part is in and nothing conflicts; open Checks still show amber.
 */
export function buildStatus(platform: Platform, build: Build, issues: Issue[], other?: Set<string>) {
  const missing = platform.slots.filter((s) => s.required && !build[s.id] && !other?.has(s.id)).length;
  const errors = issues.filter((i) => i.severity === 'error').length;
  const checks = issues.filter((i) => i.severity === 'warn').length;
  if (errors) return { cls: 'error', text: `${errors} conflict${errors > 1 ? 's' : ''} to fix`, complete: false };
  if (missing) return { cls: 'warn', text: `${missing} required part${missing > 1 ? 's' : ''} missing`, complete: false };
  if (checks) return { cls: 'warn', text: `Complete · ${checks} check${checks > 1 ? 's' : ''} to review`, complete: true };
  return { cls: 'ok', text: 'Complete and compatible', complete: true };
}
