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
  let traced: { o: string; d: string } | null = null;
  let rear: number;
  // Stocks traced from patent drawings (see scripts/pistol-profiles/ar.py), each placed by its butt and its top.
  const fixedStock = matches(stock, /A2|PRS|Precision|Rifle Stock/);
  rear = fixedStock ? TE - 0.65 : TE - 0.73;
  const traceStock = (key: ArStockKey, top: number) => {
    traced = arPaths(AR_PROFILES[key], (x, y) => [x + rear, y + top]);
    return traced.o;
  };
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
  else {
    // Other collapsible stocks: the M4 stock traced from US 10,184,737 FIG. 2A, pushed in so its nose sits just behind the castle nut.
    const dx = rear - AR_STOCK_REAR;
    traced = arPaths(AR_PROFILES.stock, (x, y) => [x + dx, y]);
    sd = traced.o;
  }
  const stockDet = traced!.d;
  P.push({ slot: 'stock', z: 2, row: 'bottom', target: px(rear + 2.2, 1.6), el: <><path d={T(sd)} /><path className="detail" d={T(stockDet)} /></> });

  // Lower receiver, A2-style grip and trigger: traced from US 10,184,737 FIG. 2A (see scripts/pistol-profiles/ar.py).
  const lower = arPaths(AR_PROFILES.lower);
  P.push({ slot: 'lower', z: 4, row: 'bottom', target: px(5.6 * kx, 2.4 * ky),
    el: <><path d={R(lower.o)} /><path className="detail" d={R(lower.d)} /></> });

  // Lower parts kit: the selector's right-side stub over its detent (the lower drawing shows the hole).
  P.push({ slot: 'lpk', z: 6, row: 'bottom', target: px(1.43 * kx, 1.29 * ky),
    el: <path d={O(1.43, 1.29, 0.2) + R(' M1.43,1.29 L1.75,1.12 M1.36,1.29 L1.5,1.29')} /> });
  const trig = arPaths(AR_PROFILES.trigger);
  P.push({ slot: 'trigger', z: 6, row: 'bottom', target: px(2.5 * kx, 2.3 * ky), el: <path d={R(trig.o)} /> });

  // Pistol grip: the traced A2-style grip, leaned forward for steeper and vertical grips (sheared about its top),
  // with a stippled panel inside the drawing's panel outline.
  const gr = b.grip;
  const sh = matches(gr, /vertical/i) ? 0.15 : matches(gr, /steep/i) ? 0.08 : 0;
  const gTop = Math.min(...AR_PROFILES.grip.outline[0].filter((_, i) => i % 2));
  const gmap: Map2 = (x, y) => [x + (y - gTop) * sh, y];
  const grip = arPaths(AR_PROFILES.grip, gmap);
  const panel = AR_PROFILES.grip.detail.reduce((a, d) => (d.length > a.length ? d : a), [] as number[]);
  let gripTex = '';
  for (let y = gTop + 0.6, row = 0; y < gTop + 3.6; y += 0.14, row++) {
    for (let x = -1.6 + (row % 2 ? 0.07 : 0); x < 1.8; x += 0.14) {
      if (!inside(panel, x, y) || !inside(panel, x - 0.1, y) || !inside(panel, x + 0.1, y) || !inside(panel, x, y - 0.1) || !inside(panel, x, y + 0.1)) continue;
      const [a, c] = gmap(x, y);
      gripTex += `M${f(a)},${f(c)} L${f(a + 0.015)},${f(c)} `;
    }
  }
  P.push({ slot: 'grip', z: 5, row: 'bottom', target: px((0.1 + 2.5 * sh) * kx, 3.6 * ky),
    el: <>
      <path d={R(grip.o)} />
      <path className="detail" d={R(grip.d)} />
      <path className="detail stipple" d={R(gripTex)} />
    </> });

  // Magazine. The AR-15's is the PMAG traced from US D712,500 FIG. 2, its stop ledge at the bottom of the mag well.
  const pmag = arPaths(AR_PROFILES.pmag, (x, y) => [MAG_X + x, MAG_Y + y]);
  P.push({ slot: 'mag', z: 3, row: 'bottom', target: px(big ? 5.5 * kx : 6.2, big ? 6.2 : 6.6),
    el: big
      ? <><path d={T('M3.98,3.0 L6.55,3.0 C6.65,4.8 6.85,6.4 7.05,7.75 L7.1,7.98 L4.6,8.12 L4.55,7.9 C4.3,6.3 4.1,4.7 3.98,3.0 Z', kx, 1)} /><path className="detail" d={T('M4.2,4.4 L6.65,4.32 M4.35,5.8 L6.85,5.7 M4.5,7.2 L7.0,7.1', kx, 1)} /></>
      : <><path d={T(pmag.o)} /><path className="detail" d={T(pmag.d)} /></> });

  // Upper receiver: the standard flat-top traced from US 8,910,406 FIG. 1A.
  const upper = arPaths(AR_PROFILES.upper);
  P.push({ slot: 'upper', z: 7, row: 'top', target: px(1.4 * kx, -0.55 * ky),
    el: <>
      <path d={R(upper.o)} />
      <path className="detail" d={R(upper.d)} />
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
    P.push({ slot: 'handguard', z: 11, row: 'top', target: px(RF + H * 0.45, RAIL),
      el: <>
        <path d={T(`M${f(RF)},${f(RAIL)} L${f(HX - 0.25)},${f(RAIL)} Q${f(HX)},${f(RAIL)} ${f(HX)},${f(RAIL + 0.25)} L${f(HX)},0.7 Q${f(HX)},0.95 ${f(HX - 0.25)},0.95 L${f(RF)},0.95 Z`)} />
        <path className="detail" d={T(`M${f(RF)},${f(RAIL + 0.2)} L${f(HX - 0.1)},${f(RAIL + 0.2)} ${pic(RF + 0.25, HX - 0.3, RAIL)} M${f(HX - 0.35)},${f(RAIL + 0.2)} L${f(HX - 0.35)},0.95 M${f(RF)},0.62 L${f(HX - 0.35)},0.62 M${f(RF + 0.55)},0.62 L${f(RF + 0.55)},0.95 ${repeat(RF + 1.1, HX - 1.6, 1.6, (x) => `M${x},0.72 L${f(x + 0.9)},0.72`)}`) + O(RF / kx + 0.95 / kx, 0.38 / ky, 0.12) + O((HX - 0.75) / kx, 0.38 / ky, 0.12)} />
        <path className="detail" d={T(` ${repeat(RF + 1.1, HX - 1.6, 1.6, (x) => `M${x},-0.2 L${f(x + 1.1)},-0.2 Q${f(x + 1.27)},-0.2 ${f(x + 1.27)},-0.03 Q${f(x + 1.27)},0.14 ${f(x + 1.1)},0.14 L${x},0.14 Q${f(x - 0.17)},0.14 ${f(x - 0.17)},-0.03 Q${f(x - 0.17)},-0.2 ${x},-0.2 Z`)} M${f(RF + 0.15)},${f(RAIL + 0.2)} L${f(RF + 0.15)},0.95`)} />
      </> });
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
  // Brakes: a ported brake traced from US D285,238 FIG. 1; 3-prong hiders: US D577,410 FIG. 1 (collar and prongs).
  const mzTrace = matches(mz, /brake/i) ? 'muzzleBrake' as const : matches(mz, /prong/i) ? 'muzzleProng' as const : null;
  if (mzTrace) {
    const h = AR_PROFILES.marks[mzTrace + 'H'];
    const t = arPaths(AR_PROFILES[mzTrace], (x, y) => [BX + x, y - h / 2]);
    mlen = mzTrace === 'muzzleBrake' ? 2.25 : 2.2;
    md = t.o;
    mdet = t.d;
  } else if (matches(mz, /comp/i)) {
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
    ot = px(4.9, -3.28);
  } else if (matches(opt, /EXPS|holographic/i) || matches(opt, /ROMEO5|PRO Patrol/i)) {
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
    ot = px(4.9, rail - riser - pr.h * k);
  } else {
    const cy = -2.3;
    od = `M2.6,${f(cy - 0.8)} L7.2,${f(cy - 0.8)} Q7.45,${f(cy - 0.8)} 7.45,${f(cy - 0.55)} L7.45,${f(cy + 0.55)} Q7.45,${f(cy + 0.8)} 7.2,${f(cy + 0.8)} L2.6,${f(cy + 0.8)} Q2.35,${f(cy + 0.8)} 2.35,${f(cy + 0.55)} L2.35,${f(cy - 0.55)} Q2.35,${f(cy - 0.8)} 2.6,${f(cy - 0.8)} Z M4.4,${f(cy - 0.8)} L4.4,${f(cy - 1.2)} L5.2,${f(cy - 1.2)} L5.2,${f(cy - 0.8)}`;
    odet = `M3.4,${f(cy + 0.8)} L3.4,-1.1 L6.4,-1.1 L6.4,${f(cy + 0.8)} M2.8,${f(cy - 0.8)} L2.8,${f(cy + 0.8)} M7.0,${f(cy - 0.8)} L7.0,${f(cy + 0.8)} ${O2(4.8, cy, 0.34)} ${O2(4.8, cy, 0.22)} ${repeat(4.45, 5.15, 0.1, (x) => `M${x},${f(cy - 1.15)} L${x},${f(cy - 0.85)}`)} M5.6,-1.25 L6.5,-1.45 L6.6,-1.32 L5.75,-1.15 ${repeat(2.45, 2.7, 0.08, (x) => `M${x},${f(cy - 0.7)} L${x},${f(cy + 0.7)}`)}`;
    ot = px(4.8, cy - 1.2);
  }
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

const MODELS: Record<string, PistolModel> = {
  glock17: G(7.32, 8.03, 4.49, 0.98, 2.83),
  glock19: G(6.85, 7.36, 4.02, 0.98, 2.8),
  glock26: G(6.26, 6.5, 3.43, 0.98, 2.83),
  g43x: G(6.06, 6.5, 3.41, 0.9, 2.64),
  g48: G(6.85, 7.28, 4.17, 0.9, 2.64),
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

/* Pistols are drawn from the makers' own patent drawings (see scripts/pistol-profiles/trace.py): the P320 and P365
 * from Sig's design patents, the Glocks from Glock's G42 utility patent. Each is calibrated to the published length
 * and height of the gun it shows, then fitted to each slide, frame and grip size. */

type ProfileKey = 'p320' | 'p365' | 'glock';

/** The size each patent drawing shows, and what the patents leave as broken lines (trigger) or don't show. */
const PROFILE_REF: Record<ProfileKey, { oal: number; h: number; rake: number; portH: number }> = {
  p320: { oal: 8.0, h: 5.5, rake: 0.2, portH: 0.52 },
  p365: { oal: 5.8, h: 4.3, rake: 0.1, portH: 0.4 },
  glock: { oal: 5.94, h: 4.13, rake: 0.29, portH: 0.48 },
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
function glockGrip(traced: number[], o: { SH: number; hole: number[]; slim: boolean; grooves: number; yGB: number }) {
  const { SH, slim, grooves: n, yGB } = o;
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
  const gw = slim ? 1.85 : 2.08;
  const hx = -tang - 0.25;
  const toeX = hx + gw;
  const fs = 0.31; // front strap rake, inches back per inch down
  const front = (y: number) => toeX + fs * (yGB - y);
  const A = [X(iA), Y(iA)];
  const fy = A[1] + 0.24;
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
  // Back strap, heel up to the web; Gen3/4 hump low down. It runs straight above that, so the web can carry its line on.
  const wx = -tang + (slim ? 0.57 : 0.59), wy = SH + 0.74;
  q([hx + 0.08, yGB], [hx, yGB], [hx - 0.01, yGB - 0.1], 3);
  const yb0 = yGB - 0.1, sx = (wx - hx + 0.01) / (yb0 - wy);
  const bx = (y: number) => hx - 0.01 + sx * (yb0 - y);
  const yw = SH + 1.05;
  for (let y = yb0 - 0.05; y > yw + 0.02; y -= 0.05) {
    const t = (yb0 - y) / (yb0 - wy);
    pts.push(bx(y) - (n ? 0.09 * Math.exp(-(((t - 0.3) / 0.16) ** 2)) : 0), y);
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
    return [x - R.rake * (y2 - y), y2];
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
  const hole = pr.frame.hole ? polyPath(scF(pr.frame.hole), frameMap, true) : '';
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
    const grip9 = glockGrip(traced, { SH, hole: mk.hole, slim: o.slim, grooves: spec.grooves, yGB: spec.gripH - SIGHT - BASE });
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
    const rearSerr = repeat(0.24, 1.12, 0.11, (x) => `M${x},0.2 L${f(x - 0.07)},${f(SH - 0.24)}`);
    const fSerr = o.frontSerr ? repeat(SL - 1.45, SL - 0.8, 0.12, (x) => `M${x},0.2 L${f(x - 0.07)},${f(SH - 0.3)}`) : '';
    const extractor = `M${f(port0 - 0.42)},0.26 L${f(port0 - 0.04)},0.26 L${f(port0 - 0.04)},0.4 L${f(port0 - 0.42)},0.4 Z`;
    const face = `M${f(SL - 0.05)},${f(mk.bore - 0.2)} L${f(SL - 0.05)},${f(mk.bore + 0.2)}`;
    slideDetail = `${lines} ${rearSerr} ${fSerr} ${extractor} ${face}`;
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
  P.push({ slot: 'mag', z: 2, row: 'bottom', target: px((hx + tx) / 2, (hy + ty) / 2 + bb - 0.06),
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
  P.push({ slot: 'slide', z: 8, row: 'top', target: px(SL - 1.0, g.sh * 0.5),
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
  const small = fp === 'rmsc' || fp === 'rmrcc';
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

function pistol(platform: Platform, b: Build): Scene {
  const S = 58;
  const spec = pistolSpec(platform, b);
  const { m } = spec;
  const sig = m.brand === 'sig';
  const micro = sig && m.sh < 1.0;
  const has = (id: string) => platform.slots.some((s) => s.id === id);
  const trig = has('fcg') ? 'fcg' : 'fcu';
  const flat = trig === 'fcg' ? matches(b.fcg, /flat|Apex/i) : matches(b.fcu, /flat|X-Series/i);
  // Every pistol is drawn from its maker's patent drawing, fitted to each size.
  const geo = profileGeometry(sig ? (platform.id === 'p365' ? 'p365' : 'p320') : 'glock', spec, {
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
  const frameSlot = has('frame') ? 'frame' : 'grip';
  const { railY: yRail, gF, dust, yMB, bc, port0, port1, springY } = geo;
  const rear = Math.min(-tang, geo.heel[0]);
  profilePieces(P, geo, { T, px, frameSlot, trig, flat, comp, cut, lighten, SL });

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
