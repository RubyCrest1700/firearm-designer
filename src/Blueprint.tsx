import { useRef, useState, type ReactNode } from 'react';
import { mountsFor } from './data/addons';
import { AR_PROFILES, type ArPiece } from './data/arProfiles';
import { OPTIC_PROFILES } from './data/opticProfiles';
import { GLOCK_PHOTOS, type GlockPhoto } from './data/glockPhotos';
import { SIG_MODULE_PHOTOS, MODULE_PANEL, MODULE_STRIPS, MODULE_LOGO, MODULE_CATCH, AXG_PANEL, AXG_FIELD, AXG_SCREWS, AXG_SERRATIONS } from './data/sigModulePhotos';
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
/** Glock-magazine 9mm lowers traced from their makers' flat side photos, scaled by the 6.12" between the takedown
 *  and pivot pins: outline, then the trigger guard opening. FM's FM-9 uses FM's photo of its newer Mike-9, the same profile. */
const LOWER9_PHOTOS: [RegExp, number[], number[]][] = [
  [/C-9/, [-0.52, -0.38, -0.58, -0.14, -0.58, 0.10, -0.48, 0.86, -0.48, 1.09, -0.38, 1.35, -0.31, 1.41, -0.02, 1.43, 0.18, 1.53, 0.36, 1.73, 0.44, 1.93, 0.61, 1.95, 0.62, 2.21, 1.59, 2.77, 1.74, 2.78, 1.76, 3.13, 2.55, 3.34, 2.68, 3.34, 3.75, 3.15, 3.98, 3.19, 6.26, 2.77, 6.30, 2.71, 6.31, 2.63, 6.13, 2.45, 6.11, 2.29, 6.15, 2.15, 6.17, 1.84, 6.24, 1.68, 6.26, 1.35, 6.31, 1.25, 6.48, 1.13, 6.74, 1.09, 6.82, 1.03, 6.85, 0.97, 6.85, 0.87, 6.79, 0.77, 6.48, 0.68, 0.64, 0.65, 0.50, 0.62, 0.42, 0.49, 0.32, -0.13, 0.22, -0.38, 0.14, -0.47, 0.09, -0.50, -0.37, -0.50, -0.46, -0.47], [2.02, 2.08, 2.10, 1.99, 2.27, 1.95, 3.51, 1.97, 3.59, 2.02, 3.65, 2.11, 3.67, 2.85, 3.62, 2.91, 3.52, 2.95, 2.65, 3.11, 2.53, 3.10, 2.13, 2.95, 2.03, 2.87, 1.98, 2.74, 1.98, 2.25]],
  [/FM-9/, [-0.43, -0.37, -0.46, 0.15, -0.40, 1.14, -0.36, 1.32, -0.06, 1.36, 0.14, 1.45, 0.32, 1.61, 0.40, 1.73, 0.45, 1.86, 0.49, 1.88, 0.85, 1.90, 0.87, 2.31, 1.63, 2.77, 1.77, 2.77, 1.78, 3.07, 1.83, 3.10, 2.81, 3.24, 3.31, 3.23, 4.46, 2.98, 5.90, 2.60, 6.29, 2.48, 6.34, 2.44, 6.53, 1.36, 6.63, 1.23, 6.89, 1.06, 6.96, 0.94, 6.94, 0.81, 6.83, 0.71, 6.61, 0.67, 6.39, 0.67, 6.26, 0.67, 4.76, 0.67, 4.18, 0.67, 3.93, 0.66, 3.72, 0.66, 0.92, 0.66, 0.74, 0.65, 0.63, 0.62, 0.50, 0.53, 0.38, 0.41, 0.30, 0.27, 0.24, 0.05, 0.20, -0.39, 0.14, -0.58, -0.35, -0.57, -0.39, -0.51], [1.98, 2.07, 2.06, 1.97, 2.20, 1.91, 3.38, 1.91, 3.41, 1.94, 3.70, 1.94, 3.82, 2.03, 3.87, 2.15, 3.88, 2.65, 3.86, 2.80, 3.78, 2.91, 3.30, 3.01, 2.73, 3.01, 2.61, 2.97, 2.23, 2.94, 2.10, 2.86, 2.13, 2.90, 2.05, 2.91, 1.98, 2.83, 1.96, 2.73, 1.95, 2.16]],
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
  if (matches(opt, /\d+-\d+x24/i)) {
    // 1-6x24 / 1-8x24 LPVOs on a 30 mm tube, traced from a flat side photo of the Vortex Strike Eagle at its published
    // 10.5" length (inches from the eyepiece end, on the tube axis): ribbed diopter, ocular housing, ribbed magnification
    // ring with its throw lever, a plain tube to the turret saddle (capped elevation turret on top, illumination knob on
    // the side), and an objective no bigger than the tube. The SLx has a taller finned lever; the mount's rings hug the tube.
    const slx = matches(opt, /SLx/);
    const ex = -0.6, cy = -2.6;
    const p = (pts: number[], close = true) => pts.reduce((s, v, i) => i % 2 ? s : `${s}${i ? ' L' : 'M'}${f(ex + v)},${f(cy + pts[i + 1])}`, '') + (close ? ' Z' : '');
    const lever = slx ? [3.0, -1.03, 2.96, -1.62, 3.08, -1.7, 3.3, -1.66, 3.22, -1.02] : [3.2, -1.02, 3.19, -1.47, 3.11, -1.52, 2.95, -1.46, 2.97, -1.03];
    od = p([0, -0.66, 0, 0.66, 0.09, 0.83, 0.31, 0.87, 2.12, 0.9, 2.51, 0.86, 2.59, 0.93, 3.22, 0.94, 3.55, 0.9, 3.79, 0.61, 5.79, 0.61,
      5.94, 0.8, 6.29, 1.0, 6.52, 1.08, 6.7, 1.08, 6.94, 0.99, 7.2, 0.82, 7.41, 0.61, 10.45, 0.61, 10.52, 0.56, 10.52, -0.57, 10.45, -0.62,
      7.41, -0.62, 7.21, -0.82, 7.18, -1.15, 7.04, -1.25, 6.79, -1.31, 6.32, -1.3, 6.06, -1.21, 5.97, -1.05, 5.97, -0.82, 5.78, -0.62,
      3.78, -0.62, 3.42, -1.01, ...lever, 2.79, -1.01, 2.69, -0.93, 2.59, -0.94, 2.51, -0.87, 2.08, -0.91, 0.32, -0.89, 0.1, -0.85]);
    const ring = (a: number, b: number) => `${p([a, 0.61, a, 1.5, b, 1.5, b, 0.61], false)}`;
    odet = `${repeat(0.06, 0.46, 0.08, (x) => `${p([x, -0.8, x, -0.6], false)} ${p([x, 0.6, x, 0.8], false)}`)} ${p([0.31, -0.89, 0.31, 0.87], false)} ${p([2.51, -0.87, 2.51, 0.86], false)}`
      + ` ${repeat(2.66, 3.5, slx ? 0.14 : 0.09, (x) => `${p([x, -0.94, x, -0.7], false)} ${p([x, 0.7, x, 0.94], false)}`)} ${p([3.55, -0.9, 3.55, 0.9], false)}`
      + ` ${p([5.97, -0.82, 7.21, -0.82], false)} ${repeat(6.12, 7.1, 0.08, (x) => p([x, -1.22, x, -1.0], false))}`
      + ` ${OC(ex + 6.62, cy + 0.43, 0.55)} ${OC(ex + 6.62, cy + 0.43, 0.34)} ${p([10.45, -0.62, 10.45, 0.61], false)}`
      + ` ${ring(4.2, 4.8)} ${ring(8.0, 8.6)} ${p([4.2, 1.35, 8.6, 1.35], false)}`;
    ot = [ex + 6.6, cy - 1.31];
  } else if (matches(opt, /Venom 5-25/i)) {
    // Vortex Venom 5-25x56, traced from a flat side photo and scaled to its published 14.4" length (trace inches from
    // the eyepiece, down from the tube axis): the eyepiece, the ribbed power ring, the saddle with the tall exposed
    // elevation turret and the side parallax knob, the front tube, the long taper and the 56 mm bell, on high rings.
    const k = 14.4 / 15.63, x0 = -1.2, cy = -2.95;
    const X = (v: number) => x0 + v * k, Y = (v: number) => cy + v * k;
    const p = (pts: number[], close = true) => pts.reduce((s, v, i) => i % 2 ? s : `${s}${i ? ' L' : 'M'}${f(X(v))},${f(Y(pts[i + 1]))}`, '') + (close ? ' Z' : '');
    od = p([0, -0.16, 0.01, 0.26, 0.11, 0.72, 0.19, 0.81, 0.41, 0.87, 2.01, 0.9, 2.39, 0.83, 2.48, 0.91, 2.98, 0.91, 3.46, 0.84, 3.62, 0.67, 6.13, 0.68, 6.26, 0.82, 6.4, 0.86, 6.47, 0.96, 6.62, 1, 6.73, 0.97, 6.8, 0.89, 7.35, 0.89, 7.67, 0.86, 7.78, 0.8, 7.9, 0.67, 10.57, 0.67, 13.09, 1.25, 15.32, 1.22, 15.42, 1.13, 15.51, 0.95, 15.59, 0.66, 15.63, 0.26, 15.63, -0.26, 15.56, -0.76, 15.44, -1.1, 15.32, -1.24, 15.27, -1.26, 13.08, -1.27, 10.52, -0.66, 7.89, -0.67, 7.75, -0.82, 7.78, -1.58, 7.71, -1.62, 7.7, -1.66, 7.42, -1.67, 7.26, -1.74, 7.04, -1.75, 6.77, -1.74, 6.58, -1.65, 6.32, -1.66, 6.31, -1.62, 6.24, -1.59, 6.23, -1.29, 6.26, -1.25, 6.27, -0.82, 6.13, -0.67, 3.63, -0.67, 3.45, -0.84, 2.89, -0.91, 2.5, -0.91, 2.4, -0.84, 2.02, -0.91, 0.4, -0.89, 0.19, -0.83, 0.12, -0.75, 0.04, -0.49]);
    const ring = (a: number, b: number) => `M${f(X(a))},${f(Y(0.67))} L${f(X(a))},-1.1 L${f(X(b))},-1.1 L${f(X(b))},${f(Y(0.67))}`;
    odet = `${p([0.41, -0.89, 0.41, 0.87], false)} ${p([2.01, -0.91, 2.01, 0.9], false)} ${p([3.62, -0.67, 3.62, 0.67], false)}`
      + ` ${repeat(X(0.12), X(0.4), 0.05, (x) => `M${f(x)},${f(Y(-0.86))} L${f(x)},${f(Y(-0.6))} M${f(x)},${f(Y(0.6))} L${f(x)},${f(Y(0.86))}`)}`
      + ` ${repeat(X(2.55), X(3.4), 0.07, (x) => `M${f(x)},${f(Y(-0.9))} L${f(x)},${f(Y(0.9))}`)}`
      + ` ${p([6.27, -0.82, 7.75, -0.82], false)} ${p([6.24, -1.29, 7.78, -1.29], false)} ${repeat(X(6.36), X(7.66), 0.07, (x) => `M${f(x)},${f(Y(-1.6))} L${f(x)},${f(Y(-1.32))}`)}`
      + ` ${OC(X(7.07), Y(0), 0.74 * k)} ${OC(X(7.07), Y(0), 0.57 * k)} ${OC(X(7.07), Y(0), 0.3 * k)} ${p([7.9, -0.67, 7.9, 0.67], false)} ${p([10.55, -0.66, 10.55, 0.67], false)}`
      + ` ${p([13.09, -1.27, 13.09, 1.25], false)} ${p([15.3, -1.24, 15.3, 1.22], false)} ${ring(4.3, 5.0)} ${ring(8.9, 9.6)} ${p([4.3, 1.9, 9.6, 1.9], false)}`;
    ot = [X(7.0), Y(-1.75)];
  } else if (matches(opt, /\d+-\d+x/i)) {
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
    // Holosun HS510C, traced from a flat side photo at its published 3.27" length (inches from the rear, down from the
    // rail top): the low emitter housing with its battery cap, the hood sweeping up to the tall front window frame,
    // the side plate with its screws and the QD lever hanging beside the rail.
    const p = (pts: number[], close = true) => pts.reduce((s, v, i) => i % 2 ? s : `${s}${i ? ' L' : 'M'}${f(2.8 + v)},${f(-1.1 + pts[i + 1])}`, '') + (close ? ' Z' : '');
    od = p([3.0, -1.74, 2.97, -1.76, 2.01, -1.77, 1.97, -1.55, 1.91, -1.36, 1.84, -1.21, 1.75, -1.05, 1.65, -0.93, 1.54, -0.82, 1.44, -0.74, 1.25, -0.64,
      0.89, -0.64, 0.82, -0.72, 0.1, -0.73, 0.02, -0.72, 0.0, -0.7, 0.0, -0.4, 0.07, -0.11, 0.07, 0.01, 0.25, 0.04, 0.43, 0.08, 0.49, 0.13, 0.41, 0.16,
      0.4, 0.41, 0.42, 0.43, 0.68, 0.43, 0.78, 0.48, 2.88, 0.48, 2.94, 0.41, 3.09, 0.19, 3.23, 0.03, 3.27, -0.09, 3.27, -0.7, 3.08, -1.55, 3.05, -1.65]);
    odet = `${p([0.07, -0.11, 3.27, -0.11], false)} ${p([0.07, 0, 3.25, 0], false)} ${p([1.03, -0.11, 1.17, -0.58, 1.44, -0.74], false)}`
      + ` ${OC(2.8 + 0.47, -1.1 - 0.35, 0.14)} ${p([0.4, -0.35, 0.54, -0.35], false)}`
      + ` M${f(4.4)},${f(-1.57)} L${f(5.64)},${f(-1.57)} Q${f(5.74)},${f(-1.57)} ${f(5.74)},${f(-1.47)} Q${f(5.74)},${f(-1.37)} ${f(5.64)},${f(-1.37)} L${f(4.4)},${f(-1.37)} Q${f(4.3)},${f(-1.37)} ${f(4.3)},${f(-1.47)} Q${f(4.3)},${f(-1.57)} ${f(4.4)},${f(-1.57)} Z`
      + ` ${p([1.95, -0.48, 1.97, -0.53, 2.44, -0.53, 2.46, -0.48], false)}`
      + ` ${[[1.32, -0.29], [1.63, -0.29], [2.79, -0.33], [3.12, -0.26]].map(([x, y]) => OC(2.8 + x, -1.1 + y, 0.07)).join(' ')}`
      + ` ${p([0.41, 0.15, 2.45, 0.15, 2.45, 0.4, 0.41, 0.4])} ${repeat(2.8 + 0.55, 2.8 + 1.25, 0.06, (x) => `M${x},${f(-1.1 + 0.17)} L${x},${f(-1.1 + 0.38)}`)} ${OC(2.8 + 1.86, -1.1 + 0.29, 0.1)}`;
    ot = [4.9, -2.87];
  } else if (matches(opt, /ROMEO5X/i)) {
    // Sig ROMEO5X, traced from a flat side photo at its published 2.5" length (inches from the window centre): a boxy
    // body with a raked top facet, lens rings at both ends, the battery cap mid-side, slanted grip cuts, the brightness
    // knob low at the front, and the riser block standing on the rail at the listed sight height.
    const H = Number(opt?.attrs.height ?? 1.41), cx = 4.9, ay = -1.1 - H;
    const p = (pts: number[], close = true) => pts.reduce((s, v, i) => i % 2 ? s : `${s}${i ? ' L' : 'M'}${f(cx + v)},${f(ay + pts[i + 1])}`, '') + (close ? ' Z' : '');
    od = p([-1.01, -0.73, -1.06, -0.68, -1.14, -0.51, -1.23, -0.5, -1.24, 0.52, -1.15, 0.55, -1.08, 0.77, -1.08, H, 0.94, H, 0.94, 1.24,
      1.23, 1.23, 1.3, 1.16, 1.31, 0.91, 1.26, 0.82, 1.31, 0.75, 1.24, 0.64, 1.18, 0.64, 1.23, 0.21, 1.2, -0.48, 0.89, -0.5, 0.72, -0.57,
      0.7, -0.6, -0.32, -0.76]);
    odet = `${p([-1.08, -0.5, -1.08, 0.55], false)} ${p([1.08, -0.5, 1.08, 0.64], false)} ${p([-1.07, -0.47, -0.31, -0.58, 0.88, -0.22, 0.94, 0.47, 0.94, 0.77], false)}`
      + ` ${p([-1.08, 0.77, 0.94, 0.77], false)} ${p([-1.08, 1.23, 0.94, 1.23], false)} ${p([-1.08, 1.32, 0.94, 1.32], false)}`
      + ` ${OC(cx - 0.72, ay + 0.03, 0.34)} ${OC(cx - 0.72, ay + 0.03, 0.24)} ${p([-0.84, 0.01, -0.6, 0.05], false)}`
      + ` ${repeat(-0.75, 0.55, 0.2, (x) => p([x, 0.48, x + 0.12, 0.66], false))}`
      + ` ${repeat(1.0, 1.26, 0.065, (x) => p([x, 0.66, x, 1.21], false))}`;
    ot = [cx, ay - 0.76];
  } else if (matches(opt, /PRO Patrol/i)) {
    // Aimpoint PRO, traced from a flat side photo at its published 5.1" length with both flip caps open (inches from
    // the rear cap, down from the rail top): the rear cap, the main body with its turret, a plain tube with a short
    // accessory rail, the objective bell, and the QRP2 mount with its row of holes and the big clamp knob.
    const X0 = 2.0;
    const p = (pts: number[], close = true) => pts.reduce((s, v, i) => i % 2 ? s : `${s}${i ? ' L' : 'M'}${f(X0 + v)},${f(-1.1 + pts[i + 1])}`, '') + (close ? ' Z' : '');
    od = p([5.04, -2.13, 4.9, -2.41, 4.75, -2.64, 4.66, -2.68, 4.53, -2.68, 4.48, -2.65, 4.33, -2.44, 4.2, -2.36, 4.11, -2.25, 3.74, -2.24, 3.5, -2.1,
      3.45, -2.19, 2.54, -2.19, 2.52, -2.51, 2.47, -2.56, 2.26, -2.55, 1.89, -2.55, 1.66, -2.59, 1.53, -2.59, 1.29, -2.54, 0.59, -2.53, 0.43, -2.52,
      0.33, -2.46, 0.14, -2.16, 0.06, -2.1, 0.01, -1.94, 0, -1.72, 0, -1.3, 0.04, -1.03, 0.14, -0.91, 0.17, -0.76, 0.21, -0.67, 0.33, -0.67, 0.37, -0.88,
      0.64, -0.87, 0.92, -0.83, 0.86, -0.73, 0.85, -0.09, 0.9, -0.02, 0.9, 0.12, 1.59, 0.12, 1.6, 0.21, 1.77, 0.21, 1.84, 0.35, 1.96, 0.47, 2.11, 0.53,
      2.27, 0.53, 2.36, 0.5, 2.49, 0.42, 2.62, 0.22, 2.75, 0.22, 2.76, 0.11, 3.43, 0.11, 3.42, -0.03, 3.48, -0.05, 3.48, -0.38, 3.49, -0.98, 3.75, -0.84,
      4.12, -0.84, 4.23, -0.74, 4.72, -0.75, 4.78, -0.5, 4.94, -0.51, 5.0, -0.66, 5.0, -0.86, 5.06, -1.06, 5.1, -1.37, 5.09, -1.78]);
    odet = `${p([0.59, -2.19, 0.59, -0.86], false)} ${p([0.89, -2.3, 0.89, -0.81], false)} ${p([2.34, -2.3, 2.34, -0.81], false)} ${p([3.47, -2.17, 3.47, -0.92], false)}`
      + ` ${p([4.17, -2.39, 4.17, -0.72], false)} ${repeat(X0 + 1.3, X0 + 1.92, 0.07, (x) => `M${x},${f(-1.1 - 2.53)} L${x},${f(-1.1 - 2.39)}`)}`
      + ` ${p([2.39, -1.78, 3.56, -1.78, 3.56, -1.42, 2.39, -1.42])} ${p([0.87, -0.75, 3.47, -0.75], false)} ${p([0.87, 0, 3.43, 0], false)}`
      + ` ${repeat(X0 + 1.42, X0 + 2.95, 0.213, (x) => OC(x, -1.1 - 0.47, 0.067))} ${OC(X0 + 2.21, -1.1 + 0.09, 0.43)} ${OC(X0 + 2.21, -1.1 + 0.09, 0.33)}`;
    ot = [X0 + 1.6, -1.1 - 2.59];
  } else if (matches(opt, /EXPS/i)) {
    // EOTech EXPS3, traced from a flat side photo at its published 3.8" length (inches from the rear, down from the
    // rail top): the window hood at the rear, the body stepping down to the transverse battery cap at the front, the
    // night-vision and up/down buttons, two side screws, the QD mount with its lever, and the thin lanyard on the cap.
    const X0 = 3.0;
    const p = (pts: number[], close = true) => pts.reduce((s, v, i) => i % 2 ? s : `${s}${i ? ' L' : 'M'}${f(X0 + v)},${f(-1.1 + pts[i + 1])}`, '') + (close ? ' Z' : '');
    od = p([3.77, -1.18, 3.67, -1.34, 3.53, -1.48, 3.36, -1.59, 3.17, -1.61, 3.06, -1.63, 2.48, -1.65, 2.36, -1.78, 2.31, -1.9,
      2.28, -2.0, 2.16, -2.69, 2.13, -2.79, 0.56, -2.78, 0.5, -2.68, 0.54, -2.47, 0.55, -2.29, 0.49, -2.04, 0.39, -1.85, 0.18, -1.64, 0.11, -1.52,
      0.03, -1.02, 0.03, -0.43, 0, -0.29, 0.03, -0.12, 0.15, -0.12, 0.16, 0.09, 2.07, 0.11, 2.32, 0.15, 2.73, 0.12, 2.86, 0.08, 2.86, -0.42, 2.84, -0.58,
      2.97, -0.5, 3.13, -0.44, 3.34, -0.44, 3.54, -0.52, 3.68, -0.65, 3.76, -0.79, 3.8, -0.98]);
    const rr = (x0: number, y0: number, x1: number, y1: number, r: number) => p([x0 + r, y0, x1 - r, y0, x1, y0 + r, x1, y1 - r, x1 - r, y1, x0 + r, y1, x0, y1 - r, x0, y0 + r]);
    odet = `${p([0.52, -1.74, 2.23, -1.82], false)} ${OC(X0 + 0.46, -1.1 - 1.33, 0.18)} ${OC(X0 + 0.46, -1.1 - 1.33, 0.12)} ${rr(0.2, -0.84, 0.61, -0.55, 0.05)} ${rr(0.67, -0.84, 1.08, -0.55, 0.05)}`
      + ` ${OC(X0 + 1.45, -1.1 - 0.55, 0.09)} ${OC(X0 + 2.43, -1.1 - 0.55, 0.09)} ${p([0.14, -0.23, 1.41, -0.37, 2.72, -0.39], false)} ${p([0.16, -0.12, 2.86, -0.12], false)}`
      + ` ${p([3.0, -1.6, 3.0, -0.47], false)} ${p([2.5, -1.68, 2.6, -1.84, 2.75, -1.89, 2.92, -1.84, 3.04, -1.66], false)} ${p([1.77, -0.27, 2.23, -0.27, 2.23, -0.06, 1.77, -0.06])}`;
    ot = [X0 + 1.3, -1.1 - 2.79];
  } else if (matches(opt, /holographic/i) || matches(opt, /Micro T-2/i)) {
    // Traced from the makers' design-patent side views (see scripts/pistol-profiles/optics.py). The micro dot drawing
    // stands in for any other dot; risers lift each to its published sight height.
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
  else if (matches(stock, /PRS|Precision/)) {
    // Magpul PRS Gen3, traced from Magpul's side photo (deskewed, scaled to its 11.5" collapsed length) and placed by the
    // latch tab at the receiver: the butt pad and its plate, the raised cheek riser, the adjustment window and knobs,
    // the tube housing seam, the QD socket and the side screws.
    const F = -0.95 * kx;
    const a = (pts: number[], close = true) => pts.reduce((o, v, i) => i % 2 ? o : `${o}${i ? ' L' : 'M'}${f(F + v)},${f(pts[i + 1])}`, '') + (close ? ' Z' : '');
    rear = F - 11.55;
    sd = a([-0.3, -0.72, -4.69, -0.73, -4.82, -0.8, -8.83, -0.79, -9.15, -0.68, -10.75, -0.71, -11.02, -0.67, -11.19, -0.55, -11.37, -0.3, -11.55, 0.1,
      -11.39, 3.39, -11.27, 3.85, -11.02, 4.17, -10.52, 4.2, -10.39, 4.25, -9.85, 4.23, -7.08, 4.4, -6.18, 4.43, -6.04, 4.39, -5.81, 4.25, -5.7, 4.12,
      -5.63, 3.92, -5.57, 3.39, -5.42, 3.08, -4.7, 1.94, -4.37, 1.67, -4.2, 1.64, -3.76, 1.73, -2.85, 1.8, -2.55, 1.87, -2.31, 1.83, -0.83, 1.94,
      -0.26, 1.94, -0.12, 1.56, 0, 0.73, -0.05, 0.55, -0.3, 0.5]);
    sdet = `${a([-10.49, -0.7, -10.45, 4.2], false)} ${a([-10.0, -0.72, -9.95, 4.22], false)}`
      + ` ${a([-9.36, -0.76, -9.54, 0.12, -8.64, 2.24, -6.32, 2.08, -5.01, 0, -4.83, -0.76], false)}`
      + ` M${f(F - 9.3)},2.5 L${f(F - 6.5)},2.5 Q${f(F - 6.32)},2.5 ${f(F - 6.32)},2.68 L${f(F - 6.32)},3.03 Q${f(F - 6.32)},3.21 ${f(F - 6.5)},3.21 L${f(F - 9.3)},3.21 Q${f(F - 9.48)},3.21 ${f(F - 9.48)},3.03 L${f(F - 9.48)},2.68 Q${f(F - 9.48)},2.5 ${f(F - 9.3)},2.5 Z`
      + ` ${OC(F - 7.1, 2.86, 0.3)} ${OC(F - 7.1, 2.86, 0.12)} ${OC(F - 9.24, 1.67, 0.22)}`
      + ` ${a([-3.88, -0.72, -4.12, 0.12, -3.4, 1.62], false)} ${a([-0.55, -0.72, -0.55, 0.5], false)} ${a([-9.95, 3.87, -6.0, 3.9], false)}`
      + ` ${OC(F - 2.57, 1.43, 0.33)} ${OC(F - 2.57, 1.43, 0.13)}`
      + ` ${[[-9.74, 1.05], [-9.74, 3.15], [-5.37, 1.43], [-6.4, 3.81]].map(([x, y]) => OC(F + x, y, 0.08)).join(' ')}`;
  }
  else if (matches(stock, /MOE Rifle/)) sd = traceStock('stockMoeRifle', -1.0);
  else if (matches(stock, /UBR/)) {
    // Magpul UBR Gen2, traced from Magpul's flat side photo (scaled by its 1.185" receiver-extension threads). It carries
    // its own tube and sits against the receiver, so it is placed by its front face: a long cheek body, the ribbed butt
    // pad, the storage window with its cover, four screws, the adjustment lever and the sling slot.
    const F = -0.95 * kx;
    const a = (pts: number[], close = true) => pts.reduce((o, v, i) => i % 2 ? o : `${o}${i ? ' L' : 'M'}${f(F + v + 0.95)},${f(pts[i + 1])}`, '') + (close ? ' Z' : '');
    rear = F - 9.2;
    sd = a([-10.15, -0.71, -9.79, 4.12, -9.53, 4.85, -9.38, 4.96, -9.01, 5.0, -7.38, 4.98, -7.28, 4.94, -6.54, 4.17, -5.99, 3.69, -5.71, 3.3, -5.67, 3.15,
      -5.68, 2.83, -5.28, 2.42, -5.12, 2.34, -3.58, 2.05, -3.08, 2.06, -3.04, 2.39, -2.71, 2.39, -2.72, 2.14, -2.6, 1.87, -0.93, 1.58, -0.93, -0.7,
      -9.27, -0.84, -9.72, -0.88, -10.05, -0.84]);
    sdet = `${a([-9.36, -0.84, -9.13, 4.95], false)} ${a([-9.19, -0.83, -8.12, 0.57, -0.95, 0.57], false)}`
      + ` ${a([-8.85, 1.5, -8.1, 1.05, -6.45, 1.05, -6.45, 1.55, -7.9, 3.75, -8.85, 3.75])} ${a([-8.01, 3.91, -6.82, 2.19, -5.85, 1.76, -5.58, 2.4, -6.61, 3.91, -7.9, 4.13])}`
      + ` ${a([-7.45, 4.62, -7.05, 4.22], false)} ${a([-7.3, 4.72, -6.9, 4.32], false)}`
      + ` ${repeat(-0.7, 4.0, 0.16, (y) => a([-10.12 + (y + 0.7) * 0.075, y, -10.0 + (y + 0.7) * 0.075, y], false))}`
      + ` ${[[-8.85, 1.19], [-5.37, 1.33], [-1.56, 1.33], [-8.35, 4.47]].map(([x, y]) => `${OC(F + x + 0.95, y, 0.16)} ${OC(F + x + 0.95, y, 0.08)}`).join(' ')}`;
  }
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
    // SB Tactical SBA3, traced from a flat side photo (scaled so its nose matches the 1.85" mil-spec nose): a full-length
    // body over the tube, the latch lever panel and QD socket hanging under its front, and the arm fin dropping 5" at
    // the rear with its strap wrapped round, buckle on top.
    const pp = (pts: number[], close = true) => pts.reduce((a, v, i) => i % 2 ? a : `${a}${i ? ' L' : 'M'}${U(v)},${f(pts[i + 1])}`, '') + (close ? ' Z' : '');
    sd = pp([7.0, -0.89, 2.1, -0.89, 1.8, -1.18, 0.42, -1.17, 0.39, -0.89, 0.25, -0.79, 0.24, 0.69, 0.27, 0.81, 0.36, 0.89, 0.43, 1.84,
      0.5, 3.46, 0.52, 4.88, 0.55, 4.95, 0.68, 5.04, 1.8, 5.03, 1.89, 4.93, 1.94, 4.24, 2.24, 1.6, 2.39, 1.61, 2.72, 1.93, 3.89, 1.93,
      4.06, 1.87, 4.17, 1.74, 4.19, 1.34, 6.0, 1.27, 6.26, 1.02, 6.3, 0.83, 6.68, 0.82, 6.74, 0.78, 6.74, 0.26, 7.06, -0.06]);
    sdet = `${pp([0.56, -1.02, 1.79, -1.02, 1.79, 2.64, 0.56, 2.64])} ${pp([0.62, 3.14, 1.79, 3.14, 1.79, 4.98, 0.62, 4.98])} ${pp([0.6, 2.64, 0.6, 3.14], false)}`
      + ` ${pp([0.38, -0.8, 0.38, 0.78], false)} ${pp([0.26, 0.78, 2.38, 0.78], false)} ${pp([2.9, 0.12, 6.75, 0.12], false)} ${pp([2.57, 0.42, 6.28, 0.42], false)}`
      + ` ${pp([3.46, 0.54, 6.31, 0.74, 6.28, 1.01, 6.0, 1.28, 3.52, 1.19])} ${pp([3.13, 0.07, 3.88, 0.07, 3.88, 0.15, 3.13, 0.15])} ${pp([5.77, 0.07, 6.49, 0.07, 6.49, 0.15, 5.77, 0.15])}`
      + ` ${OC(rear + 2.85, 1.44, 0.27)} ${OC(rear + 2.85, 1.44, 0.18)} ${OC(rear + 3.86, 0.88, 0.05)} ${OC(rear + 3.86, 1.75, 0.05)}`;
  }
  else if (matches(stock, /SBA4/)) {
    // SB Tactical SBA4, traced from a flat side photo (scaled to its 7" body): a body over the tube with three rows of
    // slots, the latch lever below it, a QD socket in the nose, the arm fin at the rear with its strap and buckle, and
    // the diagonal strut from the nose down to the fin's foot around an open window.
    const pp = (pts: number[], close = true) => pts.reduce((a, v, i) => i % 2 ? a : `${a}${i ? ' L' : 'M'}${U(v)},${f(pts[i + 1])}`, '') + (close ? ' Z' : '');
    sd = pp([0.51, 4.18, 0.7, 4.19, 0.76, 4.29, 1.13, 4.3, 1.67, 4.26, 1.81, 4.17, 2.1, 4.17, 2.35, 3.77, 4.0, 2.76, 6.31, 1.42, 6.41, 1.3, 6.45, 1.02,
      6.86, 0.97, 6.96, 0.89, 7.01, 0.8, 7.03, -0.15, 6.96, -0.68, 2.58, -0.72, 2.37, -0.84, 2.15, -0.84, 2.11, -0.93, 1.83, -1.08, 0.61, -1.08,
      0.37, -0.94, 0.31, -0.84, 0.08, -0.84, 0.04, -0.25, 0.06, 0.26, 0.2, 1.17, 0.45, 3.32])
      + ' ' + pp([2.13, 1.4, 3.89, 1.4, 3.89, 1.71, 4.51, 1.71, 4.51, 1.4, 5.28, 1.4, 5.38, 1.23, 2.36, 3.15, 2.13, 3.04]);
    const slot = (x0: number, x1: number, y0: number, y1: number) => { const r = (y1 - y0) / 2; return `M${U(x0 + r)},${f(y0)} L${U(x1 - r)},${f(y0)} Q${U(x1)},${f(y0)} ${U(x1)},${f(y0 + r)} Q${U(x1)},${f(y1)} ${U(x1 - r)},${f(y1)} L${U(x0 + r)},${f(y1)} Q${U(x0)},${f(y1)} ${U(x0)},${f(y0 + r)} Q${U(x0)},${f(y0)} ${U(x0 + r)},${f(y0)} Z`; };
    sdet = [[1.94, 3.16], [3.43, 4.69], [4.93, 6.22]].flatMap(([a, b]) => [[-0.4, -0.2], [-0.1, 0.11], [0.23, 0.44]].map(([c, d]) => slot(a, b, c, d))).join(' ')
      + ` ${pp([0.06, 0.56, 2.13, 0.56], false)} ${pp([2.22, 0.95, 4.1, 0.7, 4.62, 0.98, 5.28, 1.05, 5.28, 1.4, 2.25, 1.4])} ${OC(rear + 4.25, 0.91, 0.05)}`
      + ` ${OC(rear + 6.71, 0.6, 0.2)} ${OC(rear + 6.71, 0.6, 0.13)} ${pp([0.72, -0.93, 1.8, -0.93, 1.8, 1.47, 0.72, 1.47])} ${pp([0.72, 2.51, 1.8, 2.51, 1.8, 4.29, 0.72, 4.29])}`
      + ` ${pp([0.62, 3.0, 1.9, 3.0, 1.9, 3.63, 0.62, 3.63])} ${pp([0.72, 1.47, 0.72, 2.51], false)} ${pp([1.8, 1.47, 1.8, 2.51], false)}`;
  }
  else {
    // Other collapsible stocks: the M4 stock traced from US 10,184,737 FIG. 2A, pushed in so its nose sits just behind the castle nut.
    const dx = rear - AR_STOCK_REAR;
    traced = arPaths(AR_PROFILES.stock, (x, y) => [x + dx, y]);
    sd = traced.o;
  }
  const stockDet = sdet || traced!.d;
  P.push({ slot: 'stock', z: 2, row: 'bottom', target: px(rear + 2.2, 1.6), el: <><path d={T(sd)} fillRule={matches(stock, /SBA4/) ? 'evenodd' : undefined} /><path className="detail" d={T(stockDet)} /></> });

  // Lower receiver, A2-style grip and trigger: traced from US 10,184,737 FIG. 2A (see scripts/pistol-profiles/ar.py).
  // The Glock-magazine 9mm lower is traced from US D782,596 FIG. 1; its trigger guard and web openings are holes.
  // Lowers with an integrated trigger guard and flared magwell (Aero's M4E1 and M5, billet lowers) get a deeper,
  // rounded guard flowing into the magwell lip in place of the mil-spec guard and its pins.
  const flared = !glock9 && (matches(b.lower, /M4E1|M5 Stripped|Billet/) || matches(b.lower, /Integrated trigger guard|Flared magwell/));
  let lower: { o: string; d: string };
  if (flared) {
    const o = AR_PROFILES.lower.outline[0];
    // Measured from a flat side photo of Aero's M4E1 lower: the guard's belly bottoms out 3.17" below the bore, its
    // opening runs 2.06-3.87" back to front, and the flared magwell lip sits 0.15" ahead of the mil-spec face.
    const guard = [1.76, 2.2, 1.73, 2.66, 1.73, 2.98, 1.76, 2.99, 2.3, 3.1, 2.82, 3.17, 3.63, 3.02, 4.1, 2.97, 6.62, 2.51, 6.62, 2.43, 6.52, 2.15, 6.52, 1.45];
    // The guard is a loop: its opening is a hole, and the mil-spec guard's ears and pins at the magwell are dropped.
    const opening = [2.06, 2.07, 2.1, 1.94, 2.22, 1.83, 2.32, 1.79, 3.64, 1.79, 3.74, 1.85, 3.83, 1.96, 3.87, 2.09, 3.86, 2.62, 3.81, 2.74, 3.69, 2.84, 2.96, 2.98, 2.77, 3.01, 2.27, 2.9, 2.17, 2.85, 2.09, 2.74, 2.06, 2.62];
    const drop = [1, 2, 3, 4, 5, 6, 7, 8, 32, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56];
    lower = arPaths({ outline: [[...o.slice(0, 27 * 2), ...guard, ...o.slice(64 * 2)], opening], detail: AR_PROFILES.lower.detail.filter((_, k) => !drop.includes(k)) });
  } else lower = arPaths(glock9 ? AR_PROFILES.lower9 : AR_PROFILES.lower);
  const photo9 = glock9 ? LOWER9_PHOTOS.find(([re]) => matches(b.lower, re)) : undefined;
  if (photo9) lower = arPaths({ outline: [photo9[1], photo9[2]], detail: [] });
  if (flared && matches(b.lower, /M5 Stripped/)) {
    // Aero M5, traced from Aero's flat side photo: a squarer guard opening and a shallower guard and magwell than the
    // M4E1 (in this frame's units, before the AR-10 stretch).
    const o = AR_PROFILES.lower.outline[0];
    const guard = [2.02, 2.17, 2.02, 2.45, 2.03, 2.76, 3.09, 2.91, 3.82, 2.78, 3.94, 2.78, 4.0, 2.81, 6.67, 2.32, 6.74, 2.3, 6.79, 2.23, 6.78, 2.14,
      6.69, 1.95, 6.58, 1.31, 6.57, 1.2];
    const opening = [2.22, 2.02, 2.27, 1.9, 2.33, 1.82, 2.41, 1.75, 2.53, 1.7, 3.5, 1.69, 3.66, 1.78, 3.78, 1.93, 3.81, 1.98, 3.8, 2.28, 3.76, 2.37,
      3.69, 2.47, 3.6, 2.56, 3.49, 2.61, 3.09, 2.69, 2.58, 2.61, 2.42, 2.56, 2.29, 2.42, 2.25, 2.31, 2.22, 2.18];
    const drop = [1, 2, 3, 4, 5, 6, 7, 8, 32, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56];
    lower = arPaths({ outline: [[...o.slice(0, 27 * 2), ...guard, ...o.slice(66 * 2)], opening], detail: AR_PROFILES.lower.detail.filter((_, k) => !drop.includes(k)) });
  }
  if (flared && matches(b.lower, /SP223|SP10/)) {
    // Seekins SP223, traced from Seekins' flat side photo (scaled by its 6.25" pin spacing): a deep bowed guard with
    // four lightening holes along its belly, and a long flared magwell with a recessed side panel.
    const o = AR_PROFILES.lower.outline[0];
    const guard = [1.79, 2.65, 1.81, 3.0, 2.05, 2.98, 2.29, 3.0, 2.58, 3.11, 2.81, 3.28, 3.09, 3.35, 3.31, 3.35, 3.59, 3.27, 4.13, 2.94, 4.46, 2.77, 4.78, 2.69,
      5.05, 2.69, 5.41, 2.76, 6.31, 3.1, 6.72, 3.1, 6.78, 3.07, 6.78, 2.98, 6.72, 2.88, 6.7, 2.6, 6.64, 2.2, 6.62, 1.8, 6.61, 1.44];
    const opening = [2.03, 2.13, 2.1, 2.0, 2.19, 1.91, 2.26, 1.86, 2.43, 1.79, 3.51, 1.79, 3.71, 1.88, 3.83, 2.03, 3.9, 2.26, 3.89, 2.47, 3.85, 2.61, 3.78, 2.75,
      3.64, 2.9, 3.53, 2.98, 3.27, 3.07, 2.99, 3.06, 2.26, 2.75, 2.15, 2.68, 2.04, 2.54, 2.01, 2.43, 2.0, 2.26];
    const panel = [4.39, 0.84, 6.42, 0.82, 6.5, 0.92, 6.55, 2.7, 6.45, 2.8, 5.9, 2.8, 5.3, 2.55, 4.75, 2.4, 4.4, 2.42, 4.3, 2.3, 4.3, 0.95];
    const drop = [1, 2, 3, 4, 5, 6, 7, 8, 16, 19, 32, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56];
    const sp = arPaths({ outline: [[...o.slice(0, 27 * 2), ...guard, ...o.slice(65 * 2)], opening], detail: [...AR_PROFILES.lower.detail.filter((_, k) => !drop.includes(k)), panel] });
    lower = { o: sp.o, d: `${sp.d} ${[[2.89, 3.2], [3.17, 3.25], [3.45, 3.21], [3.7, 3.08]].map(([x, y]) => OC(x, y, 0.065)).join(' ')}` };
  }
  P.push({ slot: 'lower', z: 4, row: 'bottom', target: px(5.6 * kx, 2.4 * ky),
    el: <><path d={R(lower.o)} fillRule={glock9 || flared ? 'evenodd' : undefined} /><path className="detail" d={R(glock9 ? LOWER9_DETAIL.map((l) => polyPath(l, same, false)).join(' ') : lower.d)} /></> });

  // Lower parts kit: the selector's right-side stub over its detent (the lower drawing shows the hole).
  P.push({ slot: 'lpk', z: 6, row: 'bottom', target: px(1.43 * kx, 1.29 * ky),
    el: <path d={O(1.43, 1.29, 0.2) + R(' M1.43,1.29 L1.75,1.12 M1.36,1.29 L1.5,1.29')} /> });
  // Trigger: the curved shoe traced with the lower, or a flat blade for the flat-shoe triggers.
  // Aftermarket shoes are traced from flat side photos of each trigger group, scaled so the shoe hangs as far below
  // the guard opening's top as the mil-spec shoe: Geissele's SSA-E and LaRue's MBT-2S narrow curves, the ALG ACT,
  // Rise's straight RA-535 with its slot, Angstadt's PCC shoe, and CMC's flat blades with the brace behind them.
  const AR_TRIGGERS: [RegExp, number[], number[]?][] = [
    [/SSA-E/, [2.31, 1.87, 2.276, 1.973, 2.27, 2.06, 2.235, 2.251, 2.254, 2.506, 2.272, 2.611, 2.304, 2.712, 2.351, 2.801, 2.541, 2.808, 2.541, 2.786, 2.466, 2.744, 2.456, 2.714, 2.443, 2.602, 2.443, 2.452, 2.462, 2.283, 2.492, 2.153, 2.53, 2.06, 2.545, 1.981, 2.59, 1.87]],
    [/MBT-2S/, [2.316, 1.87, 2.398, 2.016, 2.398, 2.058, 2.352, 2.18, 2.335, 2.274, 2.33, 2.451, 2.361, 2.627, 2.412, 2.76, 2.429, 2.791, 2.448, 2.807, 2.483, 2.801, 2.5, 2.77, 2.462, 2.634, 2.453, 2.563, 2.455, 2.446, 2.5, 2.284, 2.582, 2.17, 2.63, 2.02, 2.67, 1.87]],
    [/ACT Trigger/, [2.314, 1.87, 2.324, 1.945, 2.339, 1.968, 2.339, 2.024, 2.301, 2.126, 2.282, 2.223, 2.277, 2.338, 2.29, 2.436, 2.316, 2.526, 2.359, 2.62, 2.425, 2.718, 2.51, 2.808, 2.532, 2.808, 2.547, 2.795, 2.549, 2.759, 2.47, 2.624, 2.433, 2.483, 2.442, 2.331, 2.463, 2.259, 2.502, 2.178, 2.57, 2.1, 2.65, 2, 2.73, 1.87]],
    [/RA-535/, [2.36, 1.87, 2.353, 1.928, 2.28, 2.142, 2.28, 2.544, 2.514, 2.808, 2.527, 2.808, 2.534, 2.768, 2.503, 2.549, 2.501, 2.323, 2.523, 2.089, 2.532, 2.084, 2.534, 2.049, 2.545, 2.038, 2.547, 1.87], [2.38, 2.15, 2.42, 2.17, 2.42, 2.45, 2.38, 2.47, 2.35, 2.45, 2.35, 2.18, 2.38, 2.15]],
    [/AR9 PCC Trigger/, [2.551, 1.87, 2.488, 2.057, 2.437, 2.164, 2.404, 2.311, 2.404, 2.41, 2.426, 2.502, 2.558, 2.751, 2.543, 2.803, 2.492, 2.806, 2.459, 2.781, 2.353, 2.615, 2.275, 2.428, 2.253, 2.311, 2.25, 2.134, 2.268, 2.021, 2.32, 1.87]],
    [/9mm PCC Single-Stage Trigger, Flat/, [2.25, 1.87, 2.548, 2.778, 2.58, 2.803, 2.795, 2.803, 2.801, 2.781, 2.783, 2.742, 2.664, 2.702, 2.632, 2.663, 2.603, 1.963, 2.609, 1.87], [2.304, 1.87, 2.306, 1.924, 2.413, 2.247, 2.422, 2.256, 2.478, 2.256, 2.49, 2.238, 2.48, 1.913, 2.467, 1.87]],
    [/Single Stage Drop-In, Flat/, [2.25, 1.87, 2.444, 2.61, 2.459, 2.787, 2.476, 2.797, 2.615, 2.808, 2.758, 2.802, 2.764, 2.783, 2.752, 2.77, 2.648, 2.766, 2.629, 2.686, 2.615, 1.959, 2.642, 1.87], [2.34, 1.87, 2.47, 2.43, 2.52, 2.45, 2.54, 2.4, 2.54, 1.87]],
  ];
  const trig = arPaths(AR_PROFILES.trigger);
  const trigPhoto = AR_TRIGGERS.find(([re]) => matches(b.trigger, re));
  P.push({ slot: 'trigger', z: 6, row: 'bottom', target: px(2.5 * kx, 2.3 * ky),
    el: trigPhoto ? <><path d={R(polyPath(trigPhoto[1], same, true))} />{trigPhoto[2] && <path className="detail" d={R(polyPath(trigPhoto[2], same, false))} />}</>
      : <path d={R(matches(b.trigger, /Flat/) ? 'M2.28,1.89 L2.76,1.89 L2.76,1.94 L2.6,2.05 L2.66,2.75 Q2.66,2.82 2.58,2.82 L2.5,2.82 L2.42,2.05 L2.28,1.94 Z' : trig.o)} /> });

  // Pistol grip, each one in the catalog drawn to its own profile. The MOE keeps the A2's rake with a smooth front
  // strap (no finger ridge) and Magpul's long side panel; the MOE+ is the same grip overmoulded all round; the MOE-K2+
  // and BCM's Gunfighter Mod 3 are traced from their side photos (below); Hogue's rubber grip is traced from its photo too.
  // Without a grip chosen, the A2-style grip traced from the lower's patent stands in.
  const gr = b.grip;
  const gk = matches(gr, /K2/) ? 'k2' : matches(gr, /Gunfighter/) ? 'bcm' : matches(gr, /Finger grooves|OverMolded/) ? 'hogue' : matches(gr, /MOE\+/) ? 'moeplus' : matches(gr, /MOE/) ? 'moe' : 'a2';
  let gripO: string, gripDet = '', gripTex: string;
  let gripAt: [number, number] = [-0.2, 4.0];
  // Short grooves set square to a strap, from (x0, y0) to (x1, y1), each d long.
  const strap = (x0: number, y0: number, x1: number, y1: number, d: number) => {
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.15), ux = (x1 - x0) / n, uy = (y1 - y0) / n, l = Math.hypot(ux, uy);
    return Array.from({ length: n - 1 }, (_, k) => { const x = x0 + ux * (k + 1), y = y0 + uy * (k + 1); return `M${f(x)},${f(y)} L${f(x + d * uy / l)},${f(y - d * ux / l)}`; }).join(' ');
  };
  if (gk === 'a2') {
    const grip = arPaths(AR_PROFILES.grip);
    const panel = AR_PROFILES.grip.detail.reduce((a, d) => (d.length > a.length ? d : a), [] as number[]);
    gripO = grip.o; gripDet = grip.d; gripTex = dotsIn(panel, 0.14);
  } else if (gk === 'moe' || gk === 'moeplus') {
    // Traced from Magpul's photos of each grip, set by its top face: the curled beavertail, the tab up into the
    // trigger guard, grooves down both straps and the flared base. The MOE has a raised textured side panel; the
    // MOE+ is rubber overmoulded all over, so it is textured everywhere below the logo. The beavertail follows the
    // lower's own tang curve, so the two share one line where they meet.
    gripO = gk === 'moe'
      ? 'M-0.146,1.334 Q-0.2,1.38 -0.18,1.5 L-0.11,1.87 L0.25,2.18 Q0.32,2.33 0.30,2.48 L-0.53,3.61 L-1.18,4.63 Q-1.21,4.76 -1.08,4.83 L-0.85,4.98 L0.01,5.39 L0.51,5.58 Q0.66,5.55 0.63,5.34 L0.58,5.22 L0.63,5.02 L0.80,4.68 L0.90,4.49 L1.47,3.39 Q1.56,3.22 1.74,3.19 L1.74,2.39 L1.74,2.07 Q1.70,1.93 1.55,1.93 L1.52,1.953 L0.659,1.945 L0.39,1.915 L0.331,1.94 L0.298,1.939 L0.265,1.919 L0.267,1.84 L0.235,1.774 L0.235,1.735 L0.262,1.702 L0.257,1.65 L0.205,1.576 L0.018,1.396 L-0.048,1.362 L-0.146,1.334 Z'
      : 'M-0.146,1.334 Q-0.24,1.4 -0.24,1.55 L-0.23,1.90 L0.09,2.18 Q0.22,2.32 0.20,2.49 L0.09,2.66 L-0.34,3.23 L-0.88,4.03 L-1.24,4.61 Q-1.27,4.76 -1.11,4.88 L-0.71,5.10 L0.06,5.44 L0.50,5.58 Q0.62,5.52 0.61,5.35 L0.56,5.14 L1.41,3.39 Q1.50,3.27 1.73,3.21 L1.74,2.98 L1.74,2.66 L1.71,2.13 Q1.66,1.95 1.52,1.93 L1.52,1.953 L0.659,1.945 L0.39,1.915 L0.331,1.94 L0.298,1.939 L0.265,1.919 L0.267,1.84 L0.235,1.774 L0.235,1.735 L0.262,1.702 L0.257,1.65 L0.205,1.576 L0.018,1.396 L-0.048,1.362 L-0.146,1.334 Z';
    const logo = gk === 'moe' ? [0.78, 2.04, 1.46, 2.27] : [0.74, 2.09, 1.37, 2.29];
    gripDet = `M${logo[0] + 0.06},${logo[1]} L${logo[2] - 0.06},${logo[1]} Q${logo[2]},${logo[1]} ${logo[2]},${(logo[1] + logo[3]) / 2} Q${logo[2]},${logo[3]} ${logo[2] - 0.06},${logo[3]} L${logo[0] + 0.06},${logo[3]} Q${logo[0]},${logo[3]} ${logo[0]},${(logo[1] + logo[3]) / 2} Q${logo[0]},${logo[1]} ${logo[0] + 0.06},${logo[1]} Z`
      + ` M-1.02,4.76 L0.58,5.34 ${strap(1.44, 3.42, 0.72, 4.85, -0.17)} ${strap(0.02, 2.86, -0.95, 4.42, 0.1)}`;
    if (gk === 'moe') {
      const panel = [0.21, 2.71, 1.16, 2.98, 0.45, 4.93, -0.86, 4.46];
      gripDet += ' ' + polyPath(panel, same, true);
      gripTex = dotsIn(panel, 0.14);
    } else gripTex = dotsIn([0.14, 2.5, 1.5, 2.5, 1.54, 3.0, 0.62, 4.95, -0.95, 4.5], 0.13);
    gripAt = [-0.1, 4.0];
  } else if (gk === 'k2') {
    // Traced from Magpul's side photo of the MOE-K2+, set by its top face: the hump of its extended backstrap, a
    // steep body and a flat floor plate. It is rubber overmoulded, smooth on the sides with grooves down both straps.
    gripO = 'M0.05,1.58 L-0.17,1.70 L-0.19,1.94 L-0.11,2.15 L0.24,2.40 L0.23,2.52 L0.17,2.65 L0.04,2.79 L-0.08,2.97 L-0.87,5.00 L-0.76,5.19 L-0.46,5.33 L0.39,5.53 L0.92,5.58 L1.00,5.49 L0.98,5.29 L0.91,5.11 L1.44,3.41 L1.56,3.24 L1.79,3.15 L1.82,2.38 L1.75,2.23 L1.71,2.03 L1.59,1.91 L0.68,1.96 L0.51,1.73 L0.25,1.59 Z';
    gripDet = `M-0.72,5.12 L0.9,5.42 ${strap(1.42, 3.5, 0.95, 5.0, 0.17)} ${strap(-0.12, 3.15, -0.8, 4.9, -0.15)}`;
    gripTex = '';
    gripAt = [0.4, 4.0];
  } else if (gk === 'bcm') {
    // Traced from BCM's side photo of the Gunfighter Mod 3, turned so its top face sits on the receiver: the
    // beavertail tang, the reduced angle, the tab reaching up to the trigger guard, the flared base with its
    // storage door, and the textured panel down the side.
    gripO = 'M-0.03,1.39 L-0.11,1.47 L-0.13,1.60 L0.08,1.77 L0.18,1.95 L0.24,2.33 L0.23,2.66 L0.13,3.00 L-0.19,3.63 L-0.53,4.53 L-0.62,4.83 L-0.61,5.09 L-0.52,5.22 L-0.24,5.34 L0.44,5.52 L0.77,5.58 L0.87,5.57 L0.99,5.49 L1.03,5.39 L1.02,5.30 L0.93,5.16 L1.50,3.28 L1.56,3.20 L1.99,3.09 L2.03,3.02 L1.73,2.97 L1.72,2.15 L1.64,2.02 L1.47,1.94 L0.61,1.96 L0.52,1.76 L0.39,1.60 L0.20,1.46 L0.05,1.39 Z';
    const panel = [0.83, 2.55, 1.36, 2.66, 1.33, 3.31, 0.76, 5.2, -0.44, 4.86, -0.27, 4.16, 0.26, 3.1];
    gripDet = `M-0.5,5.2 L0.95,5.48 M0.3,5.36 Q0.45,5.25 0.62,5.4 ${polyPath(panel, same, true)}`;
    gripTex = dotsIn(panel, 0.14);
    gripAt = [0.4, 4.0];
  } else {
    // Hogue OverMolded, traced from Hogue's side photo and set by its top face like the K2+ and BCM: the A2's rake,
    // three finger grooves down the front strap, a full rounded back strap, and the cobblestone panel and logo on the side.
    gripO = 'M1.68,2.01 L1.51,1.93 L0.65,1.92 L0.48,1.95 L0.38,2.02 L0.34,2.35 L0.22,2.62 L-0.13,3.07 L-0.71,3.77 L-1.38,4.78 L-1.49,5.07 L-1.41,5.21 L-1.23,5.30 L-0.92,5.38 L0.08,5.56 L0.49,5.57 L0.63,5.50 L0.58,5.13 Q0.66,4.8 0.98,4.66 Q1.02,4.5 0.93,4.36 Q1.02,4.04 1.35,3.86 Q1.36,3.62 1.24,3.40 Q1.42,3.27 1.63,3.23 L1.68,3.18 L1.84,3.19 L1.94,3.05 L1.77,2.93 L1.75,2.14 Z';
    const panel = [1.17, 3.01, 0.39, 2.97, 0.09, 3.31, -0.3, 3.69, -0.83, 4.08, -1.09, 4.59, -1.16, 4.85, -0.81, 5.12, -0.25, 5.06, -0.05, 4.87, 0.21, 4.35, 0.54, 4.03, 0.87, 3.71, 1.12, 3.45];
    gripDet = `${polyPath(panel, same, true)} ${OC(0.99, 2.46, 0.25)} ${OC(0.99, 2.46, 0.17)} M-1.3,5.18 L0.5,5.47`;
    gripTex = dotsIn(panel, 0.11);
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
    el: big && b.mag?.brand === 'Magpul'
      // Magpul PMAG 20 LR/SR Gen M3, traced from a flat side photo at the magwell's 2.9" depth (real inches, not stretched
      // with the receiver), drawn from the magwell's lip down: straight spine, gently curved front, the raked top of the grip panel, two rows of pockets,
      // the dot texture block and the floor plate's stepped seam.
      ? <><path d={T(`M7.43,${flared ? 2.72 : 2.85} L7.44,3.24 L7.51,4.4 L7.56,4.57 L7.61,5.08 L7.67,5.49 L7.75,6.16 L7.82,6.39 L7.81,6.61 L7.7,6.7 L7.09,6.82 L4.96,7.18 L4.8,7.16 L4.71,7.1 L4.67,6.94 L4.67,6.77 L4.71,6.64 L4.58,5.96 L4.45,4.92 L4.47,4.77 L4.42,4.6 L4.4,4.06 L4.36,4.01 L4.35,${flared ? 3.24 : 3.38} Z`)} />
        <path className="detail" d={T('M7.42,3.22 L4.4,3.82 M5.54,3.98 L6.81,3.89 L6.81,4.72 L5.54,4.72 Z M4.48,4.0 L5.26,3.96 L5.26,4.72 L4.5,4.72 M7.02,3.86 L7.42,3.8 M7.02,3.86 L7.02,4.72 L7.48,4.72 M5.5,4.89 L6.92,4.89 L6.92,5.76 L5.5,5.76 Z M4.5,5.07 L5.4,5.07 L5.4,5.83 L4.58,5.83 M7.12,4.92 L7.58,4.92 M7.12,4.92 L7.12,5.74 L7.66,5.74 M7.78,6.38 L7.1,6.47 L4.71,6.79 M7.0,6.36 L7.0,6.48')} />
        <path className="detail stipple" d={T(dotsIn([4.91, 5.93, 6.74, 5.93, 6.74, 6.5, 4.91, 6.5], 0.12, same, 0.04))} /></>
      : big
      ? <><path d={T('M3.98,3.0 L6.55,3.0 C6.65,4.8 6.85,6.4 7.05,7.75 L7.1,7.98 L4.6,8.12 L4.55,7.9 C4.3,6.3 4.1,4.7 3.98,3.0 Z', kx, 1)} /><path className="detail" d={T(b.mag?.brand === 'Armalite' ? 'M4.7,3.3 L5.4,7.9 M4.52,7.55 L7.05,7.4' : 'M4.2,4.4 L6.65,4.32 M4.35,5.8 L6.85,5.7 M4.5,7.2 L7.0,7.1 M4.45,3.3 L4.95,7.6 M6.15,3.3 L6.75,7.6', kx, 1)} /></>
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

  let hgBot = 0.98;
  if (freeFloat) {
    // Free-float rails, each read off the maker's side photo (inches from the rail's rear face and down from the
    // top of its rail). The side shows three rows of M-LOK slots, upper, 3 o'clock and lower, at 1.5" to 1.55"
    // pitch. ATLAS S-ONE: rail only at its ends, paired thin slots above and below the main row, a QD hole and a
    // notched tab under the rear. BCM MCMR: teardrop and round cuts under the rail, thin slots either side of
    // the main row, and a raked nose. Geissele MK16: plain rectangular slots, a QD hole and a clamp hanging below
    // the barrel nut with two screws. Midwest Combat Rail: a round hole between every rail slot, a clamp with two
    // screws and an anti-rotation tab at the rear. Seekins keeps its angled cuts; the rest keep the plain rail.
    const hk = matches(hg, /ATLAS|S-ONE/) ? 'atlas' : matches(hg, /MCMR/) ? 'mcmr' : matches(hg, /MK16|Super Modular/) ? 'mk16' : matches(hg, /Combat Rail/) ? 'mi' : matches(hg, /SP3R/) ? 'seekins' : matches(hg, /AR-10 Tactical/) ? 'armalite' : 'plain';
    const top = RAIL;
    const Y = (v: number) => f(top + v);
    const bot = top + { atlas: 2.05, mcmr: 1.98, mk16: 2.08, mi: 2.05, seekins: 2.1, armalite: 1.88, plain: 2.2 }[hk];
    hgBot = bot;
    const slotRow = (y: number, h: number, len: number, from: number, to: number, pitch: number) => {
      const r = h / 2;
      return repeat(from, to - len - r, pitch, (x) => `M${x},${f(y - r)} L${f(x + len)},${f(y - r)} Q${f(x + len + r)},${f(y - r)} ${f(x + len + r)},${f(y)} Q${f(x + len + r)},${f(y + r)} ${f(x + len)},${f(y + r)} L${x},${f(y + r)} Q${f(x - r)},${f(y + r)} ${f(x - r)},${f(y)} Q${f(x - r)},${f(y - r)} ${x},${f(y - r)} Z`);
    };
    // A row of M-LOK slots between v0 and v1 below the rail top, from `from` inches past the rail's rear face to
    // its nose: square-ended with small corner radii, or round-ended when `round`.
    const row = (v0: number, v1: number, from: number, len: number, pitch: number, round = false, end = 0.3) => {
      if (round) return slotRow(top + (v0 + v1) / 2, v1 - v0, len - (v1 - v0), RF + from + (v1 - v0) / 2, HX - end, pitch);
      const r = Math.min(0.06, (v1 - v0) / 3), y0 = top + v0, y1 = top + v1;
      return repeat(RF + from, HX - end - len, pitch, (x) => `M${f(x + r)},${f(y0)} L${f(x + len - r)},${f(y0)} Q${f(x + len)},${f(y0)} ${f(x + len)},${f(y0 + r)} L${f(x + len)},${f(y1 - r)} Q${f(x + len)},${f(y1)} ${f(x + len - r)},${f(y1)} L${f(x + r)},${f(y1)} Q${x},${f(y1)} ${x},${f(y1 - r)} L${x},${f(y0 + r)} Q${x},${f(y0)} ${f(x + r)},${f(y0)} Z`);
    };
    const mlok = (from: number, to: number) => slotRow(-0.03, 0.34, 1.1, from, to, 1.6);
    // Inch-space circles: these sit inside paths that go through T, so they can't use px arcs.
    const screws = (y: number) => ` ${OC(RF + 0.3, y, 0.1)} ${OC(RF + 0.65, y, 0.1)}`;
    const railBase = (x0: number, x1: number) => `M${f(x0)},${Y(0.2)} L${f(x1)},${Y(0.2)}`;
    let hgO: string, hgD: string;
    if (hk === 'atlas') {
      const dip = 0.3;
      hgO = `M${f(RF)},${Y(dip)} L${f(RF + 0.35)},${Y(dip)} L${f(RF + 0.35)},${Y(0)} L${f(RF + 2.1)},${Y(0)} Q${f(RF + 2.25)},${Y(dip)} ${f(RF + 2.45)},${Y(dip)} L${f(HX - 2.4)},${Y(dip)} Q${f(HX - 2.15)},${Y(dip)} ${f(HX - 2.0)},${Y(0)} L${f(HX - 0.1)},${Y(0)} Q${f(HX)},${Y(0)} ${f(HX)},${Y(0.1)} L${f(HX)},${f(bot - 0.1)} Q${f(HX)},${f(bot)} ${f(HX - 0.1)},${f(bot)} L${f(RF + 1.45)},${f(bot)} L${f(RF + 1.35)},${Y(2.2)} L${f(RF + 1.1)},${Y(2.2)} L${f(RF + 1.0)},${Y(2.0)} L${f(RF + 0.85)},${Y(2.0)} L${f(RF + 0.8)},${Y(2.2)} L${f(RF + 0.3)},${Y(2.2)} L${f(RF + 0.3)},${Y(1.75)} L${f(RF)},${Y(1.75)} Z`;
      hgD = `${pic(RF + 0.45, RF + 2.0, top)} ${pic(HX - 1.95, HX - 0.15, top)} ${railBase(RF + 0.35, RF + 2.1)} ${railBase(HX - 2.0, HX - 0.05)} M${f(RF + 0.3)},${Y(dip)} L${f(RF + 0.3)},${Y(1.75)}`
        + ` ${row(0.48, 0.6, 2.5, 0.9, 1.0, true)} ${row(0.72, 0.84, 2.5, 0.9, 1.0, true)} ${row(1.47, 1.58, 2.5, 0.9, 1.0, true)} ${row(1.7, 1.8, 2.5, 0.9, 1.0, true)} ${row(1.03, 1.3, 3.45, 1.15, 1.5, true)} ${OC(RF + 2.65, top + 1.16, 0.16)}`;
    } else if (hk === 'mcmr') {
      hgO = `M${f(RF + 0.05)},${Y(0)} L${f(HX - 0.5)},${Y(0)} L${f(HX - 0.5)},${Y(0.42)} L${f(HX)},${Y(0.95)} L${f(HX)},${Y(1.65)} Q${f(HX)},${f(bot)} ${f(HX - 0.35)},${f(bot)} L${f(RF + 0.25)},${f(bot)} Q${f(RF)},${f(bot)} ${f(RF)},${f(bot - 0.3)} L${f(RF)},${Y(0.35)} L${f(RF - 0.1)},${Y(0.35)} L${f(RF - 0.1)},${Y(0.2)} L${f(RF + 0.05)},${Y(0.2)} Z`;
      const cuts = repeat(RF + 1.45, HX - 0.9, 0.78, (x) => `M${f(x)},${Y(0.52)} Q${f(x - 0.08)},${Y(0.52)} ${f(x - 0.06)},${Y(0.44)} L${f(x + 0.1)},${Y(0.3)} Q${f(x + 0.16)},${Y(0.27)} ${f(x + 0.16)},${Y(0.35)} L${f(x + 0.12)},${Y(0.5)} Q${f(x + 0.1)},${Y(0.54)} ${f(x)},${Y(0.52)} Z ${OC(+x + 0.42, top + 0.42, 0.05)}`);
      hgD = `${pic(RF + 0.25, HX - 0.6, top)} ${railBase(RF + 0.05, HX - 0.5)} ${cuts} ${row(0.68, 0.78, 2.0, 1.1, 1.5, true, 0.55)} ${row(1.05, 1.3, 2.45, 1.0, 1.5, false, 0.3)} ${row(1.62, 1.72, 2.0, 1.1, 1.5, true, 0.45)} ${OC(RF + 0.85, top + 0.55, 0.07)}`;
    } else if (hk === 'mk16') {
      hgO = `M${f(RF + 0.15)},${Y(0)} L${f(HX - 0.2)},${Y(0)} L${f(HX)},${Y(0.25)} L${f(HX)},${Y(1.75)} L${f(HX - 0.3)},${f(bot)} L${f(RF + 2.5)},${f(bot)} L${f(RF + 2.25)},${Y(2.57)} L${f(RF + 0.5)},${Y(2.57)} L${f(RF + 0.5)},${Y(1.55)} L${f(RF + 0.15)},${Y(1.55)} Z M${f(RF + 0.15)},${Y(0.55)} L${f(RF - 0.1)},${Y(0.55)} L${f(RF - 0.1)},${Y(0.75)} L${f(RF + 0.15)},${Y(0.75)}`;
      hgD = `${pic(RF + 0.3, HX - 0.25, top)} ${railBase(RF + 0.15, HX - 0.15)} M${f(RF + 2.2)},${Y(0.62)} Q${f(RF + 2.4)},${Y(0.52)} ${f(RF + 3.9)},${Y(0.52)}`
        + ` ${row(0.72, 0.98, 4.35, 1.2, 1.53)} ${row(1.25, 1.52, 2.8, 1.2, 1.53)} ${row(1.75, 1.95, 2.8, 1.2, 1.53)} ${OC(RF + 2.95, top + 0.82, 0.15)} ${OC(RF + 0.9, top + 2.27, 0.14)} ${OC(RF + 1.9, top + 2.27, 0.14)}`;
    } else if (hk === 'mi') {
      hgO = `M${f(RF + 0.1)},${Y(0)} L${f(HX - 0.05)},${Y(0)} L${f(HX)},${Y(0.1)} L${f(HX)},${Y(1.85)} L${f(HX - 0.45)},${f(bot)} L${f(RF + 2.1)},${f(bot)} L${f(RF + 1.75)},${Y(2.44)} L${f(RF + 0.3)},${Y(2.44)} Q${f(RF + 0.1)},${Y(2.44)} ${f(RF + 0.1)},${Y(2.25)} L${f(RF + 0.1)},${Y(1.05)} L${f(RF - 0.08)},${Y(1.05)} L${f(RF - 0.08)},${Y(0.75)} L${f(RF + 0.1)},${Y(0.75)} Z`;
      const holes = repeat(RF + 2.4, HX - 0.5, 0.394, (x) => OC(+x, top + 0.55, 0.09));
      hgD = `${pic(RF + 0.25, HX - 0.2, top)} ${railBase(RF + 0.1, HX - 0.05)} ${holes} ${row(0.85, 1.05, 3.75, 1.15, 1.53)} ${row(1.38, 1.58, 2.85, 1.15, 1.53)} ${row(1.83, 1.93, 2.85, 1.15, 1.53, true, 0.5)}`
        + ` ${OC(RF + 1.95, top + 1.5, 0.16)} ${OC(RF + 0.55, top + 2.25, 0.11)} ${OC(RF + 1.15, top + 2.25, 0.11)} M${f(RF + 0.65)},${Y(0.85)} L${f(RF + 1.85)},${Y(0.85)} Q${f(RF + 1.95)},${Y(0.92)} ${f(RF + 1.85)},${Y(1.0)} L${f(RF + 0.65)},${Y(1.0)} Q${f(RF + 0.55)},${Y(0.92)} ${f(RF + 0.65)},${Y(0.85)} Z`;
    } else if (hk === 'seekins') {
      // Seekins SP3R V3, measured from its flat side photo: a full-length top rail, a row of raked slashes under it
      // ending in a triangular window at the nose, seven M-LOK slots, paired screw holes at the rear and a flat belly.
      hgO = `M${f(RF)},${f(top)} L${f(HX - 0.15)},${f(top)} L${f(HX - 0.15)},${Y(0.17)} L${f(HX)},${Y(0.25)} L${f(HX)},${f(bot)} L${f(RF)},${f(bot)} Z`;
      const slash = repeat(RF + 2.0, HX - 1.1, 0.394, (x) => `M${x},${Y(0.85)} L${f(x + 0.18)},${Y(0.85)} L${f(x + 0.62)},${Y(0.37)} L${f(x + 0.44)},${Y(0.37)} Z`);
      hgD = `${pic(RF + 0.15, HX - 0.3, top)} ${railBase(RF, HX - 0.15)} ${slash} M${f(HX - 0.55)},${Y(0.85)} L${f(HX - 0.18)},${Y(0.85)} L${f(HX - 0.18)},${Y(0.4)} Z`
        + ` ${row(1.28, 1.58, 2.7, 1.26, 1.575, false, 1.3)}`
        + ` ${[[0.58, 0.6, 0.09], [1.04, 0.6, 0.09], [0.58, 1.42, 0.12], [1.04, 1.42, 0.12], [2.09, 1.42, 0.15], [H - 0.98, 1.42, 0.15]].map(([x, y, r]) => OC(RF + x, top + y, r)).join(' ')}`;
    } else if (hk === 'armalite') {
      // Armalite AR-10 Tactical 15" (M-LOK), measured from its flat side photo: a deep clamp collar at the rear with two
      // screws and three raked cuts, then three rows of M-LOK slots, some swapped for raked cuts, and chamfered nose corners.
      const A = (pts: number[]) => polyPath(pts.map((v, i) => i % 2 ? top + v : RF + v), same, true);
      hgO = `M${f(RF + 0.45)},${f(top)} L${f(RF + 14.95)},${f(top)} L${f(RF + 14.95)},${Y(0.2)} L${f(RF + 14.99)},${Y(0.62)} L${f(RF + 14.99)},${Y(1.52)} L${f(RF + 14.81)},${Y(1.88)}`
        + ` L${f(RF + 2.71)},${Y(1.88)} L${f(RF + 2.62)},${Y(2.29)} L${f(RF + 0.36)},${Y(2.29)} L${f(RF)},${Y(1.88)} L${f(RF)},${Y(1.02)} Q${f(RF)},${Y(0.93)} ${f(RF + 0.1)},${Y(0.92)}`
        + ` Q${f(RF + 0.45)},${Y(0.8)} ${f(RF + 0.45)},${Y(0.45)} Z`;
      const slots = (v0: number, v1: number, idx: number[]) => idx.map((k) => {
        const x = RF + 2.8 + k * 1.536, r = 0.06;
        return `M${f(x + r)},${Y(v0)} L${f(x + 1.22 - r)},${Y(v0)} Q${f(x + 1.22)},${Y(v0)} ${f(x + 1.22)},${Y(v0 + r)} L${f(x + 1.22)},${Y(v1 - r)} Q${f(x + 1.22)},${Y(v1)} ${f(x + 1.22 - r)},${Y(v1)} L${f(x + r)},${Y(v1)} Q${f(x)},${Y(v1)} ${f(x)},${Y(v1 - r)} L${f(x)},${Y(v0 + r)} Q${f(x)},${Y(v0)} ${f(x + r)},${Y(v0)} Z`;
      }).join(' ');
      hgD = `${pic(RF + 0.6, HX - 0.2, top)} ${railBase(RF + 0.45, RF + 14.95)}`
        + ` ${slots(1.09, 1.38, [0, 1, 2, 3, 4, 5, 6, 7])} ${slots(0.59, 0.81, [0, 1, 3, 6, 7])} ${slots(1.6, 1.78, [0, 1, 3, 6, 7])}`
        + ` ${[5.92, 6.6].map((x) => A([x, 0.81, x + 0.4, 0.81, x + 0.68, 0.59, x + 0.28, 0.59])).join(' ')}`
        + ` ${[8.85, 9.75, 10.65].map((x) => A([x, 0.81, x + 0.75, 0.81, x + 0.97, 0.59, x + 0.22, 0.59])).join(' ')}`
        + ` ${[5.96, 6.37, 6.78, 8.99, 9.41, 9.83, 10.25, 10.67, 11.09].map((x) => A([x, 1.6, x + 0.12, 1.6, x + 0.3, 1.78, x + 0.18, 1.78])).join(' ')}`
        + ` ${[0.6, 1.3, 2.0].map((x) => A([x, 0.84, x + 0.45, 0.84, x + 0.6, 0.52, x + 0.15, 0.52])).join(' ')}`
        + ` M${f(RF)},${Y(1.58)} L${f(RF + 2.66)},${Y(1.58)} ${OC(RF + 1.22, top + 2.02, 0.19)} ${OC(RF + 1.22, top + 2.02, 0.08)} ${OC(RF + 2.08, top + 2.02, 0.19)} ${OC(RF + 2.08, top + 2.02, 0.08)} ${OC(RF + 0.18, top + 1.81, 0.05)}`;
    } else {
      hgO = `M${f(RF)},${f(top)} L${f(HX - 0.25)},${f(top)} Q${f(HX)},${f(top)} ${f(HX)},${f(top + 0.25)} L${f(HX)},${f(bot - 0.25)} Q${f(HX)},${f(bot)} ${f(HX - 0.25)},${f(bot)} L${f(RF)},${f(bot)} Z`;
      hgD = `${pic(RF + 0.25, HX - 0.3, top)} M${f(RF)},${f(top + 0.2)} L${f(HX - 0.1)},${f(top + 0.2)} M${f(HX - 0.35)},${f(top + 0.2)} L${f(HX - 0.35)},${f(bot)} M${f(RF)},${f(bot - 0.33)} L${f(HX - 0.35)},${f(bot - 0.33)} M${f(RF + 0.55)},${f(bot - 0.33)} L${f(RF + 0.55)},${f(bot)} ${repeat(RF + 1.1, HX - 1.6, 1.6, (x) => `M${x},${f(bot - 0.23)} L${f(x + 0.9)},${f(bot - 0.23)}`)} ${mlok(RF + 1.1, HX - 0.5)} M${f(RF + 0.15)},${f(top + 0.2)} L${f(RF + 0.15)},${f(bot)} ${OC(RF + 0.95, 0.38, 0.12)} ${OC(HX - 0.75, 0.38, 0.12)}`;
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
  // Each device to its own shape. Lantac Dragon: a squared can, solid at the rear, with three side windows shrinking
  // toward its coned nose. Precision Armament M4-72: a fat brake cut by three deep raked slots into swept fins. VG6 Gamma: two side
  // chambers behind three flash-hider slots. SureFire WarComp: the SOCOM's three tines ahead of a grid of round
  // ports. 3-prong hiders: traced from US D577,410 FIG. 1; other brakes from US D285,238 FIG. 1. Devices traced from
  // photos (SureFire 3-prong, A2 .30, the 9mm cans and the Atlas 9) are in MZ_PHOTOS below.
  const mk = matches(mz, /Dragon/) ? 'dragon' : matches(mz, /M4-72/) ? 'm472' : matches(mz, /Gamma/) ? 'gamma' : matches(mz, /WarComp/) ? 'warcomp'
    : matches(mz, /prong/i) ? 'prong' : matches(mz, /Flash Can|Linear/) ? 'can' : matches(mz, /Atlas 9/) ? 'comp9' : matches(mz, /brake/i) ? 'brake' : matches(mz, /comp/i) ? 'comp' : 'a2';
  const tube = (len: number, r: number, nose = '') => `M${f(BX)},-0.4 L${f(BX + 0.28)},-0.4 L${f(BX + 0.28)},${f(-r)} ${nose || `L${f(BX + len)},${f(-r)} L${f(BX + len)},${f(r)}`} L${f(BX + 0.28)},${f(r)} L${f(BX + 0.28)},0.4 L${f(BX)},0.4 Z`;
  const window = (x0: number, x1: number, y0: number, y1: number) => `M${f(x0)},${f(y0)} L${f(x1)},${f(y0)} L${f(x1)},${f(y1)} L${f(x0)},${f(y1)} Z`;
  const vents = (xs: number[], r: number) => xs.map((d) => `M${f(BX + d)},${f(-r)} L${f(BX + d)},${f(-r + 0.12)} M${f(BX + d + 0.14)},${f(-r)} L${f(BX + d + 0.14)},${f(-r + 0.12)}`).join(' ');
  // Muzzle devices traced from flat side photos (inches from the rear face, up/down from the bore), scaled by the
  // published length or outside diameter: SureFire's SOCOM 3-prong mounts (5.56 and 7.62) with the suppressor
  // shoulder and ring groove behind the tines, the .30 cal A2, KAK's slim flash can, Odin's Atlas 9 and PSA's AK-V.
  const MZ_PHOTOS: [RegExp, number, number[], (X: (x: number) => number, Y: (y: number) => number) => string][] = [
    [/SOCOM 3-Prong.*5\.56/, 1, [0.01, -0.25, 0.00, -0.11, 0.00, 0.07, 0.02, 0.25, 0.03, 0.28, 0.14, 0.28, 0.16, 0.37, 0.17, 0.39, 0.19, 0.39, 0.33, 0.39, 0.37, 0.36, 0.66, 0.36, 0.67, 0.34, 0.70, 0.34, 0.72, 0.36, 0.74, 0.34, 0.77, 0.34, 0.78, 0.35, 2.10, 0.32, 2.15, 0.29, 2.18, 0.26, 2.20, 0.11, 2.18, 0.10, 1.15, 0.12, 0.90, 0.11, 0.90, 0.09, 0.94, 0.06, 2.03, 0.04, 2.15, 0.03, 2.19, 0.00, 2.20, -0.03, 2.19, -0.25, 2.16, -0.31, 2.11, -0.33, 1.38, -0.35, 0.91, -0.35, 0.81, -0.37, 0.77, -0.37, 0.76, -0.35, 0.74, -0.35, 0.72, -0.37, 0.71, -0.37, 0.69, -0.35, 0.67, -0.35, 0.64, -0.37, 0.31, -0.37, 0.24, -0.40, 0.17, -0.40, 0.15, -0.37, 0.14, -0.28, 0.03, -0.28], (X, Y) => [0.15, 0.35, 0.78].map((x) => `M${f(X(x))},${f(Y(-0.36))} L${f(X(x))},${f(Y(0.36))}`).join(' ') + ` M${f(X(0.9))},${f(Y(-0.12))} L${f(X(2.19))},${f(Y(-0.12))}`],
    [/SOCOM 3-Prong.*7\.62/, 1, [0.02, -0.30, 0.00, -0.21, 0.00, -0.03, 0.01, 0.18, 0.03, 0.32, 0.05, 0.34, 0.21, 0.34, 0.23, 0.42, 0.25, 0.44, 0.43, 0.44, 0.47, 0.41, 0.79, 0.40, 0.81, 0.38, 0.84, 0.38, 0.85, 0.40, 0.87, 0.40, 0.88, 0.38, 0.91, 0.38, 0.92, 0.40, 0.98, 0.39, 1.47, 0.38, 1.79, 0.36, 1.95, 0.35, 2.48, 0.33, 2.55, 0.31, 2.57, 0.28, 2.59, 0.24, 2.60, 0.17, 2.60, 0.13, 2.59, 0.12, 1.09, 0.14, 1.06, 0.14, 1.06, 0.09, 1.11, 0.08, 1.48, 0.07, 1.97, 0.05, 2.48, 0.03, 2.54, 0.02, 2.59, -0.01, 2.60, -0.03, 2.59, -0.28, 2.58, -0.31, 2.56, -0.34, 2.50, -0.39, 1.93, -0.39, 1.91, -0.40, 1.10, -0.40, 1.03, -0.42, 0.91, -0.42, 0.90, -0.40, 0.87, -0.40, 0.86, -0.42, 0.83, -0.42, 0.82, -0.40, 0.79, -0.40, 0.78, -0.42, 0.38, -0.41, 0.32, -0.44, 0.23, -0.44, 0.22, -0.42, 0.20, -0.34, 0.04, -0.33, 0.02, -0.32], (X, Y) => [0.22, 0.45, 0.98].map((x) => `M${f(X(x))},${f(Y(-0.4))} L${f(X(x))},${f(Y(0.38))}`).join(' ') + ` M${f(X(1.06))},${f(Y(-0.14))} L${f(X(2.59))},${f(Y(-0.14))}`],
    [/A2 Flash Hider \.30|A2 Flash Hider \.308/, 0.9 / 1.078, [2.21, -0.49, 2.16, -0.54, 1.66, -0.51, 0.99, -0.51, 0.85, -0.53, 0.79, -0.51, 0.74, -0.43, 0.69, -0.43, 0.64, -0.52, 0.48, -0.51, 0.42, -0.42, 0.31, -0.46, 0.04, -0.45, 0.00, -0.18, 0.00, 0.15, 0.04, 0.45, 0.09, 0.47, 0.37, 0.47, 0.38, 0.45, 0.43, 0.44, 0.50, 0.53, 0.65, 0.53, 0.70, 0.44, 0.77, 0.45, 0.80, 0.52, 0.83, 0.53, 1.38, 0.50, 2.17, 0.52, 2.23, 0.46, 2.24, 0.27, 2.24, -0.17], (X, Y) => [0.34, 0.49, 0.7, 0.78].map((x) => `M${f(X(x))},${f(Y(-0.46))} L${f(X(x))},${f(Y(0.46))}`).join(' ')
      + [[-0.32, 0.82], [0.02, 0.95], [0.34, 0.82]].map(([y, x0]) => ` M${f(X(x0))},${f(Y(y - 0.055))} L${f(X(1.93))},${f(Y(y - 0.055))} Q${f(X(1.99))},${f(Y(y))} ${f(X(1.93))},${f(Y(y + 0.055))} L${f(X(x0))},${f(Y(y + 0.055))} L${f(X(x0 - 0.05))},${f(Y(y))} Z`).join('')],
    [/Slimline Flash Can/, 1.0 / 1.077, [0.02, -0.32, 0.01, -0.24, 0.00, 0.17, 0.01, 0.28, 0.03, 0.36, 0.07, 0.40, 0.46, 0.41, 0.48, 0.42, 0.50, 0.51, 0.54, 0.54, 2.68, 0.53, 2.70, 0.51, 2.71, 0.51, 2.73, 0.53, 2.77, 0.53, 2.79, 0.51, 2.80, 0.51, 2.82, 0.53, 2.90, 0.53, 2.94, 0.50, 2.97, 0.45, 2.99, 0.31, 3.00, 0.07, 2.96, 0.06, 2.83, 0.06, 2.83, -0.06, 2.91, -0.06, 2.92, -0.13, 2.99, -0.14, 2.98, -0.33, 2.96, -0.46, 2.94, -0.50, 2.89, -0.54, 2.82, -0.54, 2.80, -0.51, 2.79, -0.51, 2.77, -0.54, 2.73, -0.54, 2.71, -0.51, 2.70, -0.51, 2.68, -0.54, 0.54, -0.54, 0.51, -0.51, 0.48, -0.42, 0.46, -0.41, 0.08, -0.40, 0.03, -0.36], (X, Y) => `M${f(X(0.5))},${f(Y(-0.5))} L${f(X(0.5))},${f(Y(0.5))} M${f(X(2.7))},${f(Y(-0.51))} L${f(X(2.7))},${f(Y(0.51))} M${f(X(2.8))},${f(Y(-0.51))} L${f(X(2.8))},${f(Y(0.51))}`],
    [/Atlas 9/, 1, [0.02, -0.31, 0.00, -0.11, 0.00, 0.10, 0.02, 0.30, 0.04, 0.35, 0.16, 0.38, 0.22, 0.39, 0.52, 0.39, 0.55, 0.42, 0.76, 0.42, 0.79, 0.43, 0.83, 0.43, 0.86, 0.42, 1.60, 0.42, 1.68, 0.42, 1.90, 0.42, 2.20, 0.41, 2.22, 0.39, 2.22, 0.32, 2.24, 0.30, 2.24, 0.20, 2.25, 0.10, 2.25, -0.13, 2.22, -0.17, 2.23, -0.20, 2.23, -0.27, 2.21, -0.32, 2.23, -0.39, 2.20, -0.41, 1.94, -0.41, 1.90, -0.42, 0.94, -0.42, 0.89, -0.42, 0.85, -0.42, 0.81, -0.42, 0.56, -0.42, 0.52, -0.40, 0.49, -0.39, 0.23, -0.39, 0.17, -0.38, 0.05, -0.34], (X, Y) => [0.06, 0.53, 1.85, 1.89].map((x) => `M${f(X(x))},${f(Y(-0.4))} L${f(X(x))},${f(Y(0.4))}`).join(' ')
      + ` M${f(X(1.92))},${f(Y(-0.18))} L${f(X(2.22))},${f(Y(-0.18))} M${f(X(1.92))},${f(Y(0.12))} L${f(X(2.22))},${f(Y(0.12))} ${OC(X(0.82), Y(-0.01), 0.025)}`
      // Six raked ports, three a side, leaning toward the bore.
      + [0.76, 1.18, 1.62].flatMap((x) => [-1, 1].map((sg) => ` M${f(X(x))},${f(Y(sg * 0.38))} L${f(X(x + 0.15))},${f(Y(sg * 0.38))} L${f(X(x + 0.13))},${f(Y(sg * 0.17))} L${f(X(x - 0.06))},${f(Y(sg * 0.17))} L${f(X(x - 0.08))},${f(Y(sg * 0.27))} Z`)).join('')],
    [/AK-V/, 1, [2.07, -0.43, 2.04, -0.48, 0.57, -0.45, 0.53, -0.38, 0.04, -0.37, 0.01, -0.30, 0.00, -0.17, 0.00, 0.18, 0.03, 0.36, 0.53, 0.37, 0.57, 0.44, 1.53, 0.44, 1.60, 0.47, 2.04, 0.46, 2.07, 0.43, 2.09, 0.27], (X, Y) => `M${f(X(0.55))},${f(Y(-0.4))} L${f(X(0.55))},${f(Y(0.4))} M${f(X(1.56))},${f(Y(-0.45))} L${f(X(1.56))},${f(Y(0.45))} M${f(X(0.04))},${f(Y(-0.18))} L${f(X(0.53))},${f(Y(-0.18))}`],
  ];
  const mzPhoto = MZ_PHOTOS.find(([re]) => matches(mz, re));
  if (mzPhoto) {
    const [, k, pts, det] = mzPhoto;
    const X = (x: number) => BX + x * k, Y = (y: number) => y * k;
    md = pts.reduce((s, v, i) => i % 2 ? s : `${s}${i ? ' L' : 'M'}${f(X(v))},${f(Y(pts[i + 1]))}`, '') + ' Z';
    mlen = Math.max(...pts.filter((_, i) => i % 2 === 0)) * k;
    mdet = det(X, Y);
  } else if (mk === 'prong' || mk === 'warcomp' || mk === 'brake') {
    const key = mk === 'brake' ? 'muzzleBrake' as const : 'muzzleProng' as const;
    const h = AR_PROFILES.marks[key + 'H'];
    const t = arPaths(AR_PROFILES[key], (x, y) => [BX + x, y - h / 2]);
    mlen = mk === 'brake' ? 2.25 : 2.2;
    md = t.o;
    mdet = t.d + (mk === 'warcomp' ? ' ' + [0.4, 0.58].flatMap((d) => [-0.2, 0, 0.2].map((y) => OC(BX + d, y, 0.06))).join(' ') : '');
  } else if (mk === 'dragon') {
    mlen = 2.25;
    md = tube(mlen, 0.44, `L${f(BX + 2.05)},-0.44 L${f(BX + mlen)},-0.28 L${f(BX + mlen)},0.28 L${f(BX + 2.05)},0.44`);
    mdet = `M${f(BX + 0.55)},-0.44 L${f(BX + 0.55)},0.44 ${window(BX + 0.95, BX + 1.33, -0.3, 0.22)} ${window(BX + 1.42, BX + 1.75, -0.3, 0.22)} ${window(BX + 1.84, BX + 2.04, -0.26, 0.18)} ${vents([1.05, 1.5], 0.44)}`;
  } else if (mk === 'm472') {
    mlen = 2.3;
    // Three deep cuts raked back into the body leave fins swept toward the muzzle.
    const top = [0.6, 1.2, 1.8].map((d) => `L${f(BX + d)},-0.5 L${f(BX + d - 0.12)},-0.16 L${f(BX + d + 0.24)},-0.5`).join(' ');
    const bot = [1.8, 1.2, 0.6].map((d) => `L${f(BX + d + 0.24)},0.5 L${f(BX + d - 0.12)},0.16 L${f(BX + d)},0.5`).join(' ');
    md = `M${f(BX)},-0.4 L${f(BX + 0.28)},-0.4 L${f(BX + 0.28)},-0.5 ${top} L${f(BX + mlen)},-0.5 L${f(BX + mlen)},0.5 ${bot} L${f(BX + 0.28)},0.5 L${f(BX + 0.28)},0.4 L${f(BX)},0.4 Z`;
    mdet = `M${f(BX + 0.28)},-0.4 L${f(BX + 0.28)},0.4 M${f(BX + 2.12)},-0.5 L${f(BX + 2.12)},0.5`;
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
  const RAIL_BOT = hgBot;
  const mountPiece = (slot: string, el: ReactNode, x0: number, x1: number, y0: number, y1: number) => {
    const m = mounts[slot];
    const outside = m.side === 'bottom' ? y1 + 0.55 : m.side === 'top' ? y0 - 0.55 : RAIL_TOP - 0.45;
    P.push({ slot, internal: m.side === 'left', z: 13, row: m.side === 'bottom' ? 'bottom' : 'top', target: px((x0 + x1) / 2, m.side === 'bottom' ? y1 : y0),
      move: { at: m.at, min: m.min, max: m.max, step: m.step, scale: S },
      dim: [f(ox + RF * S), f(ox + x0 * S), f(oy + outside * S), `${inch(m.at)} from receiver`], el });
  };
  // Every add-on is drawn in its own frame: u inches from its rear end, v inches out from the rail it sits on.
  // On the top or bottom rail its mount shows; on a side rail the mount is behind it and only the body shows.
  // Shapes are measured from maker and retailer side photos, scaled to the published lengths.
  // A solid backing hides the handguard lines behind a light, laser or magnifier that sits in front of it.
  type At = (u: number, v: number) => string;
  const frame = (side: string, x0: number, vc: number): At => (u, v) =>
    `${f(x0 + u)},${f(side === 'top' ? RAIL_TOP - v : side === 'bottom' ? RAIL_BOT + v : -0.08 - (v - vc))}`;
  const lp = (at: At, ...s: (string | number)[]) => {
    let d = '';
    for (let i = 0; i < s.length;) {
      const c = s[i++] as string;
      if (c === 'Z') { d += 'Z '; continue; }
      const pts = c === 'Q' ? 2 : 1;
      d += c;
      for (let k = 0; k < pts; k++, i += 2) d += `${k ? ' ' : ''}${at(s[i] as number, s[i + 1] as number)}`;
      d += ' ';
    }
    return d;
  };
  // A round body from its radius profile [u, r], rear to front; a repeated u is a step. Rings go at every step.
  const revolve = (at: At, prof: number[][], vc: number) => {
    const o = prof.map(([u, r]) => at(u, vc - r)).concat([...prof].reverse().map(([u, r]) => at(u, vc + r)));
    const steps = prof.filter((p, i) => i && prof[i - 1][0] === p[0] && i < prof.length - 1).map(([u]) => {
      const r = Math.min(...prof.filter((p) => p[0] === u).map((p) => p[1])) - 0.03;
      return `M${at(u, vc - r)} L${at(u, vc + r)}`;
    });
    return { o: `M${o.join(' L')} Z`, rings: steps.join(' ') };
  };
  const knurl = (at: At, u0: number, u1: number, vc: number, r: number) =>
    repeat(u0 + 0.06, u1 - 0.04, 0.09, (u) => `M${at(u, vc - r + 0.05)} L${at(u, vc + r - 0.05)}`);
  const sideMount = (side: string) => side === 'top' || side === 'bottom';
  const addon = (slot: string, side: string, x0: number, x1: number, vMax: number, outline: string, detail: string) => {
    const y = (v: number) => side === 'top' ? RAIL_TOP - v : side === 'bottom' ? RAIL_BOT + v : v;
    const [y0, y1] = side === 'top' ? [y(vMax), RAIL_TOP] : side === 'bottom' ? [RAIL_BOT, y(vMax)] : [-0.08 - vMax / 2, -0.08 + vMax / 2];
    mountPiece(slot, <>
      {side !== 'left' && <path className="solid" d={T(outline)} />}
      <path fillRule="evenodd" d={T(outline)} />
      <path className="detail" d={T(detail)} />
    </>, x0, x1, y0, y1);
  };

  if (b.light && mounts.light) {
    const m = mounts.light;
    const x0 = RF + m.at, side = m.side, show = sideMount(side);
    let prof: number[][], vc: number, mount = '', mdet = '', lens: number, knurls = '', vMax: number;
    if (matches(b.light, /M600/)) {
      // SureFire M600DF: tail switch, knurled tailcap, clamp ring with the M75 clamp on the rail and its
      // thumbscrew under the body, plain 1" tube, then the two-step 1.25" bezel.
      vc = 0.74;
      prof = [[0, 0.3], [0.04, 0.34], [0.25, 0.34], [0.25, 0.47], [0.95, 0.47], [0.95, 0.43], [1.05, 0.43], [1.05, 0.53], [2.1, 0.53], [2.1, 0.5], [3.35, 0.5], [3.55, 0.58], [4.1, 0.58], [4.1, 0.625], [5.25, 0.625], [5.3, 0.58]];
      knurls = knurl(frame(side, x0, vc), 0.25, 0.95, vc, 0.47);
      const at = frame(side, x0, vc);
      if (show) {
        mount = lp(at, 'M', 1.15, vc - 0.5, 'L', 1.15, 0.12, 'L', 1.3, 0, 'L', 1.95, 0, 'L', 2.05, 0.12, 'L', 2.05, vc - 0.5, 'Z',
          'M', 1.35, vc + 0.5, 'L', 1.35, vc + 0.68, 'L', 1.45, vc + 0.68, 'L', 1.45, vc + 0.9, 'L', 1.85, vc + 0.9, 'L', 1.85, vc + 0.68, 'L', 1.95, vc + 0.68, 'L', 1.95, vc + 0.5, 'Z');
        mdet = repeat(1.5, 1.8, 0.08, (u) => `M${at(u, vc + 0.7)} L${at(u, vc + 0.88)}`) + ` M${at(1.15, 0.2)} L${at(2.05, 0.2)}`;
      }
      lens = 5.22; vMax = vc + (show ? 0.9 : 0.625);
    } else if (matches(b.light, /HL-X/)) {
      // Streamlight HL-X: long tail and switch body, a clamp ring, a short neck, then the flared 1.4" head.
      vc = 0.76;
      prof = [[0, 0.38], [0.12, 0.47], [1.95, 0.49], [1.95, 0.55], [2.95, 0.55], [2.95, 0.45], [3.35, 0.45], [3.35, 0.52], [3.75, 0.52], [4.3, 0.69], [5.35, 0.69], [5.4, 0.64]];
      const at = frame(side, x0, vc);
      if (show) {
        mount = lp(at, 'M', 2.05, vc - 0.55, 'L', 2.05, 0.1, 'L', 2.2, 0, 'L', 2.8, 0, 'L', 2.9, 0.1, 'L', 2.9, vc - 0.55, 'Z');
        mdet = `M${at(2.15, 0.18)} L${at(2.8, 0.18)}`;
      }
      knurls = repeat(0.4, 1.7, 0.26, (u) => `M${at(u, vc - 0.4)} L${at(u, vc + 0.4)}`) + ` M${at(4.4, vc - 0.6)} L${at(4.4, vc + 0.6)}`;
      lens = 5.3; vMax = vc + 0.69;
    } else if (matches(b.light, /REIN/)) {
      // Cloud Defensive REIN Micro: tailcap with its rocker, an octagonal ring, slim body and a 1" head,
      // held on an inline M-LOK plate under the body.
      vc = 0.56;
      prof = [[0, 0.38], [0.05, 0.43], [0.65, 0.43], [0.65, 0.46], [1.0, 0.46], [1.0, 0.36], [1.95, 0.36], [2.05, 0.5], [3.55, 0.5], [3.6, 0.46]];
      const at = frame(side, x0, vc);
      if (show) mount = lp(at, 'M', 1.05, 0, 'L', 2.0, 0, 'L', 2.0, vc - 0.36, 'L', 1.05, vc - 0.36, 'Z');
      knurls = lp(at, 'M', 0.25, vc + 0.43, 'L', 0.25, vc + 0.28, 'L', 0.42, vc + 0.28, 'L', 0.42, vc + 0.43) + ` M${at(0.82, vc - 0.46)} L${at(0.82, vc + 0.46)} M${at(2.5, vc - 0.5)} L${at(2.5, vc + 0.5)}`;
      lens = 3.52; vMax = vc + 0.5;
    } else {
      vc = 0.74;
      prof = [[0, 0.45], [0.1, 0.5], [m.len - 1.1, 0.5], [m.len - 0.8, 0.62], [m.len, 0.62]];
      lens = m.len - 0.12; vMax = vc + 0.62;
    }
    const at = frame(side, x0, vc);
    const body = revolve(at, prof, vc);
    const rl = prof[prof.length - 1][1] - 0.06;
    addon('light', side, x0, x0 + m.len, vMax, body.o + mount, `${body.rings} ${knurls} ${mdet} M${at(lens, vc - rl)} L${at(lens, vc + rl)}`);
  }
  if (b.laser && mounts.laser) {
    const m = mounts.laser;
    const x0 = RF + m.at, side = m.side, show = sideMount(side);
    if (matches(b.laser, /CMR/)) {
      // Crimson Trace CMR-301: a rounded light-and-laser body sitting flat on the rail: rear cap, seam,
      // a waisted front and a crenellated bezel; a groove runs along the side.
      const vc = 0.6, at = frame(side, x0, vc);
      const prof = [[0, 0.46], [0.04, 0.5], [0.25, 0.5], [0.25, 0.57], [0.82, 0.57], [0.82, 0.6], [2.55, 0.6], [2.75, 0.55], [3.15, 0.55], [3.15, 0.53], [3.3, 0.53], [3.3, 0.6], [3.6, 0.6], [3.9, 0.45]];
      const body = revolve(at, prof, vc);
      addon('laser', side, x0, x0 + m.len, 1.2, body.o,
        `${body.rings} M${at(0.25, vc)} L${at(2.6, vc)} M${at(0.25, vc - 0.08)} L${at(2.6, vc - 0.08)} ${repeat(3.42, 3.75, 0.11, (u) => `M${at(u, vc - 0.5)} L${at(u + 0.05, vc - 0.3)}`)}`);
    } else if (matches(b.laser, /LS117/)) {
      // Holosun LS117: a squared housing on its own QD Picatinny mount, knurled battery cap at the rear,
      // windage screw on the side, elevation screw on top and the emitter in a step at the front.
      const vb = show ? 0.42 : 0, vt = vb + 0.85, vc = (vb + vt) / 2, at = frame(side, x0, vc);
      const o = lp(at, 'M', 0.5, vb + 0.2, 'L', 0.7, vb, 'L', 2.75, vb, 'L', 2.75, vb + 0.1, 'L', 2.97, vb + 0.1, 'L', 2.97, vc - 0.3, 'L', 3.2, vc - 0.27,
        'L', 3.2, vc + 0.27, 'L', 2.97, vc + 0.3, 'L', 2.97, vt - 0.1, 'L', 2.75, vt - 0.1, 'L', 2.75, vt, 'L', 2.35, vt, 'L', 2.35, vt + 0.12, 'L', 1.85, vt + 0.12, 'L', 1.85, vt, 'L', 0.5, vt, 'Z',
        'M', 0.5, vc - 0.38, 'L', 0.04, vc - 0.38, 'L', 0, vc - 0.32, 'L', 0, vc + 0.32, 'L', 0.04, vc + 0.38, 'L', 0.5, vc + 0.38, 'Z')
        + (show ? lp(at, 'M', 1.1, vb, 'L', 1.1, 0.08, 'L', 1.2, 0, 'L', 2.5, 0, 'L', 2.6, 0.08, 'L', 2.6, vb, 'Z') : '');
      const sc = at(2.1, vc - 0.05).split(',').map(Number);
      addon('laser', side, x0, x0 + m.len, vt + 0.12, o,
        `${knurl(at, 0, 0.5, vc, 0.38)} M${at(2.97, vb + 0.1)} L${at(2.97, vt - 0.1)} ${OC(sc[0], sc[1], 0.24)} ${OC(sc[0], sc[1], 0.17)}${show ? ` ${OC(...(at(1.85, vb / 2).split(',').map(Number) as [number, number]), 0.1)}` : ''}`);
    } else {
      const h = 1.1, vc = h / 2, at = frame(side, x0, vc);
      addon('laser', side, x0, x0 + m.len, h, lp(at, 'M', 0, 0.1, 'L', 0.1, 0, 'L', m.len - 0.1, 0, 'L', m.len, 0.1, 'L', m.len, h - 0.1, 'L', m.len - 0.1, h, 'L', 0.1, h, 'L', 0, h - 0.1, 'Z'),
        `M${at(m.len - 0.18, 0.2)} L${at(m.len - 0.18, h - 0.2)}`);
    }
  }
  if (b.foregrip && mounts.foregrip) {
    const m = mounts.foregrip;
    const kind = b.foregrip.attrs.kind;
    const h = (b.foregrip.attrs.h as number) ?? 1;
    const L = m.len, x0 = RF + m.at, at = frame('bottom', x0, 0);
    let o: string, det: string;
    if (matches(b.foregrip, /MVG/)) {
      // Magpul MVG: flared top, a waist under the palm, then a full-width body with grooved front and rear edges.
      o = lp(at, 'M', 0.02, 0, 'L', L - 0.02, 0, 'L', L, 0.22, 'Q', L - 0.15, 0.5, L - 0.15, 0.85, 'Q', L - 0.15, 1.35, L - 0.03, 1.65, 'L', L - 0.03, h - 0.3,
        'Q', L - 0.03, h, L - 0.33, h, 'L', 0.33, h, 'Q', 0.03, h, 0.03, h - 0.3, 'L', 0.03, 1.65, 'Q', 0.15, 1.35, 0.15, 0.85, 'Q', 0.15, 0.5, 0, 0.22, 'Z');
      det = repeat(1.85, h - 0.45, 0.2, (v) => `M${at(0.03, v)} L${at(0.2, v)} M${at(L - 0.03, v)} L${at(L - 0.2, v)}`) + ` M${at(0.15, 0.12)} L${at(L - 0.15, 0.12)}`;
    } else if (matches(b.foregrip, /Vertical Grip Mod 3/)) {
      // BCM Mod 3: a short block under a wider rounded top, a textured panel and ridges down the front.
      o = lp(at, 'M', 0.05, 0, 'L', L - 0.05, 0, 'Q', L, 0, L, 0.15, 'L', L, 0.3, 'L', L - 0.2, 0.58, 'L', L - 0.18, h - 0.18, 'Q', L - 0.18, h, L - 0.36, h,
        'L', 0.33, h, 'Q', 0.15, h, 0.15, h - 0.18, 'L', 0.15, 0.58, 'L', 0, 0.3, 'L', 0, 0.15, 'Q', 0, 0, 0.05, 0, 'Z');
      det = lp(at, 'M', 0.35, 0.7, 'L', L - 0.45, 0.7, 'L', L - 0.45, h - 0.25, 'L', 0.35, h - 0.25, 'Z') + repeat(0.75, h - 0.3, 0.14, (v) => `M${at(L - 0.18, v)} L${at(L - 0.32, v)}`);
    } else if (matches(b.foregrip, /Kinesthetic/)) {
      // BCM KAG: a long ramp from the front down to a deep rear body that ends in a forward hook.
      o = lp(at, 'M', 0, 0, 'L', L, 0, 'L', L, 0.06, 'L', L - 0.2, 0.3, 'L', 1.75, h * 0.42, 'Q', 1.35, h * 0.55, 1.62, h * 0.88, 'Q', 1.55, h, 1.2, h,
        'L', 0.85, h * 0.97, 'Q', 0.4, h * 0.85, 0.32, h * 0.58, 'L', 0.15, 0.25, 'Z');
      det = `M${at(0.3, 0.12)} L${at(L - 0.3, 0.12)} ` + repeat(2.0, L - 0.4, 0.16, (u) => `M${at(u, 0.42 * h - (u - 1.75) * (0.42 * h - 0.3) / (L - 1.95) - 0.02)} L${at(u + 0.06, 0.42 * h - (u - 1.75) * (0.42 * h - 0.3) / (L - 1.95) - 0.14)}`);
    } else if (matches(b.foregrip, /AFG/)) {
      // Magpul AFG-2: an open triangle, its rear leg reaching the low point and a ramp climbing to the front,
      // with a short foot at the front end of the rail bar.
      o = lp(at, 'M', 0, 0, 'L', L, 0, 'L', L, 0.48, 'Q', L - 0.05, 0.66, L - 0.25, 0.66, 'L', L - 0.42, 0.66, 'Q', L - 0.62, 0.62, L - 0.64, 0.42, 'L', L - 0.7, 0.2,
        'L', 3.1, 0.2, 'L', 1.05, h - 0.06, 'Q', 0.85, h + 0.04, 0.7, h - 0.12, 'L', 0, 0.18, 'Z',
        'M', 0.42, 0.3, 'L', 2.55, 0.3, 'L', 0.92, h - 0.42, 'Z');
      det = `M${at(0.2, 0.1)} L${at(L - 0.2, 0.1)}`;
    } else if (matches(b.foregrip, /Hand Stop/)) {
      // Magpul hand stop: a lip at the rear that hooks forward, curving back up into the rail toward the front.
      o = lp(at, 'M', 0, 0, 'L', L, 0, 'L', L, 0.05, 'Q', 0.75, 0.1, 0.52, 0.52, 'Q', 0.47, 0.64, 0.36, 0.62, 'L', 0.2, 0.58, 'Q', 0.05, 0.52, 0.03, 0.35, 'Z');
      det = repeat(0.62, 1.1, 0.12, (u) => `M${at(u, 0.12 + (1.1 - u) * 0.45)} L${at(u + 0.05, 0.05 + (1.1 - u) * 0.4)}`);
    } else if (kind === 'vertical') {
      o = lp(at, 'M', 0, 0, 'L', L, 0, 'L', L - 0.12, h - 0.25, 'Q', L - 0.16, h, L - 0.42, h, 'L', 0.3, h, 'Q', 0.05, h, 0.08, h - 0.28, 'Z');
      det = repeat(0.7, h - 0.4, 0.42, (v) => `M${at(0.2, v)} L${at(L - 0.2, v)}`);
    } else if (kind === 'angled') {
      o = lp(at, 'M', 0, 0, 'L', L, 0, 'L', L - 0.15, 0.28, 'L', 0.55, h, 'Q', 0.1, h + 0.02, 0, h - 0.35, 'Z');
      det = `M${at(0.25, 0.12)} L${at(L - 0.25, 0.12)}`;
    } else {
      o = lp(at, 'M', 0, 0, 'L', L, 0, 'L', L, h - 0.1, 'Q', L, h, L - 0.12, h, 'L', 0.55, h, 'L', 0, 0.12, 'Z');
      det = `M${at(0.25, 0.12)} L${at(L - 0.25, 0.12)}`;
    }
    mountPiece('foregrip', <><path fillRule="evenodd" d={T(o)} /><path className="detail" d={T(det)} /></>, x0, x0 + L, RAIL_BOT, RAIL_BOT + h);
  }
  const mag3x = b.magnifier;
  if (mag3x && opt?.attrs.kind === 'dot') {
    // Behind the red dot on the receiver rail, at the dot's height, flipped up in line, on its flip mount.
    // Holosun HM3X: a plain 1.6" body between rubber eye and objective rings, turrets on top and side.
    // Vortex VMX-3T: knurled eyepiece, a 30 mm tube and a larger faceted turret housing.
    const cy = (matches(opt, /reflex|510/i) ? -2.42 : -2.3) + RAIL + 1.1;
    const vmx = matches(mag3x, /VMX/);
    const L = vmx ? 4.3 : 4.0;
    const x1 = 1.9, x0 = x1 - L;
    const at: At = (u, v) => `${f(x0 + u)},${f(cy - v)}`;
    const prof = vmx
      ? [[0, 0.64], [0.04, 0.68], [0.5, 0.68], [0.5, 0.6], [0.6, 0.6], [0.6, 0.62], [1.4, 0.64], [1.6, 0.86], [3.2, 0.86], [3.4, 0.7], [4.25, 0.7], [4.3, 0.66]]
      : [[0, 0.56], [0.04, 0.6], [0.45, 0.6], [0.45, 0.72], [0.55, 0.79], [3.6, 0.79], [3.7, 0.72], [3.7, 0.6], [3.96, 0.6], [4.0, 0.56]];
    const body = revolve(at, prof, 0);
    const rT = vmx ? 0.86 : 0.79;
    const [k0, k1] = vmx ? [2.2, 2.6] : [2.3, 2.7];
    const top = lp(at, 'M', k0, rT - 0.02, 'L', k0, rT + 0.12, 'L', k1, rT + 0.12, 'L', k1, rT - 0.02);
    const [m0, m1] = vmx ? [1.75, 3.0] : [1.9, 3.3];
    const base = lp(at, 'M', m0 + 0.1, -rT + 0.02, 'L', m0 + 0.1, -rT - 0.18, 'L', m0, -rT - 0.18, 'L', m0, cy - RAIL, 'L', m1, cy - RAIL, 'L', m1, -rT - 0.18, 'L', m1 - 0.1, -rT - 0.18, 'L', m1 - 0.1, -rT + 0.02);
    const sc = at((k0 + k1) / 2, 0.1).split(',').map(Number);
    const o = `${body.o} ${top} Z ${base} Z`;
    P.push({ slot: 'magnifier', z: 14, row: 'top', target: px(x0 + 1.6, cy - rT),
      el: <>
        <path className="solid" d={T(o)} />
        <path d={T(o)} />
        <path className="detail" d={T(`${body.rings} ${vmx ? knurl(at, 0, 0.5, 0, 0.68) : ''} ${OC(sc[0], sc[1], 0.2)} M${at(m0, -rT - 0.18 - 0.22)} L${at(m1, -rT - 0.18 - 0.22)} ${OC(...(at((m0 + m1) / 2, -rT - 0.6).split(',').map(Number) as [number, number]), 0.09)}`)} />
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
  // G34 Gen5: 8.74" long, 8.15" slide, 5.31" barrel. G47: 7.95", 7.32" slide, 4.49". G45 (and G19X): 7.44",
  // 6.85" slide, 4.02", on a full-size grip 5.47" tall (us.glock.com). The G45 frame's dust cover is G19 length.
  glock34: G(8.15, 8.74, 5.31, 0.98, 2.83),
  glock47: G(7.32, 7.95, 4.49, 0.98, 2.83),
  glock45: G(6.85, 7.44, 4.02, 0.98, 2.83),
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
const GLOCK_H: Record<string, number> = { glock17: 5.47, glock34: 5.47, glock19: 5.04, glock26: 4.17, glock45: 5.47, glock47: 5.47, glock20: 5.51 };
const GLOCK_MAG_H: Record<number, number> = { 4: 5.47, 3: 5.47, 2: 5.04, 1: 4.17 };
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
  /** Glock frame measured from a photo (GLOCK_PHOTOS key), when we have one for this frame. */
  photo?: string;
}

function pistolSpec(platform: Platform, b: Build): PistolSpec {
  const a = (p: Part | undefined, k: string) => p?.attrs[k] as string | undefined;
  switch (platform.id) {
    case 'glock43x': {
      const pick = (v?: string) => (v === '43X' ? MODELS.g43x : MODELS.g48);
      const fl = a(b.frame, 'len') ?? a(b.slide, 'len');
      const ph = GLOCK_PHOTOS[fl === '43X' ? 'g43x' : 'g48'];
      return { m: { ...pick(a(b.slide, 'len') ?? a(b.frame, 'len')), sh: ph.sb }, frame: pick(fl), gripH: 5.04, magH: 5.04, grooves: 0, photo: fl === '43X' ? 'g43x' : 'g48' };
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
        const photo = fr?.brand === 'Lone Wolf' ? 'tw20' : 'g20gen4';
        return { m: photo ? { ...m, sh: GLOCK_PHOTOS[photo].sb } : m, frame: m, gripH: 5.51, magH: b.mag?.attrs.ext ? 6.5 : 5.51, grooves: grooved ? 3 : 0, large: true, photo };
      }
      const fr = b.frame;
      const grooved = !fr || (/gen3|gen4/.test(String(fr.attrs.gen)) && !matches(fr, /No finger grooves/));
      // Extended bodies: Glock's 24-round runs about 1.5" below a G17 grip, the PMAG 21 about 1"; the PMAG 12 adds a 0.4" pinky extension to the G26 length.
      const over = matches(b.mag, /24-Round/) ? 1.5 : matches(b.mag, /PMAG 21/) ? 1.0 : matches(b.mag, /PMAG 12/) ? 0.4 : 0;
      // The double-stack 9mm Glock builder: the frame sets the grip and dust cover, the slide its own length (G19 when neither is chosen).
      const fk = 'glock' + String(a(fr, 'model') ?? a(b.slide, 'len') ?? 'G19').slice(1);
      const sk = 'glock' + String(a(b.slide, 'len') ?? a(fr, 'model') ?? 'G19').slice(1);
      const key = platform.id === 'glock9' ? fk : platform.id;
      const sm = platform.id === 'glock9' ? MODELS[sk] : m;
      // The photo of the frame this build uses (the G34 and G47 ride on G17 and G45 frames; Timberwolf frames have their own).
      const pk = ({ glock34: 'glock17', glock47: 'glock45' } as Record<string, string>)[key] ?? key;
      const photo = fr?.brand === 'Lone Wolf' ? (pk === 'glock19' ? 'tw19' : 'tw17') : `g${pk.slice(5)}${String(fr?.attrs.gen ?? b.slide?.attrs.gen ?? 'gen5')}`;
      if (GLOCK_PHOTOS[photo]) return { m: { ...sm, sh: GLOCK_PHOTOS[photo].sb }, frame: MODELS[key] ?? m, gripH: GLOCK_H[key] ?? 5.04, magH: (ms ? GLOCK_MAG_H[ms] : GLOCK_H[key] ?? 5.04) + over, grooves: 0, photo };
      return { m: sm, frame: MODELS[key] ?? m, gripH: GLOCK_H[key] ?? 5.04, magH: (ms ? GLOCK_MAG_H[ms] : GLOCK_H[key] ?? 5.04) + over, grooves: grooved ? (key === 'glock26' ? 2 : 3) : 0 };
    }
  }
}

/* Pistols are drawn from the makers' own patent drawings (see scripts/pistol-profiles/trace.py): the P320 and P365
 * from Sig's design patents, the Glocks from Glock's G42 utility patent. Each is calibrated to the published length
 * and height of the gun it shows, then fitted to each slide, frame and grip size. */

type ProfileKey = 'p320' | 'p365' | 'glock' | 'mp' | 'hellcat';

/** What the chosen parts change about the maker's drawing. */
interface PistolVariants {
  /** Glock frames: the Gen4/Gen5 (and Timberwolf) reversible, larger mag catch and backstrap seam; the SF large frame's
   *  reduced back strap; Gen5's flared mag well; the Timberwolf's 1911-angle grip and beavertail; the G43X rail frame. */
  bigCatch: boolean; seam: boolean; sf: boolean; flare5: boolean; timberwolf: boolean; rail: boolean;
  /** Sig grip modules: extended beavertail, undercut guard, flared mag well, and the side texture
   *  (patent = the standard module as drawn, x = X-Series laser stipple, wilson = cross hatch, axg = alloy frame with grip panels). */
  beaver: boolean; undercut: boolean; flare: boolean; texture: 'patent' | 'x' | 'wilson' | 'axg';
  /** An X-Series module traced from photos, which replaces the patent's outline. */
  module?: keyof typeof SIG_MODULE_PHOTOS;
  /** Slide: whose cuts to draw. */
  slide: 'oem' | 'gen5' | 'brownells' | 'ggp' | 'zev' | 'zaffiri' | 'apex' | 'tp';
  /** Timney's shoes end in a small hook at the toe. */
  hook: boolean;
}

/** Moves every point of a flat x,y list through fn. */
function warpPts(pts: number[], fn: Map2) {
  const out = pts.slice();
  for (let i = 0; i < pts.length; i += 2) { const [x, y] = fn(pts[i], pts[i + 1]); out[i] = x; out[i + 1] = y; }
  return out;
}

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

/** A path from "x,dy" points measured down from the top of the guard opening (y0). */
function rel(pts: string, y0: number, closed: boolean) {
  return pts.split(' ').map((p, i) => { const [x, y] = p.split(',').map(Number); return `${i ? 'L' : 'M'}${x},${n3(y0 + y)}`; }).join(' ') + (closed ? ' Z' : '');
}

/** Trigger shoes, traced from the broken-line triggers in the same patent drawings (y0 is the top of the guard opening).
 *  The P320's curved shoe bows back and its tip curls forward; the P365's runs forward to a tip near the guard;
 *  the Glock's blade has the safety lever down its face. */
const TRIGGERS: Record<ProfileKey, { face: number; curved: (y0: number) => string; flat: (y0: number) => string; line: { curved: string | ((y0: number) => string); flat: string | ((y0: number) => string) }; hook?: string }> = {
  // The P320's triggers traced from flat photos (the curved shoe from Sig's Subcompact view, the flat skeleton shoe from the
  // AXG): both hang from the front of the guard's top and sweep forward to a tip near the guard's bottom.
  p320: {
    face: 2.95,
    curved: (y0) => rel('2.514,0 2.518,0.012 2.61,0.096 2.655,0.164 2.804,0.574 2.868,0.672 2.929,0.733 3.033,0.803 3.143,0.838 3.186,0.844 3.297,0.838 3.38,0.801 3.388,0.782 3.37,0.746 3.29,0.711 3.186,0.641 3.082,0.537 3.025,0.452 2.972,0.317 2.953,0.231 2.947,0.108 2.97,0', y0, true),
    flat: (y0) => rel('2.477,0 2.484,0.046 2.56,0.124 2.932,0.774 2.98,0.828 3.112,0.935 3.14,0.949 3.159,0.942 3.18,0.914 3.18,0.871 3.137,0.821 3.118,0.782 2.953,0.179 2.951,0.14 2.959,0.089 3.009,0', y0, true),
    line: {
      curved: (y0) => rel('2.92,0.02 2.9,0.34 2.98,0.54 3.1,0.68', y0, false),
      flat: (y0) => rel('2.958,0.05 2.99,0.31 3.09,0.76', y0, false) + ' ' + rel('2.739,0.089 2.766,0.081 2.805,0.088 2.832,0.105 2.856,0.136 2.957,0.502 2.949,0.518 2.918,0.519 2.892,0.498 2.709,0.179 2.7,0.151 2.702,0.124', y0, true),
    },
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
    hook: 'M2.9,2.25 L3.08,2.2 L2.98,2.08 Z',
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
    hook: 'M2.88,2.6 L3.04,2.56 L2.95,2.44 Z',
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

/** Aftermarket Hellcat Pro slides, drawn from their makers' descriptions rather than a patent: Apex cuts deep slanted
 *  serrations front and rear under a chamfered top edge; True Precision's Axiom adds two lightening windows ahead of the port. */
function aftermarketSerr(SL: number, SH: number, port1: number, kind: 'apex' | 'tp') {
  const slot = (x: number) => `M${f(x)},${f(SH - 0.14)} L${f(x + 0.12)},0.16 L${f(x + 0.2)},0.16 L${f(x + 0.08)},${f(SH - 0.14)} Z`;
  let d = `M0.2,0.3 L${f(SL - 0.4)},0.3 `;
  for (let k = 0; k < 6; k++) d += slot(0.3 + k * 0.2) + ' ';
  for (let k = 0; k < 4; k++) d += slot(SL - 1.3 + k * 0.2) + ' ';
  if (kind === 'tp') for (const x of [port1 + 0.2, port1 + 0.62]) d += `M${f(x)},0.04 L${f(x + 0.32)},0.04 L${f(x + 0.26)},0.24 L${f(x + 0.06)},0.24 Z `;
  return d;
}

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
function glockGrip(traced: number[], o: { SH: number; hole: number[]; slim: boolean; large?: boolean; grooves: number; yGB: number; sf?: boolean; timberwolf?: boolean; flare?: boolean }) {
  const { SH, slim, large, grooves: n, yGB, timberwolf: tw } = o;
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
  // The Timberwolf's beavertail reaches about 0.3" further back than Glock's tang.
  const tang = (slim ? 0.36 : 0.38) + (tw ? 0.28 : 0);
  // The large frame's grip is a little deeper front to back for the longer 10mm and .45 magazines.
  const gw = slim ? 1.85 : large ? 2.16 : 2.08;
  // Heel: the Timberwolf stands its grip up near the 1911's angle; the SF large frame trims the back strap.
  const hx = -(slim ? 0.36 : 0.38) - 0.31 + (tw ? 0.22 : 0) + (o.sf ? 0.1 : 0);
  const toeX = hx + gw;
  const A = [X(iA), Y(iA)];
  const fy = A[1] + 0.24;
  // Front strap rake (inches back per inch down): matched to the back strap's, so the grip tilts as one piece.
  const fs = (tw ? 0.22 : 0.31) + 0.06 / (yGB - fy);
  const front = (y: number) => toeX + fs * (yGB - y);
  // Under the guard: a tight radius from the guard's bottom into the front strap.
  q(A, [front(fy) + 0.03, A[1]], [front(fy), fy]);
  const gen5 = !!o.flare;
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
    pts.push(bx(y) - (n && !o.sf ? 0.035 * Math.exp(-(((t - 0.55) / 0.22) ** 2)) : 0), y);
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

/** Glock's trigger guard opening: a squared front (nearly vertical front wall, tight corners) and a rounder back
 *  (US 4,539,889 FIG. 1), in the box [x0, y0, x1, y1]. */
function glockOpening([x0, y0, x1, y1]: number[]) {
  const r = (cx: number, cy: number, rr: number, a0: number, a1: number, n = 5) => {
    const out: number[] = [];
    for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; out.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
    return out;
  };
  const PI = Math.PI;
  return [...r(x0 + 0.3, y0 + 0.3, 0.3, PI, 1.5 * PI), ...r(x1 - 0.16, y0 + 0.16, 0.16, 1.5 * PI, 2 * PI), ...r(x1 - 0.2, y1 - 0.2, 0.2, 0, 0.5 * PI), ...r(x0 + 0.34, y1 - 0.34, 0.34, 0.5 * PI, PI)];
}

/** A Glock frame measured from a photo (GLOCK_PHOTOS): its outline, guard opening, controls, back strap seam and
 *  grip texture, all where the photo shows them. Texture is the shared dot stipple at 0.1" pitch. */
/** A tilted magazine catch from its four corners, with grip ribs running between its top and bottom edges. */
function catchPoly(q: number[]) {
  const [ax, ay, bx, by, cx, cy, dx, dy] = q;
  const at = (t: number, s: number) => `${f(ax + (bx - ax) * t + ((dx + (cx - dx) * t) - (ax + (bx - ax) * t)) * s)},${f(ay + (by - ay) * t + ((dy + (cy - dy) * t) - (ay + (by - ay) * t)) * s)}`;
  let ribs = '';
  for (let t = 0.18; t < 0.85; t += 0.16) ribs += ` M${at(t, 0.2)} L${at(t, 0.8)}`;
  return polyPath(q, same, true) + ribs;
}

function glockPhotoFrame(ph: GlockPhoto, o: { dust: number; yRail: number; rail: boolean; seam: boolean }) {
  const pts = ph.frame;
  const xs = pts.filter((_, i) => !(i % 2)), ys = pts.filter((_, i) => i % 2);
  const low = xs.filter((_, i) => ys[i] > ph.gb - 0.1); // 0.1: the slim frames' grip bottom slopes
  const heel: [number, number] = [Math.min(...low), ph.gb], toe: [number, number] = [Math.max(...low), ph.gb];
  const tang = -Math.min(...xs.filter((_, i) => ys[i] < ph.sb + 0.4));
  const P = (q: number[], close = false) => polyPath(q, same, close);
  const rr = ([x0, y0, x1, y1]: number[], r: number) =>
    `M${f(x0 + r)},${f(y0)} L${f(x1 - r)},${f(y0)} Q${f(x1)},${f(y0)} ${f(x1)},${f(y0 + r)} L${f(x1)},${f(y1 - r)} Q${f(x1)},${f(y1)} ${f(x1 - r)},${f(y1)} L${f(x0 + r)},${f(y1)} Q${f(x0)},${f(y1)} ${f(x0)},${f(y1 - r)} L${f(x0)},${f(y0 + r)} Q${f(x0)},${f(y0)} ${f(x0 + r)},${f(y0)} Z`;
  // Dust cover: its bottom edge, from the outline, carries the accessory rail's cross slot.
  const dust = Math.max(...xs); // the photo's own dust cover front
  const front = xs.map((x, i) => (x > dust - 1.2 && x < dust - 0.2 ? ys[i] : 0));
  const yDust = Math.max(...front);
  const rail = o.rail ? ` M${f(dust - 0.58)},${f(yDust - 0.14)} L${f(dust - 0.58)},${f(yDust)} M${f(dust - 0.42)},${f(yDust - 0.14)} L${f(dust - 0.42)},${f(yDust)} M${f(dust - 1.6)},${f(yDust - 0.14)} L${f(dust - 0.12)},${f(yDust - 0.14)}` : '';
  const [s0, s1, s2, s3] = ph.slideStop, [t0, t1, t2, t3] = ph.takedown, [c0, c1, c2, c3] = ph.magCatch;
  const controls = rr(ph.slideStop, 0.06) + ` M${f(s0 + 0.06)},${f(s1 + 0.09)} L${f(s2 - 0.06)},${f(s1 + 0.09)} M${f(s0 + 0.06)},${f((s1 + s3) / 2 + 0.03)} L${f(s2 - 0.06)},${f((s1 + s3) / 2 + 0.03)}`
    + ' ' + rr(ph.takedown, 0.02) + ` M${f(t0 + 0.03)},${f(t1 + 0.1)} L${f(t2 - 0.03)},${f(t1 + 0.1)} M${f(t0 + 0.03)},${f(t1 + 0.16)} L${f(t2 - 0.03)},${f(t1 + 0.16)}`
    + ' ' + OC(ph.triggerPin[0], ph.triggerPin[1], ph.triggerPin[2]) + ' ' + OC(ph.housingPin[0], ph.housingPin[1], ph.housingPin[2])
    + (ph.lockPin ? ' ' + OC(ph.lockPin[0], ph.lockPin[1], ph.lockPin[2]) : '')
    + ' ' + (ph.magCatchPoly ? catchPoly(ph.magCatchPoly) : rr(ph.magCatch, 0.03) + repeat(c0 + 0.07, c2 - 0.06, 0.07, (x) => ` M${x},${f(c1 + 0.05)} L${x},${f(c3 - 0.05)}`));
  // Grip texture: the side panel between its molded rear edge and the front strap, and the back strap between the
  // outline and its seam, all at the same 0.1" pitch. The logo plate is left smooth.
  const lineX = (q: number[], y: number) => {
    for (let i = 0; i + 3 < q.length; i += 2) if ((q[i + 1] - y) * (q[i + 3] - y) <= 0) return q[i] + ((y - q[i + 1]) / (q[i + 3] - q[i + 1] || 1)) * (q[i + 2] - q[i]);
    return NaN;
  };
  const [l0, l1, l2, l3] = ph.logo ?? [0, 0, 0, 0];
  // The front strap's line, carried up past the trigger guard so the texture stops where the strap would be.
  const fa = crossings(pts, ph.texBottom - 0.4), fb = crossings(pts, (ph.texBottom + ys.reduce((a, b) => Math.max(a, b > 2.4 && b < 3 ? b : a), 2.4)) / 2);
  const ya = ph.texBottom - 0.4, yb = (ph.texBottom + ys.reduce((a, b) => Math.max(a, b > 2.4 && b < 3 ? b : a), 2.4)) / 2;
  const strap = (y: number) => fa[fa.length - 1] + ((y - ya) / (yb - ya)) * (fb[fb.length - 1] - fa[fa.length - 1]);
  let stipple = '';
  for (let y = ph.texTop, row = 0; y <= ph.texBottom; y += 0.1, row++) {
    const c = crossings(pts, y);
    const off = row % 2 ? 0.05 : 0;
    const back = c[0], frontX = Math.min(c[c.length - 1], strap(y));
    const rear = lineX(ph.panelRear, y), sm = lineX(ph.seam, y);
    if (!Number.isNaN(rear)) for (let x = rear + 0.08 + off; x < frontX - 0.07; x += 0.1) {
      if (x > l0 - 0.04 && x < l2 + 0.04 && y > l1 - 0.04 && y < l3 + 0.04) continue;
      if (x > c0 - 0.05 && x < c2 + 0.05 && y < c3 + 0.05) continue; // smooth around the mag catch
      stipple += `M${f(x)},${f(y)} L${f(x + 0.014)},${f(y)} `;
    }
    // Back strap: behind the seam, or behind the panel edge on the slim frames (no separate back strap).
    const strapEdge = ph.seam.length ? sm : rear;
    if (!Number.isNaN(strapEdge) && y < ph.texBottom - 0.15) for (let x = back + 0.07 + off; x < strapEdge - 0.06; x += 0.1) stipple += `M${f(x)},${f(y)} L${f(x + 0.014)},${f(y)} `;
  }
  const frameDetail = `${rail} ${controls} ${o.seam ? P(ph.seam) : ''} ${P(ph.panelRear)} ${ph.logo ? rr(ph.logo, 0.06) : ''}`;
  return { mapped: pts, heel, toe, tang, hole: P(glockOpening(ph.hole), true), frameDetail, stipple };
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
  xt: number; trigTop: number; trigD: string; trigLine: string; fcuX0: number;
  gF: number; dust: number; railY: number;
  heel: [number, number]; toe: [number, number]; yGB: number; yMB: number; ext: number;
  frameD: string; frameDetail: string; stipple: string; slideD: string; slideDetail: string; windowD: string;
  /** Floor plate measured from a photo (flush OEM magazine). */
  plateD?: string;
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

/** A closed polygon with each corner cut back by r and rounded (a quadratic through the corner). */
function roundCorners(q: number[], r: number) {
  const n = q.length / 2, out: number[] = [];
  for (let i = 0; i < n; i++) {
    const px = q[2 * ((i + n - 1) % n)], py = q[2 * ((i + n - 1) % n) + 1], x = q[2 * i], y = q[2 * i + 1], nx = q[2 * ((i + 1) % n)], ny = q[2 * ((i + 1) % n) + 1];
    const a = Math.min(r, Math.hypot(px - x, py - y) / 2), b = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ax = x + ((px - x) * a) / Math.hypot(px - x, py - y), ay = y + ((py - y) * a) / Math.hypot(px - x, py - y);
    const bx = x + ((nx - x) * b) / Math.hypot(nx - x, ny - y), by = y + ((ny - y) * b) / Math.hypot(nx - x, ny - y);
    for (let t = 0; t <= 1.001; t += 0.25) out.push((1 - t) ** 2 * ax + 2 * t * (1 - t) * x + t * t * bx, (1 - t) ** 2 * ay + 2 * t * (1 - t) * y + t * t * by);
  }
  return out;
}

/** A closed outline cut off at x = x1 (everything ahead of it dropped). */
/** Cut a closed outline back to a front face given as x, y pairs from top to bottom: no point lies ahead of the face. */
function clipToFace(pts: number[], face: number[]) {
  const ys = face.filter((_, i) => i % 2), xs = face.filter((_, i) => !(i % 2));
  const at = (y: number) => {
    if (y <= ys[0]) return xs[0];
    for (let i = 1; i < ys.length; i++) if (y <= ys[i]) return xs[i - 1] + ((xs[i] - xs[i - 1]) * (y - ys[i - 1])) / (ys[i] - ys[i - 1]);
    return xs[xs.length - 1];
  };
  const out: number[] = [], d = densify(pts, 0.02);
  for (let i = 0; i < d.length; i += 2) {
    const x = Math.min(d[i], at(d[i + 1]));
    if (out.length < 2 || out[out.length - 2] !== x || out[out.length - 1] !== d[i + 1]) out.push(x, d[i + 1]);
  }
  return out;
}

function clipFront(pts: number[], x1: number) {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[(i + 2) % pts.length], by = pts[(i + 3) % pts.length];
    if (ax <= x1) out.push(ax, ay);
    if ((ax <= x1) !== (bx <= x1)) out.push(x1, ay + ((x1 - ax) / (bx - ax)) * (by - ay));
  }
  return out;
}

function profileGeometry(key: ProfileKey, spec: PistolSpec, o: { slim: boolean; frontSerr: boolean; flat: boolean; v: PistolVariants }): ProfileGeo {
  const v = o.v;
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
  const glockHole = glockOpening(mk.hole);
  let hole = glock ? polyPath(glockHole, frameMap, true) : pr.frame.hole ? polyPath(scF(pr.frame.hole), frameMap, true) : '';
  const outlines = pr.frame.outline.map((ol) => (glock ? smooth(fillWeb(densify(scF(ol), 0.05), mk.sh + 0.15, mk.gripBottom - 0.1, 0.65), 2) : ol));
  if (!glock && (v.beaver || v.undercut || v.flare)) {
    // Sig grip modules that leave the patent's shape: the X-Series, Wilson Combat and AXG modules reach further back
    // under the hand (beavertail) and higher under the guard (undercut); the X-Carry and Wilson modules flare the mag well.
    const sh = mk.sh, gb = mk.gripBottom, hx0 = mk.heel[0], tx0 = mk.toe[0];
    outlines[0] = warpPts(outlines[0], (x, y) => {
      let dx = 0, dy = 0;
      if (v.beaver && x < 0.3 && y > sh && y < sh + 1.0) { const w = Math.sin((Math.PI * (y - sh)) / 1.0); dx -= 0.3 * w; dy -= 0.06 * w; }
      if (v.undercut && x > h0x - 0.45 && x < h0x + 0.35 && y > h1y + 0.05 && y < h1y + 0.75) dy -= 0.13 * Math.min(1, Math.max(0, (h0x + 0.35 - x) / 0.35));
      if (v.flare && y > gb - 0.5) { const w = (y - (gb - 0.5)) / 0.5; if (x < hx0 + 0.1) dx -= 0.14 * w; else if (x > tx0 - 0.1) dx += 0.14 * w; }
      return [x + dx, y + dy];
    });
  }
  // A module traced from photos (the X-Series ones, the Subcompact and the AXG) replaces the patent's outline; its dust cover stops where the slide's nose comes down.
  const modPh = !glock && v.module ? SIG_MODULE_PHOTOS[v.module] : undefined;
  // A module with its photo's front face is cut back to that face (the slide's nose sits in front of it).
  // The slide's nose ends just behind the slide's own lower front edge.
  const swapXY = (p: number[]) => p.flatMap((_, i) => (i % 2 ? [] : [p[i + 1], p[i]]));
  const slideCut = pr.slide.outline.map((ol) => swapXY(clipFront(swapXY(scS(ol).flatMap((_, i, a) => (i % 2 ? [] : slideMap(a[i], a[i + 1])))), mk.sh)));
  const noseX1 = Math.max(...slideCut.flatMap((ol) => ol.filter((v, i) => !(i % 2) && ol[i + 1] > mk.sh - 0.3 && ol[i + 1] < mk.sh - 0.01))) - 0.03;
  const faceShift = modPh?.nose ? noseX1 - modPh.nose[1] : 0;
  const face = modPh?.front?.map((v, i) => (i % 2 ? v : v + faceShift));
  const modOl = modPh ? (face ? clipToFace(modPh.frame, face) : clipFront(modPh.frame, fx(mk.dust))) : undefined;
  if (modPh && modOl) {
    hole = polyPath(modPh.hole, same, true);
    const yb = Math.max(...modOl.filter((_, i) => i % 2));
    const low = modOl.filter((_, i) => i % 2 === 0).filter((_, i) => modOl[2 * i + 1] > yb - 0.04);
    heel = [Math.min(...low), yb];
    toe = [Math.max(...low), yb];
  }
  // A grip module with its own texture replaces the patent's molded panels below the guard.
  // A photo-traced module keeps only the patent's lines above the trigger guard (the controls); its grip is its own.
  // The P320's takedown lever is drawn from the photos below, so the patent's version of it is dropped.
  const patentLever = (ol: number[]) => key === 'p320' && ol.every((c, i) => (i % 2 ? c > 1.03 && c < 1.43 : c > 2.0 && c < 3.62));
  // A module with its photo's front face draws its own dust cover and rail, so the patent's lines there are dropped.
  const patentRail = (ol: number[]) => !!modPh?.front && (ol.every((c, i) => (i % 2 ? c > 1.3 : c > 3.7)) || ol.every((c, i) => (i % 2 ? c > 0.95 : c > 5.5)));
  const keepDetail = (ol: number[]) => !patentLever(ol) && !patentRail(ol) && (glock || (modPh ? Math.max(...ol.filter((_, i) => i % 2)) < h0y + 0.2
    : v.texture === 'patent' || Math.min(...ol.filter((_, i) => i % 2)) < h1y - 0.1));
  let frameDetail = pr.frame.detail.filter(keepDetail).map((ol) => polyPath(scF(ol), frameMap, false)).join(' ');
  let slideDetail = pr.slide.detail.map((ol) => polyPath(scS(ol), slideMap, false)).join(' ');
  let stipple = '';
  let tang = -mk.tang;
  let fcuX0 = -Infinity;
  if (key === 'p320') {
    // The takedown lever as the flat photos show it: a paddle with five ribs at the rear and a lobe hanging down at the
    // front. It sits about 0.1" further back on the shorter Subcompact slide.
    const dx = (SL - 6.75) * 0.2, sh = (pts: number[]) => pts.map((v, i) => (i % 2 ? v : v + dx));
    frameDetail += ' ' + polyPath(roundCorners(sh([2.919, 0.982, 3.969, 0.995, 3.995, 1.04, 3.956, 1.137, 3.827, 1.345, 3.775, 1.423, 3.697, 1.474, 3.606, 1.468, 3.541, 1.423,
      3.477, 1.345, 3.425, 1.306, 3.308, 1.299, 2.919, 1.293, 2.88, 1.254, 2.873, 1.059, 2.893, 0.995]), 0.03), same, true)
      + [1.02, 1.079, 1.131, 1.183, 1.228].map((y, i) => ' ' + polyPath(sh([2.935, y, i > 2 ? 3.46 : 3.5, y]), same, false)).join('')
      + ' ' + polyPath(sh([3.95, 1.03, 3.762, 1.41]), same, false);
  }
  if (!glock) {
    // Side panel between the straps, inset from both, from under the guard to above the heel.
    const mappedS = modOl ?? outlines[0].flatMap((_, i, a) => (i % 2 ? [] : frameMap(a[i], a[i + 1])));
    // The fire control unit's hidden outline starts inside the back strap at both its top and bottom edges.
    fcuX0 = Math.max(...[mk.sh + 0.06, h0y - 0.04].map((y) => (crossings(mappedS, y)[0] ?? -Infinity) + 0.08));
    const inset = v.texture === 'axg' ? 0.26 : v.texture === 'patent' ? 0.3 : 0.18;
    const ys: number[] = [];
    // Factory modules are textured from just under the trigger guard to near the floor plate.
    const pat = v.texture === 'patent';
    const yTop = grip(0, h1y + (pat ? 0.18 : 0.55))[1], yBot = Math.min(heel[1], toe[1]) - (pat ? 0.3 : 0.42);
    for (let y = yTop; y < yBot; y += 0.08) ys.push(y);
    ys.push(yBot);
    const edge = ys.map((y) => { const xs = crossings(mappedS, y); return [xs[0] + inset, xs[xs.length - 1] - inset]; });
    const panel = [...ys.flatMap((y, i) => [edge[i][0], y]), ...[...ys].reverse().flatMap((y, i) => [edge[ys.length - 1 - i][1], y])];
    if (modPh?.panel) panel.splice(0, panel.length, ...roundCorners(modPh.panel, 0.08));
    if (v.texture === 'axg') panel.splice(0, panel.length, ...roundCorners(AXG_PANEL, 0.08));
    const outline = polyPath(panel, same, true);
    // The factory modules keep their molded panel lines from the patent; the texture inside is the shared 0.1" dots.
    if (modPh && !modPh.kind) {
      // The X-Series grip as the photos show it: a fine-stippled main panel around the Sig roundel, strips down both straps.
      const [lx, ly, lr] = MODULE_LOGO;
      // Sig's texture is a fine random stipple: dots on a 0.065" grid, each nudged by a fixed pseudo-random amount.
      const jit = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return (h - Math.floor(h) - 0.5) * 0.035; };
      const dots = (poly: number[]) => {
        const xs = poly.filter((_, i) => !(i % 2)), ys = poly.filter((_, i) => i % 2);
        let d = '';
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.065) for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.065) {
          const jx = x + jit(x, y), jy = y + jit(y, x);
          if (!inside(poly, jx - 0.04, jy) || !inside(poly, jx + 0.04, jy) || !inside(poly, jx, jy - 0.04) || !inside(poly, jx, jy + 0.04) || Math.hypot(jx - lx, jy - ly) < lr + 0.04) continue;
          d += `M${f(jx)},${f(jy)} L${f(jx + 0.012)},${f(jy)} `;
        }
        return d;
      };
      stipple = [MODULE_PANEL, ...MODULE_STRIPS].map(dots).join('');
      frameDetail += ' ' + [MODULE_PANEL, ...MODULE_STRIPS].map((q) => polyPath(roundCorners(q, 0.06), same, true)).join(' ') + ' ' + OC(lx, ly, lr)
    } else if (v.texture === 'x' || v.texture === 'patent') stipple = dotsIn(panel, 0.1, same, 0.06) + (modPh?.strips ?? []).map((q) => dotsIn(q, 0.06, same, 0.02)).join('');
    else if (v.texture === 'wilson') stipple = hatchIn(panel, 50, 0.13, same, 0.05) + hatchIn(panel, -50, 0.13, same, 0.05);
    else {
      // AXG: a G10 panel held by two screws on the alloy frame, a checkered field inside its raised rim, and
      // serrations down the back strap and front strap (all from the photo).
      const offScrew = (x: number, y: number) => AXG_SCREWS.every(([sx, sy, sr]) => Math.hypot(x - sx, y - sy) > sr + 0.04);
      stipple = AXG_SCREWS.map(([sx, sy, sr]) => OC(sx, sy, sr) + ` M${f(sx - sr * 0.7)},${f(sy + sr * 0.7)} L${f(sx + sr * 0.7)},${f(sy - sr * 0.7)}`).join(' ')
        + ' ' + dotsIn(AXG_FIELD, 0.07, (x, y) => (offScrew(x, y) ? [x, y] : [NaN, NaN]), 0.03).replace(/M\S*NaN\S* L\S*NaN\S* /g, '')
        + ' ' + AXG_SERRATIONS.map((l) => polyPath(l, same, false)).join(' ');
      frameDetail += ' ' + polyPath(roundCorners(AXG_FIELD, 0.06), same, true);
    }
    if ((v.texture !== 'patent' && !modPh) || modPh?.kind) frameDetail += ' ' + outline;
    if (modPh) frameDetail += [...(modPh.strips ?? []).map((q) => polyPath(roundCorners(q, 0.03), same, true)), ...(modPh.lines ?? []).map((l) => polyPath(l.map((v, i) => (i % 2 || !face || v < face[0] - 0.6 ? v : v + faceShift)), same, false))].map((d) => ' ' + d).join('');
    // A photo-traced module's mag catch: its own button as the photo shows it, or the patent drawing's button placed
    // where that module's photo shows it.
    if (modPh?.catchPoly) frameDetail += ' ' + polyPath(roundCorners(modPh.catchPoly.outline, 0.04), same, true) + ' ' + modPh.catchPoly.ridges.map((l) => polyPath(l, same, false)).join(' ');
    else if (modPh?.catchRound) {
      const [cx, cy, cr] = modPh.catchRound, knurl = [...Array(16)].flatMap((_, i) => [cx + cr * Math.cos((i * Math.PI) / 8), cy + cr * Math.sin((i * Math.PI) / 8)]);
      frameDetail += ' ' + OC(cx, cy, cr) + ' ' + OC(cx, cy, cr + 0.05) + ' ' + hatchIn(knurl, 60, 0.05, same, 0.02) + ' ' + hatchIn(knurl, -60, 0.05, same, 0.02);
    } else if (modPh) {
      const [cdx, cdy] = modPh.catchShift ?? [0, 0];
      frameDetail += ' ' + MODULE_CATCH.map((l) => polyPath(l.map((v, i) => v + (i % 2 ? cdy : cdx)), same, false)).join(' ');
    }
  }
  const gF = fx(h1x + 0.15), dust = fx(mk.dust);
  let mapped: number[] = [];
  let photoTrig: { d: string; line: string; top: number; plate: string; yMB: number } | undefined;
  if (glock) {
    // The G42 drawing's detail lines are dotted CAD shading; draw Glock's own details on the traced outline instead.
    const traced = outlines[0].flatMap((_, i, a) => (i % 2 ? [] : frameMap(a[i], a[i + 1])));
    const SH = mk.sh, yRail = mk.railBottom;
    const grip9 = glockGrip(traced, { SH, hole: mk.hole, slim: o.slim, large: spec.large, grooves: spec.grooves, yGB: spec.gripH - SIGHT - BASE, sf: v.sf, timberwolf: v.timberwolf, flare: v.flare5 });
    mapped = grip9.pts;
    heel = grip9.heel;
    toe = grip9.toe;
    tang = grip9.tang;
    const M = (pts: number[]) => polyPath(pts, frameMap, false);
    // Frame rail line under the slide, the accessory rail with its slot, and checkering down the front of the guard.
    let rail = `M${f(fx(h1x + 0.1))},${f(yRail - 0.14)} L${f(dust - 0.08)},${f(yRail - 0.14)}`;
    // The slimline frames are rail-less unless it is the G43X rail frame.
    if (!o.slim || v.rail) for (const x of [dust - 0.42]) rail += ` M${f(x - 0.16)},${f(yRail - 0.14)} L${f(x - 0.16)},${f(yRail)} M${f(x)},${f(yRail - 0.14)} L${f(x)},${f(yRail)}`;
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
      + O2(xt - 0.22, SH + 0.3, 0.05) + O2(xt + 0.66, SH + 0.3, 0.05) + O2(0.5, SH + 0.22, v.seam ? 0.07 : 0.05);
    // Gen4/Gen5 frames have the larger reversible mag catch and a seam around the removable back strap.
    const cw = v.bigCatch ? 0.26 : 0.16, ch0 = v.bigCatch ? 0.06 : 0.1, ch1 = v.bigCatch ? 0.5 : 0.42;
    const catchD = M([h0x - 0.1, h0y + ch0, h0x - 0.1, h0y + ch1, h0x - 0.1 - cw, h0y + ch1, h0x - 0.1 - cw, h0y + ch0, h0x - 0.1, h0y + ch0]);
    let seam = '';
    if (v.seam) {
      const sy: number[] = [];
      for (let y = SH + 1.15; y < heel[1] - 0.3; y += 0.1) sy.push(y);
      seam = 'M' + sy.map((y) => `${f(crossings(mapped, y)[0] + 0.1)},${f(y)}`).join(' L');
    }
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
    frameDetail = `${rail} ${check} ${controls} ${catchD} ${frameLine} ${panel} ${seam}`;
    // Slide: the top bevel and lower edge lines, rear (and optional front) serrations, extractor and muzzle face.
    const lines = `M0.05,0.12 L${f(SL - 0.1)},0.12 M0.1,${f(SH - 0.18)} L${f(SL - 0.48)},${f(SH - 0.18)}`;
    // Glock serrations are straight vertical grooves, not slanted.
    // Aftermarket slides (Grey Ghost, ZEV, Zaffiri) cut theirs on a slant and chamfer the top edge; Gen5 bevels the muzzle end.
    const lean = v.slide === 'ggp' || v.slide === 'zev' || v.slide === 'zaffiri' ? 0.14 : 0;
    const rearSerr = repeat(0.24, 1.12, 0.11, (x) => `M${x},0.2 L${f(x + lean)},${f(SH - 0.24)}`);
    const fSerr = o.frontSerr ? repeat(SL - 1.45, SL - 0.8, 0.12, (x) => `M${x},0.2 L${f(x + lean)},${f(SH - 0.3)}`) : '';
    const chamfer = lean ? `M1.3,0.3 L${f(SL - 0.5)},0.3` : v.slide === 'gen5' ? `M${f(SL - 0.22)},0.12 L${f(SL - 0.06)},${f(SH - 0.3)}` : '';
    const extractor = `M${f(port0 - 0.7)},0.24 L${f(port0 - 0.04)},0.24 L${f(port0 - 0.04)},0.42 L${f(port0 - 0.7)},0.42 Z`;
    const face = `M${f(SL - 0.05)},${f(mk.bore - 0.2)} L${f(SL - 0.05)},${f(mk.bore + 0.2)}`;
    slideDetail = `${lines} ${rearSerr} ${fSerr} ${extractor} ${face} ${chamfer}`;
    const ph = spec.photo ? GLOCK_PHOTOS[spec.photo] : undefined;
    if (ph) {
      // A frame measured from a photo replaces the patent-based frame, and the slide gets the photo's serrations.
      const pf = glockPhotoFrame(ph, { dust, yRail, rail: !o.slim || v.rail, seam: v.seam });
      ({ mapped, heel, toe, tang, hole, frameDetail, stipple } = pf);
      const sr = ph.serrations;
      const grooves = (xs: number[]) => xs.map((x) => `M${f(x)},${sr.y0} L${f(x + lean)},${sr.y1} M${f(x + sr.w)},${sr.y0} L${f(x + sr.w + lean)},${sr.y1}`).join(' ');
      const fx0 = SL - 1.5;
      slideDetail = `${lines} ${grooves(sr.x)} ${o.frontSerr ? grooves(sr.x.slice(0, 5).map((x) => fx0 + (x - sr.x[0]))) : ''} ${extractor} ${face} ${chamfer}`;
      photoTrig = { d: ph.trigger, line: ph.triggerLine, top: ph.hole[1], plate: polyPath(ph.plate, same, true), yMB: Math.max(...ph.plate.filter((_, i) => i % 2)) };
    }
  }
  if (key === 'hellcat') slideDetail += ' ' + (v.slide === 'apex' || v.slide === 'tp' ? aftermarketSerr(SL, mk.sh, port1, v.slide) : HELLCAT_SERR.map((p) => polyPath(scS(p.pts), slideMap, p.close)).join(' '));
  if (key === 'mp') slideDetail += ' ' + mpSerr(SL, mk.sh);
  if (key === 'mp') {
    // Slide stop lever and the knurled takedown lever with its pin, where the M&P photo shows them.
    const y0 = mk.sh + 0.08, y1 = mk.sh + 0.33, a = fx(1.95), b = fx(2.95);
    frameDetail += ` M${f(a + 0.08)},${f(y0)} L${f(b - 0.06)},${f(y0)} Q${f(b)},${f(y0)} ${f(b)},${f(y0 + 0.06)} L${f(b)},${f(y1 - 0.06)} Q${f(b)},${f(y1)} ${f(b - 0.06)},${f(y1)} L${f(a + 0.08)},${f(y1)} Q${f(a)},${f(y1)} ${f(a)},${f(y1 - 0.08)} L${f(a)},${f(y0 + 0.08)} Q${f(a)},${f(y0)} ${f(a + 0.08)},${f(y0)} Z`
      + repeat(a + 0.12, a + 0.42, 0.075, (x) => ` M${x},${f(y0 + 0.05)} L${x},${f(y1 - 0.05)}`)
      + ` M${f(fx(3.12) + 0.06)},${f(mk.sh + 0.07)} L${f(fx(3.9) - 0.06)},${f(mk.sh + 0.07)} Q${f(fx(3.9))},${f(mk.sh + 0.07)} ${f(fx(3.9))},${f(mk.sh + 0.13)} L${f(fx(3.9))},${f(mk.sh + 0.26)} Q${f(fx(3.9))},${f(mk.sh + 0.32)} ${f(fx(3.9) - 0.06)},${f(mk.sh + 0.32)} L${f(fx(3.12) + 0.06)},${f(mk.sh + 0.32)} Q${f(fx(3.12))},${f(mk.sh + 0.32)} ${f(fx(3.12))},${f(mk.sh + 0.26)} L${f(fx(3.12))},${f(mk.sh + 0.13)} Q${f(fx(3.12))},${f(mk.sh + 0.07)} ${f(fx(3.12) + 0.06)},${f(mk.sh + 0.07)} Z`
      + repeat(fx(3.2), fx(3.82), 0.06, (x) => ` M${x},${f(mk.sh + 0.1)} L${x},${f(mk.sh + 0.29)}`)
      + ` ${OC(fx(4.0), mk.sh + 0.2, 0.07)}`;
  }
  if (key === 'hellcat') {
    // Takedown lever and slide stop on the frame flat, in place of the drawing's molded contour lines.
    frameDetail += ` ${OC(fx(2.4), mk.railBottom + 0.32, 0.17)} ${OC(fx(2.4), mk.railBottom + 0.32, 0.06)} M${f(fx(2.0))},${f(mk.railBottom + 0.1)} L${f(fx(1.75))},${f(mk.railBottom + 0.1)} Q${f(fx(1.6))},${f(mk.railBottom + 0.12)} ${f(fx(1.6))},${f(mk.railBottom + 0.24)} L${f(fx(1.62))},${f(mk.railBottom + 0.3)} L${f(fx(1.95))},${f(mk.railBottom + 0.28)}`;
  }
  const yGB = Math.max(heel[1], toe[1]);
  // The P320's photo-traced triggers keep their size unless a module's guard is too short for them; then they shorten to clear it by 0.08".
  const reachP320 = (d: string) => {
    if (key !== 'p320') return d;
    const k = Math.min(1, (h1y - 0.08 - h0y) / (o.flat ? 0.949 : 0.844));
    let i = 0;
    return d.replace(/-?\d*\.?\d+/g, (n) => (i++ % 2 ? n3(h0y + (+n - h0y) * k) : n));
  };
  const trigLine = o.flat ? TRIGGERS[key].line.flat : TRIGGERS[key].line.curved;
  // A slide longer than the frame (G34 on a G17 frame, G47 or G19X on a G45 frame): ahead of the dust cover the
  // slide's nose comes down around the recoil spring, about 0.4" below the slide flats on the photos.
  const fF = glock && spec.photo ? Math.max(...mapped.filter((_, i) => !(i % 2))) : SL;
  const ny = mk.sh + 0.4;
  const slideNose = SL > fF + 0.1 ? ` M${f(fF)},${f(mk.sh)} L${f(SL)},${f(mk.sh)} L${f(SL)},${f(ny - 0.12)} Q${f(SL)},${f(ny)} ${f(SL - 0.12)},${f(ny)} L${f(fF)},${f(ny)} Z` : '';
  // On a photo-traced module the frame runs forward under the slide; the slide's nose is only the narrow block around
  // the recoil spring in front of the frame's face, with a rounded bottom corner, as the photos show.
  const photoSlide = (faceX: number, noseY: number) => {
    const r = 0.06;
    return slideCut.map((ol) => polyPath(ol, same, true)).join(' ')
      + ` M${f(faceX)},${f(mk.sh)} L${f(noseX1)},${f(mk.sh)} L${f(noseX1)},${f(noseY - r)} Q${f(noseX1)},${f(noseY)} ${f(noseX1 - r)},${f(noseY)} L${f(faceX)},${f(noseY)} Z`;
  };
  return {
    key, SL, muzzle: sx(mk.muzzle), tang, bc: mk.bore, springY: mk.spring, sh: mk.sh,
    port0, port1, portH: R.portH,
    xt: photoTrig ? 3.5 : TRIGGERS[key].face, trigTop: photoTrig?.top ?? h0y,
    trigD: photoTrig?.d ?? reachP320(scD((o.flat ? TRIGGERS[key].flat : TRIGGERS[key].curved)(h0y - dy) + (v.hook && TRIGGERS[key].hook ? ' ' + TRIGGERS[key].hook : ''))),
    trigLine: photoTrig?.line ?? reachP320(scD(typeof trigLine === 'string' ? trigLine : trigLine(h0y - dy))),
    gF, dust, railY: mk.railBottom, fcuX0,
    heel, toe, yGB, yMB: photoTrig ? photoTrig.yMB + ext : yGB + ext + BASE, ext, plateD: photoTrig?.plate,
    frameD: (glock ? polyPath(mapped, (x, y) => [x, y], true) : modOl ? polyPath(modOl, same, true) : outlines.map((ol) => polyPath(ol, frameMap, true)).join(' ')) + ' ' + hole,
    frameDetail, stipple,
    slideD: face && modPh?.nose ? photoSlide(face[0], modPh.nose[0]) : pr.slide.outline.map((ol) => polyPath(scS(ol), slideMap, true)).join(' ') + slideNose,
    slideDetail,
    windowD: win ? polyPath(win, grip, true) : '',
  };
}

function profilePieces(P: Piece[], g: ProfileGeo, o: {
  T: ReturnType<typeof makeT>; px: (x: number, y: number) => [number, number];
  frameSlot: string; trig: string; flat: boolean; comp: boolean; cut: string; lighten: boolean; SL: number;
  own: (slot: string) => string; mag: 'oem' | 'pmag' | 's15' | 'ets';
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
  // Floor plates: Glock's and Sig's flat plates with a lip at the front; Magpul's deeper plate with its rounded front and dot
  // matrix; Shield's thin stamped steel plate. An extended body carries round-count windows down its spine; ETS bodies are
  // translucent, so the rounds inside show.
  const pm = o.mag === 'pmag', s15 = o.mag === 's15';
  const floor = pm
    ? `M${f(hx + 0.04)},${f(hy)} L${f(tx - 0.02)},${f(ty)} L${f(tx + 0.05)},${f(ty + e + 0.02)} Q${f(tx + 0.1)},${f(ty + bb - 0.02)} ${f(tx - 0.1)},${f(ty + bb)} L${f(hx + 0.1)},${f(hy + bb)} Q${f(hx - 0.06)},${f(hy + bb)} ${f(hx - 0.03)},${f(hy + e + 0.03)} Z`
    : s15
      ? `M${f(hx + 0.04)},${f(hy)} L${f(tx - 0.02)},${f(ty)} L${f(tx + 0.01)},${f(ty + e + 0.03)} L${f(tx + 0.01)},${f(ty + bb - 0.05)} L${f(hx - 0.01)},${f(hy + bb - 0.05)} L${f(hx - 0.01)},${f(hy + e + 0.03)} Z`
      : `M${f(hx + 0.04)},${f(hy)} L${f(tx - 0.02)},${f(ty)} L${f(tx + 0.03)},${f(ty + e + 0.03)} Q${f(tx + 0.07)},${f(ty + bb)} ${f(tx - 0.06)},${f(ty + bb)} L${f(hx + 0.08)},${f(hy + bb)} Q${f(hx - 0.05)},${f(hy + bb - 0.02)} ${f(hx - 0.02)},${f(hy + e + 0.04)} Z`;
  let extLines = '';
  if (e > 0.25) {
    if (o.mag === 'ets') for (let t = 0.22; t < e - 0.05; t += 0.2) extLines += `M${f(hx + 0.3)},${f(hy + t - 0.07)} L${f(tx - 0.55)},${f(ty + t - 0.07)} Q${f(tx - 0.35)},${f(ty + t - 0.06)} ${f(tx - 0.25)},${f(ty + t)} Q${f(tx - 0.35)},${f(ty + t + 0.06)} ${f(tx - 0.55)},${f(ty + t + 0.07)} L${f(hx + 0.3)},${f(hy + t + 0.07)} Z `;
    else for (let t = 0.25; t < e - 0.1; t += 0.32) extLines += OC(hx + 0.17, hy + t, 0.03) + ' ';
  }
  const seam = pm ? `M${f(hx + 0.06)},${f(hy + e + 0.08)} L${f(tx)},${f(ty + e + 0.08)} ${OC((hx + tx) / 2 - 0.25, hy + bb - 0.1, 0.012)} ${OC((hx + tx) / 2, hy + bb - 0.1, 0.012)} ${OC((hx + tx) / 2 + 0.25, hy + bb - 0.1, 0.012)}`
    : s15 ? `M${f(hx + 0.03)},${f(hy + e + 0.03)} L${f(tx - 0.01)},${f(ty + e + 0.03)}`
      : `M${f(hx + 0.1)},${f(hy + bb - 0.07)} L${f(tx - 0.08)},${f(ty + bb - 0.07)}`;
  const photoPlate = g.plateD && o.mag === 'oem' && e < 0.05;
  P.push({ slot: o.own('mag'), z: 2, row: 'bottom', target: px((hx + tx) / 2, (hy + ty) / 2 + bb - 0.06),
    el: <>
      {g.windowD && <path d={T(g.windowD)} />}
      <path d={T(photoPlate ? g.plateD! : floor)} />
      {!photoPlate && <path className="detail" d={T(`${seam} ${extLines}`)} />}
    </> });

  /* Trigger: hangs from the top of the guard opening, shaped as in the patents (which show it as a broken line) */
  const { xt, trigTop: yT } = g;
  P.push({ slot: o.trig, z: 5, row: 'bottom', target: px(xt - 0.1, yT + 0.55),
    el: <>
      <path d={T(g.trigD)} />
      <path className="detail" d={T(g.trigLine)} />
      {o.trig === 'fcu' && (() => { const x0 = Math.max(-g.tang + 0.62, g.fcuX0); return <path className="hidden-line" d={T(`M${f(x0)},${f(g.sh + 0.06)} L${f(xt + 0.9)},${f(g.sh + 0.06)} L${f(xt + 0.9)},${f(yT - 0.04)} L${f(x0)},${f(yT - 0.04)} Z`)} />; })()}
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
 *  Open emitters (RMR and RMRcc, SRO, Holosun 407/507 C and K, Romeo1Pro and RomeoX, RomeoZero, Shield RMSc, Venom,
 *  DeltaPoint Pro) have the window hood at the front, high, sloping down to the emitter housing at the rear; each has its
 *  own hood height, housing and battery arrangement. Enclosed emitters (Acro, EPS Carry, MPS) are a box with a lens at
 *  each end, laid out as in Aimpoint's Acro design patent (US D881,320 FIG. 4): battery cap mid-side, adjuster behind it,
 *  clamp along the bottom; Steiner's MPS is squarer with its battery cap on top. */
function pistolOptic(o: Part | undefined, fp: string): { od: string; odet: string; len: number; h: number } {
  const holo = o?.brand === 'Holosun';
  const small = fp === 'rmsc' || fp === 'rmrcc' || fp === 'k';
  const kind = matches(o, /MPS/) ? 'mps' : fp === 'acro' || matches(o, /EPS|enclosed/i) ? 'enclosed'
    : matches(o, /SRO/) ? 'sro' : matches(o, /DeltaPoint/) ? 'dpp' : matches(o, /Venom/) ? 'venom' : matches(o, /RomeoZero/) ? 'r0'
    : o?.brand === 'Shield' ? 'rmsc' : matches(o, /RomeoX/) ? 'romeox' : matches(o, /Romeo1/) ? 'romeo1' : holo ? (small ? 'holok' : 'holo') : small ? 'rmrcc' : 'rmr';
  if (kind === 'enclosed' || kind === 'mps') {
    const mps = kind === 'mps';
    const L = fp === 'acro' ? (mps ? 1.85 : 2.05) : 1.8, H = mps ? 1.1 : fp === 'acro' ? 1.22 : 1.0;
    const r = 0.06;
    // The Acro and EPS round their top corners and hood the front lens; the MPS chamfers its top front.
    const od = mps
      ? `M0.04,0 L0.06,${f(-H + 0.08)} Q0.07,${-H} 0.16,${-H} L${f(L - 0.5)},${-H} L${f(L - 0.1)},${f(-H + 0.34)} L${f(L - 0.04)},${f(-0.3)} L${L},${f(-0.24)} L${f(L - 0.02)},0 Z`
      : `M0.04,0 L0.08,${f(-H + r)} Q0.09,${-H} ${f(r + 0.09)},${-H} L${f(L - 0.16)},${-H} Q${f(L - 0.04)},${-H} ${f(L - 0.02)},${f(-H + 0.12)} L${L},${f(-H + 0.2)} L${f(L - 0.04)},${f(-H + 0.26)} L${f(L - 0.04)},${f(-0.3)} L${L},${f(-0.24)} L${f(L - 0.02)},0 Z`;
    const cy = -H * 0.56, cr = H * 0.27;
    let ticks = '';
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      ticks += `M${f(L * 0.5 + Math.cos(t) * cr * 0.84)},${f(cy + Math.sin(t) * cr * 0.84)} L${f(L * 0.5 + Math.cos(t) * cr)},${f(cy + Math.sin(t) * cr)} `;
    }
    // The Acro's battery cap is the big ring on the side; the MPS has a plain lens ring there and its cap on top.
    const cap = mps ? OC(L * 0.5, cy, cr) + ' ' + OC(L * 0.5, cy, cr * 0.88) : OC(L * 0.5, cy, cr) + ' ' + OC(L * 0.5, cy, cr * 0.8) + ' ' + ticks;
    const top = mps
      ? `M0.26,${-H} L0.26,${f(-H - 0.08)} L0.68,${f(-H - 0.08)} L0.68,${-H} M0.14,${f(-H + 0.06)} L${f(L - 0.5)},${f(-H + 0.06)}`
      : `M0.3,${-H} L0.3,${f(-H - 0.04)} L0.62,${f(-H - 0.04)} L0.62,${-H} M0.1,${f(-H + 0.06)} L${f(L - 0.12)},${f(-H + 0.06)}`;
    const cross = mps ? '' : `M${f(L * 0.5 - 0.06)},${f(-H * 0.56)} L${f(L * 0.5 + 0.06)},${f(-H * 0.56)} M${f(L * 0.5)},${f(-H * 0.56 - 0.06)} L${f(L * 0.5)},${f(-H * 0.56 + 0.06)}`;
    const adj = mps
      ? OC(L * 0.17, -H * 0.3, 0.05) + ' ' + OC(L * 0.17, -H * 0.62, 0.05) + ` M${f(L * 0.17 - 0.03)},${f(-H * 0.62)} L${f(L * 0.17 + 0.03)},${f(-H * 0.62)}`
      : OC(L * 0.2, -H * 0.42, H * 0.12) + ' ' + OC(L * 0.2, -H * 0.42, H * 0.05);
    const clamp = `M${f(L * 0.12)},-0.02 L${f(L * 0.12)},-0.2 Q${f(L * 0.12)},-0.26 ${f(L * 0.18)},-0.26 L${f(L * 0.66)},-0.26 Q${f(L * 0.72)},-0.26 ${f(L * 0.72)},-0.2 L${f(L * 0.72)},-0.02 `
      + OC(L * 0.42, -0.13, 0.07) + ` M${f(L * 0.42 - 0.04)},-0.13 L${f(L * 0.42 + 0.04)},-0.13`;
    // Lens hoods: the front and rear glass sit back inside a lip at each end.
    const lips = mps
      ? `M0.2,${f(-H + 0.12)} L0.17,-0.3 M${f(L - 0.2)},${f(-H + 0.42)} L${f(L - 0.16)},-0.3 M0.02,${f(-H + 0.12)} L${f(L - 0.2)},${f(-H + 0.12)}`
      : `M0.17,${f(-H + 0.12)} L0.13,-0.3 M${f(L - 0.14)},${f(-H + 0.1)} L${f(L - 0.14)},-0.3 M0.02,${f(-H + 0.12)} L${f(L - 0.04)},${f(-H + 0.12)}`;
    return { od, odet: `${cap} ${cross} ${adj} ${clamp} ${lips} ${top}`, len: L, h: H };
  }
  // Open emitters: length, hood height, housing height at the rear, where the hood starts to rise (k0) and reaches its
  // top (k1) as fractions of the length, and the hood frame's thickness.
  const OPEN: Record<string, { L: number; H: number; hb: number; k0: number; k1: number; t: number }> = {
    rmr: { L: 1.77, H: 1.0, hb: 0.42, k0: 0.48, k1: 0.64, t: 0.1 },
    rmrcc: { L: 1.62, H: 0.86, hb: 0.36, k0: 0.48, k1: 0.64, t: 0.09 },
    holo: { L: 1.77, H: 1.0, hb: 0.42, k0: 0.48, k1: 0.64, t: 0.1 },
    holok: { L: 1.62, H: 0.84, hb: 0.36, k0: 0.48, k1: 0.64, t: 0.09 },
    sro: { L: 1.77, H: 1.16, hb: 0.42, k0: 0.48, k1: 0.64, t: 0.08 },
    romeo1: { L: 1.85, H: 1.05, hb: 0.5, k0: 0.5, k1: 0.66, t: 0.1 },
    romeox: { L: 1.9, H: 1.1, hb: 0.5, k0: 0.5, k1: 0.66, t: 0.1 },
    venom: { L: 1.9, H: 1.02, hb: 0.46, k0: 0.5, k1: 0.66, t: 0.07 },
    dpp: { L: 1.82, H: 1.3, hb: 0.5, k0: 0.42, k1: 0.56, t: 0.07 },
    rmsc: { L: 1.65, H: 0.76, hb: 0.3, k0: 0.5, k1: 0.66, t: 0.06 },
    r0: { L: 1.68, H: 0.9, hb: 0.42, k0: 0.5, k1: 0.64, t: 0.11 },
  };
  const { L, H, hb, t } = OPEN[kind];
  const k0 = L * OPEN[kind].k0, k1 = L * OPEN[kind].k1;
  const sro = kind === 'sro', arch = sro || kind === 'dpp' || kind === 'venom';
  // Outline: low rear housing, then the hood rises to a flat top (or an arch on the big-window dots) and drops down a
  // near-upright front face; the RomeoZero's polymer hood is squared off.
  const top = arch
    ? `Q${f(k1 - 0.02)},${f(-H)} ${f((k1 + L) / 2)},${f(-H)} Q${f(L - 0.02)},${f(-H)} ${f(L - 0.02)},${f(-H + 0.3)}`
    : kind === 'r0'
      ? `L${f(k1 + 0.02)},${f(-H)} L${f(L - 0.04)},${f(-H)} L${f(L - 0.02)},${f(-H + 0.06)}`
      : `Q${f(k1 + 0.04)},${f(-H)} ${f(k1 + 0.14)},${f(-H)} L${f(L - 0.12)},${f(-H)} Q${f(L - 0.03)},${f(-H)} ${f(L - 0.02)},${f(-H + 0.1)}`;
  const od = `M0.02,0 L0.0,${f(-hb + 0.1)} Q0.0,${f(-hb)} 0.1,${f(-hb)} L${f(k0 - 0.14)},${f(-hb)} Q${f(k0)},${f(-hb)} ${f(k0 + 0.06)},${f(-hb - 0.1)} L${f(k1 - 0.06)},${f(-H + 0.12)} ${top} L${L},-0.1 L${f(L - 0.04)},0 Z`;
  // Details: the hood's inner edge, the base line, windage adjuster, elevation knob or top-loading battery cap,
  // brightness buttons, and Holosun's side battery tray.
  const face = arch
    ? `M${f(k0 + 0.14)},${f(-hb - 0.12)} L${f(k1 + 0.02)},${f(-H + 0.12 + t)} Q${f(k1 + 0.06)},${f(-H + t)} ${f((k1 + L) / 2)},${f(-H + t)} Q${f(L - 0.1)},${f(-H + t)} ${f(L - 0.1)},${f(-H + 0.32)} L${f(L - 0.1)},-0.2`
    : `M${f(k0 + 0.14)},${f(-hb - 0.12)} L${f(k1 + 0.02)},${f(-H + 0.08 + t)} Q${f(k1 + 0.08)},${f(-H + t)} ${f(k1 + 0.18)},${f(-H + t)} L${f(L - 0.14)},${f(-H + t)} Q${f(L - 0.1)},${f(-H + t)} ${f(L - 0.1)},${f(-H + t + 0.06)} L${f(L - 0.1)},-0.2`;
  const base = `M0.02,-0.12 L${f(L - 0.02)},-0.12`;
  const wind = OC(0.26, -hb * 0.55, 0.075) + ` M${f(0.21)},${f(-hb * 0.55 + 0.03)} L${f(0.31)},${f(-hb * 0.55 - 0.03)}`;
  // Romeo1Pro, RomeoX and Venom load the battery through a round cap on top of the housing; the DeltaPoint Pro through
  // a spring door at the rear; the rest from underneath, so they show the elevation screw on top instead.
  const topLoad = kind === 'romeo1' || kind === 'romeox' || kind === 'venom';
  const elev = topLoad
    ? `M${f(k0 - 0.58)},${f(-hb)} L${f(k0 - 0.58)},${f(-hb - 0.07)} Q${f(k0 - 0.56)},${f(-hb - 0.1)} ${f(k0 - 0.52)},${f(-hb - 0.1)} L${f(k0 - 0.2)},${f(-hb - 0.1)} Q${f(k0 - 0.16)},${f(-hb - 0.1)} ${f(k0 - 0.14)},${f(-hb - 0.07)} L${f(k0 - 0.14)},${f(-hb)} M${f(k0 - 0.46)},${f(-hb - 0.05)} L${f(k0 - 0.26)},${f(-hb - 0.05)}`
    : kind === 'dpp'
      ? `M0.06,${f(-hb)} L0.06,${f(-hb - 0.1)} L0.4,${f(-hb - 0.1)} L0.4,${f(-hb)} M0.1,${f(-hb - 0.05)} L0.36,${f(-hb - 0.05)}`
      : `M${f(k0 - 0.36)},${f(-hb)} L${f(k0 - 0.36)},${f(-hb - 0.05)} L${f(k0 - 0.16)},${f(-hb - 0.05)} L${f(k0 - 0.16)},${f(-hb)}`;
  const btn = (x: number) => `M${f(x)},${f(-0.2)} L${f(x)},${f(-0.3)} Q${f(x)},${f(-0.33)} ${f(x + 0.03)},${f(-0.33)} L${f(x + 0.13)},${f(-0.33)} Q${f(x + 0.16)},${f(-0.33)} ${f(x + 0.16)},${f(-0.3)} L${f(x + 0.16)},${f(-0.2)} Z`;
  const tray = holo ? `M${f(k0 - 0.02)},-0.14 L${f(k0 - 0.02)},${f(-hb + 0.04)} L${f(L - 0.2)},${f(-hb + 0.04)} L${f(L - 0.2)},-0.14 ${OC(k0 + 0.06, -0.24, 0.025)} ${OC(L - 0.28, -0.24, 0.025)}` : '';
  const btns = holo ? `${btn(0.4)} ${btn(0.6)}` : kind === 'r0' || kind === 'rmsc' ? `M0.14,${f(-hb)} L0.14,${f(-hb - 0.03)} L0.3,${f(-hb - 0.03)} L0.3,${f(-hb)}` : `${btn(k1 + 0.02)} ${btn(k1 + 0.24)}`;
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
  // What the chosen frame, grip module, slide and trigger change about the maker's drawing.
  const fr = b.frame, gr = b.grip, gen = String(fr?.attrs.gen ?? '');
  const wilson = gr?.brand === 'Wilson Combat', xs = matches(gr, /X-Series/), axg = matches(gr, /AXG/);
  const v: PistolVariants = {
    bigCatch: gen === 'gen4' || gen === 'gen5' || matches(fr, /Timberwolf|TWF/), seam: gen === 'gen4' || gen === 'gen5' || matches(fr, /Timberwolf/),
    sf: !!fr?.attrs.sf, flare5: gen === 'gen5', timberwolf: matches(fr, /Timberwolf/), rail: !!fr?.attrs.rail,
    beaver: wilson || axg, undercut: wilson || axg, flare: wilson,
    module: matches(gr, /X-Series Full/) ? 'xfull' : matches(gr, /X-Series Carry/) ? 'xcarry' : gr?.id === 'p-grip-sub' ? 'sub' : axg ? 'axg' : undefined,
    texture: wilson ? 'wilson' : axg ? 'axg' : xs ? 'x' : 'patent',
    slide: b.slide?.brand === 'Brownells' ? 'brownells' : matches(b.slide, /Combat Slide/) ? 'ggp' : matches(b.slide, /Octane/) ? 'zev' : matches(b.slide, /ZPS/) ? 'zaffiri'
      : b.slide?.brand === 'Apex Tactical' ? 'apex' : matches(b.slide, /Axiom/) ? 'tp' : matches(b.slide, /Gen5/) ? 'gen5' : 'oem',
    hook: matches(b[trig], /Timney/),
  };
  // Every pistol is drawn from its maker's patent drawing, fitted to each size.
  const geo = profileGeometry(PROFILE_FOR[platform.id] ?? (sig ? 'p320' : 'glock'), spec, {
    slim: platform.id === 'glock43x', frontSerr: matches(b.slide, /serration|Gen5|MOS|ZEV|Spectre|XFull|M18|ZPS/i), flat, v,
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
  const magKind = matches(b.mag, /PMAG/) ? 'pmag' : matches(b.mag, /S15/) ? 's15' : b.mag?.brand === 'ETS' ? 'ets' : 'oem';
  profilePieces(P, geo, { T, px, frameSlot, trig: own(trig), flat, comp, cut, lighten, SL, own, mag: magKind });

  /* Barrel: hood shows in the ejection port; the rest is hidden; threads run past the slide */
  const br = micro ? 0.24 : 0.28;
  const chamber = f(port0 - 0.12);
  P.push({ slot: own('barrel'), z: 9, row: 'top', target: px((port0 + port1) / 2, 0.24),
    el: <>
      <path d={T(`M${f(port0 + 0.02)},0.06 L${f(port1 - 0.02)},0.06 L${f(port1 - 0.02)},0.48 L${f(port0 + 0.02)},0.48 Z M${f(port0 + 0.16)},0.06 L${f(port0 + 0.16)},0.48`)} />
      {matches(b.barrel, /Fluted/) && <path className="detail" d={T(repeat(port0 + 0.3, port1 - 0.2, 0.22, (x) => `M${x},0.12 L${f(x + 0.1)},0.42`))} />}
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
  // Gen4/Gen5 Glocks run a dual spring: a second, shorter coil around the inner one.
  const dual = matches(b[has('rsa') ? 'rsa' : 'spring'], /Dual/);
  P.push({ slot: springSlot, internal: true, z: 20, row: 'top', target: px(SL - 1.5, sy),
    el: <path d={T(`M${f(port0 + 0.5)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy + 0.08)} L${f(port0 + 0.5)},${f(sy + 0.08)} Z ${repeat(port0 + 0.7, SL - 0.3, 0.15, (x) => `M${x},${f(sy - 0.12)} L${f(x + 0.08)},${f(sy + 0.12)}`)}${dual ? ` M${f(port0 + 0.5)},${f(sy - 0.16)} L${f(SL - 0.9)},${f(sy - 0.16)} M${f(port0 + 0.5)},${f(sy + 0.16)} L${f(SL - 0.9)},${f(sy + 0.16)}` : ''}`)} /> });
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
  // Plain polymer sights carry nothing; night sights carry their tritium vials, fiber sights a rod down the front post;
  // the HD XR, Perfect Dot and Trooper rears have a serrated face.
  const sp = b.sights;
  const night = !sp || matches(sp, /Tritium|Night/i), fiber = matches(sp, /Fiber|TFX/i), serr = matches(sp, /HD XR|Perfect Dot|Trooper|Bright & Tough/);
  const sightDet = `M${f(r0 + 0.04)},0.1 L${f(r1 - 0.04)},0.1 M${f(r0 + 0.04)},0.1 L${f(r0 + 0.1)},0 M${f(r1 - 0.04)},0.1 L${f(r1 - 0.1)},0 `
    + `M${f((r0 + r1) / 2 - 0.08)},${f(-sh)} L${f((r0 + r1) / 2 - 0.08)},${f(-sh + 0.09)} L${f((r0 + r1) / 2 + 0.08)},${f(-sh + 0.09)} L${f((r0 + r1) / 2 + 0.08)},${f(-sh)} `
    + (night ? O2((r0 + r1) / 2, -sh / 2 + 0.02, 0.045) : '') + ` M${f(fr0 + 0.04)},0.08 L${f(fr1 - 0.04)},0.08 ` + (night ? O2((fr0 + fr1) / 2, -sh / 2 + 0.02, 0.045) : '')
    + (fiber ? ` M${f(fr0 + 0.1)},${f(-sh / 2 + 0.02)} L${f(fr1 - 0.05)},${f(-sh / 2 + 0.02)} ${O2(fr0 + 0.12, -sh / 2 + 0.02, 0.03)}` : '')
    + (serr ? repeat(r1 - 0.3, r1 - 0.1, 0.07, (x) => `M${x},${f(-sh + 0.03)} L${x},-0.03`) : '');
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

/* ================================================================== render */

export function sceneFor(platform: Platform, build: Build, place: Placement = {}): Scene {
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
    ? (platform.family === 'Rifle' ? `20 60 ${scene.width - 40} ${scene.height - 140}` : '90 40 540 400')
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
