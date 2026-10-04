import { useRef, useState, type ReactNode } from 'react';
import { mountsFor } from './data/addons';
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

function rifle(platform: Platform, b: Build, place: Placement): Scene {
  const S = 22;
  const ox = 300;
  const oy = 170;
  const T = makeT(S, ox, oy);
  const big = platform.id === 'ar10';
  const kx = big ? 1.13 : 1; // AR-10 receivers are longer and taller
  const ky = big ? 1.08 : 1;
  const RF = 7 * kx; // front face of upper receiver
  const BF = RF - 0.55; // bolt face
  const P: Piece[] = [];
  const px = (x: number, y: number): [number, number] => [f(ox + x * S), f(oy + y * S)];
  const R = (d: string) => T(d, kx, ky); // receiver-group paths
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
  let rear: number;
  if (matches(stock, /A2/)) {
    const r = TE - 0.25;
    rear = r - 0.4;
    sd = `M${r},-1.2 Q${f(r + 0.4)},-1.27 ${f(r + 1.4)},-1.17 L${f(r + 9.35)},-0.64 L${f(r + 9.75)},-0.64 L${f(r + 9.75)},0.66 L${f(r + 9.3)},0.78 L${f(r + 2.4)},4.0 Q${f(r + 1.2)},4.45 ${r},4.5 Z M${f(rear)},-1.25 L${r},-1.22 L${r},4.52 L${f(rear)},4.48 Z M${f(r + 1.3)},3.6 Q${f(r + 3)},2.4 ${f(r + 6.2)},1.1`;
  } else if (matches(stock, /PRS|Precision/)) {
    const r = TE - 0.3;
    rear = r - 0.4;
    sd = `M${r},-1.95 L${f(r + 6.9)},-1.95 Q${f(r + 7.6)},-1.95 ${f(r + 7.9)},-1.35 L${f(r + 8.4)},-0.66 L${f(r + 9.6)},-0.66 L${f(r + 9.6)},0.66 L${f(r + 5.4)},1.05 L${f(r + 5.2)},2.75 L${f(r + 3.6)},2.75 L${f(r + 3.4)},1.95 L${f(r + 1.6)},4.25 Q${f(r + 1.2)},4.5 ${r},4.5 Z M${f(rear)},-1.98 L${r},-1.95 L${r},4.5 L${f(rear)},4.46 Z M${f(r + 0.6)},-1.35 L${f(r + 6.8)},-1.35 M${f(r + 3.7)},2.35 L${f(r + 5.1)},2.35`;
  } else {
    const ubr = matches(stock, /UBR/);
    const r = TE - 0.15;
    rear = r - 0.4;
    sd = ubr
      ? `M${r},-1.35 L${f(r + 6.4)},-0.95 Q${f(r + 6.8)},-0.92 ${f(r + 6.8)},-0.6 L${f(r + 6.8)},0.7 Q${f(r + 6.8)},0.95 ${f(r + 6.4)},1.0 L${f(r + 2.6)},1.45 L${f(r + 0.9)},4.25 Q${f(r + 0.7)},4.45 ${r},4.45 Z M${f(rear)},-1.4 L${r},-1.35 L${r},4.45 L${f(rear)},4.4 Z M${f(r + 0.6)},-0.7 L${f(r + 5.9)},-0.45 M${f(r + 1.6)},3.4 L${f(r + 2.8)},1.6`
      : `M${r},-1.12 L${f(r + 0.55)},-1.12 L${f(r + 5.6)},-0.84 Q${f(r + 5.95)},-0.82 ${f(r + 5.95)},-0.55 L${f(r + 5.95)},0.64 Q${f(r + 5.9)},0.88 ${f(r + 5.55)},0.9 L${f(r + 3.25)},1.12 Q${f(r + 2.45)},1.26 ${f(r + 1.9)},1.95 L${f(r + 0.8)},3.95 Q${f(r + 0.62)},4.2 ${f(r + 0.3)},4.2 L${r},4.2 Z M${f(rear)},-1.16 L${r},-1.12 L${r},4.2 L${f(rear)},4.16 Z M${f(r + 1.2)},-0.62 L${f(r + 4.9)},-0.48 M${f(r + 3.6)},0.95 L${f(r + 4.4)},1.25 L${f(r + 4.9)},0.88`;
  }
  const padTop = matches(stock, /PRS|Precision/) ? -1.9 : matches(stock, /A2/) ? -1.15 : matches(stock, /UBR/) ? -1.3 : -1.08;
  const padBot = matches(stock, /PRS|Precision|A2/) ? 4.42 : matches(stock, /UBR/) ? 4.36 : 4.12;
  const stockDet = `${repeat(padTop + 0.25, padBot - 0.2, 0.22, (y) => `M${f(rear + 0.08)},${y} L${f(rear + 0.32)},${y}`)} ${O2(rear + 1.3, padTop + 0.55, 0.16)} ${O2(rear + 1.3, padTop + 0.55, 0.07)}`;
  P.push({ slot: 'stock', z: 2, row: 'bottom', target: px(rear + 2.2, 1.6), el: <><path d={T(sd)} /><path className="detail" d={T(stockDet)} /></> });

  // Lower receiver
  P.push({ slot: 'lower', z: 4, row: 'bottom', target: px(5.3 * kx, 2.3 * ky),
    el: <>
      <path d={R('M-0.55,-0.45 Q-0.55,-0.62 -0.35,-0.62 L0,-0.62 L0,0.72 L6.6,0.72 Q7.05,0.72 7.05,1.05 Q7.05,1.36 6.75,1.36 L6.5,1.36 L6.58,2.94 Q6.58,3.1 6.42,3.1 L3.96,3.1 Q3.84,3.1 3.84,2.95 L3.84,1.45 L1.15,1.45 Q0.6,1.45 0.35,1.22 L-0.25,0.95 Q-0.55,0.84 -0.55,0.58 Z')} />
      <path className="detail" d={R('M4.05,1.3 L6.35,1.3 M4.15,2.9 L6.4,2.9') + O(0.45, 0.98, 0.12) + O(6.8, 1.04, 0.12)} />
    </> });

  // Lower parts kit: controls and trigger guard
  P.push({ slot: 'lpk', z: 6, row: 'bottom', target: px(1.25 * kx, 1.05 * ky),
    el: <path d={O(1.25, 1.05, 0.22) + R(' M1.25,1.05 L1.62,0.82 M2.05,1.45 L2.2,1.45 L2.2,1.95 Q2.2,2.02 2.3,2.02 L3.84,2.02 L3.84,2.16 L2.3,2.16 Q2.05,2.16 2.05,1.95 Z M5.95,1.58 L6.32,1.58 L6.32,1.9 L5.95,1.9 Z M3.95,0.8 L4.45,0.8 L4.45,1.22 L4.1,1.22 Z')} /> });
  P.push({ slot: 'trigger', z: 6, row: 'bottom', target: px(2.82 * kx, 1.9 * ky),
    el: <path d={R('M2.72,1.45 Q2.6,1.75 2.78,2.0 L2.9,1.98 Q2.76,1.75 2.87,1.45 Z')} /> });

  // Pistol grip: drawn at its own angle (steeper grips stand more upright), with a beavertail at the top,
  // a palm swell on the back strap, a stippled panel and the bottom plug. Finger-groove grips get grooves.
  const gr = b.grip;
  const sh = matches(gr, /vertical/i) ? 0.15 : matches(gr, /steep/i) ? 0.08 : 0;
  const grooved = matches(gr, /finger groove/i);
  const g = (x: number, y: number) => `${f(x + (y - 1.42) * sh)},${f(y)}`;
  const gFront = grooved
    ? `L${g(1.86, 2.36)} Q${g(1.62, 2.62)} ${g(1.8, 2.86)} Q${g(1.56, 3.18)} ${g(1.62, 3.4)} Q${g(1.38, 3.74)} ${g(1.46, 3.98)} L${g(1.2, 4.62)}`
    : `L${g(1.86, 2.36)} Q${g(1.7, 2.8)} ${g(1.66, 3.06)} L${g(1.2, 4.62)}`;
  // The top follows the lower receiver's tang, so the beavertail tucks up under it with no gap.
  const gripD = `M0.35,1.23 Q0.62,1.46 1.15,1.46 L${g(1.98, 1.46)} Q${g(2.1, 1.52)} ${g(2.05, 1.68)} ${gFront} Q${g(1.1, 4.94)} ${g(0.82, 4.96)} L${g(-0.42, 4.88)} Q${g(-0.72, 4.84)} ${g(-0.68, 4.58)} L${g(0.02, 2.5)} Q${g(0.16, 2.0)} ${g(-0.06, 1.62)} Q${g(-0.2, 1.3)} -0.02,1.07 Z`;
  let gripTex = '';
  for (let y = 2.35; y < 4.45; y += 0.14) {
    const xa = 0.02 - (y - 2.5) * 0.338 + 0.22;
    const xb = (y < 3.06 ? 1.66 : 1.66 - (y - 3.06) * 0.29) - (grooved ? 0.34 : 0.22);
    const off = Math.round((y - 2.35) / 0.14) % 2 ? 0.07 : 0;
    for (let x = xa + off; x < xb; x += 0.14) gripTex += `M${g(x, y)} L${g(x + 0.015, y)} `;
  }
  P.push({ slot: 'grip', z: 5, row: 'bottom', target: px((0.6 + 2.0 * sh) * kx, 3.3 * ky),
    el: <>
      <path d={R(gripD)} />
      <path className="detail" d={R(`M${g(-0.58, 4.62)} L${g(1.16, 4.72)} M${g(0.1, 2.2)} L${g(1.7, 2.24)}`)} />
      <path className="detail stipple" d={R(gripTex)} />
    </> });

  // Magazine
  P.push({ slot: 'mag', z: 3, row: 'bottom', target: px(big ? 5.5 * kx : 6.2, big ? 6.2 : 6.6),
    el: big
      ? <><path d={T('M3.98,3.0 L6.55,3.0 C6.65,4.8 6.85,6.4 7.05,7.75 L7.1,7.98 L4.6,8.12 L4.55,7.9 C4.3,6.3 4.1,4.7 3.98,3.0 Z', kx, 1)} /><path className="detail" d={T('M4.2,4.4 L6.65,4.32 M4.35,5.8 L6.85,5.7 M4.5,7.2 L7.0,7.1', kx, 1)} /></>
      : <><path d={T('M4.0,3.0 L6.35,3.0 C6.6,4.8 7.0,6.6 7.65,8.4 L7.72,8.66 L5.56,9.06 L5.46,8.82 C4.85,7.0 4.35,5.0 4.0,3.0 Z')} /><path className="detail" d={T('M4.25,4.3 L6.6,4.2 M4.6,5.7 L6.95,5.55 M5.05,7.1 L7.3,6.9')} /></> });

  // Upper receiver
  P.push({ slot: 'upper', z: 7, row: 'top', target: px(1.4 * kx, -0.55 * ky),
    el: <>
      <path d={R('M0.05,-1.1 L6.95,-1.1 L6.95,-0.9 L6.95,0.55 L6.6,0.72 L0.9,0.72 L0.9,0.4 L0.05,0.4 Z')} />
      <path className="detail" d={R(`M0.05,-0.9 L6.95,-0.9 ${pic(0.25, 6.85, -1.1)} M2.3,-0.38 L5.0,-0.38 L5.0,0.3 L2.3,0.3 Z M2.3,0.2 L5.0,0.2 M4.55,-0.38 L4.55,-0.18 L4.8,-0.18 L4.8,-0.38 M0.75,-0.58 Q1.65,-0.62 1.95,-0.2 L1.95,0.12 Q1.55,0.36 0.75,0.32 M2.05,-0.58 Q2.25,-0.62 2.25,-0.38 M0.1,0.4 L0.1,0.12 M6.25,-0.9 L6.25,0.55 M6.45,0.15 L6.95,0.15`) + O(1.12, -0.12, 0.17) + O(1.12, -0.12, 0.08)} />
    </> });
  P.push({ slot: 'charging', z: 8, row: 'top', target: px(-0.55 * kx, -0.62 * ky),
    el: <path d={R('M-0.78,-0.76 L0.05,-0.76 L0.05,-0.5 L-0.78,-0.5 Q-0.98,-0.53 -0.98,-0.63 Q-0.98,-0.73 -0.78,-0.76 Z')} /> });
  P.push({ slot: 'bcg', internal: true, z: 20, row: 'top', target: px(2.4 * kx, 0.3 * ky),
    el: <path d={R('M0.4,-0.45 L5.85,-0.45 L5.85,0.45 L0.4,0.45 Z M3.2,-0.45 L3.2,-0.76 L4.6,-0.76 L4.6,-0.45 M5.85,-0.3 L6.45,-0.3 L6.45,0.3 L5.85,0.3')} /> });

  // Barrel, gas system, handguard, muzzle
  const L = typeof b.barrel?.attrs.length === 'number' ? b.barrel.attrs.length : big ? 18 : 16;
  const BX = BF + L; // muzzle
  const gas = (b.barrel?.attrs.gas as string) ?? (b.gastube?.attrs.length as string) ?? 'midlength';
  const GX = BF + GAS_FROM_BOLT[gas];
  const hg = b.handguard;
  const freeFloat = hg ? hg.attrs.freeFloat !== false : true;
  const H = typeof hg?.attrs.length === 'number' ? hg.attrs.length : freeFloat ? (big ? 15 : 13.5) : 9;
  const HX = RF + H;
  const fsb = b.gasblock?.attrs.profile === 'fsb';

  P.push({ slot: 'barrel', z: 9, row: 'top', target: px(Math.max(HX, GX + 0.6) + (BX - Math.max(HX, GX + 0.6)) / 2, 0.3),
    el: <>
      <path d={T(`M${f(RF)},-0.42 L${f(GX)},-0.375 L${f(GX + 0.9)},-0.31 L${f(BX)},-0.29 L${f(BX)},0.29 L${f(GX + 0.9)},0.31 L${f(GX)},0.375 L${f(RF)},0.42 Z`)} />
      <path className="hidden-line" d={T(`M${f(BF)},-0.5 L${f(RF)},-0.5 M${f(BF)},0.5 L${f(RF)},0.5`)} />
    </> });
  P.push({ slot: 'gastube', internal: true, z: 21, row: 'top', target: px((4.6 * kx + GX) / 2, -0.62),
    el: <path d={T(`M${f(4.6 * kx)},-0.62 L${f(GX)},-0.62`)} /> });
  P.push({ slot: 'gasblock', internal: !fsb && GX + 0.6 < HX, z: fsb ? 12 : 10, row: 'top', target: px(GX + 0.1, fsb ? -2.0 : -0.3),
    el: fsb
      ? <>
          <path d={T(`M${f(GX - 0.62)},-0.98 L${f(GX + 0.62)},-0.98 L${f(GX + 0.62)},0.62 L${f(GX - 0.62)},0.62 Z M${f(GX - 0.42)},-0.98 Q${f(GX - 0.5)},-2.42 ${f(GX - 0.16)},-2.47 L${f(GX + 0.16)},-2.47 Q${f(GX + 0.5)},-2.42 ${f(GX + 0.42)},-0.98 M${f(GX)},0.62 L${f(GX)},1.02 L${f(GX + 0.55)},1.02 L${f(GX + 0.55)},0.62`)} />
          <path className="detail" d={T(`M${f(GX)},-2.3 L${f(GX)},-1.35 M${f(GX - 0.2)},-1.35 L${f(GX + 0.2)},-1.35`)} />
        </>
      : <path d={T(`M${f(GX - 0.42)},-0.86 L${f(GX + 0.55)},-0.86 L${f(GX + 0.55)},0.44 L${f(GX - 0.42)},0.44 Z`)} /> });

  if (freeFloat) {
    P.push({ slot: 'handguard', z: 11, row: 'top', target: px(RF + H * 0.45, -1.1),
      el: <>
        <path d={T(`M${f(RF)},-1.1 L${f(HX - 0.25)},-1.1 Q${f(HX)},-1.1 ${f(HX)},-0.85 L${f(HX)},0.7 Q${f(HX)},0.95 ${f(HX - 0.25)},0.95 L${f(RF)},0.95 Z`)} />
        <path className="detail" d={T(`M${f(RF)},-0.9 L${f(HX - 0.1)},-0.9 ${pic(RF + 0.25, HX - 0.3, -1.1)} M${f(HX - 0.35)},-0.9 L${f(HX - 0.35)},0.95 M${f(RF)},0.62 L${f(HX - 0.35)},0.62 M${f(RF + 0.55)},0.62 L${f(RF + 0.55)},0.95 ${repeat(RF + 1.1, HX - 1.6, 1.6, (x) => `M${x},0.72 L${f(x + 0.9)},0.72`)}`) + O(RF / kx + 0.95 / kx, 0.38 / ky, 0.12) + O((HX - 0.75) / kx, 0.38 / ky, 0.12)} />
        <path className="detail" d={T(` ${repeat(RF + 1.1, HX - 1.6, 1.6, (x) => `M${x},-0.2 L${f(x + 1.1)},-0.2 Q${f(x + 1.27)},-0.2 ${f(x + 1.27)},-0.03 Q${f(x + 1.27)},0.14 ${f(x + 1.1)},0.14 L${x},0.14 Q${f(x - 0.17)},0.14 ${f(x - 0.17)},-0.03 Q${f(x - 0.17)},-0.2 ${x},-0.2 Z`)} M${f(RF + 0.15)},-0.9 L${f(RF + 0.15)},0.95`)} />
      </> });
  } else {
    P.push({ slot: 'handguard', z: 11, row: 'top', target: px(RF + H * 0.5, -0.86),
      el: <>
        <path d={T(`M${f(RF)},-0.98 L${f(RF + 0.45)},-0.98 L${f(RF + 0.45)},0.98 L${f(RF)},0.98 Z M${f(RF + 0.5)},-0.72 Q${f(RF + 0.6)},-0.88 ${f(RF + 0.95)},-0.88 L${f(HX - 0.75)},-0.86 Q${f(HX - 0.45)},-0.84 ${f(HX - 0.45)},-0.55 L${f(HX - 0.45)},0.6 Q${f(HX - 0.45)},0.88 ${f(HX - 0.75)},0.9 L${f(RF + 0.95)},0.92 Q${f(RF + 0.6)},0.92 ${f(RF + 0.5)},0.74 Z M${f(HX - 0.45)},-0.66 L${f(HX)},-0.6 L${f(HX)},0.62 L${f(HX - 0.45)},0.68`)} />
        <path className="detail" d={T(repeat(RF + 1.2, HX - 1.0, 0.42, (x) => `M${x},-0.62 L${x},0.66`))} />
      </> });
  }

  const mz = b.muzzle;
  let md: string;
  let mlen: number;
  if (matches(mz, /brake/i)) {
    mlen = 2.4;
    md = `M${f(BX)},-0.47 L${f(BX + mlen - 0.1)},-0.47 Q${f(BX + mlen)},-0.47 ${f(BX + mlen)},-0.37 L${f(BX + mlen)},0.37 Q${f(BX + mlen)},0.47 ${f(BX + mlen - 0.1)},0.47 L${f(BX)},0.47 Z ${repeat(BX + 0.55, BX + mlen - 0.45, 0.42, (x) => `M${x},-0.3 L${f(x + 0.22)},-0.3 L${f(x + 0.22)},0.3 L${x},0.3 Z`)}`;
  } else if (matches(mz, /comp/i)) {
    mlen = 2.0;
    md = `M${f(BX)},-0.45 L${f(BX + mlen)},-0.45 L${f(BX + mlen)},0.45 L${f(BX)},0.45 Z ${repeat(BX + 0.5, BX + 1.6, 0.36, (x) => `M${x},-0.45 L${f(x + 0.1)},-0.15 L${f(x + 0.22)},-0.45`)}`;
  } else {
    mlen = 2.25;
    md = `M${f(BX)},-0.4 L${f(BX + 0.4)},-0.4 L${f(BX + 0.55)},-0.45 L${f(BX + mlen)},-0.45 L${f(BX + mlen)},0.45 L${f(BX + 0.55)},0.45 L${f(BX + 0.4)},0.4 L${f(BX)},0.4 Z ${repeat(BX + 0.85, BX + 1.95, 0.27, (x) => `M${x},-0.45 L${x},-0.08`)}`;
  }
  P.push({ slot: 'muzzle', z: 12, row: 'top', target: px(BX + mlen / 2, -0.45), el: <path d={T(md)} /> });

  // Optic, mounted on the upper's rail
  const opt = b.optic;
  let od: string;
  let odet = '';
  let ot: [number, number];
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
    ot = px(e1 + 2.3, cy - 1.25);
  } else if (matches(opt, /reflex|510/i)) {
    od = 'M2.8,-1.1 L2.8,-1.6 L3.3,-1.6 L3.62,-3.0 Q3.7,-3.25 3.96,-3.25 L5.6,-3.25 Q5.86,-3.25 5.9,-3.0 L6.0,-1.6 L6.0,-1.1 Z M3.86,-1.75 L4.06,-2.97 L5.5,-2.97 L5.64,-1.75 Z';
    odet = `M3.0,-1.35 L5.8,-1.35 M3.95,-2.97 L3.86,-1.75 M4.4,-1.48 L4.75,-1.48 L4.75,-1.25 L4.4,-1.25 Z M4.95,-1.48 L5.3,-1.48 L5.3,-1.25 L4.95,-1.25 Z ${O2(3.35, -1.85, 0.12)}`;
    ot = px(4.7, -3.25);
  } else {
    const cy = -2.3;
    od = `M2.6,${f(cy - 0.8)} L7.2,${f(cy - 0.8)} Q7.45,${f(cy - 0.8)} 7.45,${f(cy - 0.55)} L7.45,${f(cy + 0.55)} Q7.45,${f(cy + 0.8)} 7.2,${f(cy + 0.8)} L2.6,${f(cy + 0.8)} Q2.35,${f(cy + 0.8)} 2.35,${f(cy + 0.55)} L2.35,${f(cy - 0.55)} Q2.35,${f(cy - 0.8)} 2.6,${f(cy - 0.8)} Z M4.4,${f(cy - 0.8)} L4.4,${f(cy - 1.2)} L5.2,${f(cy - 1.2)} L5.2,${f(cy - 0.8)}`;
    odet = `M3.4,${f(cy + 0.8)} L3.4,-1.1 L6.4,-1.1 L6.4,${f(cy + 0.8)} M2.8,${f(cy - 0.8)} L2.8,${f(cy + 0.8)} M7.0,${f(cy - 0.8)} L7.0,${f(cy + 0.8)} ${O2(4.8, cy, 0.34)} ${O2(4.8, cy, 0.22)} ${repeat(4.45, 5.15, 0.1, (x) => `M${x},${f(cy - 1.15)} L${x},${f(cy - 0.85)}`)} M5.6,-1.25 L6.5,-1.45 L6.6,-1.32 L5.75,-1.15 ${repeat(2.45, 2.7, 0.08, (x) => `M${x},${f(cy - 0.7)} L${x},${f(cy + 0.7)}`)}`;
    ot = px(4.8, cy - 1.2);
  }
  P.push({ slot: 'optic', z: 14, row: 'top', target: ot,
    el: <><path fillRule="evenodd" d={T(od)} /><path className="detail" d={T(odet)} /></> });

  // Add-ons, drawn only once chosen. Sizes are the makers' published lengths, rounded.
  // Lights, lasers and foregrips go where the builder put them: on the top, right, left or bottom of the
  // handguard, at a distance from the receiver. This is the right-side view, so anything on the left is
  // hidden behind the handguard and drawn in dashed hidden lines.
  const mounts = mountsFor(b, place, H);
  const RAIL_TOP = freeFloat ? -1.1 : -0.98;
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
    const cy = matches(opt, /reflex|510/i) ? -2.42 : -2.3;
    const x1 = 1.9;
    const x0 = x1 - 4.1;
    const r = 0.72;
    P.push({ slot: 'magnifier', z: 14, row: 'top', target: px(x0 + 1.6, cy - r),
      el: <>
        <path d={T(`M${f(x0)},${f(cy - r + 0.1)} L${f(x0 + 1.0)},${f(cy - r + 0.1)} L${f(x0 + 1.2)},${f(cy - r + 0.2)} L${f(x1 - 0.5)},${f(cy - r + 0.2)} L${f(x1 - 0.3)},${f(cy - r)} L${f(x1)},${f(cy - r)} L${f(x1)},${f(cy + r)} L${f(x1 - 0.3)},${f(cy + r)} L${f(x1 - 0.5)},${f(cy + r - 0.2)} L${f(x0 + 1.2)},${f(cy + r - 0.2)} L${f(x0 + 1.0)},${f(cy + r - 0.1)} L${f(x0)},${f(cy + r - 0.1)} Z`)} />
        <path className="detail" d={T(`M${f(x0 + 1.6)},${f(cy + r - 0.2)} L${f(x0 + 1.6)},-1.1 L${f(x0 + 3.0)},-1.1 L${f(x0 + 3.0)},${f(cy + r - 0.2)} M${f(x0 + 0.5)},${f(cy - r + 0.1)} L${f(x0 + 0.5)},${f(cy + r - 0.1)}`)} />
      </> });
  }

  const front = Math.max(BX + (mz ? mlen : 0), HX);
  return {
    width: 1000, height: 486, pieces: P,
    center: [f(ox + (rear - 0.6) * S), f(ox + (front + 0.6) * S), oy],
    dims: [[f(ox + rear * S), f(ox + front * S), 462, `${inch(front - rear)} overall`], [f(ox + BF * S), f(ox + BX * S), oy + 2.05 * S, `${inch(L)} barrel`]],
    rows: [26, 424],
    spec: `${b.barrel?.attrs.caliber ?? (big ? '.308 Win' : '5.56 NATO')} · ${inch(L)} barrel · ${gas} gas`,
  };
}

