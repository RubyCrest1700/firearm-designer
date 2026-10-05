import { useRef, useState, type ReactNode } from 'react';
import { mountsFor } from './data/addons';
import { AR_PROFILES, type ArPiece } from './data/arProfiles';
import { OPTIC_PROFILES } from './data/opticProfiles';
import { PROFILES } from './data/pistolProfiles';
import type { Build, Part, Placement, Platform } from './types';

/**
 * Blueprint-style side elevation of a build, drawn as line art from real-world proportions (inches)
 * and the selected parts' attributes. The Sig pistols follow Sig's own design-patent drawings
 * (public records); no product photos are traced.
 */

export type RegionState = 'empty' | 'ok' | 'warn' | 'error';

interface Piece {
  /** Slot this piece belongs to; dropped to static context when the platform has no such slot. */
  slot?: string;
  /** Internal parts use hidden (dashed) lines, as on an engineering drawing. */
  internal?: boolean;
  z: number;
  /** Callout anchor in px and which callout row it uses. */
  target: [number, number];
  row: 'top' | 'bottom';
  el: ReactNode;
  /** Accessories the builder can drag along the rail: position limits and snap step in inches, px per inch. */
  move?: { at: number; min: number; max: number; step: number; scale: number };
  /** Dimension shown while the piece is selected: [x0, x1, y, label] in px. */
  dim?: [number, number, number, string];
}

interface Scene {
  width: number;
  height: number;
  pieces: Piece[];
  /** Bore / slide centerline: [x0, x1, y] */
  center: [number, number, number];
  /** Dimension lines: [x0, x1, y, label] */
  dims: [number, number, number, string][];
  /** Vertical dimension lines: [x, y0, y1, label] */
  vdims?: [number, number, number, string][];
  rows: [number, number];
  /** Short spec line for the title block */
  spec: string;
}

const f = (n: number) => Math.round(n * 100) / 100;

/** Map a path written in inches ("x,y" pairs, absolute commands) onto the drawing. */
function makeT(S: number, ox: number, oy: number) {
  return (d: string, kx = 1, ky = 1, ax = 0) =>
    d.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_, x, y) => `${f(ox + (ax + Number(x) * kx) * S)},${f(oy + Number(y) * ky * S)}`);
}

const matches = (p: Part | undefined, re: RegExp) => !!p && re.test(`${p.name} ${p.specs.join(' ')}`);
const inch = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')}"`;

/** Picatinny rail cross slots along a top edge at y, from x0 to x1 (inches, 0.394" pitch). */
function pic(x0: number, x1: number, y: number) {
  let d = '';
  for (let x = x0; x + 0.206 <= x1 + 1e-6; x += 0.394) d += `M${f(x)},${f(y)} L${f(x)},${f(y + 0.1)} L${f(x + 0.206)},${f(y + 0.1)} L${f(x + 0.206)},${f(y)} `;
  return d;
}

function repeat(from: number, to: number, step: number, fn: (x: number) => string) {
  let d = '';
  for (let x = from; x <= to + 1e-6; x += step) d += fn(f(x)) + ' ';
  return d;
}

/* ================================================================== rifles */

const GAS_FROM_BOLT: Record<string, number> = { pistol: 4, carbine: 7, midlength: 9, rifle: 12 };

/** Top of the upper receiver's rail above the bore, from the traced flat-top (scripts/pistol-profiles/ar.py). */
const MAG_X = 4.2, MAG_Y = 3.0;
const AR_RAIL = Math.min(...AR_PROFILES.upper.outline[0].filter((_, i) => i % 2));
/** Rear of the stock's butt in the traced drawing, which shows it on a carbine buffer tube. */
const AR_STOCK_REAR = Math.min(...AR_PROFILES.stock.outline[0].filter((_, i) => !(i % 2)));
/** Detail lines of the Glock-magazine 9mm lower, placed by hand on US D782,596 FIG. 1 in receiver inches: the
 *  buffer tower, the takedown pin ring, the selector and pin holes, the mag catch boss and button, and the mag well ribs. */
const LOWER9_DETAIL: number[][] = [
  [-0.413, -0.246, -0.046, -0.246],
  [-0.413, 0.241, 0.043, 0.241],
  [-0.46, 0.924, 0.11, 0.916],
  [-0.354, 0.935, -0.354, 1.294],
  [0.094, 1.033, 0.336, 1.17, 0.511, 1.326, 0.656, 1.54, 0.745, 1.774, 0.773, 1.93],
  [0.773, 1.942, 1.331, 1.942],
  [1.35, 1.895, 2.064, 1.907],
  [3.417, 0.674, 3.417, 1.013, 4.021, 1.013],
  [3.417, 1.852, 3.417, 1.762, 4.021, 1.762],
  [3.709, 1.013, 3.709, 0.721, 6.674, 0.721],
  [4.08, 1.337, 6.194, 1.337, 6.225, 1.384, 6.233, 1.482],
  [4.08, 1.657, 6.167, 1.657],
  [6.42, 0.998, 4.458, 0.998, 4.408, 1.049, 4.4, 1.883, 4.509, 1.93, 4.626, 2.047, 4.673, 2.203, 4.607, 2.632, 4.579, 2.846, 5.944, 2.605],
  [3.885, 1.891, 4.372, 1.891],
  [3.979, 1.033, 4.006, 1.04, 4.026, 1.06, 4.033, 1.088, 4.033, 1.626, 4.026, 1.653, 4.006, 1.673, 3.979, 1.68, 3.581, 1.68, 3.554, 1.673, 3.534, 1.653, 3.526, 1.626, 3.526, 1.088, 3.534, 1.06, 3.554, 1.04, 3.581, 1.033, 3.979, 1.033],
  [0.745, 0.857, 0.742, 0.884, 0.734, 0.91, 0.719, 0.933, 0.7, 0.952, 0.677, 0.966, 0.652, 0.975, 0.625, 0.978, 0.598, 0.975, 0.572, 0.966, 0.549, 0.952, 0.53, 0.933, 0.516, 0.91, 0.507, 0.884, 0.504, 0.857, 0.507, 0.831, 0.516, 0.805, 0.53, 0.782, 0.549, 0.763, 0.572, 0.749, 0.598, 0.74, 0.625, 0.737, 0.652, 0.74, 0.677, 0.749, 0.7, 0.763, 0.719, 0.782, 0.734, 0.805, 0.742, 0.831, 0.745, 0.857],
  [0.808, 0.857, 0.803, 0.898, 0.79, 0.937, 0.768, 0.972, 0.739, 1.001, 0.704, 1.023, 0.665, 1.036, 0.625, 1.041, 0.584, 1.036, 0.545, 1.023, 0.51, 1.001, 0.481, 0.972, 0.459, 0.937, 0.446, 0.898, 0.441, 0.857, 0.446, 0.817, 0.459, 0.778, 0.481, 0.743, 0.51, 0.714, 0.545, 0.692, 0.584, 0.679, 0.625, 0.674, 0.665, 0.679, 0.704, 0.692, 0.739, 0.714, 0.768, 0.743, 0.79, 0.778, 0.803, 0.817, 0.808, 0.857],
  [1.592, 1.318, 1.587, 1.358, 1.574, 1.396, 1.553, 1.43, 1.524, 1.458, 1.49, 1.479, 1.452, 1.493, 1.412, 1.497, 1.372, 1.493, 1.335, 1.479, 1.301, 1.458, 1.272, 1.43, 1.251, 1.396, 1.237, 1.358, 1.233, 1.318, 1.237, 1.278, 1.251, 1.24, 1.272, 1.206, 1.301, 1.177, 1.335, 1.156, 1.372, 1.143, 1.412, 1.138, 1.452, 1.143, 1.49, 1.156, 1.524, 1.177, 1.553, 1.206, 1.574, 1.24, 1.587, 1.278, 1.592, 1.318],
  [2.582, 1.528, 2.581, 1.545, 2.575, 1.56, 2.566, 1.575, 2.555, 1.586, 2.54, 1.595, 2.525, 1.601, 2.508, 1.602, 2.492, 1.601, 2.476, 1.595, 2.462, 1.586, 2.45, 1.575, 2.442, 1.56, 2.436, 1.545, 2.434, 1.528, 2.436, 1.512, 2.442, 1.496, 2.45, 1.482, 2.462, 1.47, 2.476, 1.462, 2.492, 1.456, 2.508, 1.454, 2.525, 1.456, 2.54, 1.462, 2.555, 1.47, 2.566, 1.482, 2.575, 1.496, 2.581, 1.512, 2.582, 1.528],
  [3.401, 1.228, 3.4, 1.244, 3.394, 1.26, 3.385, 1.274, 3.374, 1.286, 3.359, 1.295, 3.344, 1.3, 3.327, 1.302, 3.311, 1.3, 3.295, 1.295, 3.281, 1.286, 3.269, 1.274, 3.261, 1.26, 3.255, 1.244, 3.253, 1.228, 3.255, 1.212, 3.261, 1.196, 3.269, 1.182, 3.281, 1.17, 3.295, 1.161, 3.311, 1.156, 3.327, 1.154, 3.344, 1.156, 3.359, 1.161, 3.374, 1.17, 3.385, 1.182, 3.394, 1.196, 3.4, 1.212, 3.401, 1.228],
  [6.865, 0.857, 6.862, 0.884, 6.853, 0.908, 6.839, 0.93, 6.821, 0.949, 6.798, 0.963, 6.774, 0.972, 6.748, 0.974, 6.722, 0.972, 6.697, 0.963, 6.675, 0.949, 6.656, 0.93, 6.642, 0.908, 6.634, 0.884, 6.631, 0.857, 6.634, 0.831, 6.642, 0.807, 6.656, 0.785, 6.675, 0.766, 6.697, 0.752, 6.722, 0.743, 6.748, 0.741, 6.774, 0.743, 6.798, 0.752, 6.821, 0.766, 6.839, 0.785, 6.853, 0.807, 6.862, 0.831, 6.865, 0.857],
];
type ArStockKey = 'stockA2' | 'stockPrs' | 'stockMoeRifle' | 'stockUbr' | 'stockMoeSl' | 'stockCtr';
const same: Map2 = (x, y) => [x, y];
/** Outline and detail paths of a traced AR piece. */
function arPaths(pc: ArPiece, map: Map2 = same) {
  return { o: pc.outline.map((ol) => polyPath(ol, map, true)).join(' '), d: pc.detail.map((ol) => polyPath(ol, map, false)).join(' ') };
}
/** Is (x, y) inside the closed polyline? */
function inside(pts: number[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    if ((pts[i + 1] > y) !== (pts[j + 1] > y) && x < ((pts[j] - pts[i]) * (y - pts[i + 1])) / (pts[j + 1] - pts[i + 1]) + pts[i]) c = !c;
  }
  return c;
}

/** Dots on a staggered grid inside a polygon (flat x,y list), kept a tenth of an inch off its edge: grip textures. */
function dotsIn(poly: number[], pitch: number, map: Map2 = same, margin = 0.1): string {
  const xs = poly.filter((_, i) => !(i % 2)), ys = poly.filter((_, i) => i % 2);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let d = '';
  for (let y = y0, row = 0; y <= y1; y += pitch, row++) {
    for (let x = x0 + (row % 2 ? pitch / 2 : 0); x <= x1; x += pitch) {
      if (!inside(poly, x, y) || !inside(poly, x - margin, y) || !inside(poly, x + margin, y) || !inside(poly, x, y - margin) || !inside(poly, x, y + margin)) continue;
      const [a, c] = map(x, y);
      d += `M${f(a)},${f(c)} L${f(a + 0.015)},${f(c)} `;
    }
  }
  return d;
}

