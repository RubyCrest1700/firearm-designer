import type { Build, Platform } from './types';

/** Slots that aren't on the gun when you carry it. */
const OFF_GUN = new Set(['case', 'holster']);

export interface BuildWeight {
  oz: number;
  /** Chosen parts with a weight, and how many of those are estimates. */
  counted: number;
  estimated: number;
  /** Chosen parts we have no weight for. */
  missing: number;
}

/**
 * Unloaded weight of the parts on the gun. `bare` leaves out the optic, the magazine and add-ons, which is how
 * makers quote rifle weights and what the heavy-build thresholds compare against.
 */
export function buildWeight(platform: Platform, b: Build, bare = false): BuildWeight {
  const out: BuildWeight = { oz: 0, counted: 0, estimated: 0, missing: 0 };
  for (const s of platform.slots) {
    const p = b[s.id];
    if (!p || OFF_GUN.has(s.id)) continue;
    if (bare && (s.group === 'Add-ons' || s.id === 'optic' || s.id === 'mag')) continue;
    if (!p.weight) { out.missing++; continue; }
    // Upgrades to a complete base pistol replace a factory part whose weight is already in the pistol's.
    const factory = s.id !== 'pistol' ? b.pistol?.attrs[`w_${s.id}`] : undefined;
    out.oz += p.weight.oz - (typeof factory === 'number' ? factory : 0);
    out.counted++;
    if (!p.weight.published) out.estimated++;
  }
  return out;
}

/** Rifles in pounds, pistols in ounces, the way each is usually quoted. */
export function formatWeight(oz: number, rifle: boolean): string {
  return rifle ? `${(oz / 16).toFixed(1)} lb` : `${oz.toFixed(1)} oz`;
}