/* ================================================================= pistols */

/**
 * Factory dimensions, in inches, from the manufacturers' published spec tables
 * (us.glock.com technical data; Sig Sauer specs as listed for each size).
 * `oal` is overall length, `height` is top of the rear sight to the bottom of a flush magazine.
 */
interface PistolModel {
  brand: 'glock' | 'sig';
  slide: number; oal: number; barrel: number;
  /** Slide height, top flat to frame */
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

const MODELS: Record<string, PistolModel> = {
  glock17: G(7.32, 8.03, 4.49, 1.12, 2.83),
  glock19: G(6.85, 7.36, 4.02, 1.12, 2.8),
  glock26: G(6.26, 6.5, 3.43, 1.12, 2.83),
  g43x: G(6.06, 6.5, 3.41, 1.02, 2.64),
  g48: G(6.85, 7.28, 4.17, 1.02, 2.64),
  p320full: S9(7.55, 8.0, 4.7, 1.18, 2.85),
  p320compact: S9(6.75, 7.2, 3.9, 1.18, 2.85),
  p320subcompact: S9(6.25, 6.7, 3.6, 1.18, 2.85),
  p365std: S9(5.4, 5.8, 3.1, 0.98, 2.6),
  p365xl: S9(6.2, 6.6, 3.7, 0.98, 2.6),
};

/** Published height with a flush magazine, by grip size / magazine size. */
const GLOCK_H: Record<string, number> = { glock17: 5.47, glock19: 5.04, glock26: 4.17 };
const GLOCK_MAG_H: Record<number, number> = { 3: 5.47, 2: 5.04, 1: 4.17 };
const P320_H: Record<string, number> = { full: 5.5, carry: 5.5, compact: 5.3, subcompact: 4.7 };
const P320_DUST: Record<string, string> = { full: 'full', carry: 'compact', compact: 'compact', subcompact: 'subcompact' };
const P365_H: Record<string, number> = { std: 4.3, xl: 4.8, ext: 5.2 };
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
    default: {
      const m = MODELS[platform.id] ?? MODELS.glock19;
      const ms = b.mag?.attrs.size as number | undefined;
      const fr = b.frame;
      const grooved = !fr || (/gen3|gen4/.test(String(fr.attrs.gen)) && !matches(fr, /No finger grooves/));
      return { m, frame: m, gripH: GLOCK_H[platform.id] ?? 5.04, magH: ms ? GLOCK_MAG_H[ms] : GLOCK_H[platform.id] ?? 5.04, grooves: grooved ? (platform.id === 'glock26' ? 2 : 3) : 0 };
    }
  }
}