/** Dashes along parallel lines (angle from +x in degrees, pitch in inches) inside a polygon: lattice textures. */
function hatchIn(poly: number[], angle: number, pitch: number, map: Map2 = same, margin = 0.06): string {
  const xs = poly.filter((_, i) => !(i % 2)), ys = poly.filter((_, i) => i % 2);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const a = (angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2, step = 0.02;
  let d = '';
  for (let o = -R; o <= R; o += pitch) {
    let run: [number, number] | null = null;
    for (let t = -R; t <= R + step; t += step) {
      const x = cx - uy * o + ux * t, y = cy + ux * o + uy * t;
      const ok = t <= R && inside(poly, x, y) && inside(poly, x - margin, y) && inside(poly, x + margin, y) && inside(poly, x, y - margin) && inside(poly, x, y + margin);
      if (ok && !run) run = [x, y];
      else if (!ok && run) {
        const [p, q] = map(run[0], run[1]), [r, t2] = map(x - ux * step, y - uy * step);
        d += `M${f(p)},${f(q)} L${f(r)},${f(t2)} `;
        run = null;
      }
    }
  }
  return d;
}

/**
 * A rifle optic drawn on a Picatinny rail whose top is at y = -1.1, centred near x = 4.9 (inches). Returns the outline,
 * detail and the callout anchor in inches; callers move it onto their rail.
 */
function rifleOptic(opt: Part | undefined): { od: string; odet: string; ot: [number, number] } {
  let od: string;
  let odet = '';
  let ot: [number, number]; // inches
  if (matches(opt, /\d+-\d+x/i)) {
    const big56 = matches(opt, /x5\d/);
    const cy = big56 ? -2.95 : -2.6;
    const ob = big56 ? 1.18 : 0.72;
    const x0 = big56 ? -1.2 : -0.6;
    const x1 = big56 ? 12.8 : 9.9;
    const tubeR = big56 ? 0.67 : 0.59;
    const e1 = x0 + 2.9;
    const o0 = x1 - (big56 ? 3.6 : 2.3);
    od = `M${x0},${f(cy - 0.85)} L${f(e1 - 0.35)},${f(cy - 0.85)} Q${f(e1)},${f(cy - 0.85)} ${f(e1 + 0.2)},${f(cy - tubeR)} L${f(o0)},${f(cy - tubeR)} L${f(o0 + 0.9)},${f(cy - ob)} L${x1},${f(cy - ob)} L${x1},${f(cy + ob)} L${f(o0 + 0.9)},${f(cy + ob)} L${f(o0)},${f(cy + tubeR)} L${f(e1 + 0.2)},${f(cy + tubeR)} Q${f(e1)},${f(cy + 0.85)} ${f(e1 - 0.35)},${f(cy + 0.85)} L${x0},${f(cy + 0.85)} Z M${f(e1 + 1.7)},${f(cy - tubeR)} L${f(e1 + 1.7)},${f(cy - 1.25)} L${f(e1 + 2.9)},${f(cy - 1.25)} L${f(e1 + 2.9)},${f(cy - tubeR)}`;
    odet = `M${f(e1 + 0.5)},${f(cy + tubeR)} L${f(e1 + 0.5)},-1.1 L${f(e1 + 1.1)},-1.1 L${f(e1 + 1.1)},${f(cy + tubeR)} M${f(o0 - 1.0)},${f(cy + tubeR)} L${f(o0 - 1.0)},-1.1 L${f(o0 - 0.4)},-1.1 L${f(o0 - 0.4)},${f(cy + tubeR)} M${f(e1 + 0.2)},-1.25 L${f(o0 - 0.2)},-1.25 L${f(o0 - 0.2)},-1.1 M${f(x0 + 0.6)},${f(cy - 0.85)} L${f(x0 + 0.6)},${f(cy + 0.85)} M${f(x0 + 1.3)},${f(cy - 0.85)} L${f(x0 + 1.3)},${f(cy + 0.85)}`;
    const tc = (e1 + 1.1 + o0 - 1.0) / 2;
    const tTop = cy - tubeR - 0.62;
    od += ` M${f(tc - 0.42)},${f(cy - tubeR)} L${f(tc - 0.42)},${f(tTop + 0.08)} Q${f(tc - 0.42)},${f(tTop)} ${f(tc - 0.34)},${f(tTop)} L${f(tc + 0.34)},${f(tTop)} Q${f(tc + 0.42)},${f(tTop)} ${f(tc + 0.42)},${f(tTop + 0.08)} L${f(tc + 0.42)},${f(cy - tubeR)}`;
    odet += ` ${repeat(tc - 0.32, tc + 0.32, 0.08, (x) => `M${x},${f(tTop + 0.06)} L${x},${f(tTop + 0.3)}`)} M${f(tc - 0.42)},${f(tTop + 0.36)} L${f(tc + 0.42)},${f(tTop + 0.36)}`
      + ` ${O2(tc, cy, 0.4)} ${O2(tc, cy, 0.3)} ${O2(tc, cy, 0.06)}`
      + ` ${repeat(x0 + 1.75, x0 + 2.55, 0.1, (x) => `M${x},${f(cy - 0.85)} L${x},${f(cy - 0.62)} M${x},${f(cy + 0.62)} L${x},${f(cy + 0.85)}`)} M${f(x0 + 2.1)},${f(cy + 0.85)} L${f(x0 + 2.1)},${f(cy + 1.05)} L${f(x0 + 2.3)},${f(cy + 1.05)} L${f(x0 + 2.3)},${f(cy + 0.85)}`
      + ` ${O2(e1 + 0.8, cy - tubeR - 0.12, 0.05)} ${O2(o0 - 0.7, cy - tubeR - 0.12, 0.05)} M${f(o0 + 0.9)},${f(cy - ob + 0.18)} L${f(x1 - 0.12)},${f(cy - ob + 0.18)} M${f(x1 - 0.12)},${f(cy - ob)} L${f(x1 - 0.12)},${f(cy + ob)}`;
    ot = [e1 + 2.3, cy - 1.25];
  } else if (matches(opt, /reflex|510/i)) {
    // Open reflex (HS510C): QD base on the rail, low emitter housing at the rear, and the window inside a
    // protective hood at the front with the solar panel on top.
    od = 'M2.8,-1.1 L2.8,-1.62 L2.95,-1.62 L2.95,-1.88 Q2.95,-2.0 3.07,-2.0 L3.62,-2.0 L3.86,-3.06 Q3.92,-3.28 4.14,-3.28 L5.62,-3.28 Q5.86,-3.28 5.9,-3.04 L6.0,-1.62 L6.0,-1.1 Z'
      + ' M4.04,-1.78 L4.16,-2.94 Q4.18,-3.04 4.28,-3.04 L5.52,-3.04 Q5.62,-3.04 5.63,-2.94 L5.7,-1.78 Z';
    odet = 'M2.8,-1.36 L6.0,-1.36 M2.95,-1.62 L6.0,-1.62 M3.9,-3.18 L5.84,-3.18 M4.2,-3.12 L5.56,-3.12'
      + ` ${repeat(4.3, 5.4, 0.22, (x) => `M${x},-3.18 L${x},-3.12`)}`
      + ' M5.7,-1.78 L5.6,-3.0 M5.62,-1.78 L5.53,-2.98'
      + ` ${O2(3.32, -1.8, 0.1)} M3.26,-1.8 L3.38,-1.8 ${O2(3.86, -2.3, 0.07)}`
      + ' M4.3,-1.5 L4.3,-1.7 L4.62,-1.7 L4.62,-1.5 Z M4.72,-1.5 L4.72,-1.7 L5.04,-1.7 L5.04,-1.5 Z'
      + ` M3.0,-1.1 L3.0,-1.3 L3.6,-1.3 L3.6,-1.1 ${O2(3.3, -1.22, 0.06)} M5.2,-1.24 L5.86,-1.24`;
    ot = [4.9, -3.28];
  } else if (matches(opt, /EXPS|holographic/i) || matches(opt, /ROMEO5|PRO Patrol|Micro T-2/i)) {
    // Traced from the makers' design-patent side views (see scripts/pistol-profiles/optics.py). The micro dot drawing
    // stands in for the full-size Aimpoint PRO, scaled to its length; risers lift each to its published sight height.
    const holo = matches(opt, /EXPS|holographic/i);
    const pr = OPTIC_PROFILES[holo ? 'holo' : 'micro'];
    const want = Number(opt?.attrs.height ?? 0);
    const k = holo ? 1 : matches(opt, /PRO Patrol/i) ? 1.3 : 1;
    const riser = want ? Math.max(0, want - pr.axis * k) : 0;
    const x0 = 4.9 - (pr.w * k) / 2, rail = -1.1;
    const map = (x: number, y: number): [number, number] => [x0 + x * k, rail - riser + y * k];
    od = pr.outline.map((ol) => polyPath(ol, map, true)).join(' ');
    odet = pr.detail.map((ol) => polyPath(ol, map, false)).join(' ');
    if (riser > 0.02) {
      // The mount's foot, from the drawing's lowest points, stood on a riser block.
      let a = Infinity, z = -Infinity;
      for (const ol of pr.outline) for (let i = 0; i < ol.length; i += 2) if (ol[i + 1] > -0.03) { a = Math.min(a, ol[i]); z = Math.max(z, ol[i]); }
      const xa = x0 + a * k, xz = x0 + z * k;
      od += ` M${f(xa)},${rail} L${f(xa)},${f(rail - riser)} L${f(xz)},${f(rail - riser)} L${f(xz)},${rail} Z`;
      odet += ` M${f(xa + 0.08)},${f(rail - riser / 2)} L${f(xz - 0.08)},${f(rail - riser / 2)}`;
    }
    ot = [4.9, rail - riser - pr.h * k];
  } else {
    const cy = -2.3;
    od = `M2.6,${f(cy - 0.8)} L7.2,${f(cy - 0.8)} Q7.45,${f(cy - 0.8)} 7.45,${f(cy - 0.55)} L7.45,${f(cy + 0.55)} Q7.45,${f(cy + 0.8)} 7.2,${f(cy + 0.8)} L2.6,${f(cy + 0.8)} Q2.35,${f(cy + 0.8)} 2.35,${f(cy + 0.55)} L2.35,${f(cy - 0.55)} Q2.35,${f(cy - 0.8)} 2.6,${f(cy - 0.8)} Z M4.4,${f(cy - 0.8)} L4.4,${f(cy - 1.2)} L5.2,${f(cy - 1.2)} L5.2,${f(cy - 0.8)}`;
    odet = `M3.4,${f(cy + 0.8)} L3.4,-1.1 L6.4,-1.1 L6.4,${f(cy + 0.8)} M2.8,${f(cy - 0.8)} L2.8,${f(cy + 0.8)} M7.0,${f(cy - 0.8)} L7.0,${f(cy + 0.8)} ${O2(4.8, cy, 0.34)} ${O2(4.8, cy, 0.22)} ${repeat(4.45, 5.15, 0.1, (x) => `M${x},${f(cy - 1.15)} L${x},${f(cy - 0.85)}`)} M5.6,-1.25 L6.5,-1.45 L6.6,-1.32 L5.75,-1.15 ${repeat(2.45, 2.7, 0.08, (x) => `M${x},${f(cy - 0.7)} L${x},${f(cy + 0.7)}`)}`;
    ot = [4.8, cy - 1.2];
  }
  return { od, odet, ot };
}

function rifle(platform: Platform, b: Build, place: Placement): Scene {
  const S = 22;
  const ox = 300;
  const oy = 170;
  const T = makeT(S, ox, oy);
  const big = platform.id === 'ar10';
  // AR-9: straight blowback (no gas system); Glock-magazine lowers use their own trace, Colt-pattern ones the AR-15's.
  const nine = platform.id === 'ar9';
  const glock9 = nine && b.lower?.attrs.mag !== 'colt';
  const kx = big ? 1.13 : 1; // AR-10 receivers are longer and taller
  const ky = big ? 1.08 : 1;
  const RF = 7 * kx; // front face of upper receiver
  const BF = RF - 0.55; // bolt face
  const P: Piece[] = [];
  const px = (x: number, y: number): [number, number] => [f(ox + x * S), f(oy + y * S)];
  const R = (d: string) => T(d, kx, ky); // receiver-group paths
  const RAIL = AR_RAIL * ky; // top of the upper's rail; handguard rails and optics line up with it
  /** Circle in receiver coordinates, emitted in px (arcs can't go through T). */
  const O = (x: number, y: number, r: number) => {
    const [cx, cy] = px(x * kx, y * ky);
    const rr = f(r * S);
    return ` M${f(cx - rr)},${cy} a${rr},${rr} 0 1,0 ${f(2 * rr)},0 a${rr},${rr} 0 1,0 ${f(-2 * rr)},0`;
  };

  // Receiver extension (buffer tube)
  const tubeKind = (b.buffer?.attrs.tube as string) ?? ((b.stock?.attrs.fits as string[] | undefined)?.[0] === 'rifle' ? 'rifle' : 'carbine');
  const tubeLen = tubeKind === 'rifle' ? 9.75 : tubeKind === 'a5' ? 7.8 : 7.1;
  const TE = -0.55 * kx - tubeLen; // rear end of tube
  P.push({ slot: 'buffer', z: 1, row: 'bottom', target: px(TE + tubeLen * 0.62, 0.55),
    el: <>
      <path d={T(`M${f(TE)},-0.57 L${f(-0.95 * kx)},-0.57 L${f(-0.95 * kx)},-0.7 L${f(-0.58 * kx)},-0.7 L${f(-0.58 * kx)},0.7 L${f(-0.95 * kx)},0.7 L${f(-0.95 * kx)},0.57 L${f(TE)},0.57 Z`)} />
      <path d={T(`M${f(-0.95 * kx - 0.42)},-0.66 L${f(-0.95 * kx)},-0.66 L${f(-0.95 * kx)},0.66 L${f(-0.95 * kx - 0.42)},0.66 Z ${repeat(-0.95 * kx - 0.34, -0.95 * kx - 0.1, 0.12, (x) => `M${x},-0.66 L${x},-0.54`)}`)} />
      <path d={T(`M${f(-0.75 * kx)},-0.7 L${f(-0.75 * kx)},0.7 M${f(TE + 0.25)},-0.57 L${f(TE + 0.25)},0.57 ${tubeKind === 'rifle' ? '' : repeat(TE + 0.8, TE + 5.6, 0.65, (x) => `M${x},0.57 L${x},0.4`)}`)} className="detail" />
    </> });

  // Stock
  const stock = b.stock;
  let sd: string;
  let sdet = '';
  let traced: { o: string; d: string } | null = null;
  let rear: number;
  // Stocks traced from patent drawings (see scripts/pistol-profiles/ar.py), each placed by its butt and its top;
  // the rest are drawn to their makers' shapes along the tube, from the butt (u = 0) to the nose at the castle nut.
  const fixedStock = matches(stock, /A2|PRS|Precision|Rifle Stock/);
  rear = fixedStock ? TE - 0.65 : TE - 0.73;
  const traceStock = (key: ArStockKey, top: number) => {
    traced = arPaths(AR_PROFILES[key], (x, y) => [x + rear, y + top]);
    return traced.o;
  };
  const U = (u: number) => f(rear + u);
  // The nose, tube saddle and release latch shared by the mil-spec collapsible stocks and braces drawn here.
  const nose = `L${U(6.75)},-0.9 Q${U(7.02)},-0.9 ${U(7.02)},-0.62 L${U(7.02)},0.95 L${U(5.75)},0.95 L${U(5.65)},1.08 L${U(5.55)},1.45 L${U(4.45)},1.45 L${U(4.25)},1.12`;
  const latchPin = OC(rear + 5.4, 1.2, 0.06);
  if (matches(stock, /A2/)) {
    // The A2 drawing is a hatched section, so only its outline is traced; the butt plate seam is drawn here.
    sd = traceStock('stockA2', -1.0);
    traced!.d = `M${f(rear + 0.42)},-0.94 L${f(rear + 0.42)},4.1`;
  }
  else if (matches(stock, /PRS|Precision/)) sd = traceStock('stockPrs', -1.3);
  else if (matches(stock, /MOE Rifle/)) sd = traceStock('stockMoeRifle', -1.0);
  else if (matches(stock, /UBR/)) sd = traceStock('stockUbr', -1.4);
  else if (matches(stock, /MOE SL/)) sd = traceStock('stockMoeSl', -1.05);
  else if (matches(stock, /CTR/)) sd = traceStock('stockCtr', -1.05);
  else if (matches(stock, /Bravo/)) {
    // B5 Systems Bravo: a wedge whose toe line runs straight from behind the latch to the heel, a near-vertical butt
    // under a thin pad, a recessed side panel, a QD socket at the rear and a sling slot through the toe.
    sd = `M${U(0.3)},-0.98 ${nose} L${U(3.95)},1.12 L${U(0.6)},3.95 Q${U(0.42)},4.08 ${U(0.32)},3.95 L${U(0)},-0.6 Q${U(0)},-0.98 ${U(0.3)},-0.98 Z`;
    sdet = `M${U(0.3)},-0.9 L${U(0.6)},3.9 ${OC(rear + 1.3, 0.35, 0.2)} ${OC(rear + 1.3, 0.35, 0.08)} M${U(1.9)},-0.15 L${U(3.8)},-0.15 L${U(3.8)},0.9 L${U(1.9)},0.9 Z M${U(0.8)},2.5 L${U(1.1)},2.5 L${U(1.1)},3.25 Q${U(1.1)},3.4 ${U(0.95)},3.4 Q${U(0.8)},3.4 ${U(0.8)},3.25 Z M${U(0.6)},-0.72 L${U(6.6)},-0.72 ${latchPin}`;
  }
  else if (matches(stock, /Gunfighter/)) {
    // BCM Gunfighter Mod 0: boxier than the M4, the toe line stepping down behind the latch before falling to a
    // squared heel, a thick ribbed rubber pad on a vertical butt, a QD socket at the rear and a slot through the toe.
    sd = `M${U(0.45)},-0.98 ${nose} L${U(3.7)},1.12 L${U(3.5)},1.6 L${U(3.0)},1.6 L${U(0.7)},3.75 L${U(0.45)},3.85 L${U(0)},3.85 L${U(0)},-0.8 Q${U(0)},-0.98 ${U(0.45)},-0.98 Z`;
    sdet = `M${U(0.45)},-0.9 L${U(0.45)},3.85 ${repeat(-0.45, 3.5, 0.55, (y) => `M${U(0.08)},${f(y)} L${U(0.4)},${f(y)}`)} ${OC(rear + 1.05, 0.3, 0.2)} ${OC(rear + 1.05, 0.3, 0.08)} M${U(0.9)},2.6 L${U(1.25)},2.6 L${U(1.25)},3.3 L${U(0.9)},3.3 Z M${U(0.7)},-0.72 L${U(6.6)},-0.72 ${latchPin}`;
  }
  else if (matches(stock, /SBA3/)) {
    // SB Tactical SBA3: a slim spine along the tube ending in the tall arm cuff, its strap buckled across.
    sd = `M${U(1.45)},-0.9 ${nose} L${U(1.6)},1.15 L${U(1.5)},1.6 Q${U(1.55)},3.5 ${U(0.9)},3.75 Q${U(0.2)},3.95 ${U(0.1)},3.0 L${U(0)},0.2 L${U(0.05)},-0.6 Q${U(0.1)},-0.95 ${U(0.5)},-0.95 Z`;
    sdet = `M${U(0.1)},1.7 L${U(1.5)},1.7 M${U(0.1)},2.5 L${U(1.5)},2.5 M${U(0.55)},1.7 L${U(0.55)},2.5 M${U(0.95)},1.7 L${U(0.95)},2.5 ${OC(rear + 0.75, 0.55, 0.3)} M${U(1.6)},-0.72 L${U(6.6)},-0.72 ${latchPin}`;
  }
  else if (matches(stock, /SBA4/)) {
    // SB Tactical SBA4: stock-shaped, a flat-bottomed cuff behind a short angled underside, the strap across the cuff.
    sd = `M${U(0.25)},-0.95 ${nose} L${U(2.4)},1.12 L${U(1.9)},2.0 L${U(1.75)},3.5 Q${U(1.75)},3.85 ${U(1.4)},3.85 L${U(0.25)},3.85 Q${U(0)},3.85 ${U(0)},3.6 L${U(0)},-0.7 Q${U(0)},-0.95 ${U(0.25)},-0.95 Z`;
    sdet = `M${U(0.1)},1.6 L${U(1.8)},1.6 M${U(0.1)},2.4 L${U(1.8)},2.4 M${U(0.6)},1.6 L${U(0.6)},2.4 M${U(1.0)},1.6 L${U(1.0)},2.4 M${U(0.1)},0.95 L${U(1.9)},0.95 ${OC(rear + 0.8, 0.35, 0.28)} M${U(0.4)},-0.72 L${U(6.6)},-0.72 ${latchPin}`;
  }
  else {
    // Other collapsible stocks: the M4 stock traced from US 10,184,737 FIG. 2A, pushed in so its nose sits just behind the castle nut.
    const dx = rear - AR_STOCK_REAR;
    traced = arPaths(AR_PROFILES.stock, (x, y) => [x + dx, y]);
    sd = traced.o;
  }
  const stockDet = sdet || traced!.d;
  P.push({ slot: 'stock', z: 2, row: 'bottom', target: px(rear + 2.2, 1.6), el: <><path d={T(sd)} /><path className="detail" d={T(stockDet)} /></> });

  // Lower receiver, A2-style grip and trigger: traced from US 10,184,737 FIG. 2A (see scripts/pistol-profiles/ar.py).
  // The Glock-magazine 9mm lower is traced from US D782,596 FIG. 1; its trigger guard and web openings are holes.
  // Lowers with an integrated trigger guard and flared magwell (Aero's M4E1 and M5, billet lowers) get a deeper,
  // rounded guard flowing into the magwell lip in place of the mil-spec guard and its pins.
  const flared = !glock9 && (matches(b.lower, /M4E1|M5 Stripped|Billet/) || matches(b.lower, /Integrated trigger guard|Flared magwell/));
  let lower: { o: string; d: string };
  if (flared) {
    const o = AR_PROFILES.lower.outline[0];
    const guard = [2.08, 2.05, 2.0, 2.3, 1.98, 2.75, 2.05, 3.05, 2.25, 3.28, 2.6, 3.36, 3.4, 3.36, 3.85, 3.3, 4.1, 3.18, 4.15, 3.22, 6.3, 2.8, 6.42, 2.72];
    lower = arPaths({ outline: [[...o.slice(0, 27 * 2), ...guard, ...o.slice(59 * 2)]], detail: AR_PROFILES.lower.detail.filter((_, k) => ![4, 5, 6, 7, 8, 32].includes(k)) });
  } else lower = arPaths(glock9 ? AR_PROFILES.lower9 : AR_PROFILES.lower);
  P.push({ slot: 'lower', z: 4, row: 'bottom', target: px(5.6 * kx, 2.4 * ky),
    el: <><path d={R(lower.o)} fillRule={glock9 ? 'evenodd' : undefined} /><path className="detail" d={R(glock9 ? LOWER9_DETAIL.map((l) => polyPath(l, same, false)).join(' ') : lower.d)} /></> });

  // Lower parts kit: the selector's right-side stub over its detent (the lower drawing shows the hole).
  P.push({ slot: 'lpk', z: 6, row: 'bottom', target: px(1.43 * kx, 1.29 * ky),
    el: <path d={O(1.43, 1.29, 0.2) + R(' M1.43,1.29 L1.75,1.12 M1.36,1.29 L1.5,1.29')} /> });
  // Trigger: the curved shoe traced with the lower, or a flat blade for the flat-shoe triggers.
  const trig = arPaths(AR_PROFILES.trigger);
  P.push({ slot: 'trigger', z: 6, row: 'bottom', target: px(2.5 * kx, 2.3 * ky),
    el: <path d={R(matches(b.trigger, /Flat/) ? 'M2.28,1.89 L2.76,1.89 L2.76,1.94 L2.6,2.05 L2.66,2.75 Q2.66,2.82 2.58,2.82 L2.5,2.82 L2.42,2.05 L2.28,1.94 Z' : trig.o)} /> });

  // Pistol grip, each one in the catalog drawn to its own profile. The MOE keeps the A2's rake with a smooth front
  // strap (no finger ridge) and Magpul's long side panel; the MOE+ is the same grip overmoulded all round; the MOE-K2+
  // stands near vertical with its extended backstrap and palm swell; BCM's Gunfighter Mod 3 leans at its reduced
  // angle with a straight front strap, a tang filling the gap behind the receiver, a fillet up to the trigger guard and
  // the hexagonal texture; Hogue's rubber grip has its finger grooves and palm swell under a cobblestone finish.
  // Without a grip chosen, the A2-style grip traced from the lower's patent stands in.
  const gr = b.grip;
  const gk = matches(gr, /K2/) ? 'k2' : matches(gr, /Gunfighter/) ? 'bcm' : matches(gr, /Finger grooves|OverMolded/) ? 'hogue' : matches(gr, /MOE\+/) ? 'moeplus' : matches(gr, /MOE/) ? 'moe' : 'a2';
  let gripO: string, gripDet = '', gripTex: string;
  let gripAt: [number, number] = [-0.2, 4.0];
  if (gk === 'a2') {
    const grip = arPaths(AR_PROFILES.grip);
    const panel = AR_PROFILES.grip.detail.reduce((a, d) => (d.length > a.length ? d : a), [] as number[]);
    gripO = grip.o; gripDet = grip.d; gripTex = dotsIn(panel, 0.14);
  } else if (gk === 'moe' || gk === 'moeplus') {
    gripO = 'M0.28,1.92 L0.26,2.15 L-1.58,4.86 Q-1.74,5.08 -1.66,5.22 L-0.02,5.56 Q0.32,5.6 0.40,5.28 L1.12,4.15 Q1.45,3.6 1.62,3.0 Q1.70,2.7 1.70,2.35 L1.70,1.96 Z';
    gripDet = 'M-1.5,5.02 L0.25,5.38';
    if (gk === 'moe') {
      const panel = [0.09, 2.62, 1.52, 2.62, 1.52, 2.95, 1.3, 3.6, 0.97, 4.15, 0.45, 5.05, -1.4, 4.86];
      gripDet += ' ' + polyPath(panel, same, true);
      gripTex = dotsIn(panel, 0.14);
    } else gripTex = dotsIn([0.14, 2.5, 1.56, 2.5, 1.56, 2.6, 1.5, 3.0, 1.32, 3.6, 1.0, 4.15, 0.42, 5.05, 0.3, 5.22, -1.42, 4.92], 0.13);
    gripAt = [-0.3, 4.0];
  } else if (gk === 'k2') {
    gripO = 'M0.28,1.92 L-0.05,1.94 Q-0.3,1.96 -0.3,2.2 Q-1.05,3.5 -1.22,5.0 Q-1.34,5.2 -1.2,5.3 L0.2,5.5 Q0.5,5.55 0.55,5.3 L1.1,3.7 Q1.45,3.0 1.62,2.7 Q1.70,2.5 1.70,2.3 L1.70,1.96 Z';
    gripDet = 'M-1.1,5.05 L0.42,5.3';
    gripTex = dotsIn([-0.15, 2.45, 1.56, 2.45, 1.56, 2.6, 1.5, 2.95, 1.2, 3.7, 0.45, 5.05, -1.0, 4.88, -0.72, 3.6], 0.13);
    gripAt = [0.1, 4.0];
  } else if (gk === 'bcm') {
    gripO = 'M0.28,1.92 L0.05,1.95 Q-0.12,1.97 -0.15,2.15 L-1.42,5.05 Q-1.55,5.22 -1.42,5.3 L0.2,5.58 Q0.45,5.62 0.52,5.4 L1.75,2.65 L1.88,2.35 L1.9,2.05 L1.70,1.96 Z';
    gripDet = 'M-1.3,5.08 L0.42,5.38';
    const panel = [0.0, 2.55, 1.6, 2.55, 1.5, 2.9, 0.55, 4.95, -1.15, 4.7, -0.15, 2.75];
    gripDet += ' ' + polyPath(panel, same, true);
    gripTex = hatchIn(panel, 60, 0.18) + hatchIn(panel, -60, 0.18);
    gripAt = [0.1, 4.0];
  } else {
    gripO = 'M0.28,1.92 L0.2,1.96 Q0.06,2.05 0.02,2.25 Q-1.15,3.6 -1.62,4.9 Q-1.78,5.1 -1.7,5.25 L-0.05,5.6 Q0.3,5.65 0.42,5.35 L0.5,5.07 Q0.86,4.78 0.77,4.26 Q1.21,3.89 1.11,3.37 Q1.56,3.01 1.46,2.49 Q1.62,2.15 1.70,1.96 Z';
    gripTex = dotsIn([0.1, 2.45, 1.5, 2.45, 1.42, 2.6, 1.08, 3.36, 0.73, 4.25, 0.42, 5.04, 0.05, 5.4, -1.55, 5.06, -1.3, 4.7, -0.85, 3.95, -0.45, 3.3], 0.16);
    gripAt = [-0.3, 4.0];
  }
  P.push({ slot: 'grip', z: 5, row: 'bottom', target: px(gripAt[0] * kx, gripAt[1] * ky),
    el: <>
      <path d={R(gripO)} />
      {gripDet && <path className="detail" d={R(gripDet)} />}
      <path className="detail stipple" d={R(gripTex)} />
    </> });

  // Magazine. The AR-15's is the PMAG traced from US D712,500 FIG. 2, its stop ledge at the bottom of the mag well.
  const pmag = arPaths(AR_PROFILES.pmag, (x, y) => [MAG_X + x, MAG_Y + y]);
  if (nine) {
    // 9mm magazines are straight boxes. A Glock mag follows the rear wall of the 9mm lower's mag well (marks traced
    // with it) and ends in a floor plate; Colt SMG mags sit at the back of the AR-15 mag well.
    const rounds = typeof b.mag?.attrs.rounds === 'number' ? b.mag.attrs.rounds : glock9 ? 17 : 32;
    const m = AR_PROFILES.marks;
    const [ax, ay] = glock9 ? [m.mag9RearTopX, m.mag9RearTopY] : [4.3, 1.0];
    const lean = glock9 ? (m.mag9RearBottomX - ax) / (m.mag9RearBottomY - ay) : 0;
    const top = glock9 ? ay : 0.75; // feed lips at the top of the mag well, like the PMAG
    const len = glock9 ? 5.0 + (rounds - 17) * 0.29 : 3.3 + rounds * 0.165; // G17 5.0", 33 rd 9.6"; Colt 32 rd 8.6"
    const w = glock9 ? 1.25 : 1.12;
    const at = (x: number, y: number): [number, number] => [ax + (y - ay) * lean + x, y];
    const pmagGl = glock9 && matches(b.mag, /PMAG/);
    const bot = top + len, fp = glock9 ? (pmagGl ? 0.48 : 0.34) : 0.22; // floor plate height
    const pts = [at(0, top), at(w, top), at(w, bot - fp), at(w + (glock9 ? 0.1 : 0.04), bot - fp + 0.05), at(w + (glock9 ? 0.1 : 0.04), bot - 0.05),
      at(w + (glock9 ? 0.04 : 0), bot), at(-0.04, bot), at(-0.06, bot - 0.05), at(-0.06, bot - fp + 0.05), at(0, bot - fp)];
    const pp = (q: [number, number][]) => q.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join(' ');
    const seam = pp([at(-0.06, bot - fp + 0.05), at(w + (glock9 ? 0.1 : 0.04), bot - fp + 0.05)]);
    // Colt mags have stamped ribs down the sides.
    const ribs = glock9
      ? pmagGl ? ` ${pp([at(0.28, top + 0.7), at(0.28, bot - fp - 0.3)])} ${pp([at(w - 0.28, top + 0.7), at(w - 0.28, bot - fp - 0.3)])}` : ''
      : ` ${pp([at(0.3, 3.4), at(0.3, bot - fp - 0.4)])} ${pp([at(w - 0.3, 3.4), at(w - 0.3, bot - fp - 0.4)])}`;
    P.push({ slot: 'mag', z: 3, row: 'bottom', target: px(ax + (bot - 1 - ay) * lean + w / 2, bot - 1),
      el: <><path d={T(pp(pts) + ' Z')} /><path className="detail" d={T(seam + ribs)} /></> });
  } else
  P.push({ slot: 'mag', z: 3, row: 'bottom', target: px(big ? 5.5 * kx : 6.2, big ? 6.2 : 6.6),
    el: big
      ? <><path d={T('M3.98,3.0 L6.55,3.0 C6.65,4.8 6.85,6.4 7.05,7.75 L7.1,7.98 L4.6,8.12 L4.55,7.9 C4.3,6.3 4.1,4.7 3.98,3.0 Z', kx, 1)} /><path className="detail" d={T(matches(b.mag, /Armalite/) ? 'M4.7,3.3 L5.4,7.9 M4.52,7.55 L7.05,7.4' : 'M4.2,4.4 L6.65,4.32 M4.35,5.8 L6.85,5.7 M4.5,7.2 L7.0,7.1 M4.45,3.3 L4.95,7.6 M6.15,3.3 L6.75,7.6', kx, 1)} /></>
      : <><path d={T(pmag.o)} /><path className="detail" d={T(pmag.d)} /></> });

  // Upper receiver: the standard flat-top traced from US 8,910,406 FIG. 1A.
  const upper = arPaths(AR_PROFILES.upper);
  P.push({ slot: 'upper', z: 7, row: 'top', target: px(1.4 * kx, -0.55 * ky),
    el: <>
      <path d={R(upper.o)} />
      <path className="detail" d={R(upper.d)} />
    </> });
  // Charging handle; this is the right side, so only an ambidextrous handle (Radian's Raptor) shows a latch wing.
  P.push({ slot: 'charging', z: 8, row: 'top', target: px(-0.55 * kx, -0.62 * ky),
    el: <path d={R('M-0.78,-0.76 L0.05,-0.76 L0.05,-0.5 L-0.78,-0.5 Q-0.98,-0.53 -0.98,-0.63 Q-0.98,-0.73 -0.78,-0.76 Z' + (matches(b.charging, /Raptor/) ? ' M-0.5,-0.5 L-1.0,-0.5 Q-1.25,-0.42 -1.15,-0.26 L-0.45,-0.3 Z' : ''))} /> });
  P.push({ slot: 'bcg', internal: true, z: 20, row: 'top', target: px(2.4 * kx, 0.3 * ky),
    el: <path d={R(`M0.4,-0.45 L5.85,-0.45 L5.85,0.45 L0.4,0.45 Z ${nine ? '' : 'M3.2,-0.45 L3.2,-0.76 L4.6,-0.76 L4.6,-0.45'} M5.85,-0.3 L6.45,-0.3 L6.45,0.3 L5.85,0.3`)} /> });

  // Barrel, gas system, handguard, muzzle
  const L = typeof b.barrel?.attrs.length === 'number' ? b.barrel.attrs.length : big ? 18 : 16;
  const BX = BF + L; // muzzle
  const gas = (b.barrel?.attrs.gas as string) ?? (b.gastube?.attrs.length as string) ?? 'midlength';
  const GX = nine ? RF - 0.6 : BF + GAS_FROM_BOLT[gas];
  const hg = b.handguard;
  const freeFloat = hg ? hg.attrs.freeFloat !== false : true;
  const H = typeof hg?.attrs.length === 'number' ? hg.attrs.length : freeFloat ? (big ? 15 : 13.5) : 9;
  const HX = RF + H;
  const fsb = b.gasblock?.attrs.profile === 'fsb';
  const gb625 = b.gasblock?.attrs.journal === '.625';
  const gbAdj = matches(b.gasblock, /Adjustable/);

  // Barrel contour: pencil barrels stay thin, Government (M4) profiles step up to .750 at the gas block, heavy and
  // hybrid profiles run fat under the handguard; the gas journal takes the size the specs give. Fluted barrels show
  // their flutes along the exposed length.
  const bp = matches(b.barrel, /Light profile|Pencil/) ? 'light' : matches(b.barrel, /Heavy/) ? 'heavy' : matches(b.barrel, /Government/) ? 'gov' : matches(b.barrel, /Hybrid/) ? 'hybrid' : 'std';
  const jm = /\.(\d{3}) journal/.exec(b.barrel?.specs.join(' ') ?? '');
  const rj = jm ? Number('0.' + jm[1]) / 2 : 0.375;
  const rRear = { light: 0.31, heavy: 0.47, gov: 0.31, hybrid: 0.45, std: 0.36 }[bp];
  const rFront = { light: 0.3, heavy: 0.43, gov: 0.375, hybrid: 0.375, std: 0.34 }[bp];
  const rF9 = matches(b.barrel, /Light Taper/) ? 0.3 : 0.36;
  const fx0 = Math.max(HX, GX + 1.2) + 0.25, fx1 = BX - 0.45;
  const flutes = matches(b.barrel, /Fluted/) && fx1 > fx0 + 0.5 ? [-0.16, 0, 0.16].map((y) => `M${f(fx0)},${y} L${f(fx1)},${y}`).join(' ') : '';
  P.push({ slot: 'barrel', z: 9, row: 'top', target: px(Math.max(HX, GX + 0.6) + (BX - Math.max(HX, GX + 0.6)) / 2, 0.3),
    el: <>
      <path d={T(nine
        ? `M${f(RF)},-0.42 L${f(RF + 0.9)},-0.42 L${f(RF + 1.0)},-0.36 L${f(RF + 3)},-0.36 L${f(BX)},${f(-rF9)} L${f(BX)},${f(rF9)} L${f(RF + 3)},0.36 L${f(RF + 1.0)},0.36 L${f(RF + 0.9)},0.42 L${f(RF)},0.42 Z`
        : `M${f(RF)},-0.42 L${f(RF + 1.0)},-0.42 L${f(RF + 1.15)},${f(-rRear)} L${f(GX - 0.05)},${f(-rRear)} L${f(GX)},${f(-rj)} L${f(GX + 0.9)},${f(-rj)} L${f(GX + 1.1)},${f(-rFront)} L${f(BX)},${f(-rFront)} L${f(BX)},${f(rFront)} L${f(GX + 1.1)},${f(rFront)} L${f(GX + 0.9)},${f(rj)} L${f(GX)},${f(rj)} L${f(GX - 0.05)},${f(rRear)} L${f(RF + 1.15)},${f(rRear)} L${f(RF + 1.0)},0.42 L${f(RF)},0.42 Z`)} />
      {flutes && <path className="detail" d={T(flutes)} />}
      <path className="hidden-line" d={T(`M${f(BF)},-0.5 L${f(RF)},-0.5 M${f(BF)},0.5 L${f(RF)},0.5`)} />
    </> });
  if (!nine) P.push({ slot: 'gastube', internal: true, z: 21, row: 'top', target: px((4.6 * kx + GX) / 2, -0.62),
    el: <path d={T(`M${f(4.6 * kx)},-0.62 L${f(GX)},-0.62`)} /> });
  if (!nine) P.push({ slot: 'gasblock', internal: !fsb && GX + 0.6 < HX, z: fsb ? 12 : 10, row: 'top', target: px(GX + 0.1, fsb ? -2.0 : -0.3),
    el: fsb
      ? <>
          <path d={T(`M${f(GX - 0.62)},-0.98 L${f(GX + 0.62)},-0.98 L${f(GX + 0.62)},0.62 L${f(GX - 0.62)},0.62 Z M${f(GX - 0.42)},-0.98 Q${f(GX - 0.5)},-2.42 ${f(GX - 0.16)},-2.47 L${f(GX + 0.16)},-2.47 Q${f(GX + 0.5)},-2.42 ${f(GX + 0.42)},-0.98 M${f(GX)},0.62 L${f(GX)},1.02 L${f(GX + 0.55)},1.02 L${f(GX + 0.55)},0.62`)} />
          <path className="detail" d={T(`M${f(GX)},-2.3 L${f(GX)},-1.35 M${f(GX - 0.2)},-1.35 L${f(GX + 0.2)},-1.35`)} />
        </>
      : <path d={T(`M${f(GX - 0.42)},${gb625 ? -0.78 : -0.86} L${f(GX + 0.55)},${gb625 ? -0.78 : -0.86} L${f(GX + 0.55)},${gb625 ? 0.36 : 0.44} L${f(GX - 0.42)},${gb625 ? 0.36 : 0.44} Z${gbAdj ? ` M${f(GX + 0.55)},-0.72 L${f(GX + 0.74)},-0.72 L${f(GX + 0.74)},-0.46 L${f(GX + 0.55)},-0.46 Z M${f(GX + 0.74)},-0.59 L${f(GX + 0.66)},-0.59` : ''}`)} /> });

  if (freeFloat) {
    // Free-float rails, each to its maker's profile: the top rail level with the upper's (the ATLAS S-ONE only
    // carries rail at its ends), M-LOK slots along the side at 3 o'clock, and each maker's own lightening cuts
    // below them: BCM's short 4:30 slots, Geissele's ovals and big rear bolts, Midwest's long narrow slots and
    // anti-rotation tab, Seekins' angled cuts. The rest keep the plain rail with its bottom slots.
    const hk = matches(hg, /ATLAS|S-ONE/) ? 'atlas' : matches(hg, /MCMR/) ? 'mcmr' : matches(hg, /MK16|Super Modular/) ? 'mk16' : matches(hg, /Combat Rail/) ? 'mi' : matches(hg, /SP3R/) ? 'seekins' : 'plain';
    const bot = { atlas: 0.72, mcmr: 0.78, mk16: 0.9, mi: 0.8, seekins: 0.85, plain: 0.95 }[hk];
    const top = RAIL;
    const slotRow = (y: number, h: number, len: number, from: number, to: number, pitch: number) => {
      const r = h / 2;
      return repeat(from, to - len - r, pitch, (x) => `M${x},${f(y - r)} L${f(x + len)},${f(y - r)} Q${f(x + len + r)},${f(y - r)} ${f(x + len + r)},${f(y)} Q${f(x + len + r)},${f(y + r)} ${f(x + len)},${f(y + r)} L${x},${f(y + r)} Q${f(x - r)},${f(y + r)} ${f(x - r)},${f(y)} Q${f(x - r)},${f(y - r)} ${x},${f(y - r)} Z`);
    };
    const mlok = (from: number, to: number) => slotRow(-0.03, 0.34, 1.1, from, to, 1.6);
    const screws = (y: number) => O((RF + 0.3) / kx, y / ky, 0.1) + O((RF + 0.65) / kx, y / ky, 0.1);
    let hgO: string, hgD: string;
    if (hk === 'atlas') {
      hgO = `M${f(RF)},${f(top + 0.32)} L${f(RF + 0.3)},${f(top + 0.32)} L${f(RF + 0.3)},${f(top)} L${f(RF + 2.1)},${f(top)} L${f(RF + 2.1)},${f(top + 0.32)} L${f(HX - 1.7)},${f(top + 0.32)} L${f(HX - 1.7)},${f(top)} L${f(HX - 0.2)},${f(top)} Q${f(HX)},${f(top)} ${f(HX)},${f(top + 0.2)} L${f(HX)},${f(bot - 0.2)} Q${f(HX)},${f(bot)} ${f(HX - 0.2)},${f(bot)} L${f(RF)},${f(bot)} Z`;
      hgD = `${pic(RF + 0.45, HX - 1.75, top)} ${pic(HX - 1.55, HX - 0.25, top)} M${f(RF + 0.3)},${f(top + 0.2)} L${f(RF + 2.1)},${f(top + 0.2)} M${f(HX - 1.7)},${f(top + 0.2)} L${f(HX - 0.1)},${f(top + 0.2)} M${f(RF + 0.75)},${f(top + 0.32)} L${f(RF + 0.75)},${f(bot)} ${mlok(RF + 1.3, HX - 0.4)} ${repeat(RF + 1.3, HX - 1.5, 1.6, (x) => `M${x},${f(bot - 0.14)} L${f(x + 1.1)},${f(bot - 0.14)}`)} ${screws(bot - 0.25)}`;
    } else if (hk === 'mcmr') {
      hgO = `M${f(RF)},${f(top)} L${f(HX - 0.2)},${f(top)} Q${f(HX)},${f(top)} ${f(HX)},${f(top + 0.2)} L${f(HX)},${f(bot - 0.15)} Q${f(HX)},${f(bot)} ${f(HX - 0.15)},${f(bot)} L${f(RF)},${f(bot)} Z`;
      hgD = `${pic(RF + 0.25, HX - 0.3, top)} M${f(RF)},${f(top + 0.2)} L${f(HX - 0.1)},${f(top + 0.2)} M${f(RF + 0.85)},${f(top + 0.2)} L${f(RF + 0.85)},${f(bot)} ${mlok(RF + 1.3, HX - 0.4)} ${slotRow(bot - 0.3, 0.2, 0.7, RF + 1.5, HX - 0.4, 1.6)} ${screws(bot - 0.22)}`;
    } else if (hk === 'mk16') {
      hgO = `M${f(RF)},${f(top)} L${f(HX - 0.8)},${f(top)} L${f(HX)},${f(top + 0.55)} L${f(HX)},${f(bot - 0.2)} Q${f(HX)},${f(bot)} ${f(HX - 0.2)},${f(bot)} L${f(RF + 1.0)},${f(bot)} L${f(RF + 1.0)},${f(bot + 0.12)} L${f(RF)},${f(bot + 0.12)} Z`;
      hgD = `${pic(RF + 0.25, HX - 0.85, top)} M${f(RF)},${f(top + 0.2)} L${f(HX - 0.75)},${f(top + 0.2)} M${f(RF + 1.0)},${f(top + 0.2)} L${f(RF + 1.0)},${f(bot)} ${mlok(RF + 1.6, HX - 0.5)} ${slotRow(bot - 0.32, 0.26, 0.5, RF + 1.9, HX - 0.6, 1.6)} ${screws(bot - 0.12)}`;
    } else if (hk === 'mi') {
      hgO = `M${f(RF)},${f(top)} L${f(HX - 0.15)},${f(top)} L${f(HX)},${f(top + 0.15)} L${f(HX)},${f(bot - 0.15)} L${f(HX - 0.15)},${f(bot)} L${f(RF)},${f(bot)} Z M${f(RF + 0.05)},${f(top)} L${f(RF + 0.05)},${f(top - 0.1)} L${f(RF + 0.65)},${f(top - 0.1)} L${f(RF + 0.65)},${f(top)} Z`;
      hgD = `${pic(RF + 0.85, HX - 0.3, top)} M${f(RF)},${f(top + 0.2)} L${f(HX - 0.1)},${f(top + 0.2)} M${f(RF + 0.75)},${f(top + 0.2)} L${f(RF + 0.75)},${f(bot)} ${mlok(RF + 1.3, HX - 0.4)} ${slotRow(bot - 0.3, 0.14, 1.2, RF + 1.3, HX - 0.4, 1.6)} ${screws(bot - 0.25)}`;
    } else if (hk === 'seekins') {
      hgO = `M${f(RF)},${f(top)} L${f(HX - 0.4)},${f(top)} L${f(HX)},${f(top + 0.3)} L${f(HX)},${f(bot - 0.15)} Q${f(HX)},${f(bot)} ${f(HX - 0.15)},${f(bot)} L${f(RF)},${f(bot)} Z`;
      hgD = `${pic(RF + 0.25, HX - 0.45, top)} M${f(RF)},${f(top + 0.2)} L${f(HX - 0.35)},${f(top + 0.2)} M${f(RF + 0.8)},${f(top + 0.2)} L${f(RF + 0.8)},${f(bot)} ${mlok(RF + 1.3, HX - 0.4)} ${repeat(RF + 1.4, HX - 0.9, 1.6, (x) => `M${x},${f(bot - 0.5)} L${f(x + 0.55)},${f(bot - 0.5)} L${f(x + 0.4)},${f(bot - 0.15)} L${f(x - 0.15)},${f(bot - 0.15)} Z`)} ${screws(bot - 0.25)}`;
    } else {
      hgO = `M${f(RF)},${f(top)} L${f(HX - 0.25)},${f(top)} Q${f(HX)},${f(top)} ${f(HX)},${f(top + 0.25)} L${f(HX)},${f(bot - 0.25)} Q${f(HX)},${f(bot)} ${f(HX - 0.25)},${f(bot)} L${f(RF)},${f(bot)} Z`;
      hgD = `${pic(RF + 0.25, HX - 0.3, top)} M${f(RF)},${f(top + 0.2)} L${f(HX - 0.1)},${f(top + 0.2)} M${f(HX - 0.35)},${f(top + 0.2)} L${f(HX - 0.35)},${f(bot)} M${f(RF)},${f(bot - 0.33)} L${f(HX - 0.35)},${f(bot - 0.33)} M${f(RF + 0.55)},${f(bot - 0.33)} L${f(RF + 0.55)},${f(bot)} ${repeat(RF + 1.1, HX - 1.6, 1.6, (x) => `M${x},${f(bot - 0.23)} L${f(x + 0.9)},${f(bot - 0.23)}`)} ${mlok(RF + 1.1, HX - 0.5)} M${f(RF + 0.15)},${f(top + 0.2)} L${f(RF + 0.15)},${f(bot)} ${O((RF + 0.95) / kx, 0.38 / ky, 0.12)} ${O((HX - 0.75) / kx, 0.38 / ky, 0.12)}`;
    }
    P.push({ slot: 'handguard', z: 11, row: 'top', target: px(RF + H * 0.45, top), el: <><path d={T(hgO)} /><path className="detail" d={T(hgD)} /></> });
  } else {
    // Drop-in handguard: the Magpul MOE carbine handguard traced from US D656,215 FIG. 3, between the delta ring
    // and the front sight base. Longer ones keep the end caps and stretch the middle.
    const L0 = 6.9, end = 1.3, hx0 = RF + 0.45, L = HX - hx0;
    const mid = (L - 2 * end) / (L0 - 2 * end);
    const cy = AR_PROFILES.marks.handguardMoeH / 2 - 0.15;
    const hgm: Map2 = (x, y) => [hx0 + (x < end ? x : x > L0 - end ? L - (L0 - x) : end + (x - end) * mid), y - cy];
    const moe = arPaths(AR_PROFILES.handguardMoe, hgm);
    P.push({ slot: 'handguard', z: 11, row: 'top', target: px(RF + H * 0.5, -0.86),
      el: <>
        <path d={T(`M${f(RF)},-0.98 L${f(RF + 0.45)},-0.98 L${f(RF + 0.45)},0.98 L${f(RF)},0.98 Z ${moe.o}`)} />
        <path className="detail" d={T(moe.d)} />
      </> });
  }

  const mz = b.muzzle;
  let md: string;
  let mdet = '';
  let mlen: number;
  // Each device to its own shape. Lantac Dragon: a squared can with three side windows shrinking toward its
  // coned nose. Precision Armament M4-72: a fat three-chamber brake, its ports raked back. VG6 Gamma: two side
  // chambers behind three flash-hider slots. SureFire WarComp: the SOCOM's three tines with two ports cut in its
  // top. 3-prong hiders: traced from US D577,410 FIG. 1; other brakes from US D285,238 FIG. 1. 9mm cans are smooth
  // tubes, bell-mouthed (KAK) or coned (PSA's linear comp); Odin's Atlas 9 is a squared two-port comp.
  const mk = matches(mz, /Dragon/) ? 'dragon' : matches(mz, /M4-72/) ? 'm472' : matches(mz, /Gamma/) ? 'gamma' : matches(mz, /WarComp/) ? 'warcomp'
    : matches(mz, /prong/i) ? 'prong' : matches(mz, /Flash Can|Linear/) ? 'can' : matches(mz, /Atlas 9/) ? 'comp9' : matches(mz, /brake/i) ? 'brake' : matches(mz, /comp/i) ? 'comp' : 'a2';
  const tube = (len: number, r: number, nose = '') => `M${f(BX)},-0.4 L${f(BX + 0.28)},-0.4 L${f(BX + 0.28)},${f(-r)} ${nose || `L${f(BX + len)},${f(-r)} L${f(BX + len)},${f(r)}`} L${f(BX + 0.28)},${f(r)} L${f(BX + 0.28)},0.4 L${f(BX)},0.4 Z`;
  const window = (x0: number, x1: number, y0: number, y1: number) => `M${f(x0)},${f(y0)} L${f(x1)},${f(y0)} L${f(x1)},${f(y1)} L${f(x0)},${f(y1)} Z`;
  const vents = (xs: number[], r: number) => xs.map((d) => `M${f(BX + d)},${f(-r)} L${f(BX + d)},${f(-r + 0.12)} M${f(BX + d + 0.14)},${f(-r)} L${f(BX + d + 0.14)},${f(-r + 0.12)}`).join(' ');
  if (mk === 'prong' || mk === 'warcomp' || mk === 'brake') {
    const key = mk === 'brake' ? 'muzzleBrake' as const : 'muzzleProng' as const;
    const h = AR_PROFILES.marks[key + 'H'];
    const t = arPaths(AR_PROFILES[key], (x, y) => [BX + x, y - h / 2]);
    mlen = mk === 'brake' ? 2.25 : 2.2;
    md = t.o;
    mdet = t.d + (mk === 'warcomp' ? ` ${window(BX + 0.45, BX + 0.7, -h / 2, -h / 2 + 0.2)} ${window(BX + 0.85, BX + 1.1, -h / 2, -h / 2 + 0.2)}` : '');
  } else if (mk === 'dragon') {
    mlen = 2.25;
    md = tube(mlen, 0.44, `L${f(BX + 2.05)},-0.44 L${f(BX + mlen)},-0.28 L${f(BX + mlen)},0.28 L${f(BX + 2.05)},0.44`);
    mdet = `${window(BX + 0.45, BX + 0.98, -0.3, 0.2)} ${window(BX + 1.1, BX + 1.55, -0.3, 0.2)} ${window(BX + 1.67, BX + 2.0, -0.3, 0.2)} ${vents([0.55, 1.2, 1.72], 0.44)}`;
  } else if (mk === 'm472') {
    mlen = 2.3;
    md = tube(mlen, 0.5);
    mdet = [0.4, 1.0, 1.6].map((d) => `M${f(BX + d + 0.15)},-0.42 L${f(BX + d + 0.55)},-0.42 L${f(BX + d + 0.4)},0.42 L${f(BX + d)},0.42 Z`).join(' ') + ` ${vents([0.6, 1.2, 1.8], 0.5)}`;
  } else if (mk === 'gamma') {
    mlen = 2.2;
    md = tube(mlen, 0.43);
    const slot = (y: number) => `M${f(BX + 1.6)},${f(y - 0.05)} L${f(BX + 2.08)},${f(y - 0.05)} Q${f(BX + 2.13)},${f(y)} ${f(BX + 2.08)},${f(y + 0.05)} L${f(BX + 1.6)},${f(y + 0.05)} Q${f(BX + 1.55)},${f(y)} ${f(BX + 1.6)},${f(y - 0.05)} Z`;
    mdet = `${window(BX + 0.45, BX + 0.95, -0.3, 0.26)} ${window(BX + 1.05, BX + 1.45, -0.3, 0.26)} ${slot(-0.27)} ${slot(-0.07)} ${slot(0.13)} ${vents([0.6, 1.15], 0.43)}`;
  } else if (mk === 'can') {
    mlen = 2.6;
    const cone = matches(mz, /Linear/);
    md = tube(mlen, 0.44, cone ? `L${f(BX + 2.0)},-0.44 L${f(BX + mlen)},-0.22 L${f(BX + mlen)},0.22 L${f(BX + 2.0)},0.44` : `L${f(BX + 2.25)},-0.44 Q${f(BX + mlen)},-0.44 ${f(BX + mlen)},-0.15 L${f(BX + mlen)},0.15 Q${f(BX + mlen)},0.44 ${f(BX + 2.25)},0.44`);
    mdet = `M${f(BX + 0.55)},-0.44 L${f(BX + 0.55)},0.44 ${repeat(BX + 0.32, BX + 0.5, 0.06, (x) => `M${x},-0.44 L${x},0.44`)}`;
  } else if (mk === 'comp9') {
    mlen = 2.1;
    md = tube(mlen, 0.45);
    mdet = `${window(BX + 0.5, BX + 0.95, -0.26, 0.26)} ${window(BX + 1.15, BX + 1.6, -0.26, 0.26)} ${vents([0.62, 1.27], 0.45)} M${f(BX + 1.85)},-0.45 L${f(BX + 1.85)},0.45`;
  } else if (mk === 'comp') {
    mlen = 2.0;
    md = `M${f(BX)},-0.42 L${f(BX + mlen - 0.08)},-0.42 L${f(BX + mlen)},-0.34 L${f(BX + mlen)},0.34 L${f(BX + mlen - 0.08)},0.42 L${f(BX)},0.42 Z M${f(BX + 0.45)},-0.42 L${f(BX + 0.45)},0.42 ${repeat(BX + 0.75, BX + 1.6, 0.34, (x) => `M${x},-0.42 L${x},-0.27 Q${f(x + 0.1)},-0.15 ${f(x + 0.2)},-0.27 L${f(x + 0.2)},-0.42`)}`;
  } else {
    mlen = 2.25;
    // A2 birdcage: lengthwise slots around the top and sides; the bottom is closed.
    const slot = (y: number) => `M${f(BX + 0.9)},${f(y - 0.05)} L${f(BX + 1.95)},${f(y - 0.05)} Q${f(BX + 2.0)},${f(y)} ${f(BX + 1.95)},${f(y + 0.05)} L${f(BX + 0.9)},${f(y + 0.05)} Q${f(BX + 0.85)},${f(y)} ${f(BX + 0.9)},${f(y - 0.05)} Z`;
    md = `M${f(BX)},-0.4 L${f(BX + 0.4)},-0.4 L${f(BX + 0.55)},-0.45 L${f(BX + mlen)},-0.45 L${f(BX + mlen)},0.45 L${f(BX + 0.55)},0.45 L${f(BX + 0.4)},0.4 L${f(BX)},0.4 Z`;
    mdet = `M${f(BX + 0.55)},-0.45 L${f(BX + 0.55)},0.45 ${slot(-0.3)} ${slot(-0.08)} ${slot(0.14)}`;
  }
  P.push({ slot: 'muzzle', z: 12, row: 'top', target: px(BX + mlen / 2, -0.45), el: <><path d={T(md)} />{mdet && <path className="detail" d={T(mdet)} />}</> });

  // Optic, mounted on the upper's rail
  const opt = b.optic;
  const { od, odet, ot: oti } = rifleOptic(opt);
  const ot = px(oti[0], oti[1]);
  P.push({ slot: 'optic', z: 14, row: 'top', target: [ot[0], f(ot[1] + (RAIL + 1.1) * S)],
    el: <><path fillRule="evenodd" d={T(movePath(od, 0, RAIL + 1.1))} /><path className="detail" d={T(movePath(odet, 0, RAIL + 1.1))} /></> });

  // Add-ons, drawn only once chosen. Sizes are the makers' published lengths, rounded.
  // Lights, lasers and foregrips go where the builder put them: on the top, right, left or bottom of the
  // handguard, at a distance from the receiver. This is the right-side view, so anything on the left is
  // hidden behind the handguard and drawn in dashed hidden lines.
  const mounts = mountsFor(b, place, H);
  const RAIL_TOP = freeFloat ? RAIL : -0.98;
  const RAIL_BOT = freeFloat ? 0.95 : 0.98;
  const mountPiece = (slot: string, el: ReactNode, x0: number, x1: number, y0: number, y1: number) => {
    const m = mounts[slot];
    const outside = m.side === 'bottom' ? y1 + 0.55 : m.side === 'top' ? y0 - 0.55 : RAIL_TOP - 0.45;
    P.push({ slot, internal: m.side === 'left', z: 13, row: m.side === 'bottom' ? 'bottom' : 'top', target: px((x0 + x1) / 2, m.side === 'bottom' ? y1 : y0),
      move: { at: m.at, min: m.min, max: m.max, step: m.step, scale: S },
      dim: [f(ox + RF * S), f(ox + x0 * S), f(oy + outside * S), `${inch(m.at)} from receiver`], el });
  };
  if (b.light && mounts.light) {
    const m = mounts.light;
    const len = m.len;
    const r = 0.5, hr = 0.62, gap = 0.24;
    const cy = m.side === 'bottom' ? RAIL_BOT + gap + r : m.side === 'top' ? RAIL_TOP - gap - r : -0.08;
    const x0 = RF + m.at, x1 = x0 + len, hx = x1 - 1.1;
    const tab = m.side === 'bottom' ? `M${f(x0 + 0.8)},${f(RAIL_BOT)} L${f(x0 + 0.8)},${f(cy - r)} M${f(x0 + 2.0)},${f(RAIL_BOT)} L${f(x0 + 2.0)},${f(cy - r)}`
      : m.side === 'top' ? `M${f(x0 + 0.8)},${f(RAIL_TOP)} L${f(x0 + 0.8)},${f(cy + r)} M${f(x0 + 2.0)},${f(RAIL_TOP)} L${f(x0 + 2.0)},${f(cy + r)}` : '';
    mountPiece('light', <>
      <path d={T(`M${f(x0)},${f(cy - r)} L${f(hx)},${f(cy - r)} L${f(hx + 0.3)},${f(cy - hr)} L${f(x1)},${f(cy - hr)} L${f(x1)},${f(cy + hr)} L${f(hx + 0.3)},${f(cy + hr)} L${f(hx)},${f(cy + r)} L${f(x0)},${f(cy + r)} Q${f(x0 - 0.25)},${f(cy)} ${f(x0)},${f(cy - r)} Z`)} />
      <path className="detail" d={T(`${tab} M${f(x1 - 0.12)},${f(cy - hr + 0.08)} L${f(x1 - 0.12)},${f(cy + hr - 0.08)} ${repeat(x0 + 0.5, hx - 0.4, 0.35, (x) => `M${x},${f(cy - r + 0.12)} L${x},${f(cy + r - 0.12)}`)}`)} />
    </>, x0, x1, cy - hr, cy + hr);
  }
  if (b.laser && mounts.laser) {
    const m = mounts.laser;
    const combo = matches(b.laser, /CMR|light/i);
    const h = combo ? 1.3 : 1.1;
    const x0 = RF + m.at, x1 = x0 + m.len;
    const ya = m.side === 'bottom' ? RAIL_BOT : m.side === 'top' ? RAIL_TOP - h : -0.08 - h / 2;
    const yb = ya + h;
    mountPiece('laser', <>
      <path d={T(`M${f(x0)},${f(ya + 0.15)} Q${f(x0)},${f(ya)} ${f(x0 + 0.15)},${f(ya)} L${f(x1 - 0.1)},${f(ya)} Q${f(x1)},${f(ya)} ${f(x1)},${f(ya + 0.1)} L${f(x1)},${f(yb - 0.1)} Q${f(x1)},${f(yb)} ${f(x1 - 0.1)},${f(yb)} L${f(x0 + 0.15)},${f(yb)} Q${f(x0)},${f(yb)} ${f(x0)},${f(yb - 0.15)} Z`)} />
      <path className="detail" d={T(`M${f(x1 - 0.18)},${f(ya + 0.2)} L${f(x1 - 0.18)},${f(ya + h * 0.5)}${combo ? ` M${f(x1 - 0.18)},${f(ya + h * 0.6)} L${f(x1 - 0.18)},${f(yb - 0.2)}` : ''} M${f(x0 + 0.3)},${f(m.side === 'top' ? yb - 0.25 : ya + 0.25)} L${f(x1 - 0.7)},${f(m.side === 'top' ? yb - 0.25 : ya + 0.25)}`)} />
    </>, x0, x1, ya, yb);
  }
  if (b.foregrip && mounts.foregrip) {
    const m = mounts.foregrip;
    const kind = b.foregrip.attrs.kind;
    const h = (b.foregrip.attrs.h as number) ?? 1;
    const x0 = RF + m.at, x1 = x0 + m.len, y = RAIL_BOT, yb = y + h;
    const d = kind === 'vertical'
      ? `M${f(x0)},${f(y)} L${f(x1)},${f(y)} L${f(x1 - 0.12)},${f(yb - 0.25)} Q${f(x1 - 0.16)},${f(yb)} ${f(x1 - 0.42)},${f(yb)} L${f(x0 + 0.3)},${f(yb)} Q${f(x0 + 0.05)},${f(yb)} ${f(x0 + 0.08)},${f(yb - 0.28)} Z`
      : kind === 'angled'
        ? `M${f(x0)},${f(y)} L${f(x1)},${f(y)} L${f(x1 - 0.15)},${f(y + 0.28)} L${f(x0 + 0.55)},${f(yb)} Q${f(x0 + 0.1)},${f(yb + 0.02)} ${f(x0)},${f(yb - 0.35)} Z`
        : `M${f(x0)},${f(y)} L${f(x1)},${f(y)} L${f(x1)},${f(yb - 0.1)} Q${f(x1)},${f(yb)} ${f(x1 - 0.12)},${f(yb)} L${f(x0 + 0.55)},${f(yb)} L${f(x0)},${f(y + 0.12)} Z`;
    const det = kind === 'vertical'
      ? repeat(y + 0.7, yb - 0.4, 0.42, (yy) => `M${f(x0 + 0.2)},${yy} L${f(x1 - 0.2)},${yy}`)
      : `M${f(x0 + 0.25)},${f(y + 0.12)} L${f(x1 - 0.25)},${f(y + 0.12)}`;
    mountPiece('foregrip', <><path d={T(d)} /><path className="detail" d={T(det)} /></>, x0, x1, y, yb);
  }
  const mag3x = b.magnifier;
  if (mag3x && opt?.attrs.kind === 'dot') {
    // Behind the red dot on the receiver rail, at the dot's height, flipped up in line.
    const cy = (matches(opt, /reflex|510/i) ? -2.42 : -2.3) + RAIL + 1.1;
    const x1 = 1.9;
    const x0 = x1 - 4.1;
    const r = 0.72;
    P.push({ slot: 'magnifier', z: 14, row: 'top', target: px(x0 + 1.6, cy - r),
      el: <>
        <path d={T(`M${f(x0)},${f(cy - r + 0.1)} L${f(x0 + 1.0)},${f(cy - r + 0.1)} L${f(x0 + 1.2)},${f(cy - r + 0.2)} L${f(x1 - 0.5)},${f(cy - r + 0.2)} L${f(x1 - 0.3)},${f(cy - r)} L${f(x1)},${f(cy - r)} L${f(x1)},${f(cy + r)} L${f(x1 - 0.3)},${f(cy + r)} L${f(x1 - 0.5)},${f(cy + r - 0.2)} L${f(x0 + 1.2)},${f(cy + r - 0.2)} L${f(x0 + 1.0)},${f(cy + r - 0.1)} L${f(x0)},${f(cy + r - 0.1)} Z`)} />
        <path className="detail" d={T(`M${f(x0 + 1.6)},${f(cy + r - 0.2)} L${f(x0 + 1.6)},${f(RAIL)} L${f(x0 + 3.0)},${f(RAIL)} L${f(x0 + 3.0)},${f(cy + r - 0.2)} M${f(x0 + 0.5)},${f(cy - r + 0.1)} L${f(x0 + 0.5)},${f(cy + r - 0.1)}`)} />
      </> });
  }

  const front = Math.max(BX + (mz ? mlen : 0), HX);
  return {
    width: 1000, height: 486, pieces: P,
    center: [f(ox + (rear - 0.6) * S), f(ox + (front + 0.6) * S), oy],
    dims: [[f(ox + rear * S), f(ox + front * S), 462, `${inch(front - rear)} overall`], [f(ox + BF * S), f(ox + BX * S), oy + 2.05 * S, `${inch(L)} barrel`]],
    rows: [26, 424],
    spec: nine ? `${b.barrel?.attrs.caliber ?? '9mm'} · ${inch(L)} barrel · ${glock9 ? 'Glock' : 'Colt SMG'} mags · blowback`
      : `${b.barrel?.attrs.caliber ?? (big ? '.308 Win' : '5.56 NATO')} · ${inch(L)} barrel · ${gas} gas`,
  };
}

/* ================================================================= pistols */

/**
 * Factory dimensions, in inches, from the manufacturers' published spec tables
 * (us.glock.com technical data; Sig Sauer specs as listed for each size).
 * `oal` is overall length, `height` is top of the rear sight to the bottom of a flush magazine.
 */
interface PistolModel {
  brand: 'glock' | 'sig' | 'sw' | 'sa';
  slide: number; oal: number; barrel: number;
  /** Slide height, top flat to frame. The Glock patent drawing (a G42, US 9,316,455 FIG. 4) shows 0.83";
   *  the 9mm slides stand about a fifth of the gun's height. */
  sh: number;
  /** Grip angle as inches of rearward run per inch of drop */
  rake: number;
  /** Trigger distance: back strap to trigger face */
  reach: number;
}

const G = (slide: number, oal: number, barrel: number, sh: number, reach: number): PistolModel =>
  ({ brand: 'glock', slide, oal, barrel, sh, rake: 0.4, reach });
const S9 = (slide: number, oal: number, barrel: number, sh: number, reach: number): PistolModel =>
  ({ brand: 'sig', slide, oal, barrel, sh, rake: 0.33, reach });
const SW = (slide: number, oal: number, barrel: number, sh: number, reach: number): PistolModel =>
  ({ brand: 'sw', slide, oal, barrel, sh, rake: 0.3, reach });
const SA = (slide: number, oal: number, barrel: number, sh: number, reach: number): PistolModel =>
  ({ brand: 'sa', slide, oal, barrel, sh, rake: 0.25, reach });

const MODELS: Record<string, PistolModel> = {
  glock17: G(7.32, 8.03, 4.49, 0.98, 2.83),
  glock19: G(6.85, 7.36, 4.02, 0.98, 2.8),
  glock26: G(6.26, 6.5, 3.43, 0.98, 2.83),
  // G20/G21 Gen4: 8.07" long, 7.60" slide, 4.61" barrel, 5.51" tall, 2.85" trigger distance (us.glock.com).
  // The large-frame slide is taller.
  glock20: G(7.6, 8.07, 4.61, 1.06, 2.85),
  g43x: G(6.06, 6.5, 3.41, 0.9, 2.64),
  g48: G(6.85, 7.28, 4.17, 0.9, 2.64),
  p320full: S9(7.55, 8.0, 4.7, 1.18, 2.85),
  p320compact: S9(6.75, 7.2, 3.9, 1.18, 2.85),
  p320subcompact: S9(6.25, 6.7, 3.6, 1.18, 2.85),
  p365std: S9(5.4, 5.8, 3.1, 0.98, 2.6),
  p365xl: S9(6.2, 6.6, 3.7, 0.98, 2.6),
  // M&P9 M2.0 Full Size 4.25" (7.4" long, 5.5" tall) and Compact 4" (7.0", 5.3"), smith-wesson.com.
  mpfs: SW(6.93, 7.4, 4.25, 0.89, 2.8),
  mpc: SW(6.53, 7.0, 4.0, 0.89, 2.8),
  // Hellcat 3" (6.0" long, 4.0" tall) and Hellcat Pro 3.7" (6.6", 4.8"), springfield-armory.com.
  hellcat3: SA(5.79, 6.0, 3.0, 0.9, 2.6),
  hellcatpro: SA(6.39, 6.6, 3.7, 0.9, 2.6),
};

/** Published height with a flush magazine, by grip size / magazine size. */
const GLOCK_H: Record<string, number> = { glock17: 5.47, glock19: 5.04, glock26: 4.17, glock20: 5.51 };
const GLOCK_MAG_H: Record<number, number> = { 3: 5.47, 2: 5.04, 1: 4.17 };
const P320_H: Record<string, number> = { full: 5.5, carry: 5.5, compact: 5.3, subcompact: 4.7 };
const P320_DUST: Record<string, string> = { full: 'full', carry: 'compact', compact: 'compact', subcompact: 'subcompact' };
const P365_H: Record<string, number> = { std: 4.3, xl: 4.8, ext: 5.2 };
const MP_H: Record<string, number> = { fs: 5.5, c: 5.3 };
const HELLCAT_H: Record<string, number> = { '3': 4.0, pro: 4.8 };
const SIGHT = 0.2; // standard rear sight height above the slide
const BASE = 0.16; // magazine floor plate below the grip

interface PistolSpec {
  m: PistolModel;
  /** Frame model, which sets the dust cover length */
  frame: PistolModel;
  gripH: number;
  magH: number;
  grooves: number;
  /** Breech position from the slide's rear, when the barrel is shorter than the slide calls for (comp slides) */
  breech?: number;
  /** Large-frame Glock (G20/G21): a deeper grip front to back. */
  large?: boolean;
}

function pistolSpec(platform: Platform, b: Build): PistolSpec {
  const a = (p: Part | undefined, k: string) => p?.attrs[k] as string | undefined;
  switch (platform.id) {
    case 'glock43x': {
      const pick = (v?: string) => (v === '43X' ? MODELS.g43x : MODELS.g48);
      return { m: pick(a(b.slide, 'len') ?? a(b.frame, 'len')), frame: pick(a(b.frame, 'len') ?? a(b.slide, 'len')), gripH: 5.04, magH: 5.04, grooves: 0 };
    }
    case 'p320': {
      const size = a(b.grip, 'size') ?? 'carry';
      const m = MODELS['p320' + (a(b.slide, 'length') ?? P320_DUST[size])];
      const ms = a(b.mag, 'size');
      return { m, frame: MODELS['p320' + P320_DUST[size]], gripH: P320_H[size], magH: ms ? P320_H[ms] : P320_H[size], grooves: 0 };
    }
    case 'p365': {
      const g = a(b.grip, 'len') ?? 'xl';
      const base = MODELS['p365' + (a(b.slide, 'len') ?? g)];
      // The Spectre Comp slide is XL length but takes the 3.1" barrel; its comp fills the rest.
      const bl = a(b.slide, 'barrelLen');
      const m = bl ? { ...base, barrel: MODELS['p365' + bl].barrel } : base;
      const ml = a(b.mag, 'len');
      return { m, frame: MODELS['p365' + g], gripH: P365_H[g], magH: ml ? P365_H[ml] : P365_H[g], grooves: 0, breech: base.slide - base.barrel };
    }
    case 'mp2':
    case 'hellcat': {
      // Built from a complete pistol: the frame is the pistol's, the slide is the upgrade slide if there is one.
      const mp = platform.id === 'mp2';
      const key = (v?: string) => (mp ? 'mp' + (v ?? 'fs') : 'hellcat' + (v ?? '3'));
      const H = mp ? MP_H : HELLCAT_H;
      const fs = a(b.pistol, 'size') ?? (mp ? 'fs' : '3');
      const ss = a(b.slide, 'size') ?? fs;
      const ms = a(b.mag, 'size');
      const ext = b.mag ? (typeof b.mag.attrs.ext === 'number' ? b.mag.attrs.ext : b.mag.attrs.ext ? 0.9 : 0) : 0;
      return { m: MODELS[key(ss)], frame: MODELS[key(fs)], gripH: H[fs], magH: (ms ? H[ms] : H[fs]) + ext, grooves: 0 };
    }
    default: {
      const m = MODELS[platform.id] ?? MODELS.glock19;
      const ms = b.mag?.attrs.size as number | undefined;
      // Large-frame magazines are flush or extended (the ETS 18 and 20 round bodies add about an inch).
      if (platform.id === 'glock20') {
        const fr = b.frame;
        const grooved = !fr || !matches(fr, /No finger grooves/);
        return { m, frame: m, gripH: 5.51, magH: b.mag?.attrs.ext ? 6.5 : 5.51, grooves: grooved ? 3 : 0, large: true };
      }
      const fr = b.frame;
      const grooved = !fr || (/gen3|gen4/.test(String(fr.attrs.gen)) && !matches(fr, /No finger grooves/));
      return { m, frame: m, gripH: GLOCK_H[platform.id] ?? 5.04, magH: ms ? GLOCK_MAG_H[ms] : GLOCK_H[platform.id] ?? 5.04, grooves: grooved ? (platform.id === 'glock26' ? 2 : 3) : 0 };
    }
  }
}

/* Pistols are drawn from the makers' own patent drawings (see scripts/pistol-profiles/trace.py): the P320 and P365
 * from Sig's design patents, the Glocks from Glock's G42 utility patent. Each is calibrated to the published length
 * and height of the gun it shows, then fitted to each slide, frame and grip size. */

type ProfileKey = 'p320' | 'p365' | 'glock' | 'mp' | 'hellcat';

/** The size each patent drawing shows, and what the patents leave as broken lines (trigger) or don't show. */
const PROFILE_REF: Record<ProfileKey, { oal: number; h: number; rake: number; portH: number; tilt?: number }> = {
  p320: { oal: 8.0, h: 5.5, rake: 0.2, portH: 0.52 },
  p365: { oal: 5.8, h: 4.3, rake: 0.1, portH: 0.4 },
  glock: { oal: 5.94, h: 4.13, rake: 0.29, portH: 0.48 },
  // The S&W and Springfield drawings are fitted to the published length and height, which leaves their grips a
  // little more upright than drawn; `tilt` leans the grip back below the trigger guard to match the drawings.
  mp: { oal: 7.4, h: 5.5, rake: 0.3, portH: 0.58, tilt: 0.06 },
  hellcat: { oal: 6.0, h: 4.36, rake: 0.25, portH: 0.5, tilt: 0.05 },
};

/** Trigger shoes, traced from the broken-line triggers in the same patent drawings (y0 is the top of the guard opening).
 *  The P320's curved shoe bows back and its tip curls forward; the P365's runs forward to a tip near the guard;
 *  the Glock's blade has the safety lever down its face. */
const TRIGGERS: Record<ProfileKey, { face: number; curved: (y0: number) => string; flat: (y0: number) => string; line: { curved: string; flat: string } }> = {
  p320: {
    face: 2.86,
    curved: (y0) => `M2.66,${y0} Q2.5,2.05 2.6,2.32 Q2.66,2.44 2.84,2.43 Q2.89,2.42 2.87,2.38 Q2.76,2.32 2.76,2.14 Q2.76,1.94 2.86,${y0} Z`,
    flat: (y0) => `M2.66,${y0} L2.6,1.98 L2.6,2.38 Q2.6,2.43 2.65,2.43 L2.78,2.43 Q2.82,2.43 2.82,2.38 L2.82,1.98 L2.86,${y0} Z`,
    line: { curved: 'M2.8,1.86 Q2.71,2.08 2.74,2.3', flat: 'M2.71,2.0 L2.71,2.36' },
  },
  p365: {
    face: 2.8,
    curved: (y0) => `M2.6,${y0} Q2.54,1.72 2.7,1.92 Q2.78,1.98 2.86,1.95 Q2.89,1.92 2.86,1.89 Q2.76,1.76 2.8,${y0} Z`,
    flat: (y0) => `M2.62,${y0} L2.62,1.9 Q2.62,1.95 2.67,1.95 L2.78,1.95 Q2.82,1.95 2.81,1.9 L2.8,${y0} Z`,
    line: { curved: 'M2.74,1.4 Q2.72,1.7 2.8,1.88', flat: 'M2.71,1.42 L2.71,1.88' },
  },
  glock: {
    face: 2.98,
    curved: (y0) => `M2.76,${y0} Q2.6,1.86 2.8,2.16 Q2.88,2.26 3.0,2.25 Q3.06,2.24 3.03,2.18 Q2.9,2.0 2.96,1.74 Q2.99,1.6 3.06,${y0} Z`,
    flat: (y0) => `M2.76,${y0} Q2.62,1.84 2.74,2.14 Q2.8,2.25 2.94,2.25 Q3.0,2.24 2.98,2.17 L2.93,1.82 Q2.92,1.66 3.06,${y0} Z`,
    line: { curved: 'M2.86,1.56 Q2.8,1.86 2.9,2.1', flat: 'M2.86,1.56 Q2.8,1.84 2.86,2.12' },
  },
  // The M&P's hinged trigger safety: the upper shoe, and the lower blade that pivots on a pin at the hinge and
  // curls forward to its tip. Traced from the same patent drawing.
  mp: {
    face: 2.8,
    curved: (y0) => `M2.37,${y0} Q2.56,1.82 2.59,1.95 L2.606,2.1 L2.763,2.1 L2.763,2.06 Q2.8,1.8 3.095,${y0} Z M2.612,2.13 Q2.7,2.36 2.812,2.522 Q2.82,2.59 2.88,2.59 L2.95,2.588 Q3.05,2.58 3.046,2.522 Q2.85,2.3 2.765,2.13 Z`,
    flat: (y0) => `M2.37,${y0} Q2.56,1.82 2.59,1.95 L2.606,2.1 L2.763,2.1 L2.763,2.06 Q2.8,1.8 3.095,${y0} Z M2.612,2.13 L2.71,2.56 Q2.72,2.6 2.77,2.6 L2.93,2.6 Q2.98,2.6 2.97,2.55 L2.8,2.13 Z`,
    line: {
      curved: 'M2.66,2.08 Q2.66,2.05 2.69,2.05 Q2.72,2.05 2.72,2.08 Q2.72,2.11 2.69,2.11 Q2.66,2.11 2.66,2.08 Z M2.7,2.2 Q2.78,2.38 2.88,2.52',
      flat: 'M2.66,2.08 Q2.66,2.05 2.69,2.05 Q2.72,2.05 2.72,2.08 Q2.72,2.11 2.69,2.11 Q2.66,2.11 2.66,2.08 Z M2.7,2.2 L2.79,2.54',
    },
  },
  // The Hellcat's straight shoe angles forward from its pivot and widens to a rounded tip, with the blade safety
  // down its middle. Traced from the same patent drawing.
  hellcat: {
    face: 3.45,
    // A wide shoe on the trigger bar, with the blade safety running down its face (US D998,740 FIG. 4).
    curved: (y0) => `M3.219,${y0} Q3.24,1.66 3.279,1.776 L3.357,1.983 Q3.4,2.08 3.447,2.151 Q3.5,2.22 3.551,2.25 L3.624,2.289 Q3.62,2.33 3.578,2.34 L3.538,2.346 L3.512,2.367 Q3.49,2.41 3.447,2.411 L3.409,2.392 L3.318,2.346 Q3.17,2.24 3.033,2.022 L3.007,1.97 L2.903,1.952 L2.701,1.91 L2.701,1.84 L3.007,1.944 L3.157,${y0} Z`,
    flat: (y0) => `M3.219,${y0} L3.6,2.25 L3.624,2.289 Q3.62,2.33 3.578,2.34 L3.538,2.346 L3.512,2.367 Q3.49,2.41 3.447,2.411 L3.409,2.392 L3.318,2.346 Q3.17,2.24 3.033,2.022 L3.007,1.97 L2.903,1.952 L2.701,1.91 L2.701,1.84 L3.007,1.944 L3.157,${y0} Z`,
    line: {
      curved: 'M3.157,1.563 Q3.19,1.79 3.227,1.931 Q3.27,2.08 3.318,2.177 L3.421,2.351 M3.183,1.568 L3.253,1.853 Q3.3,1.99 3.357,2.125 L3.46,2.294 L3.512,2.359 M3.235,1.568 L3.331,1.879 L3.434,2.112 L3.525,2.268 L3.551,2.341 M3.025,2.035 C3.025,2.066 3.0,2.092 2.968,2.092 C2.937,2.092 2.911,2.066 2.911,2.035 C2.911,2.004 2.937,1.978 2.968,1.978 C3.0,1.978 3.025,2.004 3.025,2.035 Z',
      flat: 'M3.157,1.563 Q3.19,1.79 3.227,1.931 Q3.27,2.08 3.318,2.177 L3.421,2.351 M3.183,1.568 L3.47,2.3 M3.235,1.568 L3.53,2.29 M3.025,2.035 C3.025,2.066 3.0,2.092 2.968,2.092 C2.937,2.092 2.911,2.066 2.911,2.035 C2.911,2.004 2.937,1.978 2.968,1.978 C3.0,1.978 3.025,2.004 3.025,2.035 Z',
    },
  },
};

/** The M&P 2.0's scalloped slide serrations: tall rounded slots leaning forward, eight at the rear and three at the front
 *  (ahead of the ejection port), as on US D814,592 FIG. 1. Inches on the slide, drawn in code because the stippled
 *  drawing's loops trace unevenly. */
function mpSerr(SL: number, SH: number) {
  const slot = (x: number, top: number, bottom: number) => {
    const w = 0.085, lean = 0.1;
    return `M${f(x)},${f(bottom)} L${f(x + lean)},${f(top + 0.04)} Q${f(x + lean + 0.02)},${f(top)} ${f(x + lean + w)},${f(top)} L${f(x + w)},${f(bottom - 0.04)} Q${f(x + w - 0.02)},${f(bottom)} ${f(x)},${f(bottom)} Z`;
  };
  let d = '';
  for (let k = 0; k < 8; k++) d += slot(0.3 + k * 0.19, 0.16, SH - 0.1) + ' ';
  for (let k = 0; k < 3; k++) d += slot(SL - 1.4 + k * 0.19, 0.16, SH - 0.14) + ' ';
  return d;
}

/** The Hellcat's slide serrations, drawn from US D998,740 FIG. 4 (the traced dashes come out ragged): slanted lands
 *  with a cut beside each, five at the rear and three at the front. Patent pixels, mapped to inches by the trace's scale. */
const HELLCAT_SERR: { pts: number[]; close: boolean }[] = (() => {
  const P = (pts: number[]) => pts.map((v, i) => Math.round(((v - (i % 2 ? 415 : 480)) / 385.8) * 1000) / 1000);
  const out: { pts: number[]; close: boolean }[] = [];
  const land = (tx: number, top: number, lean: number, w: number) => out.push({ pts: P([tx, top, tx + w, top, tx + w - lean, 688, tx - lean, 688]), close: true });
  const cut = (x0: number, y0: number, x1: number, y1: number, w: number) => out.push({ pts: P([x0, y0, x0 + w, y0, x1 + w, y1, x1, y1]), close: true });
  for (let k = 0; k < 5; k++) {
    const tx = 725 + 105.5 * k;
    land(tx, 494, 32, 61);
    cut(tx + 66, 506, tx + 41, 654, 26);
  }
  out.push({ pts: P([1252, 494, 1220, 688]), close: false });
  for (let k = 0; k < 3; k++) {
    const tx = 2085 + 105 * k;
    land(tx, 479, 37, 65);
    if (k < 2) cut(tx + 74, 492, tx + 41, 672, 22);
  }
  return out;
})();

/** Monotone stretch along x: up to a nothing moves, [a, b] grows or shrinks by d (never below minZone),
 *  [b, end] shifts and absorbs whatever [a, b] could not, and everything past end shifts by d. */
function stretchX(a: number, b: number, end: number, d: number, minZone = 0.15) {
  const zone = b - a;
  const d1 = Math.max(d, minZone - zone);
  const k1 = (zone + d1) / zone;
  const k2 = (end - b + d - d1) / (end - b);
  return (x: number) => (x <= a ? x : x <= b ? a + (x - a) * k1 : x <= end ? b + d1 + (x - b) * k2 : x + d);
}

type Map2 = (x: number, y: number) => [number, number];
const n3 = (n: number) => (Math.round(n * 1000) / 1000).toString();
function polyPath(pts: number[], map: Map2, close: boolean) {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) {
    const [x, y] = map(pts[i], pts[i + 1]);
    d += `${i ? ' L' : 'M'}${n3(x)},${n3(y)}`;
  }
  return close ? d + ' Z' : d;
}
/** Adds points so no segment is longer than step, so a closed polyline bends smoothly under a warp. */
function densify(pts: number[], step: number) {
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1];
    const x1 = pts[(2 * i + 2) % pts.length], y1 = pts[(2 * i + 3) % pts.length];
    const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let j = 0; j < k; j++) out.push(x0 + ((x1 - x0) * j) / k, y0 + ((y1 - y0) * j) / k);
  }
  return out;
}
/** Eases the back strap toward a straight run: points on the back edge (x < 1.2 between y0 and y1) move part of the
 *  way out to the convex envelope from the beavertail to the heel. The G42's web under the beavertail is deeper than
 *  the 9mm Glocks'. */
function fillWeb(pts: number[], y0: number, y1: number, a: number) {
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i += 2) if (pts[i] < 1.2 && pts[i + 1] > y0 && pts[i + 1] < y1) idx.push(i);
  const p = idx.map((i) => [pts[i + 1], pts[i]]).sort((u, v) => u[0] - v[0]);
  // Envelope on the left: lower hull of the points (y, x).
  const hull: number[][] = [];
  for (const q of p) {
    while (hull.length >= 2) {
      const [a1, b1] = hull[hull.length - 2], [a2, b2] = hull[hull.length - 1];
      if ((a2 - a1) * (q[1] - b1) - (b2 - b1) * (q[0] - a1) <= 0) hull.pop(); else break;
    }
    hull.push(q);
  }
  const env = (y: number) => {
    for (let k = 1; k < hull.length; k++)
      if (y <= hull[k][0]) return hull[k - 1][1] + ((y - hull[k - 1][0]) / (hull[k][0] - hull[k - 1][0] || 1)) * (hull[k][1] - hull[k - 1][1]);
    return hull[hull.length - 1][1];
  };
  const out = pts.slice();
  for (const i of idx) out[i] = pts[i] - a * (pts[i] - env(pts[i + 1]));
  return out;
}

/** The Glock grip, built to the 9mm Glocks' proportions rather than the G42's: a short beavertail about 0.38" behind the slide,
 *  the web sits at the published trigger distance (about 2.8") behind the trigger, the back strap runs from there down
 *  and back to a heel about 0.25" behind the beavertail, the front strap is raked a little more, and the mag well is
 *  about 2.1" front to back at the bottom (1.85" on the slimline). Gen3/4 frames have the hump low on the back strap
 *  and finger grooves; Gen5 frames have a flared mag well. The traced G42 outline is kept from the top of the frame
 *  over the dust cover and around the trigger guard. Coordinates are final inches. */