/* Sig Sauer P320 and P365: drawn from Sig's design-patent side elevations (see scripts/pistol-profiles/trace.py),
 * calibrated to the published overall length and height, then fitted to each slide, frame and grip size. */

/** The size each patent drawing shows, and what the patents leave as broken lines (trigger) or don't show. */
const SIG_REF = {
  p320: { oal: 8.0, h: 5.5, trig: 2.75, trigLen: 0.66, rake: 0.2, portH: 0.52 },
  p365: { oal: 5.8, h: 4.3, trig: 2.64, trigLen: 0.56, rake: 0.1, portH: 0.4 },
};

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

interface SigGeo {
  key: 'p320' | 'p365';
  SL: number; muzzle: number; tang: number; bc: number; springY: number; sh: number;
  port0: number; port1: number; portH: number;
  xt: number; trigTop: number; trigLen: number;
  gF: number; dust: number; railY: number;
  heel: [number, number]; toe: [number, number]; yGB: number; yMB: number; ext: number;
  frameD: string; frameDetail: string; slideD: string; slideDetail: string; windowD: string;
}

function sigGeometry(key: 'p320' | 'p365', spec: PistolSpec): SigGeo {
  const pr = PROFILES[key];
  const R = SIG_REF[key];
  const mk = pr.marks as Record<string, number> & { hole: number[]; heel: number[]; toe: number[]; magWindow: number[] | null };
  const [, h0y, h1x, h1y] = mk.hole;
  const dS = spec.m.oal - R.oal; // slide length change
  const dF = spec.frame.oal - R.oal; // dust cover length change
  const dH = spec.gripH - R.h; // grip length change
  const SL = mk.slide + dS;
  // Ejection port: as drawn on the P320; over the chamber on the P365 (its patent shows the left side).
  let port0 = mk.port0, port1 = mk.port1;
  if (port0 == null) {
    const barrel = spec.breech != null ? spec.m.slide - spec.breech : spec.m.barrel;
    port0 = SL - barrel - 0.12;
    port1 = port0 + 1.02;
  }
  const sx = stretchX(port1 + 0.1, mk.frontSerr - 0.05, mk.slide, dS);
  const fa = h1x + 0.3;
  const fx = stretchX(fa, Math.max(mk.rail0, fa + 0.3), mk.dust, dF);
  // Grip: lengthen or shorten the straps between the trigger guard and the magazine well, along the grip angle.
  const win = mk.magWindow;
  let winTop = mk.gripBottom;
  if (win) for (let i = 1; i < win.length; i += 2) winTop = Math.min(winTop, win[i]);
  const g0 = h1y + 0.35;
  const g1 = Math.min(mk.gripBottom - 0.45, winTop - 0.08);
  const ky = (g1 - g0 + dH) / (g1 - g0);
  const grip: Map2 = (x, y) => {
    const y2 = y <= g0 ? y : y <= g1 ? g0 + (y - g0) * ky : y + dH;
    return [x - R.rake * (y2 - y), y2];
  };
  const frameMap: Map2 = (x, y) => grip(fx(x), y);
  const slideMap: Map2 = (x, y) => [sx(x), y];
  const heel = grip(mk.heel[0], mk.heel[1]);
  const toe = grip(mk.toe[0], mk.toe[1]);
  const yGB = Math.max(heel[1], toe[1]);
  const ext = Math.max(0, spec.magH - spec.gripH);
  const hole = pr.frame.hole ? polyPath(pr.frame.hole, frameMap, true) : '';
  return {
    key, SL, muzzle: sx(mk.muzzle), tang: -mk.tang, bc: mk.bore, springY: mk.spring, sh: mk.sh,
    port0, port1, portH: R.portH,
    xt: R.trig, trigTop: h0y, trigLen: R.trigLen,
    gF: fx(h1x + 0.15), dust: fx(mk.dust), railY: mk.railBottom,
    heel, toe, yGB, yMB: yGB + ext + BASE, ext,
    frameD: pr.frame.outline.map((o) => polyPath(o, frameMap, true)).join(' ') + ' ' + hole,
    frameDetail: pr.frame.detail.map((o) => polyPath(o, frameMap, false)).join(' '),
    slideD: pr.slide.outline.map((o) => polyPath(o, slideMap, true)).join(' '),
    slideDetail: pr.slide.detail.map((o) => polyPath(o, slideMap, false)).join(' '),
    windowD: win ? polyPath(win, grip, true) : '',
  };
}