function glockGrip(traced: number[], o: { SH: number; hole: number[]; slim: boolean; large?: boolean; grooves: number; yGB: number }) {
  const { SH, slim, large, grooves: n, yGB } = o;
  const [h0x, , h1x, h1y] = o.hole;
  const N = traced.length / 2;
  const X = (i: number) => traced[2 * (((i % N) + N) % N)], Y = (i: number) => traced[2 * (((i % N) + N) % N) + 1];
  // Splice points: B on the frame's top edge behind the slide stop, A under the rear of the trigger guard.
  let iB = 0, iA = 0, bd = Infinity, ay = -Infinity;
  for (let i = 0; i < N; i++) {
    if (Math.abs(Y(i) - SH) < 0.08 && Math.abs(X(i) - 0.6) < bd) { bd = Math.abs(X(i) - 0.6); iB = i; }
    if (X(i) > h0x + 0.15 && X(i) < h0x + 0.4 && Y(i) > h1y && Y(i) > ay) { ay = Y(i); iA = i; }
  }
  const dir = X(iB + 1) > X(iB) ? 1 : -1;
  const pts: number[] = [];
  for (let i = iB; ; i += dir) {
    pts.push(X(i), Y(i));
    if (((i % N) + N) % N === iA) break;
  }
  const q = (p0: number[], c: number[], p1: number[], k = 8) => {
    for (let j = 1; j <= k; j++) {
      const t = j / k, u = 1 - t;
      pts.push(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]);
    }
  };
  const tang = slim ? 0.36 : 0.38;
  // The large frame's grip is a little deeper front to back for the longer 10mm and .45 magazines.
  const gw = slim ? 1.85 : large ? 2.16 : 2.08;
  const hx = -tang - 0.31;
  const toeX = hx + gw;
  const A = [X(iA), Y(iA)];
  const fy = A[1] + 0.24;
  // Front strap rake (inches back per inch down): matched to the back strap's, so the grip tilts as one piece.
  const fs = 0.31 + 0.06 / (yGB - fy);
  const front = (y: number) => toeX + fs * (yGB - y);
  // Under the guard: a tight radius from the guard's bottom into the front strap.
  q(A, [front(fy) + 0.03, A[1]], [front(fy), fy]);
  const gen5 = !n && !slim;
  const yF = yGB - (gen5 ? 0.28 : 0.12);
  // Finger grooves need about 0.6" each; a short grip (G26) fits fewer.
  const g0 = fy + 0.1, g1 = yGB - 0.4;
  const ng = Math.min(n, Math.floor((g1 - g0) / 0.6));
  for (let y = fy + 0.04; y < yF; y += 0.04) {
    const t = (y - g0) / (g1 - g0);
    const groove = ng && t > 0 && t < 1 ? 0.08 * Math.sin(Math.PI * ng * t) ** 2 : 0;
    pts.push(front(y) - groove, y);
  }
  if (gen5) q([front(yF), yF], [front(yGB - 0.08) + 0.01, yGB - 0.1], [toeX + 0.07, yGB - 0.03], 5);
  q([pts[pts.length - 2], pts[pts.length - 1]], [toeX + 0.04, yGB], [toeX - 0.08, yGB], 3);
  pts.push(hx + 0.08, yGB);
  // Back strap, heel up to the web. It runs straight above that, so the web can carry its line on.
  const wx = -tang + (slim ? 0.69 : 0.71), wy = SH + 0.74;
  q([hx + 0.08, yGB], [hx, yGB], [hx - 0.01, yGB - 0.1], 3);
  const yb0 = yGB - 0.1, sx = (wx - hx + 0.01) / (yb0 - wy);
  const bx = (y: number) => hx - 0.01 + sx * (yb0 - y);
  const yw = SH + 1.05;
  for (let y = yb0 - 0.05; y > yw + 0.02; y -= 0.05) {
    const t = (yb0 - y) / (yb0 - wy);
    // Gen3/4 frames swell gently through the middle of the palm; the back strap stays straight at the heel.
    pts.push(bx(y) - (n ? 0.035 * Math.exp(-(((t - 0.55) / 0.22) ** 2)) : 0), y);
  }
  // Web: one cubic that leaves along the back strap's line and arrives level under the beavertail.
  const P0 = [bx(yw), yw], P3 = [-tang + 0.16, SH + 0.24];
  const dl = Math.hypot(sx, 1), L = 0.3;
  const P1 = [P0[0] + (sx / dl) * L, P0[1] - L / dl], P2 = [P3[0] + 0.42, P3[1] + 0.04];
  for (let j = 1; j <= 14; j++) {
    const t = j / 14, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    pts.push(a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1]);
  }
  q([-tang + 0.16, SH + 0.24], [-tang, SH + 0.24], [-tang, SH + 0.14], 4);
  q([-tang, SH + 0.14], [-tang + 0.01, SH + 0.01], [-tang + 0.2, SH], 4);
  return { pts, heel: [hx, yGB] as [number, number], toe: [toeX, yGB] as [number, number], tang, h1x };
}

/** Where a horizontal line at y crosses a closed polyline. */
function crossings(pts: number[], y: number) {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[(i + 2) % pts.length], y1 = pts[(i + 3) % pts.length];
    if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
  }
  return xs.sort((a, b) => a - b);
}

interface ProfileGeo {
  key: ProfileKey;
  SL: number; muzzle: number; tang: number; bc: number; springY: number; sh: number;
  port0: number; port1: number; portH: number;
  xt: number; trigTop: number; trigD: string; trigLine: string;
  gF: number; dust: number; railY: number;
  heel: [number, number]; toe: [number, number]; yGB: number; yMB: number; ext: number;
  frameD: string; frameDetail: string; stipple: string; slideD: string; slideDetail: string; windowD: string;
}

/** Moving average over a closed polyline (w points each side), to calm the wobble of a dotted drawing's trace. */
function smooth(pts: number[], w: number) {
  const n = pts.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    for (let j = -w; j <= w; j++) { const k = (i + j + n) % n; x += pts[2 * k]; y += pts[2 * k + 1]; }
    out.push(x / (2 * w + 1), y / (2 * w + 1));
  }
  return out;
}

function profileGeometry(key: ProfileKey, spec: PistolSpec, o: { slim: boolean; frontSerr: boolean; flat: boolean }): ProfileGeo {
  const pr = PROFILES[key];
  const R = PROFILE_REF[key];
  const glock = key === 'glock';
  // The Glock drawing is a G42. The bigger Glocks keep its trigger guard (Glock sizes the guard for gloved fingers
  // on every model) and grip angle, but have taller slides: the slide grows to each model's height and the frame drops under it.
  const ks = glock ? spec.m.sh / (pr.marks.sh as number) : 1;
  const dy = glock ? spec.m.sh - (pr.marks.sh as number) : 0;
  const scS = (pts: number[]) => (ks === 1 ? pts : pts.map((v, i) => (i % 2 ? v * ks : v)));
  const scF = (pts: number[]) => (dy === 0 ? pts : pts.map((v, i) => (i % 2 ? v + dy : v)));
  const scD = (d: string) => {
    if (dy === 0) return d;
    let i = 0;
    return d.replace(/-?\d*\.?\d+/g, (v) => (i++ % 2 ? n3(+v + dy) : v));
  };
  const raw = pr.marks as Record<string, number> & { hole: number[]; heel: number[]; toe: number[]; magWindow: number[] | null };
  const mk = { ...raw,
    bore: raw.bore * ks, spring: raw.spring * ks, sh: raw.sh * ks, railBottom: raw.railBottom + dy, gripBottom: raw.gripBottom + dy,
    hole: scF(raw.hole), heel: scF(raw.heel), toe: scF(raw.toe), magWindow: raw.magWindow && scF(raw.magWindow) } as unknown as typeof raw;
  const [h0x, h0y, h1x, h1y] = mk.hole;
  // The Glock drawing is a G42, so its sizes are fitted by slide length; the Sigs by overall length.
  const dS = glock ? spec.m.slide - mk.slide : spec.m.oal - R.oal; // slide length change
  const dF = glock ? spec.frame.slide - mk.slide : spec.frame.oal - R.oal; // dust cover length change
  // Grip length change. The G42 drawing's own height (grip bottom plus sights and floor plate) is a little under the published 4.13".
  const dH = spec.gripH - (glock ? (mk.gripBottom + SIGHT + BASE) : R.h);
  const SL = mk.slide + dS;
  // Ejection port: as drawn on the P320; over the chamber on the others (their patents show the left side).
  let port0 = mk.port0, port1 = mk.port1;
  if (port0 == null) {
    const barrel = spec.breech != null ? spec.m.slide - spec.breech : spec.m.barrel;
    port0 = SL - barrel - (glock ? 0.16 : 0.12);
    port1 = port0 + (glock ? (o.slim ? 1.1 : 1.28) : 1.02);
  }
  const sx = stretchX(port1 + 0.1, mk.frontSerr - 0.05, mk.slide, dS);
  const fa = h1x + 0.3;
  const fx = stretchX(fa, glock ? mk.dust - 0.3 : Math.max(mk.rail0, fa + 0.3), mk.dust, dF);
  // Grip: lengthen or shorten the straps between the trigger guard and the magazine well, along the grip angle.
  const win = mk.magWindow;
  let winTop = mk.gripBottom;
  if (win) for (let i = 1; i < win.length; i += 2) winTop = Math.min(winTop, win[i]);
  const g0 = glock ? h1y + 0.2 : h1y + 0.35;
  const g1 = glock ? mk.gripBottom - 0.25 : Math.min(mk.gripBottom - 0.45, winTop - 0.08);
  const ky = (g1 - g0 + dH) / (g1 - g0);
  const grip: Map2 = (x, y) => {
    const y2 = y <= g0 ? y : y <= g1 ? g0 + (y - g0) * ky : y + dH;
    return [x - R.rake * (y2 - y) - (R.tilt ?? 0) * Math.max(0, y2 - g0), y2];
  };
  // Gen3/4 Glock frames add finger grooves to the front strap.
  const n = spec.grooves;
  const groove = (x: number, y: number) => {
    if (!n || y <= g0 || y >= g1 || x < 1.0 - 0.3 * (y - g0)) return x;
    const t = (y - g0) / (g1 - g0);
    return x - 0.1 * Math.sin(Math.PI * n * t) ** 2;
  };
  const frameMap: Map2 = (x, y) => grip(groove(fx(x), y), y);
  const slideMap: Map2 = (x, y) => [sx(x), y];
  let heel = grip(mk.heel[0], mk.heel[1]);
  let toe = grip(mk.toe[0], mk.toe[1]);
  const ext = Math.max(0, spec.magH - spec.gripH);
  // The Glock guard opening has a squared front: nearly vertical front wall and tight corners (US 4,539,889 FIG. 1).
  const glockHole = (() => {
    const [x0, y0, x1, y1] = mk.hole;
    const r = (cx: number, cy: number, rr: number, a0: number, a1: number, n = 5) => {
      const out: number[] = [];
      for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; out.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
      return out;
    };
    const PI = Math.PI;
    return [...r(x0 + 0.3, y0 + 0.3, 0.3, PI, 1.5 * PI), ...r(x1 - 0.16, y0 + 0.16, 0.16, 1.5 * PI, 2 * PI), ...r(x1 - 0.2, y1 - 0.2, 0.2, 0, 0.5 * PI), ...r(x0 + 0.34, y1 - 0.34, 0.34, 0.5 * PI, PI)];
  })();
  const hole = glock ? polyPath(glockHole, frameMap, true) : pr.frame.hole ? polyPath(scF(pr.frame.hole), frameMap, true) : '';
  const outlines = pr.frame.outline.map((ol) => (glock ? smooth(fillWeb(densify(scF(ol), 0.05), mk.sh + 0.15, mk.gripBottom - 0.1, 0.65), 2) : ol));
  let frameDetail = pr.frame.detail.map((ol) => polyPath(scF(ol), frameMap, false)).join(' ');
  let slideDetail = pr.slide.detail.map((ol) => polyPath(scS(ol), slideMap, false)).join(' ');
  let stipple = '';
  let tang = -mk.tang;
  const gF = fx(h1x + 0.15), dust = fx(mk.dust);
  let mapped: number[] = [];
  if (glock) {
    // The G42 drawing's detail lines are dotted CAD shading; draw Glock's own details on the traced outline instead.
    const traced = outlines[0].flatMap((_, i, a) => (i % 2 ? [] : frameMap(a[i], a[i + 1])));
    const SH = mk.sh, yRail = mk.railBottom;
    const grip9 = glockGrip(traced, { SH, hole: mk.hole, slim: o.slim, large: spec.large, grooves: spec.grooves, yGB: spec.gripH - SIGHT - BASE });
    mapped = grip9.pts;
    heel = grip9.heel;
    toe = grip9.toe;
    tang = grip9.tang;
    const M = (pts: number[]) => polyPath(pts, frameMap, false);
    // Frame rail line under the slide, the accessory rail with its slot, and checkering down the front of the guard.
    let rail = `M${f(fx(h1x + 0.1))},${f(yRail - 0.14)} L${f(dust - 0.08)},${f(yRail - 0.14)}`;
    for (const x of [dust - 0.42]) rail += ` M${f(x - 0.16)},${f(yRail - 0.14)} L${f(x - 0.16)},${f(yRail)} M${f(x)},${f(yRail - 0.14)} L${f(x)},${f(yRail)}`;
    let check = '';
    for (let y = h0y + 0.22; y < h1y - 0.12; y += 0.1) {
      const xs = crossings(mapped, y);
      const xg = xs[xs.length - 1];
      check += `M${f(xg - 0.075)},${f(y)} L${f(xg - 0.025)},${f(y)} `;
    }
    // Slide stop lever, takedown tab with its two ribs, and the three pins; the magazine catch behind the guard.
    const xt = TRIGGERS.glock.face;
    const controls = `M${f(xt - 1.22)},${f(SH + 0.04)} L${f(xt - 0.4)},${f(SH + 0.04)} Q${f(xt - 0.33)},${f(SH + 0.1)} ${f(xt - 0.4)},${f(SH + 0.16)} L${f(xt - 1.1)},${f(SH + 0.16)} L${f(xt - 1.22)},${f(SH + 0.1)} Z`
      + ` M${f(xt + 0.02)},${f(SH + 0.08)} L${f(xt + 0.32)},${f(SH + 0.08)} L${f(xt + 0.32)},${f(SH + 0.22)} L${f(xt + 0.02)},${f(SH + 0.22)} Z M${f(xt + 0.08)},${f(SH + 0.12)} L${f(xt + 0.26)},${f(SH + 0.12)} M${f(xt + 0.08)},${f(SH + 0.17)} L${f(xt + 0.26)},${f(SH + 0.17)}`
      + O2(xt - 0.22, SH + 0.3, 0.05) + O2(xt + 0.66, SH + 0.3, 0.05) + O2(0.5, SH + 0.22, 0.05);
    const catchD = M([h0x - 0.1, h0y + 0.1, h0x - 0.1, h0y + 0.42, h0x - 0.26, h0y + 0.42, h0x - 0.26, h0y + 0.1, h0x - 0.1, h0y + 0.1]);
    const frameLine = M([0.3, SH + 0.06, mk.dust - 0.2, SH + 0.06]);
    // Grip texture: a panel inset from both straps (so it follows the finger grooves and the grip angle), stippled.
    const ys: number[] = [];
    const tex0 = h1y + 0.32, tex1 = heel[1] - 0.24;
    for (let y = tex0; y < tex1; y += 0.1) ys.push(y);
    ys.push(tex1);
    const edge = ys.map((y) => { const xs = crossings(mapped, y); return [xs[0] + 0.17, xs[xs.length - 1] - 0.17]; });
    const panel = `M${ys.map((y, i) => `${f(edge[i][0])},${f(y)}`).join(' L')} L${[...ys].reverse().map((y, i) => `${f(edge[ys.length - 1 - i][1])},${f(y)}`).join(' L')} Z`;
    for (let y = tex0 + 0.12; y < tex1 - 0.06; y += 0.13) {
      const xs = crossings(mapped, y);
      const off = Math.round((y - tex0) / 0.13) % 2 ? 0.065 : 0;
      for (let x = xs[0] + 0.27 + off; x < xs[xs.length - 1] - 0.27; x += 0.13) stipple += `M${f(x)},${f(y)} L${f(x + 0.012)},${f(y)} `;
    }
    frameDetail = `${rail} ${check} ${controls} ${catchD} ${frameLine} ${panel}`;
    // Slide: the top bevel and lower edge lines, rear (and optional front) serrations, extractor and muzzle face.
    const lines = `M0.05,0.12 L${f(SL - 0.1)},0.12 M0.1,${f(SH - 0.18)} L${f(SL - 0.48)},${f(SH - 0.18)}`;
    // Glock serrations are straight vertical grooves, not slanted.
    const rearSerr = repeat(0.24, 1.12, 0.11, (x) => `M${x},0.2 L${x},${f(SH - 0.24)}`);
    const fSerr = o.frontSerr ? repeat(SL - 1.45, SL - 0.8, 0.12, (x) => `M${x},0.2 L${x},${f(SH - 0.3)}`) : '';
    const extractor = `M${f(port0 - 0.7)},0.24 L${f(port0 - 0.04)},0.24 L${f(port0 - 0.04)},0.42 L${f(port0 - 0.7)},0.42 Z`;
    const face = `M${f(SL - 0.05)},${f(mk.bore - 0.2)} L${f(SL - 0.05)},${f(mk.bore + 0.2)}`;
    slideDetail = `${lines} ${rearSerr} ${fSerr} ${extractor} ${face}`;
  }
  if (key === 'hellcat') slideDetail += ' ' + HELLCAT_SERR.map((p) => polyPath(scS(p.pts), slideMap, p.close)).join(' ');
  if (key === 'mp') slideDetail += ' ' + mpSerr(SL, mk.sh);
  if (key === 'hellcat') {
    // Takedown lever and slide stop on the frame flat, in place of the drawing's molded contour lines.
    frameDetail += ` ${OC(fx(2.4), mk.railBottom + 0.32, 0.17)} ${OC(fx(2.4), mk.railBottom + 0.32, 0.06)} M${f(fx(2.0))},${f(mk.railBottom + 0.1)} L${f(fx(1.75))},${f(mk.railBottom + 0.1)} Q${f(fx(1.6))},${f(mk.railBottom + 0.12)} ${f(fx(1.6))},${f(mk.railBottom + 0.24)} L${f(fx(1.62))},${f(mk.railBottom + 0.3)} L${f(fx(1.95))},${f(mk.railBottom + 0.28)}`;
  }
  const yGB = Math.max(heel[1], toe[1]);
  return {
    key, SL, muzzle: sx(mk.muzzle), tang, bc: mk.bore, springY: mk.spring, sh: mk.sh,
    port0, port1, portH: R.portH,
    xt: TRIGGERS[key].face, trigTop: h0y,
    trigD: scD((o.flat ? TRIGGERS[key].flat : TRIGGERS[key].curved)(h0y - dy)),
    trigLine: scD(o.flat ? TRIGGERS[key].line.flat : TRIGGERS[key].line.curved),
    gF, dust, railY: mk.railBottom,
    heel, toe, yGB, yMB: yGB + ext + BASE, ext,
    frameD: (glock ? polyPath(mapped, (x, y) => [x, y], true) : outlines.map((ol) => polyPath(ol, frameMap, true)).join(' ')) + ' ' + hole,
    frameDetail, stipple,
    slideD: pr.slide.outline.map((ol) => polyPath(scS(ol), slideMap, true)).join(' '),
    slideDetail,
    windowD: win ? polyPath(win, grip, true) : '',
  };
}

function profilePieces(P: Piece[], g: ProfileGeo, o: {
  T: ReturnType<typeof makeT>; px: (x: number, y: number) => [number, number];
  frameSlot: string; trig: string; flat: boolean; comp: boolean; cut: string; lighten: boolean; SL: number;
  own: (slot: string) => string;
}) {
  const { T, px, SL } = o;
  /* Frame or grip module, with its controls and texture as drawn on the patent */
  const midY = g.yGB - 1.0;
  P.push({ slot: o.frameSlot, z: 3, row: 'bottom', target: px((g.heel[0] + g.toe[0]) / 2 + 0.15, midY),
    el: <>
      <path fillRule="evenodd" d={T(g.frameD)} />
      <path className="detail" d={T(g.frameDetail)} />
      {g.stipple && <path className="detail stipple" d={T(g.stipple)} />}
    </> });

  /* Magazine: shows through the window in the grip's bottom edge, then the floor plate (and any extension) below */
  const [hx, hy] = g.heel, [tx, ty] = g.toe;
  const e = g.ext, bb = e + BASE;
  const floor = `M${f(hx + 0.04)},${f(hy)} L${f(tx - 0.02)},${f(ty)} L${f(tx + 0.03)},${f(ty + e + 0.03)} Q${f(tx + 0.07)},${f(ty + bb)} ${f(tx - 0.06)},${f(ty + bb)} L${f(hx + 0.08)},${f(hy + bb)} Q${f(hx - 0.05)},${f(hy + bb - 0.02)} ${f(hx - 0.02)},${f(hy + e + 0.04)} Z`;
  let extLines = '';
  if (e > 0.25) for (let t = 0.2; t < e - 0.08; t += 0.22) extLines += `M${f(hx + 0.12)},${f(hy + t)} L${f(tx - 0.14)},${f(ty + t)} `;
  P.push({ slot: o.own('mag'), z: 2, row: 'bottom', target: px((hx + tx) / 2, (hy + ty) / 2 + bb - 0.06),
    el: <>
      {g.windowD && <path d={T(g.windowD)} />}
      <path d={T(floor)} />
      <path className="detail" d={T(`M${f(hx + 0.1)},${f(hy + bb - 0.07)} L${f(tx - 0.08)},${f(ty + bb - 0.07)} ${extLines}`)} />
    </> });

  /* Trigger: hangs from the top of the guard opening, shaped as in the patents (which show it as a broken line) */
  const { xt, trigTop: yT } = g;
  P.push({ slot: o.trig, z: 5, row: 'bottom', target: px(xt - 0.1, yT + 0.55),
    el: <>
      <path d={T(g.trigD)} />
      <path className="detail" d={T(g.trigLine)} />
      {o.trig === 'fcu' && <path className="hidden-line" d={T(`M${f(-g.tang + 0.62)},${f(g.sh + 0.06)} L${f(xt + 0.9)},${f(g.sh + 0.06)} L${f(xt + 0.9)},${f(yT - 0.04)} L${f(-g.tang + 0.62)},${f(yT - 0.04)} Z`)} />}
    </> });

  /* Slide: patent outline and details, the ejection port cut through it, plus the chosen slide's own cuts */
  const port = `M${f(g.port0)},0 L${f(g.port0)},${f(g.portH)} L${f(g.port1)},${f(g.portH)} L${f(g.port1)},0 Z`;
  const lightCuts = o.lighten ? repeat(g.port1 + 0.35, SL - 1.6, 0.42, (x) => `M${x},0.06 L${f(x + 0.26)},0.06 L${f(x + 0.2)},0.3 L${f(x - 0.06)},0.3 Z`) : '';
  const ports = o.comp ? repeat(SL - 0.95, SL - 0.35, 0.22, (x) => `M${x},0 L${x},0.13 Q${f(x + 0.07)},0.22 ${f(x + 0.14)},0.13 L${f(x + 0.14)},0`) : '';
  const plate = o.cut !== 'none' ? `M0.86,0 L0.86,0.12 L2.66,0.12 L2.66,0` : '';
  const extractor = g.key === 'p365' ? `M${f(g.port0 - 0.3)},0.24 L${f(g.port0 - 0.04)},0.24 L${f(g.port0 - 0.04)},0.34 L${f(g.port0 - 0.3)},0.34 Z` : '';
  P.push({ slot: o.own('slide'), z: 8, row: 'top', target: px(SL - 1.0, g.sh * 0.5),
    el: <>
      <path fillRule="evenodd" d={T(`${g.slideD} ${port}`)} />
      <path className="detail" d={T(`${g.slideDetail} ${lightCuts} ${ports} ${plate} ${extractor}`)} />
    </> });
}

/** Moves (and scales) a path made only of M, L, Q and Z commands: every number pair is a point. */
function movePath(d: string, dx: number, dy: number, k = 1) {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (v) => n3(i++ % 2 ? +v * k + dy : +v * k + dx));
}

/** Pistol red dots, right side, rear at x = 0 and the slide's top at y = 0, sized from the makers' listed dimensions.
 *  Open emitters (RMR, Holosun 407/507, Romeo1Pro and the RMSc-size dots) have the window hood at the front, high,
 *  sloping down to the emitter housing at the rear; enclosed emitters (Acro, EPS, MPS) are a box with a lens at each
 *  end, laid out as in Aimpoint's Acro design patent (US D881,320 FIG. 4): battery cap mid-side, adjuster behind it,
 *  clamp along the bottom. */