function sigPieces(P: Piece[], g: SigGeo, o: {
  T: ReturnType<typeof makeT>; px: (x: number, y: number) => [number, number];
  frameSlot: string; trig: string; flat: boolean; comp: boolean; cut: string; lighten: boolean; SL: number;
}) {
  const { T, px, SL } = o;
  /* Frame or grip module, with its controls and texture as drawn on the patent */
  const midY = g.yGB - 1.0;
  P.push({ slot: o.frameSlot, z: 3, row: 'bottom', target: px((g.heel[0] + g.toe[0]) / 2 + 0.15, midY),
    el: <>
      <path fillRule="evenodd" d={T(g.frameD)} />
      <path className="detail" d={T(g.frameDetail)} />
    </> });

  /* Magazine: shows through the window in the grip's bottom edge, then the floor plate (and any extension) below */
  const [hx, hy] = g.heel, [tx, ty] = g.toe;
  const e = g.ext, bb = e + BASE;
  const floor = `M${f(hx + 0.04)},${f(hy)} L${f(tx - 0.02)},${f(ty)} L${f(tx + 0.03)},${f(ty + e + 0.03)} Q${f(tx + 0.07)},${f(ty + bb)} ${f(tx - 0.06)},${f(ty + bb)} L${f(hx + 0.08)},${f(hy + bb)} Q${f(hx - 0.05)},${f(hy + bb - 0.02)} ${f(hx - 0.02)},${f(hy + e + 0.04)} Z`;
  let extLines = '';
  if (e > 0.25) for (let t = 0.2; t < e - 0.08; t += 0.22) extLines += `M${f(hx + 0.12)},${f(hy + t)} L${f(tx - 0.14)},${f(ty + t)} `;
  P.push({ slot: 'mag', z: 2, row: 'bottom', target: px((hx + tx) / 2, (hy + ty) / 2 + bb - 0.06),
    el: <>
      {g.windowD && <path d={T(g.windowD)} />}
      <path d={T(floor)} />
      <path className="detail" d={T(`M${f(hx + 0.1)},${f(hy + bb - 0.07)} L${f(tx - 0.08)},${f(ty + bb - 0.07)} ${extLines}`)} />
    </> });

  /* Trigger: hangs from the top of the guard opening (the patents show it only as a broken line) */
  const { xt, trigTop: yT, trigLen: L } = g;
  const blade = o.flat
    ? `M${f(xt + 0.1)},${f(yT)} L${f(xt + 0.0)},${f(yT + 0.1)} L${f(xt - 0.03)},${f(yT + L)} L${f(xt + 0.13)},${f(yT + L)} L${f(xt + 0.22)},${f(yT)} Z`
    : `M${f(xt + 0.12)},${f(yT)} Q${f(xt - 0.12)},${f(yT + L * 0.48)} ${f(xt + 0.01)},${f(yT + L)} L${f(xt + 0.14)},${f(yT + L - 0.04)} Q${f(xt + 0.03)},${f(yT + L * 0.48)} ${f(xt + 0.25)},${f(yT)} Z`;
  P.push({ slot: o.trig, z: 5, row: 'bottom', target: px(xt + 0.06, yT + L * 0.6),
    el: <>
      <path d={T(blade)} />
      {o.trig === 'fcu' && <path className="hidden-line" d={T(`M${f(-g.tang + 0.62)},${f(g.sh + 0.06)} L${f(xt + 0.9)},${f(g.sh + 0.06)} L${f(xt + 0.9)},${f(yT - 0.04)} L${f(-g.tang + 0.62)},${f(yT - 0.04)} Z`)} />}
    </> });

  /* Slide: patent outline and details, the ejection port cut through it, plus the chosen slide's own cuts */
  const port = `M${f(g.port0)},0 L${f(g.port0)},${f(g.portH)} L${f(g.port1)},${f(g.portH)} L${f(g.port1)},0 Z`;
  const lightCuts = o.lighten ? repeat(g.port1 + 0.35, SL - 1.6, 0.42, (x) => `M${x},0.06 L${f(x + 0.26)},0.06 L${f(x + 0.2)},0.3 L${f(x - 0.06)},0.3 Z`) : '';
  const ports = o.comp ? repeat(SL - 0.95, SL - 0.35, 0.22, (x) => `M${x},0 L${f(x + 0.07)},0.26 L${f(x + 0.14)},0`) : '';
  const plate = o.cut !== 'none' ? `M0.86,0 L0.86,0.12 L2.66,0.12 L2.66,0` : '';
  const extractor = g.key === 'p365' ? `M${f(g.port0 - 0.3)},0.24 L${f(g.port0 - 0.04)},0.24 L${f(g.port0 - 0.04)},0.34 L${f(g.port0 - 0.3)},0.34 Z` : '';
  P.push({ slot: 'slide', z: 8, row: 'top', target: px(SL - 1.0, g.sh * 0.5),
    el: <>
      <path fillRule="evenodd" d={T(`${g.slideD} ${port}`)} />
      <path className="detail" d={T(`${g.slideDetail} ${lightCuts} ${ports} ${plate} ${extractor}`)} />
    </> });
}