function pistolOptic(o: Part | undefined, fp: string): { od: string; odet: string; len: number; h: number } {
  const holo = o?.brand === 'Holosun';
  if (fp === 'acro' || matches(o, /EPS|enclosed/i)) {
    const L = fp === 'acro' ? 2.05 : 1.8, H = fp === 'acro' ? 1.22 : 1.0;
    const r = 0.06;
    const od = `M0.04,0 L0.08,${f(-H + r)} Q0.09,${-H} ${f(r + 0.09)},${-H} L${f(L - 0.16)},${-H} Q${f(L - 0.04)},${-H} ${f(L - 0.02)},${f(-H + 0.12)} L${L},${f(-H + 0.2)} L${f(L - 0.04)},${f(-H + 0.26)} L${f(L - 0.04)},${f(-0.3)} L${L},${f(-0.24)} L${f(L - 0.02)},0 Z`;
    const cy = -H * 0.56, cr = H * 0.27;
    let ticks = '';
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      ticks += `M${f(L * 0.5 + Math.cos(t) * cr * 0.84)},${f(cy + Math.sin(t) * cr * 0.84)} L${f(L * 0.5 + Math.cos(t) * cr)},${f(cy + Math.sin(t) * cr)} `;
    }
    const cap = OC(L * 0.5, cy, cr) + ' ' + OC(L * 0.5, cy, cr * 0.8) + ' ' + ticks;
    // Brightness buttons on top at the rear, and the top shroud's edge.
    const top = `M0.3,${-H} L0.3,${f(-H - 0.04)} L0.62,${f(-H - 0.04)} L0.62,${-H} M0.1,${f(-H + 0.06)} L${f(L - 0.12)},${f(-H + 0.06)}`;
    const cross = `M${f(L * 0.5 - 0.06)},${f(-H * 0.56)} L${f(L * 0.5 + 0.06)},${f(-H * 0.56)} M${f(L * 0.5)},${f(-H * 0.56 - 0.06)} L${f(L * 0.5)},${f(-H * 0.56 + 0.06)}`;
    const adj = OC(L * 0.2, -H * 0.42, H * 0.12) + ' ' + OC(L * 0.2, -H * 0.42, H * 0.05);
    const clamp = `M${f(L * 0.12)},-0.02 L${f(L * 0.12)},-0.2 Q${f(L * 0.12)},-0.26 ${f(L * 0.18)},-0.26 L${f(L * 0.66)},-0.26 Q${f(L * 0.72)},-0.26 ${f(L * 0.72)},-0.2 L${f(L * 0.72)},-0.02 `
      + OC(L * 0.42, -0.13, 0.07) + ` M${f(L * 0.42 - 0.04)},-0.13 L${f(L * 0.42 + 0.04)},-0.13`;
    // Lens hoods: the front and rear glass sit back inside a lip at each end.
    const lips = `M0.17,${f(-H + 0.12)} L0.13,-0.3 M${f(L - 0.14)},${f(-H + 0.1)} L${f(L - 0.14)},-0.3 M0.02,${f(-H + 0.12)} L${f(L - 0.04)},${f(-H + 0.12)}`;
    return { od, odet: `${cap} ${cross} ${adj} ${clamp} ${lips} ${top}`, len: L, h: H };
  }
  const small = fp === 'rmsc' || fp === 'rmrcc' || fp === 'k';
  const sro = matches(o, /SRO/);
  const L = small ? 1.62 : 1.77;
  const H = small ? 0.84 : sro ? 1.16 : matches(o, /RomeoX/) ? 1.08 : 1.0;
  const hb = small ? 0.36 : 0.42; // emitter housing height at the rear
  const k0 = L * 0.48; // where the hood starts to rise
  const k1 = L * 0.64; // top of the hood's rear edge
  // Outline: low rear housing, then the hood rises to a flat top and drops down a near-upright front face.
  const top = sro
    ? `Q${f(k1 - 0.02)},${f(-H)} ${f((k1 + L) / 2)},${f(-H)} Q${f(L - 0.02)},${f(-H)} ${f(L - 0.02)},${f(-H + 0.3)}`
    : `Q${f(k1 + 0.04)},${f(-H)} ${f(k1 + 0.14)},${f(-H)} L${f(L - 0.12)},${f(-H)} Q${f(L - 0.03)},${f(-H)} ${f(L - 0.02)},${f(-H + 0.1)}`;
  const od = `M0.02,0 L0.0,${f(-hb + 0.1)} Q0.0,${f(-hb)} 0.1,${f(-hb)} L${f(k0 - 0.14)},${f(-hb)} Q${f(k0)},${f(-hb)} ${f(k0 + 0.06)},${f(-hb - 0.1)} L${f(k1 - 0.06)},${f(-H + 0.12)} ${top} L${L},-0.1 L${f(L - 0.04)},0 Z`;
  // Details: the hood's side face, the base line, windage adjuster, elevation knob, brightness buttons,
  // and Holosun's side battery tray.
  const face = sro
    ? `M${f(k0 + 0.14)},${f(-hb - 0.12)} L${f(k1 + 0.02)},${f(-H + 0.22)} Q${f(k1 + 0.06)},${f(-H + 0.08)} ${f((k1 + L) / 2)},${f(-H + 0.08)} Q${f(L - 0.1)},${f(-H + 0.08)} ${f(L - 0.1)},${f(-H + 0.32)} L${f(L - 0.1)},-0.2`
    : `M${f(k0 + 0.14)},${f(-hb - 0.12)} L${f(k1 + 0.02)},${f(-H + 0.16)} Q${f(k1 + 0.08)},${f(-H + 0.08)} ${f(k1 + 0.18)},${f(-H + 0.08)} L${f(L - 0.14)},${f(-H + 0.08)} Q${f(L - 0.1)},${f(-H + 0.08)} ${f(L - 0.1)},${f(-H + 0.14)} L${f(L - 0.1)},-0.2`;
  const base = `M0.02,-0.12 L${f(L - 0.02)},-0.12`;
  const wind = OC(0.26, -hb * 0.55, 0.075) + ` M${f(0.21)},${f(-hb * 0.55 + 0.03)} L${f(0.31)},${f(-hb * 0.55 - 0.03)}`;
  const elev = `M${f(k0 - 0.36)},${f(-hb)} L${f(k0 - 0.36)},${f(-hb - 0.05)} L${f(k0 - 0.16)},${f(-hb - 0.05)} L${f(k0 - 0.16)},${f(-hb)}`;
  const btn = (x: number) => `M${f(x)},${f(-0.2)} L${f(x)},${f(-0.3)} Q${f(x)},${f(-0.33)} ${f(x + 0.03)},${f(-0.33)} L${f(x + 0.13)},${f(-0.33)} Q${f(x + 0.16)},${f(-0.33)} ${f(x + 0.16)},${f(-0.3)} L${f(x + 0.16)},${f(-0.2)} Z`;
  const tray = holo ? `M${f(k0 - 0.02)},-0.14 L${f(k0 - 0.02)},${f(-hb + 0.04)} L${f(L - 0.2)},${f(-hb + 0.04)} L${f(L - 0.2)},-0.14 ${OC(k0 + 0.06, -0.24, 0.025)} ${OC(L - 0.28, -0.24, 0.025)}` : '';
  const btns = holo ? `${btn(0.4)} ${btn(0.6)}` : `${btn(k1 + 0.02)} ${btn(k1 + 0.24)}`;
  const glass = `M${f(L - 0.02)},${f(-H + 0.14)} L${f(L - 0.06)},-0.16`;
  return { od, odet: `${face} ${base} ${wind} ${elev} ${btns} ${tray} ${glass}`, len: L, h: H };
}

/** Which patent drawing each platform is fitted from; the rest follow their brand. */
const PROFILE_FOR: Record<string, ProfileKey> = { p365: 'p365', mp2: 'mp', hellcat: 'hellcat' };

function pistol(platform: Platform, build: Build): Scene {
  const S = 58;
  const has = (id: string) => platform.slots.some((s) => s.id === id);
  // Pistols built from a complete base pistol: an upgrade slot left empty is the factory part, drawn as part of the pistol.
  const base = has('pistol');
  const own = (slot: string) => (base && !build[slot] ? 'pistol' : slot);
  const b: Build = base ? { ...build, slide: build.slide ?? build.pistol, barrel: build.barrel ?? build.pistol, frame: build.pistol } : build;
  const spec = pistolSpec(platform, build);
  const { m } = spec;
  const sig = m.brand === 'sig';
  const micro = (sig && m.sh < 1.0) || m.brand === 'sa';
  const trig = has('fcg') ? 'fcg' : has('trigger') ? 'trigger' : 'fcu';
  const flat = trig === 'fcg' ? matches(b.fcg, /flat|Apex/i) : trig === 'trigger' ? !!b.trigger?.attrs.flat : matches(b.fcu, /flat|X-Series/i);
  // Every pistol is drawn from its maker's patent drawing, fitted to each size.
  const geo = profileGeometry(PROFILE_FOR[platform.id] ?? (sig ? 'p320' : 'glock'), spec, {
    slim: platform.id === 'glock43x', frontSerr: matches(b.slide, /serration|Gen5|MOS|ZEV|Spectre|XFull|M18/i), flat,
  });
  const { SL, tang } = geo;
  const SH = m.sh;
  const threaded = !!b.barrel?.attrs.threaded;
  const device = platform.slots.some((s) => s.id === 'muzzle') && b.muzzle ? (b.muzzle.attrs.kind === 'comp' ? 1.25 : 0.5) : 0;
  const front = geo.muzzle + Math.max(threaded ? 0.58 : 0, device ? device + 0.04 : 0);
  // Center the gun on the sheet.
  const ox = f((720 - (tang + front) * S) / 2 + tang * S);
  const oy = 112;
  const T = makeT(S, ox, oy);
  const px = (x: number, y: number): [number, number] => [f(ox + x * S), f(oy + y * S)];
  const P: Piece[] = [];

  const comp = matches(b.slide, /Comp|Spectre/);
  const cut = (b.slide?.attrs.cut as string | undefined) ?? 'none';
  const lighten = matches(b.slide, /Octane|Lightening/);
  const frameSlot = has('frame') ? 'frame' : base ? 'pistol' : 'grip';
  const { railY: yRail, gF, dust, yMB, bc, port0, port1, springY } = geo;
  const rear = Math.min(-tang, geo.heel[0]);
  profilePieces(P, geo, { T, px, frameSlot, trig: own(trig), flat, comp, cut, lighten, SL, own });

  /* Barrel: hood shows in the ejection port; the rest is hidden; threads run past the slide */
  const br = micro ? 0.24 : 0.28;
  const chamber = f(port0 - 0.12);
  P.push({ slot: own('barrel'), z: 9, row: 'top', target: px((port0 + port1) / 2, 0.24),
    el: <>
      <path d={T(`M${f(port0 + 0.02)},0.06 L${f(port1 - 0.02)},0.06 L${f(port1 - 0.02)},0.48 L${f(port0 + 0.02)},0.48 Z M${f(port0 + 0.16)},0.06 L${f(port0 + 0.16)},0.48`)} />
      <path className="hidden-line" d={T(`M${f(port1)},${f(bc - br)} L${f(SL)},${f(bc - br)} M${f(port1)},${f(bc + br)} L${f(SL)},${f(bc + br)} M${chamber},${f(bc + br + 0.06)} L${f(port1)},${f(bc + br + 0.06)} M${chamber},${f(bc - br)} L${chamber},${f(bc + br + 0.06)}`)} />
      {threaded && <path d={T(`M${SL},${f(bc - 0.2)} L${f(SL + 0.58)},${f(bc - 0.2)} L${f(SL + 0.58)},${f(bc + 0.2)} L${SL},${f(bc + 0.2)} Z ${repeat(SL + 0.08, SL + 0.52, 0.07, (x) => `M${x},${f(bc - 0.2)} L${f(x + 0.03)},${f(bc + 0.2)}`)}`)} />}
    </> });

  /* Muzzle device, screwed onto the threads */
  if (has('muzzle')) {
    const x0 = SL + 0.04;
    const comp = b.muzzle?.attrs.kind === 'comp';
    const md = comp
      ? `M${f(x0)},0.08 L${f(x0 + 1.1)},0.08 Q${f(x0 + 1.25)},0.08 ${f(x0 + 1.25)},0.24 L${f(x0 + 1.25)},${f(SH - 0.42)} L${f(x0 + 1.0)},${f(SH - 0.3)} L${f(x0)},${f(SH - 0.3)} Z`
      : `M${f(x0)},${f(bc - 0.26)} L${f(x0 + 0.46)},${f(bc - 0.26)} L${f(x0 + 0.5)},${f(bc - 0.2)} L${f(x0 + 0.5)},${f(bc + 0.2)} L${f(x0 + 0.46)},${f(bc + 0.26)} L${f(x0)},${f(bc + 0.26)} Z`;
    const mdet = comp
      ? `${repeat(x0 + 0.25, x0 + 0.85, 0.3, (x) => `M${x},0.08 L${f(x + 0.08)},0.3 L${f(x + 0.18)},0.3 L${f(x + 0.22)},0.08`)} M${f(x0 + 1.25)},${f(bc)} L${f(x0 + 1.1)},${f(bc)}`
      : repeat(x0 + 0.1, x0 + 0.4, 0.1, (x) => `M${x},${f(bc - 0.26)} L${x},${f(bc + 0.26)}`);
    P.push({ slot: 'muzzle', z: 9.5, row: 'top', target: px(x0 + (comp ? 0.6 : 0.25), comp ? 0.2 : bc),
      el: <><path d={T(md)} /><path className="detail" d={T(mdet)} /></> });
  }

  /* Recoil spring and slide parts (internal) */
  const springSlot = own(has('rsa') ? 'rsa' : 'spring');
  const sy = springY;
  P.push({ slot: springSlot, internal: true, z: 20, row: 'top', target: px(SL - 1.5, sy),
    el: <path d={T(`M${f(port0 + 0.5)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy + 0.08)} L${f(port0 + 0.5)},${f(sy + 0.08)} Z ${repeat(port0 + 0.7, SL - 0.3, 0.15, (x) => `M${x},${f(sy - 0.12)} L${f(x + 0.08)},${f(sy + 0.12)}`)}`)} /> });
  if (has('spk'))
    P.push({ slot: 'spk', internal: true, z: 20, row: 'top', target: px(0.6, bc),
      el: <path d={T(`M0.06,${f(bc - 0.09)} L${f(port0 - 0.3)},${f(bc - 0.09)} L${f(port0 - 0.3)},${f(bc + 0.09)} L0.06,${f(bc + 0.09)} Z M0.06,${f(bc - 0.2)} L0.24,${f(bc - 0.2)} L0.24,${f(bc + 0.2)} L0.06,${f(bc + 0.2)}`)} /> });

  /* Sights */
  const sh = b.sights?.attrs.height === 'suppressor' ? 0.36 : SIGHT;
  const sightSlot = has('sights') ? own('sights') : undefined;
  // Rear sight: a block with a sloped face, square notch and the dovetail in the slide; front: a post on its dovetail.
  // Tritium or fiber inserts show as small circles. Sig rear sights are longer with a sloped back.
  const r0 = sig ? 0.14 : 0.2, r1 = sig ? 0.86 : 0.74;
  const fr0 = SL - (sig ? 0.72 : 0.62), fr1 = SL - (sig ? 0.36 : 0.34);
  const sightsD = (sig
    ? `M${r0},0 L${f(r0 + 0.12)},${f(-sh)} L${f(r1 - 0.2)},${f(-sh)} L${r1},0 Z`
    : `M${r0},0 L${f(r0 + 0.04)},${f(-sh)} L${f(r1 - 0.06)},${f(-sh)} L${r1},0 Z`)
    + ` M${f(fr0)},0 L${f(fr0 + 0.08)},${f(-sh + 0.02)} L${f(fr1 - 0.04)},${f(-sh + 0.02)} L${f(fr1)},0 Z`;
  const sightDet = `M${f(r0 + 0.04)},0.1 L${f(r1 - 0.04)},0.1 M${f(r0 + 0.04)},0.1 L${f(r0 + 0.1)},0 M${f(r1 - 0.04)},0.1 L${f(r1 - 0.1)},0 `
    + `M${f((r0 + r1) / 2 - 0.08)},${f(-sh)} L${f((r0 + r1) / 2 - 0.08)},${f(-sh + 0.09)} L${f((r0 + r1) / 2 + 0.08)},${f(-sh + 0.09)} L${f((r0 + r1) / 2 + 0.08)},${f(-sh)} `
    + O2((r0 + r1) / 2, -sh / 2 + 0.02, 0.045) + ` M${f(fr0 + 0.04)},0.08 L${f(fr1 - 0.04)},0.08 ` + O2((fr0 + fr1) / 2, -sh / 2 + 0.02, 0.045);
  P.push({ slot: sightSlot, z: 10, row: 'top', target: px((r0 + r1) / 2, -sh), el: <><path d={T(sightsD)} /><path className="detail" d={T(sightDet)} /></> });

  /* Optic */
  const fp = (b.optic?.attrs.footprint as string) ?? (cut === 'none' ? 'rmr' : cut);
  const po = pistolOptic(b.optic, fp);
  P.push({ slot: 'optic', z: 11, row: 'top', target: px(0.9 + po.len / 2, -po.h),
    el: <><path fillRule="evenodd" d={T(movePath(po.od, 0.9, 0))} /><path className="detail" d={T(movePath(po.odet, 0.9, 0))} /></> });

  /* Weapon light on the dust cover rail, drawn only once chosen */
  let pFront = front;
  const pl = b.light;
  if (pl) {
    const big = matches(pl, /X300/);
    const len = big ? 3.25 : matches(pl, /Sub/) ? 2.2 : 2.15;
    const h = big ? 1.12 : 0.92;
    const lx1 = Math.max(dust + 0.05, gF + 0.2 + len);
    const lx0 = lx1 - len;
    const ly0 = yRail - 0.14;
    pFront = Math.max(front, lx1);
    P.push({ slot: 'light', z: 4, row: 'bottom', target: px(lx0 + len * 0.5, ly0 + h),
      el: <>
        <path d={T(`M${f(lx0)},${f(ly0)} L${f(lx1 - 0.1)},${f(ly0)} Q${f(lx1)},${f(ly0)} ${f(lx1)},${f(ly0 + 0.1)} L${f(lx1)},${f(ly0 + h - 0.1)} Q${f(lx1)},${f(ly0 + h)} ${f(lx1 - 0.1)},${f(ly0 + h)} L${f(lx0 + 0.35)},${f(ly0 + h)} Q${f(lx0)},${f(ly0 + h)} ${f(lx0)},${f(ly0 + h - 0.3)} Z`)} />
        <path className="detail" d={T(`M${f(lx1 - 0.1)},${f(ly0 + 0.16)} L${f(lx1 - 0.1)},${f(ly0 + h - 0.16)} M${f(lx0 + 0.15)},${f(ly0 + 0.3)} L${f(lx0 + 0.15)},${f(ly0 + 0.6)} M${f(lx0 + 0.35)},${f(ly0 + 0.12)} L${f(lx1 - 0.4)},${f(ly0 + 0.12)}`)} />
      </> });
  }

  const vx = f(ox + (pFront + 0.5) * S);
  return {
    width: 720, height: 560, pieces: P,
    center: [f(ox + (-tang - 0.4) * S), f(ox + (pFront + 0.4) * S), f(oy + bc * S)],
    dims: [[f(ox + rear * S), f(ox + pFront * S), 540, `${inch2(pFront - rear)} overall`]],
    vdims: [[vx, f(oy - sh * S), f(oy + yMB * S), `${inch2(yMB + sh)} tall`]],
    rows: [26, 500],
    spec: `${inch2(m.barrel)} barrel · ${inch2(SL)} slide`,
  };
}

const inch2 = (n: number) => `${n.toFixed(2)}"`;
/** A true circle from four cubic arcs (O2 below is the looser, squarer quadratic version). */
const OC = (x: number, y: number, r: number) => {
  const c = r * 0.5523;
  return `M${f(x - r)},${f(y)} C${f(x - r)},${f(y - c)} ${f(x - c)},${f(y - r)} ${f(x)},${f(y - r)} C${f(x + c)},${f(y - r)} ${f(x + r)},${f(y - c)} ${f(x + r)},${f(y)} C${f(x + r)},${f(y + c)} ${f(x + c)},${f(y + r)} ${f(x)},${f(y + r)} C${f(x - c)},${f(y + r)} ${f(x - r)},${f(y + c)} ${f(x - r)},${f(y)} Z`;
};
const O2 = (x: number, y: number, r: number) =>
  `M${f(x - r)},${f(y)} Q${f(x - r)},${f(y - r)} ${f(x)},${f(y - r)} Q${f(x + r)},${f(y - r)} ${f(x + r)},${f(y)} Q${f(x + r)},${f(y + r)} ${f(x)},${f(y + r)} Q${f(x - r)},${f(y + r)} ${f(x - r)},${f(y)} Z`;

/* ===================================================================== AKs */

/**
 * AKM and AK-74, right side. Proportions follow the general view in Kalashnikov's own patent drawing (WO 99/05467
 * FIG. 1, an AK-74M), measured off the figure and scaled to the rifle's published 37.1" length; its sketched lines
 * are redrawn straight here. Upgrade furniture, mounts and muzzle devices are drawn to the makers' published sizes.
 * Inches, bore on y = 0, receiver rear at x = 0.
 */
const AK_CHAMBER = 9.45; // bolt face, an inch behind the receiver front
/** A Picatinny rail block from x0 to x1, top at y and bottom at yb, with its cross slots. */
function akRail(x0: number, x1: number, y: number, yb: number) {
  return `M${f(x0)},${f(y)} L${f(x1)},${f(y)} L${f(x1)},${f(yb)} L${f(x0)},${f(yb)} Z ` + pic(x0 + 0.12, x1 - 0.12, y);
}
const stadium = (x0: number, x1: number, y: number, h: number) => {
  const r = h / 2;
  return `M${f(x0 + r)},${f(y - r)} L${f(x1 - r)},${f(y - r)} Q${f(x1)},${f(y - r)} ${f(x1)},${f(y)} Q${f(x1)},${f(y + r)} ${f(x1 - r)},${f(y + r)} L${f(x0 + r)},${f(y + r)} Q${f(x0)},${f(y + r)} ${f(x0)},${f(y)} Q${f(x0)},${f(y - r)} ${f(x0 + r)},${f(y - r)} Z`;
};

function ak(platform: Platform, b: Build): Scene {
  const S = 22, ox = 300, oy = 165;
  const T = makeT(S, ox, oy);
  const px = (x: number, y: number): [number, number] => [f(ox + x * S), f(oy + y * S)];
  const P: Piece[] = [];
  const rifle = b.rifle;
  /** An upgrade slot left empty shows the factory part, which belongs to the base rifle. */
  const own = (slot: string) => (b[slot] ? slot : 'rifle');
  const cal = platform.id === 'akm' ? 'akm' : 'ak74';
  const L = typeof rifle?.attrs.barrel === 'number' ? rifle.attrs.barrel : 16.3;
  const BX = AK_CHAMBER + L;
  const thread = (rifle?.attrs.thread as string | undefined) ?? (cal === 'akm' ? 'M14x1 LH' : 'M24x1.5');
  const mountKind = b.mount?.attrs.kind as string | undefined;
  const hgFull = b.handguard?.attrs.kind === 'full';
  // How the base rifle is built, from its catalog entry. Each changes the factory parts' shapes below:
  // furniture: laminate | walnut | polymer (AKM-shaped polymer) | polymer100 (AK-100 series polymer)
  // stockShape: akm | ak74 (lightening groove) | fixed100 | folder-left | folder-right; cover: ribbed | smooth
  // gasBlock: 45 | 90; receiver: stamped | yugo (1.5 mm, bulged trunnion, long handguards) | milled.
  const ra = rifle?.attrs ?? {};
  const furn = (ra.furniture as string | undefined) ?? 'laminate';
  const stockShape = (ra.stockShape as string | undefined) ?? (cal === 'ak74' ? 'ak74' : 'akm');
  const coverRibbed = ((ra.cover as string | undefined) ?? (cal === 'akm' ? 'ribbed' : 'smooth')) === 'ribbed';
  const gas90 = ((ra.gasBlock as number | undefined) ?? (cal === 'akm' ? 45 : 90)) === 90;
  const receiver = (ra.receiver as string | undefined) ?? 'stamped';
  const yugo = receiver === 'yugo';
  const poly100 = furn === 'polymer100';
  // Proportions measured off a right-side AKM photo: x from the receiver's rear, y from the bore (down is positive).
  const RF = 10.45; // receiver front
  const RB = 1.45; // receiver bottom
  const HG0 = RF + 0.1, HG1 = yugo ? 17.9 : 17.1; // lower handguard; the upper one runs from UH0 to the same front cap
  const UH0 = 12.6;
  const GT = -1.12, GB = -0.58; // gas tube top and bottom
  const GX0 = yugo ? 20.35 : 19.55, GX1 = GX0 + 1.95; // gas block, with the gas tube's socket at its rear
  const fs0 = BX - 0.95, fs1 = BX;

  // Receiver: the stamped body, the dust cover (ribbed on AKM-pattern rifles, smooth on the AK-74 and AK-100 pattern)
  // chamfered at its rear, the rear sight block with the leaf lying forward over the gas tube's root, the selector
  // lever and charging handle on this side, the trigger guard with the magazine release paddle, the trigger, and the
  // rivets. A milled receiver has no rivets and a long lightening cut above the magazine; the Yugoslav 1.5 mm
  // receiver shows its bulged front trunnion.
  const cover = mountKind !== 'cover';
  const rivets = receiver === 'milled' ? '' : [[0.65, 0.1], [1.55, 0.65], [0.65, 1.0], [2.9, 1.18], [4.7, 1.18], [8.6, 0.1], [9.6, 0.1], [8.6, 0.85], [9.6, 0.85]].map(([x, y]) => OC(x, y, 0.06)).join(' ');
  const coverRibs = coverRibbed ? repeat(2.0, 6.0, 0.95, (x) => `M${x},-1.14 L${x},-0.7 M${f(x + 0.14)},-1.14 L${f(x + 0.14)},-0.7`) : '';
  const receiverDet = receiver === 'milled'
    ? 'M5.4,-0.12 L9.5,-0.12 Q9.75,-0.12 9.75,0.13 L9.75,0.78 Q9.75,1.03 9.5,1.03 L5.4,1.03 Q5.15,1.03 5.15,0.78 L5.15,0.13 Q5.15,-0.12 5.4,-0.12 Z'
    : yugo ? `M9.05,-0.55 L9.05,0.25 L${RF},0.25` : '';
  P.push({ slot: 'rifle', z: 4, row: 'bottom', target: px(7.4, 0.9), el: <>
    <path d={T(`M0,-0.55 L${RF},-0.55 L${RF},${RB} L0,${RB} Z`)} />
    {cover && <path d={T('M0.05,-0.55 L0.05,-0.6 L1.2,-1.12 L9.5,-1.2 L9.5,-0.55 Z')} />}
    {cover && coverRibs && <path className="detail" d={T(coverRibs)} />}
    {/* rear sight block, the leaf lying on it and reaching forward over the gas tube, the gas tube latch on its side */}
    <path d={T('M9.5,-1.2 L9.6,-1.5 L10.9,-1.5 L10.9,-0.55 L9.5,-0.55 Z')} />
    <path d={T('M9.72,-1.5 L9.72,-1.98 L10.1,-1.98 L10.1,-1.78 L12.0,-1.68 Q12.25,-1.68 12.25,-1.5 L12.25,-1.3 L10.9,-1.3 L10.9,-1.5 Z')} />
    <path className="detail" d={T(`${repeat(10.3, 11.9, 0.2, (x) => `M${x},-1.78 L${x},-1.68`)} M9.8,-1.0 L10.05,-1.0 Q10.15,-1.0 10.15,-0.9 L10.15,-0.4 Q10.15,-0.3 10.05,-0.3 L9.8,-0.3 Q9.7,-0.3 9.7,-0.4 L9.7,-0.9 Q9.7,-1.0 9.8,-1.0 Z`)} />
    {/* selector lever, up on safe, on its pivot; the charging handle on the bolt carrier */}
    <path d={T('M2.55,0.05 L5.5,0.0 Q5.8,-0.05 5.85,0.15 L5.85,0.45 Q5.8,0.55 5.65,0.52 L2.55,0.45 Z')} />
    <path className="detail" d={T(`${OC(2.55, 0.25, 0.17)} ${OC(2.55, 0.25, 0.07)} M2.9,0.12 L5.4,0.08`)} />
    <path d={T('M6.33,-0.85 L9.5,-0.85 L9.5,-0.25 L6.33,-0.25 Z')} />
    <path className="detail" d={T('M6.6,-0.62 L9.4,-0.62 M6.6,-0.48 L9.4,-0.48')} />
    <path d={T('M6.25,-0.25 L6.25,-1.05 Q6.25,-1.22 6.42,-1.22 L6.8,-1.22 Q6.98,-1.2 6.92,-1.02 L6.65,-0.88 L6.58,-0.25 Z')} />
    {/* trigger guard; the magazine release paddle hangs behind the magazine with its tail curling under */}
    <path d={T(`M-1.1,${RB} L0.95,${RB} L0.95,1.64 L-1.1,1.64 Z`)} />
    <path fillRule="evenodd" d={T(`M2.85,${RB} L2.85,2.6 Q2.85,2.83 3.1,2.83 L5.0,2.83 Q5.23,2.83 5.23,2.6 L5.23,${RB} L5.11,${RB} L5.11,2.55 Q5.11,2.72 4.95,2.72 L3.4,2.72 Q3.25,2.72 3.25,2.55 L3.25,${RB} Z`)} />
    <path d={T(`M5.17,${RB} L5.8,${RB} L5.8,2.6 Q5.8,2.75 5.68,2.78 L5.72,3.0 L5.6,3.0 L5.55,2.78 Q5.48,2.7 5.48,2.55 L5.48,2.15 L5.3,2.15 Q5.17,2.15 5.17,2.0 Z`)} />
    <path className="detail" d={T('M5.3,1.75 L5.7,1.75 M5.3,1.9 L5.7,1.9')} />
    {/* trigger: the blade leans forward as it drops, and its tip hooks forward */}
    <path d={T(`M3.38,${RB} L3.64,${RB} Q3.6,1.9 3.72,2.15 Q3.85,2.35 4.05,2.4 Q4.12,2.48 3.98,2.52 Q3.6,2.45 3.52,2.1 Q3.42,1.8 3.38,${RB} Z`)} />
    <path className="detail" d={T(`${rivets} ${receiverDet} ${stadium(7.0, 7.75, 0.85, 0.3)} M0,-0.4 L0.1,-0.4 M0,1.2 L0.1,1.2`)} />
  </> });

  // Barrel with the gas tube lying on top of it back to the rear sight block, the gas block (its socket takes the
  // tube's front; a 45° block slopes down to the barrel, a 90° block stands square with its sling loop), the cleaning
  // rod under the barrel, the handguard cap, and the front sight block with its hooded post and sling loop.
  const g = GX0;
  const gasD = gas90
    ? `M${f(g)},-1.31 L${f(g + 1.55)},-1.31 Q${f(g + 1.68)},-1.31 ${f(g + 1.68)},-1.18 L${f(g + 1.68)},-0.55 L${f(GX1)},-0.55 L${f(GX1)},0.4 L${f(g + 2.15)},0.4 L${f(g + 2.15)},0.75 L${f(g + 1.75)},0.75 L${f(g + 1.75)},0.45 L${f(g + 0.5)},0.45 L${f(g + 0.5)},${GB} L${f(g)},${GB} Z`
    : `M${f(g)},-1.31 L${f(g + 1.05)},-1.31 Q${f(g + 1.35)},-1.31 ${f(g + 1.45)},-1.1 L${f(g + 1.8)},-0.6 L${f(GX1)},-0.55 L${f(GX1)},0.4 L${f(g + 2.15)},0.4 L${f(g + 2.15)},0.75 L${f(g + 1.75)},0.75 L${f(g + 1.75)},0.45 L${f(g + 0.5)},0.45 L${f(g + 0.5)},${GB} L${f(g)},${GB} Z`;
  const gasDet = `M${f(g + 0.5)},${GB} L${f(g + 0.5)},-1.31 M${f(g + 0.5)},-0.3 L${f(GX1)},-0.3 ${OC(g + 0.95, -0.85, 0.07)}${gas90 ? ` ${OC(g + 1.25, -0.95, 0.1)}` : ''}`;
  P.push({ slot: 'rifle', z: 4.2, row: 'top', target: px(BX - 3, -0.3), el: <>
    <path d={T(`M${HG1},-0.3 L${GX0},-0.3 L${GX0},0.33 L${HG1},0.33 Z M${GX1},-0.29 L${f(fs0)},-0.29 L${f(fs0)},0.29 L${GX1},0.29 Z M10.9,${GT} L${GX0},${GT} L${GX0},${GB} L10.9,${GB} Z M${HG1},0.42 L${f(fs0)},0.42 L${f(fs0)},0.58 L${HG1},0.58 Z`)} />
    <path className="hidden-line" d={T(`M${AK_CHAMBER},-0.35 L${HG1},-0.33 M${AK_CHAMBER},0.35 L${HG1},0.33`)} />
    {/* handguard cap: the ferrule holding both handguards' fronts */}
    <path d={T(`M${HG1},-1.45 L${f(HG1 + 0.45)},-1.45 L${f(HG1 + 0.45)},0.85 L${HG1},0.85 Z`)} />
    <path className="detail" d={T(`M${HG1},-0.57 L${f(HG1 + 0.45)},-0.57 M${f(HG1 + 0.12)},-1.35 L${f(HG1 + 0.12)},0.75`)} />
    <path d={T(gasD)} />
    <path className="detail" d={T(gasDet)} />
    {/* front sight block: base with the sling loop, the post in its hooded tower */}
    <path d={T(`M${f(fs0)},-0.83 L${f(fs1)},-0.83 L${f(fs1)},0.54 L${f(fs1 - 0.25)},0.54 L${f(fs1 - 0.25)},0.9 L${f(fs0 + 0.15)},0.9 L${f(fs0 + 0.15)},0.54 L${f(fs0)},0.54 Z`)} />
    <path d={T(`M${f(fs0 + 0.25)},-0.83 L${f(fs0 + 0.28)},-1.75 Q${f(fs0 + 0.28)},-2.05 ${f(fs0 + 0.5)},-2.05 Q${f(fs0 + 0.75)},-2.05 ${f(fs0 + 0.75)},-1.75 L${f(fs0 + 0.78)},-0.83 Z`)} />
    <path className="detail" d={T(`M${f(fs0 + 0.38)},-1.35 L${f(fs0 + 0.62)},-1.35 L${f(fs0 + 0.62)},-0.95 L${f(fs0 + 0.38)},-0.95 Z M${f(fs0 + 0.47)},-1.35 L${f(fs0 + 0.47)},-1.75 L${f(fs0 + 0.53)},-1.75 L${f(fs0 + 0.53)},-1.35 M${f(fs0)},-0.3 L${f(fs1)},-0.3 M${f(fs0 + 0.15)},0.72 L${f(fs1 - 0.25)},0.72 ${OC(fs0 + 0.47, 0.1, 0.1)}`)} />
  </> });

  // Upper handguard over the gas tube, vented twice a side (three times on the longer Yugoslav one), unless a
  // full-length handguard or a gas tube rail replaces it.
  if (!hgFull && mountKind !== 'gastube') {
    const vents = (yugo ? [0.8, 2.25, 3.7] : [1.0, 2.5]).map((d) => stadium(UH0 + d, UH0 + d + 0.75, -1.05, 0.28)).join(' ');
    P.push({ slot: 'rifle', z: 5, row: 'top', target: px(14.8, -1.05), el: <>
      <path d={T(`M${UH0},-0.57 L${UH0},-1.4 Q${UH0},-1.52 ${f(UH0 + 0.12)},-1.52 L${f(HG1 - 0.1)},-1.52 Q${HG1},-1.52 ${HG1},-1.4 L${HG1},-0.57 Z`)} />
      <path className="detail" d={T(`${vents} M${f(UH0 + 0.15)},-1.38 L${f(HG1 - 0.15)},-1.38 M${f(UH0 + 0.15)},-0.72 L${f(HG1 - 0.15)},-0.72`)} />
    </> });
  }

  // Lower handguard: the factory one swells under the palm at its rear (wood and AKM-pattern polymer carry the long
  // side groove, AK-100 pattern polymer two moulded ribs); the upgrades are drawn to their makers' shapes.
  const hg = b.handguard;
  const hgSlot = own('handguard');
  if (!hg)
    P.push({ slot: hgSlot, z: 6, row: 'bottom', target: px(14, 0.72), el: <>
      <path d={T(`M${HG0},-0.57 L${HG1},-0.57 L${HG1},0.87 L${f(HG1 - 0.5)},0.95 Q${f(HG1 - 2.5)},1.0 13.0,1.16 Q12.1,1.3 11.8,${RB} L11.0,${RB} Q${HG0},1.4 ${HG0},1.1 Z`)} />
      <path className="detail" d={T(`M${f(HG0 + 0.25)},-0.57 L${f(HG0 + 0.25)},${RB} M${f(HG1 - 0.2)},-0.57 L${f(HG1 - 0.2)},0.9 ${poly100 ? `M11.3,0.05 L${f(HG1 - 0.4)},0.05 M11.3,0.5 L${f(HG1 - 0.4)},0.5` : stadium(12.2, HG1 - 1.7, 0.25, 0.36)}`)} />
    </> });
  else if (hg.attrs.kind === 'full')
    // ZHUKOV: one shell over both handguards, tall at the rear, its top chamfered down toward the gas block
    P.push({ slot: 'handguard', z: 6, row: 'bottom', target: px(14, 0.9), el: <>
      <path d={T(`M10.9,-1.55 L${f(HG1 - 0.9)},-1.55 L${f(HG1 - 0.2)},-1.35 Q${HG1},-1.3 ${HG1},-1.1 L${HG1},0.65 Q${HG1},0.9 ${f(HG1 - 0.2)},0.9 L11.3,0.9 Q${RF},0.85 ${RF},0.2 L${RF},-1.1 Q${RF},-1.55 10.9,-1.55 Z`)} />
      <path className="detail" d={T(`${[11.5, 13.2, 14.9].map((x) => stadium(x, x + 1.3, -0.95, 0.3) + ' ' + stadium(x, x + 1.3, 0.28, 0.3)).join(' ')} M10.9,-1.3 L${f(HG1 - 0.35)},-1.3 M11.0,-0.33 L${f(HG1 - 0.3)},-0.33 M11.0,0.62 L${f(HG1 - 0.3)},0.62`)} />
    </> });
  else if (hg.attrs.mlok)
    // MOE AK: a drop-in lower with a flat M-LOK face each side and underneath, stepped at its rear under the receiver
    P.push({ slot: 'handguard', z: 6, row: 'bottom', target: px(14, 0.5), el: <>
      <path d={T(`M${HG0},-0.57 L${HG1},-0.57 L${HG1},0.75 Q${HG1},0.85 ${f(HG1 - 0.1)},0.85 L11.6,0.85 Q11.0,0.85 ${f(HG0 + 0.2)},0.55 L${HG0},0.3 Z`)} />
      <path className="detail" d={T(`${[11.5, 13.2, 14.9].map((x) => stadium(x, x + 1.3, 0.12, 0.3)).join(' ')} M11.7,0.7 L${f(HG1 - 0.3)},0.7 M${f(HG1 - 0.25)},-0.57 L${f(HG1 - 0.25)},0.85 M${f(HG0 + 0.25)},-0.57 L${f(HG0 + 0.25)},0.55`)} />
    </> });
  else
    // US Palm Battle Rail: a lower with a full-length rail underneath and a short rail section on the side
    P.push({ slot: 'handguard', z: 6, row: 'bottom', target: px(14, 1.0), el: <>
      <path d={T(`M${HG0},-0.57 L${HG1},-0.57 L${HG1},0.85 L${HG0},0.85 Z M11.0,0.85 L${f(HG1 - 0.8)},0.85 L${f(HG1 - 0.8)},1.13 L11.0,1.13 Z M11.4,0.0 L${f(HG1 - 0.9)},0.0 L${f(HG1 - 0.9)},0.4 L11.4,0.4 Z`)} />
      <path className="detail" d={T(`${repeat(11.15, HG1 - 1.1, 0.394, (x) => `M${x},1.13 L${x},1.03 L${f(x + 0.206)},1.03 L${f(x + 0.206)},1.13`)} ${repeat(11.55, HG1 - 1.2, 0.394, (x) => `M${x},0.0 L${x},0.4`)}`)} />
    </> });

  // Stock. The factory one follows the photo (the comb climbs a little to meet the receiver, the toe line falls
  // straight back to the tall butt): laminate and AKM-pattern polymer stocks share it, the AK-74 adds its lightening
  // groove, walnut Zastavas a thicker butt pad. AK-100 pattern polymer stocks run straighter, fixed or on a hinge.
  const st = b.stock;
  let sd: string, sdet: string;
  let rear: number;
  const swivel = (x: number, y: number) => `M${f(x - 0.12)},${f(y)} L${f(x + 0.12)},${f(y)} ${OC(x, y + 0.2, 0.14)}`;
  if (!st) {
    if (stockShape === 'folder-left' || stockShape === 'folder-right' || stockShape === 'fixed100') {
      const hinge = stockShape !== 'fixed100';
      const x0 = hinge ? -0.95 : 0;
      sd = `${hinge ? `M0,-0.55 L-0.95,-0.55 L-0.95,${RB} L0,${RB} Z ` : ''}M${x0},-0.32 L-8.9,-0.32 Q-9.3,-0.32 -9.3,0.1 L-9.3,3.25 Q-9.3,3.55 -9.0,3.55 L-8.4,3.5 Q-4.6,2.35 -1.45,1.68 L${x0},${RB} Z`;
      sdet = `M-8.95,-0.3 L-8.95,3.53 ${repeat(0.1, 3.2, 0.5, (y) => `M-9.3,${y} L-8.95,${y}`)} ${stadium(-7.9, -3.4, 1.3, 0.55)} ${swivel(-8.3, 3.5)}`;
      if (stockShape === 'folder-right') sdet += ` ${OC(-0.5, -0.05, 0.3)} ${OC(-0.5, -0.05, 0.1)} M-0.95,0.55 L-0.2,0.55`;
      else if (hinge) sdet += ` ${stadium(-0.75, -0.2, 0.55, 0.3)} M-0.95,-0.1 L0,-0.1`;
      rear = -9.3;
    } else {
      // Measured on the photo: the wrist meets the receiver a quarter inch under its top rear and flush with the
      // trunnion's lower tang, the comb settles level with the bore, and the butt plate leans back under the heel.
      const bx = (y: number) => -8.1 - (y - 0.15) * 0.23; // the butt face, heel to toe
      sd = 'M0,-0.38 L-0.3,-0.36 Q-1.2,-0.2 -1.9,0.13 L-7.85,0.14 Q-8.1,0.14 -8.12,0.3 L-8.9,3.7 Q-8.92,3.92 -8.7,3.9 L-7.8,3.45 Q-5.0,2.45 -1.3,1.6 L0,1.5 Z';
      sdet = `M${f(bx(0.4) + 0.15)},0.4 L${f(bx(3.6) + 0.15)},3.6 ${OC(bx(0.9) + 0.08, 0.9, 0.05)} ${OC(bx(3.4) + 0.08, 3.4, 0.05)} M${f(bx(1.7) + 0.02)},1.7 L${f(bx(1.7) + 0.14)},1.7 L${f(bx(2.7) + 0.14)},2.7 L${f(bx(2.7) + 0.02)},2.7 Z ${swivel(-2.6, 1.9)}`;
      rear = -8.9;
      if (stockShape === 'ak74') sdet += ` ${stadium(-7.3, -3.4, 1.35, 0.6)}`;
      if (furn === 'polymer') sdet += ` ${repeat(0.7, 3.4, 0.45, (y) => `M${f(bx(y))},${f(y)} L${f(bx(y) + 0.22)},${f(y)}`)}`;
      if (furn === 'walnut') { sd += ' M-8.1,0.15 L-8.4,0.17 L-9.2,3.92 L-8.9,3.9 Z'; sdet += ' M-8.26,0.3 L-9.05,3.85'; rear = -9.2; }
    }
  } else if (st.attrs.kind === 'zhukov') {
    // ZHUKOV-S: an aluminium hinge block on the trunnion, a faceted body with a long side recess, QD socket and a
    // rubber butt pad; the latch slot sits low behind the hinge.
    sd = `M0,-0.72 L-1.1,-0.72 L-1.1,${RB} L0,${RB} Z M-1.1,-0.85 L-9.5,-0.85 Q-9.9,-0.85 -9.9,-0.45 L-9.9,3.05 Q-9.9,3.3 -9.65,3.3 L-8.55,3.3 Q-8.25,3.3 -8.0,3.22 L-1.65,1.4 L-1.1,1.4 Z M-9.9,-0.55 L-10.3,-0.4 Q-10.5,1.3 -10.3,3.1 L-9.9,3.25 Z`;
    sdet = `${OC(-0.7, -0.38, 0.2)} M-2.0,-0.45 L-8.4,-0.45 L-8.4,2.25 L-2.7,1.0 Z ${OC(-8.9, 0.95, 0.15)} ${stadium(-2.7, -1.6, 1.05, 0.22)} M-2.2,-0.65 L-8.7,-0.65`;
    rear = -10.5;
  } else if (st.attrs.kind === 'moe') {
    // MOE AK: a plain tapered body half an inch longer than the factory stock, a sling slot at its root, a rubber pad
    sd = `M0,-0.7 L-9.55,-0.7 Q-9.9,-0.7 -9.9,-0.35 L-9.95,2.75 Q-9.95,3.05 -9.7,3.05 L-8.85,3.05 Q-5.0,2.1 -1.4,1.3 L0,${RB} Z M-9.9,-0.6 L-10.3,-0.45 Q-10.5,1.2 -10.3,2.9 L-9.95,3.0 Z`;
    sdet = `M-9.6,-0.7 L-9.65,3.05 ${stadium(-2.1, -1.2, 0.85, 0.2)} ${swivel(-9.2, 3.05)} M-1.6,-0.38 L-9.2,-0.38 M-2.4,2.45 L-8.6,2.75`;
    rear = -10.5;
  } else {
    // Strikeforce: an AR buffer tube on an AK adapter carrying the M4 stock traced from US 10,184,737, with ATI's
    // adjustable cheek rest on top.
    const TE = -7.7;
    rear = TE - 0.73;
    const dx = rear - AR_STOCK_REAR, dy = -0.1;
    const t = arPaths(AR_PROFILES.stock, (x, y) => [x + dx, y + dy]);
    sd = `M0,-0.72 L-0.6,-0.72 L-0.6,${RB} L0,${RB} Z M-0.6,${f(dy - 0.57)} L${TE},${f(dy - 0.57)} L${TE},${f(dy + 0.57)} L-0.6,${f(dy + 0.57)} Z ${t.o} M${f(TE + 0.9)},${f(dy - 0.57)} L${f(TE + 0.9)},${f(dy - 1.0)} Q${f(TE + 0.9)},${f(dy - 1.1)} ${f(TE + 1.0)},${f(dy - 1.1)} L${f(TE + 3.9)},${f(dy - 1.1)} Q${f(TE + 4.0)},${f(dy - 1.1)} ${f(TE + 4.0)},${f(dy - 1.0)} L${f(TE + 4.0)},${f(dy - 0.57)} Z`;
    sdet = `${t.d} ${OC(TE + 2.45, dy - 0.83, 0.1)}`;
  }
  P.push({ slot: own('stock'), z: 4.1, row: 'bottom', target: px(rear + 3, 2.0), el: <><path fillRule="evenodd" d={T(sd)} /><path className="detail" d={T(sdet)} /></> });

  // Pistol grip. The factory grip's broad top fills the gap behind the trigger guard, then narrows to a rounded heel;
  // walnut ones are chequered. MOE: fuller, straighter, with Magpul's side panel (dimpled on the rubber AK+).
  // US Palm: near vertical and wide, ribbed, with a shelf under the receiver. Hogue: finger grooves and a palm swell.
  const gk = b.grip?.attrs.kind as string | undefined;
  let gripD: string, gripDet: string;
  if (!gk) {
    gripD = `M0.9,${RB} L2.82,${RB} Q2.7,1.9 2.4,2.34 Q2.1,3.0 1.95,4.0 L1.95,5.1 Q2.05,5.75 1.4,5.8 L0.6,5.75 Q0.12,5.7 0.2,5.3 L0.4,4.9 Q0.65,3.9 0.8,2.78 Q0.88,2.1 0.9,${RB} Z`;
    gripDet = 'M0.9,1.65 L2.75,1.65 ' + (furn === 'walnut'
      ? 'M1.0,2.3 L2.25,2.3 L1.8,5.25 L0.5,5.25 Z M1.0,3.0 L2.1,2.4 M0.9,3.7 L2.0,3.05 M0.8,4.4 L1.95,3.7 M0.65,5.1 L1.9,4.4 M1.05,2.3 L1.85,3.25 M0.9,3.2 L1.75,4.15 M0.75,4.1 L1.6,5.05'
      : 'M1.75,1.8 Q1.45,3.5 1.2,5.4');
  } else if (gk === 'moe') {
    gripD = `M0.95,${RB} L2.85,${RB} L2.85,1.8 Q2.75,2.25 2.45,2.65 Q2.15,3.3 2.05,4.05 L2.0,5.0 Q2.02,5.55 1.55,5.6 L0.62,5.6 Q0.18,5.6 0.22,5.15 L0.45,4.25 Q0.65,2.7 0.95,1.8 Z`;
    gripDet = 'M0.3,5.32 L1.95,5.32 M1.0,2.3 L2.35,2.3 L1.85,5.0 L0.55,5.0 Z ' + (matches(b.grip, /\+/)
      ? [[1.2, 2.8], [1.6, 2.8], [2.0, 2.8], [1.1, 3.4], [1.5, 3.4], [1.9, 3.4], [1.0, 4.0], [1.4, 4.0], [1.8, 4.0], [0.9, 4.6], [1.3, 4.6], [1.7, 4.6]].map(([x, y]) => OC(x, y, 0.07)).join(' ')
      : 'M1.05,3.1 L2.2,2.5 M0.95,3.9 L2.05,3.3 M0.85,4.7 L1.95,4.1 M1.4,2.3 L0.9,4.95 M1.85,2.3 L1.4,4.95');
  } else if (gk === 'uspalm') {
    gripD = `M0.95,${RB} L2.85,${RB} L2.85,1.95 Q2.88,2.45 2.6,2.8 Q2.45,3.5 2.35,4.4 L2.3,5.1 Q2.32,5.7 1.75,5.75 L0.45,5.7 Q0.02,5.65 0.08,5.2 L0.3,4.35 Q0.5,3.2 0.72,2.35 Q0.82,1.85 0.95,1.75 Z`;
    gripDet = `M2.3,1.78 L2.85,1.78 M0.95,1.78 L1.6,1.78 ${repeat(2.6, 5.0, 0.6, (y) => `M0.78,${y} L2.3,${y}`)} M0.25,5.42 L2.3,5.42`;
  } else {
    gripD = `M0.95,${RB} L2.82,${RB} L2.82,1.9 Q2.78,2.3 2.52,2.6 Q2.35,3.5 2.5,4.3 Q2.55,5.0 2.12,5.45 Q1.82,5.75 1.3,5.75 L0.55,5.7 Q0.1,5.65 0.15,5.2 L0.22,4.95 Q0.45,4.5 0.35,4.1 Q0.6,3.65 0.5,3.2 Q0.75,2.75 0.7,2.3 Q0.9,1.9 0.95,${RB} Z`;
    gripDet = 'M1.05,2.05 L2.65,2.05 M1.15,2.5 Q2.15,3.2 2.05,4.9 M0.62,3.55 L0.95,3.7 M0.5,4.45 L0.85,4.6';
  }
  P.push({ slot: own('grip'), z: 5, row: 'bottom', target: px(1.3, 4.2), el: <><path d={T(gripD)} /><path className="detail" d={T(gripDet)} /></> });

  // Trigger group: hammer, trigger and disconnector inside the receiver.
  if (b.trigger)
    P.push({ slot: 'trigger', internal: true, z: 20, row: 'bottom', target: px(4.1, 0.5), el:
      <path d={T(`${OC(4.55, 0.58, 0.22)} M4.4,0.4 L3.45,-0.12 L3.3,0.05 L4.35,0.75 M3.2,1.45 L3.2,0.85 L4.1,0.85 L4.1,1.45 ${OC(3.4, 0.72, 0.18)}`)} />
    });

  // Magazine: the photo's steel mag has a rear edge on an 8.8" radius and a front edge on an 8.5" radius about a
  // different centre; the floor plate slants up toward the front. The 5.45 mag uses the same construction with
  // larger radii. Steel mags carry four longitudinal ribs; Magpul's PMAGs their side panel (lengthwise lines on the
  // MOE, cross ribs on the GEN M3), the US Palm five ribs and a thick floor plate, Bulgarian polymer a waffle.
  const kAK = cal === 'akm' ? 1 : 1.55;
  const R1 = 8.8 * kAK, R2 = 8.48 * kAK;
  const C1: [number, number] = [6.15 + R1 * 0.998, 1.2 - R1 * 0.063], C2: [number, number] = [8.62 + R2 * 0.983, 1.2 - R2 * 0.184];
  const ang = (C: [number, number], Q: [number, number]) => Math.atan2(Q[1] - C[1], Q[0] - C[0]);
  const on = (C: [number, number], R: number, a: number): [number, number] => [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)];
  const arc = (C: [number, number], R: number, a0: number, a1: number, n = 14) => {
    let d = '';
    for (let i = 1; i <= n; i++) { const [x, y] = on(C, R, a0 + ((a1 - a0) * i) / n); d += ` L${f(x)},${f(y)}`; }
    return d;
  };
  // the floor: from the rear bottom corner, rotated from the inward radial toward the front
  const hit = (C: [number, number], R: number, Q: [number, number], d: [number, number]) => {
    const fx = Q[0] - C[0], fy = Q[1] - C[1], bq = 2 * (fx * d[0] + fy * d[1]), cq = fx * fx + fy * fy - R * R;
    const sq = Math.sqrt(Math.max(0, bq * bq - 4 * cq)), t1 = (-bq - sq) / 2, t = t1 > 1e-6 ? t1 : (-bq + sq) / 2; // nearest crossing ahead
    return [Q[0] + d[0] * t, Q[1] + d[1] * t] as [number, number];
  };
  const a1Top = ang(C1, [6.15, 1.2]), a1Bot = a1Top - (cal === 'akm' ? 7.1 : 7.4) / R1;
  const P1 = on(C1, R1, a1Bot);
  const rad = a1Bot + Math.PI + (cal === 'akm' ? 0.47 : 0.3); // inward radial, turned toward the front
  const fd: [number, number] = [Math.cos(rad), Math.sin(rad)];
  const P2 = hit(C2, R2, P1, fd);
  const a2Top = ang(C2, [8.62, 1.2]), a2Bot = ang(C2, P2);
  const magD = `M6.15,1.2${arc(C1, R1, a1Top, a1Bot)} L${f(P2[0])},${f(P2[1])}${arc(C2, R2, a2Bot, a2Top)} Z`;
  const magKind = !b.mag ? 'plain' : b.mag.attrs.steel ? 'steel' : matches(b.mag, /US Palm/) ? 'uspalm' : matches(b.mag, /Bulgarian/) ? 'waffle' : matches(b.mag, /MOE/) ? 'moe' : 'm3';
  const nd: [number, number] = [-fd[1], fd[0]]; // up from the floor
  const floorIn = (t: number) => `M${f(P1[0] + nd[0] * t)},${f(P1[1] + nd[1] * t)} L${f(P2[0] + nd[0] * t - fd[0] * 0.1)},${f(P2[1] + nd[1] * t - fd[1] * 0.1)}`;
  const floor = `${floorIn(0.25)} ${floorIn(magKind === 'uspalm' ? 0.5 : 0.32)} M${f(P1[0] + fd[0] * 0.35 + nd[0] * 0.25)},${f(P1[1] + fd[1] * 0.35 + nd[1] * 0.25)} L${f(P1[0] + fd[0] * 0.35)},${f(P1[1] + fd[1] * 0.35)}`;
  const topLine = (() => { const [x, y] = on(C1, R1, a1Top - 0.5 / R1); const q = hit(C2, R2, [x, y], [1, 0]); return `M${f(x)},${f(y)} L${f(q[0])},${f(q[1])}`; })();
  /** A lengthwise rib d inches in from the rear edge, from under the receiver to the floor. */
  const rib = (d: number, top = 0.65, bottom = 0.3) => {
    const r = R1 - d, a0 = a1Top - top / r, end = hit(C1, r, P1, fd);
    return `M${f(on(C1, r, a0)[0])},${f(on(C1, r, a0)[1])}${arc(C1, r, a0, ang(C1, end) + bottom / r, 10)}`;
  };
  let ribs = topLine;
  if (magKind === 'steel') ribs += ' ' + [0.5, 1.0, 1.5, 2.0].map((d) => rib(d)).join(' ');
  else if (magKind === 'uspalm') ribs += ' ' + [0.45, 0.85, 1.25, 1.65, 2.05].map((d) => rib(d, 1.0, 0.55)).join(' ');
  else if (magKind !== 'plain') {
    const r0 = R1 - 0.35, r1 = R2 + 0.1 * kAK; // the body lies outside circle C2, so insets from the front edge add to R2
    const a0 = a1Top - 1.0 / R1, aEnd = ang(C1, hit(C1, r0, P1, fd)) + 0.45 / r0;
    const q0 = on(C1, r0, a0), q1 = on(C1, r0, aEnd);
    const w0 = hit(C2, r1, q0, [1, 0]), w1 = hit(C2, r1, q1, fd);
    const cross = (n: number) => {
      let d = '';
      for (let k = 1; k < n; k++) { const a = a0 + ((aEnd - a0) * k) / n; const q = on(C1, r0 + 0.15, a), w = hit(C2, r1 + 0.15, q, [Math.cos(a + Math.PI), Math.sin(a + Math.PI)]); d += ` M${f(q[0])},${f(q[1])} L${f(w[0])},${f(w[1])}`; }
      return d;
    };
    if (magKind === 'waffle') ribs += ' ' + [0.75, 1.3, 1.85].map((d) => rib(d, 1.0, 0.45)).join(' ') + cross(7);
    else {
      ribs += ` M${f(q0[0])},${f(q0[1])}${arc(C1, r0, a0, aEnd, 10)} L${f(w1[0])},${f(w1[1])}${arc(C2, r1, ang(C2, w1), ang(C2, w0), 10)} Z`;
      ribs += magKind === 'moe' ? ' ' + [0.85, 1.4].map((d) => rib(d, 1.15, 0.55)).join(' ') : cross(7);
    }
  }
  P.push({ slot: 'mag', z: 3, row: 'bottom', target: px((6.15 + P2[0]) / 2, 4.6), el: <><path d={T(magD)} /><path className="detail" d={T(`${floor} ${ribs}`)} /></> });

  // Optic mount and optic
  let railTop = -2.35, rx0 = 2.6, rx1 = 7.4;
  if (mountKind === 'side') {
    // RS Regulate: a slim lower on the side rail with a short upper over the cover; Midwest: a longer cantilevered rail
    const rs = matches(b.mount, /RS Regulate/);
    railTop = rs ? -1.7 : -2.15;
    rx0 = rs ? 2.4 : 2.6; rx1 = rs ? 4.9 : 7.6;
    const ax = rs ? 2.9 : 3.4;
    P.push({ slot: 'mount', z: 13, row: 'top', target: px((rx0 + rx1) / 2, railTop), el: <>
      <path d={T(`${akRail(rx0, rx1, railTop, railTop + 0.38)} M${ax},${f(railTop + 0.38)} L${ax},-1.15 L${f(ax + 1.0)},-1.15 L${f(ax + 1.0)},${f(railTop + 0.38)}`)} />
      <path className="hidden-line" d={T(`M${ax},-1.15 L${ax},-0.55 M${f(ax + 1.0)},-1.15 L${f(ax + 1.0)},-0.55 M${f(ax - 0.4)},-0.55 L${f(ax + 3.2)},-0.55 L${f(ax + 3.2)},0.1 L${f(ax - 0.4)},0.1 Z`)} />
    </> });
  } else if (mountKind === 'gastube') {
    railTop = -2.08; rx0 = UH0 + 0.1; rx1 = HG1 - 0.1;
    P.push({ slot: 'mount', z: 13, row: 'top', target: px(14.8, railTop), el: <>
      <path d={T(`M${UH0},-0.57 L${UH0},-1.6 Q${UH0},-1.8 ${f(UH0 + 0.2)},-1.8 L${f(HG1 - 0.2)},-1.8 Q${HG1},-1.8 ${HG1},-1.6 L${HG1},-0.57 Z ${akRail(rx0, rx1, railTop, -1.8)}`)} />
      <path className="detail" d={T(`M${f(UH0 + 0.2)},-1.5 L${f(HG1 - 0.2)},-1.5 ${[13.0, 14.4, 15.8].map((x) => stadium(x, x + 1.0, -1.2, 0.2)).join(' ')}`)} />
    </> });
  } else if (mountKind === 'cover') {
    // Dog Leg: a new cover with the rail on top, hinged over the rear sight block in place of the leaf
    railTop = -1.4; rx0 = 1.5; rx1 = 8.6;
    P.push({ slot: 'mount', z: 13, row: 'top', target: px(5, railTop), el: <>
      <path d={T('M0.05,-0.55 L0.05,-0.6 L1.2,-1.12 L1.5,-1.12 L1.5,-1.4 L8.6,-1.4 L8.6,-1.2 L9.5,-1.2 L9.5,-0.55 Z M8.6,-1.4 L8.6,-1.62 L9.75,-1.62 L9.75,-1.3 L9.5,-1.3 L9.5,-1.2 L8.6,-1.2 Z')} />
      <path className="detail" d={T(`${pic(1.65, 8.45, -1.4)} M1.5,-1.12 L9.5,-1.12 ${OC(9.6, -1.46, 0.06)}`)} />
    </> });
  } else
    P.push({ slot: 'mount', z: 13, row: 'top', target: px(5, railTop), el: <path d={T(akRail(rx0, rx1, railTop, railTop + 0.38))} /> });
  const { od, odet, ot } = rifleOptic(b.optic);
  const dx = (rx0 + rx1) / 2 - 4.9, dy = railTop + 1.1;
  P.push({ slot: 'optic', z: 14, row: 'top', target: px(ot[0] + dx, ot[1] + dy),
    el: <><path fillRule="evenodd" d={T(movePath(od, dx, dy))} /><path className="detail" d={T(movePath(odet, dx, dy))} /></> });

  // Muzzle device: the factory brake when none is chosen (AKM slant brake on M14x1, AK-74 brake on M24x1.5).
  // Slant: a short tube cut away on top at the front. AK-74: a collar, the long expansion chamber with its big
  // side window, and the nose with three vent holes. FSC: side ports behind a slotted flash-hiding front.
  // RRD-4C: a squared three-port brake.
  const mk = (b.muzzle?.attrs.kind as string | undefined) ?? (thread === 'M24x1.5' ? 'brake74' : 'slant');
  let md: string, mdet: string, mlen: number;
  if (mk === 'slant') {
    mlen = 1.05;
    md = `M${f(BX)},-0.36 L${f(BX + 0.72)},-0.36 L${f(BX + mlen)},0.36 L${f(BX)},0.36 Z`;
    mdet = `M${f(BX + 0.3)},-0.36 L${f(BX + 0.3)},0.36`;
  } else if (mk === 'brake74') {
    mlen = 2.7;
    const a0 = BX, z = BX + mlen;
    md = `M${f(a0)},-0.4 L${f(a0 + 0.3)},-0.4 L${f(a0 + 0.3)},-0.47 L${f(z - 0.75)},-0.47 L${f(z - 0.75)},-0.43 L${f(z)},-0.43 L${f(z)},0.43 L${f(z - 0.75)},0.43 L${f(z - 0.75)},0.47 L${f(a0 + 0.3)},0.47 L${f(a0 + 0.3)},0.4 L${f(a0)},0.4 Z`;
    mdet = `M${f(a0 + 0.85)},-0.47 L${f(a0 + 0.85)},0.47 ${stadium(a0 + 1.0, a0 + 1.85, 0.0, 0.5)} ${[0.2, 0.42, 0.64].map((d) => OC(z - d, 0, 0.07)).join(' ')}`;
  } else if (mk === 'comp') {
    mlen = 2.3;
    md = `M${f(BX)},-0.42 L${f(BX + mlen - 0.08)},-0.42 L${f(BX + mlen)},-0.34 L${f(BX + mlen)},0.34 L${f(BX + mlen - 0.08)},0.42 L${f(BX)},0.42 Z`;
    mdet = `M${f(BX + 0.45)},-0.42 L${f(BX + 0.45)},0.42 ${repeat(BX + 0.8, BX + 1.9, 0.36, (x) => stadium(x, x + 0.22, -0.15, 0.18))} ${repeat(BX + 1.0, BX + 1.9, 0.45, (x) => `M${x},0.42 L${x},0.18`)}`;
  } else {
    mlen = 2.25;
    md = `M${f(BX)},-0.46 L${f(BX + mlen - 0.1)},-0.46 L${f(BX + mlen)},-0.36 L${f(BX + mlen)},0.36 L${f(BX + mlen - 0.1)},0.46 L${f(BX)},0.46 Z`;
    mdet = `M${f(BX + 0.35)},-0.46 L${f(BX + 0.35)},0.46 ${[0.5, 1.1, 1.7].map((d) => `M${f(BX + d)},-0.3 L${f(BX + d + 0.42)},-0.3 L${f(BX + d + 0.42)},0.3 L${f(BX + d)},0.3 Z`).join(' ')}`;
  }
  P.push({ slot: own('muzzle'), z: 12, row: 'top', target: px(BX + mlen / 2, -0.45), el: <><path d={T(md)} /><path className="detail" d={T(mdet)} /></> });

  const front = BX + mlen;
  return {
    width: 1000, height: 486, pieces: P,
    center: [f(ox + (rear - 0.6) * S), f(ox + (front + 0.6) * S), oy],
    dims: [[f(ox + rear * S), f(ox + front * S), 462, `${inch(front - rear)} overall`], [f(ox + AK_CHAMBER * S), f(ox + BX * S), f(oy + 2.0 * S), `${inch(L)} barrel`]],
    rows: [26, 424],
    spec: `${cal === 'akm' ? '7.62x39' : '5.45x39'} · ${inch(L)} barrel · ${thread === 'M24x1.5' ? 'M24x1.5 RH' : thread} threads`,
  };
}