function pistol(platform: Platform, b: Build): Scene {
  const S = 58;
  const spec = pistolSpec(platform, b);
  const { m } = spec;
  const sig = m.brand === 'sig';
  const micro = m.sh < 1.0;
  // The Sigs are drawn from Sig's own design-patent drawings, fitted to each size; the Glocks from datums.
  const geo = sig ? sigGeometry(platform.id === 'p365' ? 'p365' : 'p320', spec) : undefined;
  const SL = geo ? geo.SL : m.slide;
  const SH = m.sh;
  const tang = geo ? geo.tang : Math.max(0.4, m.oal - m.slide);
  const threaded = !!b.barrel?.attrs.threaded;
  const device = platform.slots.some((s) => s.id === 'muzzle') && b.muzzle ? (b.muzzle.attrs.kind === 'comp' ? 1.25 : 0.5) : 0;
  const front = (geo ? geo.muzzle : SL) + Math.max(threaded ? 0.58 : 0, device ? device + 0.04 : 0);
  // Center the gun on the sheet.
  const ox = f((720 - (tang + front) * S) / 2 + tang * S);
  const oy = 112;
  const T = makeT(S, ox, oy);
  const px = (x: number, y: number): [number, number] => [f(ox + x * S), f(oy + y * S)];
  const has = (id: string) => platform.slots.some((s) => s.id === id);
  const P: Piece[] = [];

  const comp = matches(b.slide, /Comp|Spectre/);
  const cut = (b.slide?.attrs.cut as string | undefined) ?? 'none';
  const lighten = matches(b.slide, /Octane|Lightening/);
  // Datums the shared pieces below need, from whichever drawing method this pistol uses.
  let yRail: number, gF: number, dust: number, yMB: number, bc: number, port0: number, port1: number, springY: number, rear: number;
  const trig = has('fcg') ? 'fcg' : 'fcu';
  const flat = trig === 'fcg' ? matches(b.fcg, /flat|Apex/i) : matches(b.fcu, /flat|X-Series/i);
  const frameSlot = has('frame') ? 'frame' : 'grip';
  if (geo) {
    ({ railY: yRail, gF, dust, yMB, bc, port0, port1, springY } = geo);
    rear = Math.min(-tang, geo.heel[0]);
    sigPieces(P, geo, { T, px, frameSlot, trig, flat, comp, cut, lighten, SL });
  } else {
    // Vertical datums, measured down from the top of the slide.
    yRail = SH + (micro ? 0.4 : 0.46); // bottom of the dust cover
    const yWeb = SH + 0.36; // top of the back strap, under the beavertail
    const yTrig = SH + 0.8;
    const gB = SH + (micro ? 1.22 : sig ? 1.4 : 1.36); // bottom of the trigger guard
    const yGB = spec.gripH - SIGHT - BASE; // bottom of the grip
    yMB = spec.magH - SIGHT; // bottom of the magazine floor plate

    // Horizontal datums. The heel of the grip sits just inside the published overall length,
    // the back strap rises from it at the grip angle, and the trigger sits at the published reach.
    const heel = -tang + (sig ? 0.1 : 0.06);
    // The back strap stands a little more upright than the front strap (palm swell at the top).
    const bk = (y: number) => f(heel + (yGB - y) * m.rake * 0.78);
    const xt = f(bk(yTrig) + m.reach); // trigger face
    const frTop = xt - (sig ? 0.4 : 0.42);
    const fr = (y: number) => f(frTop - (y - yRail) * m.rake);
    gF = f(xt + (micro ? 0.86 : sig ? 1.0 : 1.04)); // front of the trigger guard
    dust = f(spec.frame.slide - (sig ? 0.42 : 0.58));

    /* Frame or grip module */
    const gen5 = !sig && !spec.grooves;
    // Front strap: finger grooves on Gen3/4 frames, a gentle forward curve on the Sig grip modules.
    let strap = '';
    const s0 = gB + (sig ? 0.3 : 0.22);
    if (spec.grooves) {
      const step = (yGB - 0.3 - s0) / spec.grooves;
      for (let i = 0; i < spec.grooves; i++) {
        const ya = s0 + step * i;
        const yb = ya + step;
        strap += ` Q${f(fr((ya + yb) / 2) - 0.16)},${f((ya + yb) / 2)} ${fr(yb)},${f(yb)}`;
      }
    } else {
      const ym = (s0 + yGB) / 2;
      strap += ` Q${f(fr(ym) + (sig ? 0.07 : 0.03))},${f(ym)} ${fr(yGB - 0.3)},${f(yGB - 0.3)}`;
    }
    // Mag well: Gen5 and the Sig modules flare at the bottom; Gen5 has the front scallop for stripping a mag.
    const flare = sig ? 0.06 : gen5 ? 0.08 : 0.03;
    strap += gen5
      ? ` Q${f(fr(yGB - 0.12) + flare)},${f(yGB - 0.12)} ${f(fr(yGB) + flare - 0.02)},${f(yGB - 0.04)} L${f(fr(yGB) - 0.06)},${f(yGB)}`
      : ` Q${f(fr(yGB - 0.12) + flare)},${f(yGB - 0.12)} ${f(fr(yGB) + flare - 0.06)},${f(yGB)}`;

    // Trigger guard: square-fronted on the Glock, rounded and roomier on the Sig.
    const guardOuter = sig
      ? `L${f(gF - 0.16)},${f(yRail)} Q${f(gF + 0.04)},${f(yRail + 0.02)} ${f(gF + 0.05)},${f(yRail + 0.3)} Q${f(gF + 0.04)},${f(gB)} ${f(gF - 0.4)},${f(gB)} L${f(fr(gB) + 0.42)},${f(gB)} Q${f(fr(gB) + 0.02)},${f(gB + 0.01)} ${fr(s0)},${f(s0)}`
      : `L${f(gF - 0.06)},${f(yRail)} L${f(gF + 0.02)},${f(yRail + 0.1)} L${f(gF + 0.06)},${f(gB - 0.14)} Q${f(gF + 0.05)},${f(gB)} ${f(gF - 0.12)},${f(gB)} L${f(fr(gB) + 0.26)},${f(gB)} Q${f(fr(gB) + 0.02)},${f(gB + 0.01)} ${fr(s0)},${f(s0)}`;
    const hole = sig
      ? `M${f(fr(yRail) + 0.14)},${f(yRail)} L${f(gF - 0.2)},${f(yRail)} Q${f(gF - 0.1)},${f(yRail + 0.04)} ${f(gF - 0.1)},${f(yRail + 0.3)} Q${f(gF - 0.11)},${f(gB - 0.15)} ${f(gF - 0.44)},${f(gB - 0.15)} L${f(fr(gB) + 0.46)},${f(gB - 0.15)} Q${f(fr(gB - 0.3) + 0.1)},${f(gB - 0.17)} ${f(fr(yRail + 0.32) + 0.12)},${f(yRail + 0.32)} Z`
      : `M${f(fr(yRail) + 0.12)},${f(yRail)} L${f(gF - 0.12)},${f(yRail)} L${f(gF - 0.09)},${f(yRail + 0.08)} L${f(gF - 0.07)},${f(gB - 0.22)} Q${f(gF - 0.08)},${f(gB - 0.13)} ${f(gF - 0.2)},${f(gB - 0.13)} L${f(fr(gB - 0.13) + 0.3)},${f(gB - 0.13)} Q${f(fr(gB - 0.13) + 0.12)},${f(gB - 0.15)} ${f(fr(yRail + 0.3) + 0.12)},${f(yRail + 0.3)} Z`;

    // Back strap: palm swell high on the Sig, the Glock "hump" low on Gen3/4 frames, then the beavertail.
    // The web: a long, smooth radius from the back strap up into the underside of the beavertail.
    const yTop = yWeb + (sig ? 0.62 : 0.55);
    const y1 = yGB - (yGB - yTop) * (sig ? 0.3 : 0.38);
    const y2 = yTop + (yGB - yTop) * (sig ? 0.25 : 0.3);
    const swellLow = sig ? 0.02 : gen5 ? 0.05 : 0.12;
    const swellHigh = sig ? 0.12 : 0.03;
    const tailDrop = sig ? (micro ? 0.27 : 0.33) : 0.22;
    const backstrap = `C${f(bk(y1) - swellLow)},${f(y1)} ${f(bk(y2) - swellHigh)},${f(y2)} ${f(bk(yTop))},${f(yTop)}`;
    const tx0 = -tang + (sig ? 0.42 : 0.3);
    const web = `C${f(bk(yWeb + 0.12))},${f(yWeb + 0.12)} ${f(tx0 + (sig ? 0.5 : 0.4))},${f(SH + tailDrop + 0.02)} ${f(tx0)},${f(SH + tailDrop)}`;
    const tail = sig
      ? `${web} Q${f(-tang + 0.02)},${f(SH + tailDrop)} ${f(-tang)},${f(SH + 0.13)} Q${f(-tang + 0.02)},${SH} ${f(-tang + 0.2)},${SH}`
      : `${web} Q${f(-tang + 0.03)},${f(SH + tailDrop - 0.02)} ${f(-tang)},${f(SH + 0.1)} L${f(-tang + 0.05)},${f(SH + 0.02)} L${f(-tang + 0.2)},${SH}`;
    const heelX = f(bk(yGB) - (sig ? 0.04 : 0.02));
    const nose = sig
      ? `L${f(dust - 0.12)},${SH} L${dust},${f(SH + 0.12)} L${f(dust - 0.05)},${f(yRail - 0.06)} Q${f(dust - 0.06)},${f(yRail)} ${f(dust - 0.16)},${f(yRail)}`
      : `L${f(dust - 0.05)},${SH} L${dust},${f(SH + 0.06)} L${dust},${f(yRail - 0.08)} Q${dust},${f(yRail)} ${f(dust - 0.1)},${f(yRail)}`;
    const frameD = `M${f(-tang + 0.2)},${SH} ${nose} ${guardOuter}${strap} L${f(heelX + 0.08)},${f(yGB)} Q${heelX},${f(yGB)} ${f(bk(yGB - 0.1))},${f(yGB - 0.12)} ${backstrap} ${tail} Z`;

    // Texture panel follows the real curves of both straps (palm swell, hump, front curve), filled with stipple.
    const bump = (y: number, c: number, w: number) => Math.max(0, 1 - ((y - c) / w) ** 2);
    const backX = (y: number) => bk(y) - swellHigh * 0.75 * bump(y, y2, (yGB - yTop) * 0.35) - swellLow * 0.75 * bump(y, y1, (yGB - yTop) * 0.3);
    const frontX = (y: number) => fr(y) + (spec.grooves ? -0.12 : (sig ? 0.07 : 0.03) * bump(y, (s0 + yGB) / 2, (yGB - s0) / 2));
    const tex0 = yTop + (sig ? 0.05 : 0.0);
    const tex1 = yGB - (gen5 ? 0.42 : 0.26);
    const inF = sig ? 0.2 : 0.18;
    const inB = 0.17;
    const ys: number[] = [];
    for (let y = tex0; y < tex1; y += 0.12) ys.push(y);
    ys.push(tex1);
    const fromTop = sig ? 0.42 : 0.0; // Sig modules leave a smooth thumb area at the top front
    const panel = `M${ys.map((y) => `${f(backX(y) + inB)},${f(y)}`).join(' L')} L${[...ys].reverse().map((y) => `${f(frontX(y) - inF - (y < tex0 + fromTop ? 0.3 * (1 - (y - tex0) / fromTop) : 0))},${f(y)}`).join(' L')} Z`;
    let stipple = '';
    for (let y = tex0 + 0.12; y < tex1 - 0.06; y += 0.13) {
      const xa = backX(y) + inB + 0.1;
      const xb = frontX(y) - inF - 0.1 - (y < tex0 + fromTop ? 0.3 * (1 - (y - tex0) / fromTop) : 0);
      const off = Math.round((y - tex0) / 0.13) % 2 ? 0.065 : 0;
      for (let x = xa + off; x < xb; x += 0.13) stipple += `M${f(x)},${f(y)} L${f(x + 0.012)},${f(y)} `;
    }

    // Accessory rail on the dust cover: one slot on the Glocks and the P365, three on the P320.
    const railSlots = micro ? 1 : sig ? 3 : 1;
    const railLen = dust - (gF + 0.25);
    let rail = `M${f(gF + 0.12)},${f(yRail - 0.14)} L${f(dust - 0.08)},${f(yRail - 0.14)}`;
    if (railLen > 0.6)
      for (let i = 0; i < railSlots; i++) {
        const x = dust - 0.42 - i * 0.394;
        if (x - 0.16 < gF + 0.15) break;
        rail += ` M${f(x - 0.16)},${f(yRail - 0.14)} L${f(x - 0.16)},${f(yRail)} M${f(x)},${f(yRail - 0.14)} L${f(x)},${f(yRail)}`;
      }
    // Frame rail line under the slide, and the guard's checkering on Glocks.
    const frameLine = `M${f(-tang + 0.3)},${f(SH + 0.06)} L${f(dust - 0.2)},${f(SH + 0.06)}`;
    const guardCheck = sig ? '' : repeat(yRail + 0.2, gB - 0.24, 0.1, (y) => `M${f(gF + 0.025)},${y} L${f(gF + 0.075)},${y}`);
    const magRel = sig
      ? O2(fr(yRail + 0.3) + 0.02, yRail + 0.22, 0.13)
      : `M${f(fr(yRail + 0.14) - 0.02)},${f(yRail + 0.08)} L${f(fr(yRail + 0.14) + 0.12)},${f(yRail + 0.08)} L${f(fr(yRail + 0.42) + 0.12)},${f(yRail + 0.38)} L${f(fr(yRail + 0.42) - 0.02)},${f(yRail + 0.38)} Z`;
    // Controls: Glock slide stop, takedown tab and three pins; Sig slide catch with thumb pad and takedown lever.
    const controls = sig
      ? `${O2(xt + 0.5, SH + 0.24, 0.1)} M${f(xt + 0.44)},${f(SH + 0.32)} L${f(xt + 0.02)},${f(SH + 0.42)} Q${f(xt - 0.08)},${f(SH + 0.42)} ${f(xt - 0.06)},${f(SH + 0.33)} L${f(xt + 0.4)},${f(SH + 0.17)}`
        + ` M${f(xt + 0.22)},${f(SH + 0.07)} L${f(bk(yWeb) + 0.82)},${f(SH + 0.07)} Q${f(bk(yWeb) + 0.62)},${f(SH + 0.08)} ${f(bk(yWeb) + 0.56)},${f(SH + 0.26)} Q${f(bk(yWeb) + 0.5)},${f(SH + 0.4)} ${f(bk(yWeb) + 0.36)},${f(SH + 0.36)} Q${f(bk(yWeb) + 0.24)},${f(SH + 0.3)} ${f(bk(yWeb) + 0.32)},${f(SH + 0.18)} L${f(xt + 0.22)},${f(SH + 0.18)} Z`
      : `M${f(xt - 1.22)},${f(SH + 0.04)} L${f(xt - 0.4)},${f(SH + 0.04)} Q${f(xt - 0.33)},${f(SH + 0.1)} ${f(xt - 0.4)},${f(SH + 0.16)} L${f(xt - 1.1)},${f(SH + 0.16)} L${f(xt - 1.22)},${f(SH + 0.1)} Z`
        + ` M${f(xt + 0.02)},${f(SH + 0.08)} L${f(xt + 0.32)},${f(SH + 0.08)} L${f(xt + 0.32)},${f(SH + 0.22)} L${f(xt + 0.02)},${f(SH + 0.22)} Z M${f(xt + 0.08)},${f(SH + 0.12)} L${f(xt + 0.26)},${f(SH + 0.12)} M${f(xt + 0.08)},${f(SH + 0.17)} L${f(xt + 0.26)},${f(SH + 0.17)}`
        + O2(xt - 0.22, SH + 0.3, 0.05) + O2(xt + 0.66, SH + 0.3, 0.05) + O2(bk(yWeb) + 0.48, SH + 0.2, 0.05);
    P.push({ slot: frameSlot, z: 3, row: 'bottom', target: px((bk(yGB - 0.9) + fr(yGB - 0.9)) / 2, yGB - 0.9),
      el: <>
        <path fillRule="evenodd" d={T(`${frameD} ${hole}`)} />
        <path className="detail" d={T(`${panel} ${rail} ${frameLine} ${guardCheck} ${magRel}`)} />
        <path className="detail" d={T(controls)} />
        <path className="detail stipple" d={T(stipple)} />
      </> });

    /* Magazine: hidden inside the grip; floor plate and any extension visible below it */
    const mb0 = yMB - BASE;
    const fx = fr(yGB) - 0.08;
    const floor = sig
      ? `M${f(bk(yGB) + 0.06)},${f(yGB)} L${f(fx)},${f(yGB)} L${f(fr(mb0) - 0.04)},${f(mb0)} Q${f(fr(yMB) + 0.1)},${f(mb0 + 0.02)} ${f(fr(yMB) + 0.02)},${f(yMB)} L${f(bk(yMB) + 0.06)},${f(yMB)} Q${f(bk(yMB) - 0.06)},${f(yMB - 0.03)} ${f(bk(mb0))},${f(mb0)} Z`
      : `M${f(bk(yGB) + 0.08)},${f(yGB)} L${f(fx)},${f(yGB)} L${f(fr(mb0) - 0.12)},${f(mb0)} L${f(fr(mb0) - 0.02)},${f(mb0 + 0.04)} L${f(fr(yMB) - 0.06)},${f(yMB)} L${f(bk(yMB) + 0.1)},${f(yMB)} L${f(bk(yMB) + 0.02)},${f(yMB - 0.06)} L${f(bk(mb0) + 0.06)},${f(mb0)} Z`;
    const extLines = yMB - yGB > BASE + 0.25 ? repeat(yGB + 0.2, mb0 - 0.1, 0.22, (y) => `M${f(bk(y) + 0.14)},${y} L${f(fr(y) - 0.18)},${y}`) : '';
    P.push({ slot: 'mag', z: 2, row: 'bottom', target: px((bk(yMB) + fr(yMB)) / 2, yMB - 0.06),
      el: <>
        <path d={T(floor)} />
        {extLines && <path className="detail" d={T(extLines)} />}
      </> });
    /* Trigger and fire control */
    const blade = flat
      ? `M${f(xt + 0.12)},${f(yRail)} L${f(xt + 0.02)},${f(yRail + 0.1)} L${f(xt - 0.02)},${f(yRail + 0.62)} L${f(xt + 0.14)},${f(yRail + 0.62)} L${f(xt + 0.24)},${f(yRail)} Z`
      : `M${f(xt + 0.14)},${f(yRail)} Q${f(xt - 0.1)},${f(yRail + 0.3)} ${f(xt + 0.02)},${f(yRail + 0.64)} L${f(xt + 0.15)},${f(yRail + 0.6)} Q${f(xt + 0.04)},${f(yRail + 0.3)} ${f(xt + 0.27)},${f(yRail)} Z`;
    P.push({ slot: trig, z: 5, row: 'bottom', target: px(xt + 0.08, yRail + 0.42),
      el: <>
        <path d={T(blade)} />
        {!sig && <path className="detail" d={T(`M${f(xt + 0.1)},${f(yRail + 0.12)} L${f(xt + 0.08)},${f(yRail + 0.44)}`)} />}
        {trig === 'fcu' && <path className="hidden-line" d={T(`M${f(bk(yWeb) + 0.2)},${f(SH + 0.06)} L${f(xt + 0.9)},${f(SH + 0.06)} L${f(xt + 0.9)},${f(yRail - 0.04)} L${f(bk(yWeb) + 0.2)},${f(yRail - 0.04)} Z`)} />}
      </> });

    /* Slide */
    // The ejection port sits over the chamber: the barrel's breech is one barrel length back from the muzzle.
    port0 = f((spec.breech ?? SL - m.barrel) - (micro ? 0.12 : 0.16));
    port1 = port0 + (micro ? 1.02 : sig ? 1.3 : SH < 1.1 ? 1.1 : 1.28);
    const frontSerr = matches(b.slide, /serration|Gen5|MOS|ZEV|Spectre|XFull|M18/i);
    // Glock: boxy with a beveled nose. Sig: the lower front of the slide sweeps up into a tapered nose,
    // the top front corner is chamfered, and a shoulder line runs the length of the slide.
    const taper = micro ? 0.85 : 1.2;
    const slideD = sig
      ? `M0.02,0.14 Q0.03,0 0.18,0 L${f(SL - 0.34)},0 Q${f(SL - 0.08)},0.01 ${f(SL - 0.02)},0.26 L${f(SL)},${f(SH * 0.5)} Q${f(SL - 0.01)},${f(SH * 0.6)} ${f(SL - 0.12)},${f(SH * 0.64)} L${f(SL - taper)},${f(SH - 0.05)} Q${f(SL - taper - 0.08)},${SH} ${f(SL - taper - 0.22)},${SH} L0.08,${SH} L0,${f(SH - 0.08)} Z`
      : `M0,0.07 Q0,0 0.07,0 L${f(SL - 0.2)},0 Q${f(SL - 0.04)},0.01 ${SL},0.16 L${SL},${f(SH - 0.44)} L${f(SL - 0.34)},${f(SH - 0.02)} L${f(SL - 0.4)},${SH} L0.06,${SH} L0,${f(SH - 0.06)} Z`;
    const shoulder = sig
      ? `M0.06,0.17 L${f(SL - 0.16)},0.17 M0.04,${f(SH * 0.42)} L${f(SL - 0.02)},${f(SH * 0.42)} M0.1,${f(SH - 0.15)} L${f(SL - taper - 0.12)},${f(SH - 0.15)} M${f(SL - 0.12)},${f(SH * 0.64)} L${f(SL - 0.2)},${f(SH * 0.42)}`
      : `M0.05,0.12 L${f(SL - 0.1)},0.12 M0.1,${f(SH - 0.18)} L${f(SL - 0.48)},${f(SH - 0.18)}`;
    const serrTop = sig ? SH * 0.4 + 0.08 : 0.2;
    const rearSerr = sig
      ? repeat(0.2, micro ? 0.92 : 1.1, 0.14, (x) => `M${x},${f(serrTop)} L${f(x + 0.05)},${f(SH - 0.22)} M${f(x + 0.05)},${f(serrTop)} L${f(x + 0.1)},${f(SH - 0.22)}`)
      : repeat(0.2, 0.98, 0.11, (x) => `M${x},${f(serrTop)} L${f(x - 0.07)},${f(SH - 0.24)}`);
    const fSerr = frontSerr
      ? sig
        ? repeat(SL - taper - 0.85, SL - taper - 0.15, 0.12, (x) => `M${x},${f(serrTop)} L${x},${f(SH - 0.22)}`)
        : repeat(SL - 1.45, SL - 0.8, 0.12, (x) => `M${x},0.2 L${f(x - 0.07)},${f(SH - 0.3)}`)
      : '';
    const lightCuts = lighten ? repeat(port1 + 0.35, SL - 1.6, 0.42, (x) => `M${x},0.06 L${f(x + 0.26)},0.06 L${f(x + 0.2)},0.3 L${f(x - 0.06)},0.3 Z`) : '';
    const ports = comp ? repeat(SL - 0.95, SL - 0.35, 0.22, (x) => `M${x},0 L${f(x + 0.07)},0.26 L${f(x + 0.14)},0`) : '';
    const plate = cut !== 'none' ? `M0.86,0 L0.86,0.12 L2.66,0.12 L2.66,0` : '';
    const extractor = sig
      ? `M${f(port0 - 0.3)},0.26 L${f(port0 - 0.04)},0.26 L${f(port0 - 0.04)},0.38 L${f(port0 - 0.3)},0.38 Z`
      : `M${f(port0 - 0.42)},0.26 L${f(port0 - 0.04)},0.26 L${f(port0 - 0.04)},0.4 L${f(port0 - 0.42)},0.4 Z`;
    // Muzzle face with the bore and the recoil spring guide visible through the nose.
    bc = sig ? 0.42 : 0.36; // bore line
    const muzzleFace = `M${f(SL - 0.05)},${f(bc - 0.2)} L${f(SL - 0.05)},${f(bc + 0.2)}`;
    P.push({ slot: 'slide', z: 8, row: 'top', target: px(SL - (frontSerr ? 0.6 : 1.0), SH * 0.5),
      el: <>
        <path fillRule="evenodd" d={T(`${slideD} M${f(port0)},0 L${f(port0)},0.5 L${f(port1)},0.5 L${f(port1)},0 Z`)} />
        <path className="detail" d={T(`${shoulder} ${rearSerr} ${fSerr} ${lightCuts} ${ports} ${plate} ${extractor} ${muzzleFace}`)} />
      </> });
    springY = SH - 0.24;
    rear = Math.min(-tang, bk(Math.max(yGB, yMB)));
  }

  /* Barrel: hood shows in the ejection port; the rest is hidden; threads run past the slide */
  const br = micro ? 0.24 : 0.28;
  const chamber = f(port0 - 0.12);
  P.push({ slot: 'barrel', z: 9, row: 'top', target: px((port0 + port1) / 2, 0.24),
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
  const springSlot = has('rsa') ? 'rsa' : 'spring';
  const sy = springY;
  P.push({ slot: springSlot, internal: true, z: 20, row: 'top', target: px(SL - 1.5, sy),
    el: <path d={T(`M${f(port0 + 0.5)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy + 0.08)} L${f(port0 + 0.5)},${f(sy + 0.08)} Z ${repeat(port0 + 0.7, SL - 0.3, 0.15, (x) => `M${x},${f(sy - 0.12)} L${f(x + 0.08)},${f(sy + 0.12)}`)}`)} /> });
  if (has('spk'))
    P.push({ slot: 'spk', internal: true, z: 20, row: 'top', target: px(0.6, bc),
      el: <path d={T(`M0.06,${f(bc - 0.09)} L${f(port0 - 0.3)},${f(bc - 0.09)} L${f(port0 - 0.3)},${f(bc + 0.09)} L0.06,${f(bc + 0.09)} Z M0.06,${f(bc - 0.2)} L0.24,${f(bc - 0.2)} L0.24,${f(bc + 0.2)} L0.06,${f(bc + 0.2)}`)} /> });

  /* Sights */
  const sh = b.sights?.attrs.height === 'suppressor' ? 0.36 : SIGHT;
  const sightSlot = has('sights') ? 'sights' : undefined;
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
  const enclosed = fp === 'acro' || matches(b.optic, /EPS|enclosed/i);
  let od: string;
  if (enclosed) od = 'M0.9,0 L0.9,-0.86 Q0.9,-1.0 1.04,-1.0 L2.52,-1.0 Q2.66,-1.0 2.66,-0.86 L2.66,0 Z M1.08,-0.18 L1.08,-0.82 L2.48,-0.82 L2.48,-0.18 Z';
  else if (fp === 'rmsc' || fp === 'rmrcc') od = 'M0.9,0 L1.0,-0.58 Q1.08,-0.8 1.32,-0.8 L2.0,-0.8 Q2.26,-0.8 2.32,-0.56 L2.44,0 Z M1.16,-0.14 L1.26,-0.62 L2.08,-0.62 L2.18,-0.14 Z';
  else od = 'M0.9,0 L1.0,-0.66 Q1.08,-1.0 1.38,-1.0 L2.18,-1.0 Q2.48,-0.98 2.54,-0.64 L2.66,0 Z M1.18,-0.15 L1.28,-0.8 L2.28,-0.8 L2.4,-0.15 Z';
  P.push({ slot: 'optic', z: 11, row: 'top', target: px(1.78, -0.9), el: <path fillRule="evenodd" d={T(od)} /> });

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
  const labels = compact ? [] : placeLabels(pieces.filter((p) => p.slot), 24, scene.width - 24, scene.rows);
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
            key={p.slot}
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