/* ================================================================== render */

export function sceneFor(platform: Platform, build: Build, place: Placement = {}): Scene {
  if (platform.maker === 'AK Platform') return ak(platform, build);
  return platform.family === 'Rifle' ? rifle(platform, build, place) : pistol(platform, build);
}

export function Blueprint({ platform, build, place, states, active, onPick, onHover, onMove, compact }: {
  platform: Platform;
  build: Build;
  place?: Placement;
  states: Record<string, RegionState>;
  active?: string | null;
  onPick?: (slot: string) => void;
  onHover?: (slot: string | null) => void;
  /** Called while a light, laser or grip is dragged along the rail, with its new distance from the receiver. */
  onMove?: (slot: string, at: number) => void;
  /** Thumbnail mode: no callouts, dimensions or interaction. */
  compact?: boolean;
}) {
  const scene = sceneFor(platform, build, place);
  const drag = useRef<{ slot: string; x: number; at: number; k: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const moveTo = (slot: string, m: NonNullable<Piece['move']>, at: number) => {
    const snapped = m.min + Math.round((at - m.min) / m.step) * m.step;
    onMove?.(slot, Math.round(Math.min(m.max, Math.max(m.min, snapped)) * 100) / 100);
  };
  const slotIds = new Set(platform.slots.map((s) => s.id));
  const numberOf = new Map(platform.slots.map((s, i) => [s.id, i + 1]));
  const pieces = scene.pieces
    .map((p) => (p.slot && !slotIds.has(p.slot) ? { ...p, slot: undefined } : p))
    .sort((a, b) => a.z - b.z);
  // One callout per slot: when a part is drawn in several pieces (a base gun with factory parts), the first gets it.
  const labeled = pieces.filter((p, i) => p.slot && pieces.findIndex((q) => q.slot === p.slot) === i);
  const labels = compact ? [] : placeLabels(labeled, 24, scene.width - 24, scene.rows);
  const [cx0, cx1, cy] = scene.center;
  // Thumbnails crop to the drawing itself.
  const viewBox = compact
    ? (platform.family === 'Rifle' ? `40 60 ${scene.width - 60} ${scene.height - 140}` : '90 40 540 400')
    : `0 0 ${scene.width} ${scene.height}`;

  return (
    <svg className={'bp' + (compact ? ' bp-thumb' : '')} viewBox={viewBox} role={compact ? 'img' : 'group'} aria-label={`${platform.name} build drawing`}>
      <path className="bp-center" d={`M${cx0},${cy} L${cx1},${cy}`} />
      {pieces.map((p, i) => {
        const state: RegionState | 'static' = p.slot ? states[p.slot] ?? 'empty' : 'static';
        const cls = ['bp-part', state, p.internal ? 'internal' : '', p.slot && p.slot === active ? 'active' : ''].join(' ');
        if (!p.slot || compact || !onPick) return <g key={i} className={cls} aria-hidden="true">{p.el}</g>;
        const slot = platform.slots.find((s) => s.id === p.slot)!;
        const part = build[slot.id];
        const mv = onMove ? p.move : undefined;
        return (
          <g
            key={p.slot + i}
            className={cls + (mv ? ' movable' : '') + (dragging === slot.id ? ' dragging' : '')}
            role="button"
            tabIndex={0}
            aria-label={`${numberOf.get(slot.id)}. ${slot.name}${part ? `: ${part.brand} ${part.name}` : ', empty'}${mv ? `, ${mv.at} inches from the receiver. Arrow keys move it along the rail` : ''}`}
            onClick={() => { if (dragged.current) { dragged.current = false; return; } onPick(slot.id); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(slot.id); }
              if (mv && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); moveTo(slot.id, mv, mv.at + (e.key === 'ArrowRight' ? mv.step : -mv.step)); }
            }}
            onPointerDown={mv ? (e) => {
              const k = (e.currentTarget.ownerSVGElement?.getScreenCTM()?.a ?? 1) * mv.scale;
              drag.current = { slot: slot.id, x: e.clientX, at: mv.at, k, moved: false };
              dragged.current = false;
              e.currentTarget.setPointerCapture(e.pointerId);
            } : undefined}
            onPointerMove={mv ? (e) => {
              const d = drag.current;
              if (!d || d.slot !== slot.id) return;
              const dx = e.clientX - d.x;
              if (!d.moved && Math.abs(dx) < 4) return;
              d.moved = true;
              setDragging(slot.id);
              moveTo(slot.id, mv, d.at + dx / d.k);
            } : undefined}
            onPointerUp={mv ? () => { dragged.current = !!drag.current?.moved; drag.current = null; setDragging(null); } : undefined}
            onPointerCancel={mv ? () => { drag.current = null; setDragging(null); } : undefined}
            onMouseEnter={() => onHover?.(slot.id)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(slot.id)}
            onBlur={() => onHover?.(null)}
          >
            {p.el}
            <circle className="hit" cx={p.target[0]} cy={p.target[1]} r="16" />
          </g>
        );
      })}
      {labels.map(({ slot, x, y, tx, ty }) => {
        const dir = y < ty ? 1 : -1;
        return (
          <g key={'c-' + slot} className={'bp-callout ' + (states[slot] ?? 'empty') + (slot === active ? ' active' : '')} aria-hidden="true"
            onClick={() => onPick?.(slot)} onMouseEnter={() => onHover?.(slot)} onMouseLeave={() => onHover?.(null)}>
            <path d={`M${x},${y + dir * 12} L${x},${y + dir * 22} L${tx},${ty}`} />
            <circle cx={tx} cy={ty} r="2.4" className="tip" />
            <circle cx={x} cy={y} r="12" className="bubble" />
            <text x={x} y={y} dy="0.36em" textAnchor="middle">{numberOf.get(slot)}</text>
            <circle cx={x} cy={y} r="16" className="hit" />
          </g>
        );
      })}
      {!compact && scene.vdims?.map(([x, y0, y1, text], i) => (
        <g key={'v' + i} className="bp-dim" aria-hidden="true">
          <path d={`M${x - 9},${y0} L${x + 9},${y0} M${x - 9},${y1} L${x + 9},${y1} M${x},${y0} L${x},${y1}`} />
          <path d={`M${x - 4},${y0 + 9} L${x},${y0} L${x + 4},${y0 + 9} M${x - 4},${y1 - 9} L${x},${y1} L${x + 4},${y1 - 9}`} />
          <g transform={`translate(${x},${(y0 + y1) / 2}) rotate(-90)`}>
            <rect x={-text.length * 3.7 - 8} y="-9" width={text.length * 7.4 + 16} height="18" className="bg" />
            <text dy="0.35em" textAnchor="middle">{text}</text>
          </g>
        </g>
      ))}
      {!compact && [...scene.dims, ...pieces.filter((p) => p.dim && p.slot && (p.slot === active || p.slot === dragging)).map((p) => p.dim!)].map(([x0, x1, y, text], i) => (
        <g key={i} className="bp-dim" aria-hidden="true">
          <path d={`M${x0},${y - 9} L${x0},${y + 9} M${x1},${y - 9} L${x1},${y + 9} M${x0},${y} L${x1},${y}`} />
          <path d={`M${x0 + 9},${y - 4} L${x0},${y} L${x0 + 9},${y + 4} M${x1 - 9},${y - 4} L${x1},${y} L${x1 - 9},${y + 4}`} />
          <rect x={(x0 + x1) / 2 - text.length * 3.7 - 8} y={y - 9} width={text.length * 7.4 + 16} height="18" className="bg" />
          <text x={(x0 + x1) / 2} y={y} dy="0.35em" textAnchor="middle">{text}</text>
        </g>
      ))}
    </svg>
  );
}

/** Spread callout bubbles along a top and a bottom row so they never overlap. */
function placeLabels(pieces: Piece[], minX: number, maxX: number, rows: [number, number]) {
  const out: { slot: string; x: number; y: number; tx: number; ty: number }[] = [];
  const GAP = 30;
  for (const [i, row] of (['top', 'bottom'] as const).entries()) {
    const items = pieces.filter((p) => p.row === row).sort((a, b) => a.target[0] - b.target[0]);
    const xs = items.map((p) => p.target[0]);
    for (let k = 0; k < xs.length; k++) xs[k] = Math.max(xs[k], k ? xs[k - 1] + GAP : minX);
    for (let k = xs.length - 1; k >= 0; k--) xs[k] = Math.min(xs[k], k < xs.length - 1 ? xs[k + 1] - GAP : maxX);
    items.forEach((p, k) => out.push({ slot: p.slot!, x: f(xs[k]), y: rows[i], tx: p.target[0], ty: p.target[1] }));
  }
  return out;
}
