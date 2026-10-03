import type { ReactNode } from 'react';
import type { Build, Part, Platform } from './types';

/**
 * Blueprint-style side elevation of a build, drawn as our own line art from real-world
 * proportions (inches) and the selected parts' attributes. No product photos are traced.
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

function repeat(from: number, to: number, step: number, fn: (x: number) => string) {
  let d = '';
  for (let x = from; x <= to + 1e-6; x += step) d += fn(f(x)) + ' ';
  return d;
}

/* ================================================================== rifles */

const GAS_FROM_BOLT: Record<string, number> = { pistol: 4, carbine: 7, midlength: 9, rifle: 12 };

function rifle(platform: Platform, b: Build): Scene {
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
  P.push({ slot: 'stock', z: 2, row: 'bottom', target: px(rear + 2.2, 1.6), el: <path d={T(sd)} /> });

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

  // Pistol grip
  P.push({ slot: 'grip', z: 5, row: 'bottom', target: px(0.6 * kx, 3.3 * ky),
    el: <>
      <path d={R('M0.55,1.4 L1.95,1.45 Q2.07,1.5 2.02,1.66 L1.72,2.6 Q1.57,2.86 1.64,3.06 L1.1,4.76 Q1.0,4.96 0.79,4.95 L-0.45,4.86 Q-0.72,4.8 -0.66,4.58 L0.25,1.76 Q0.35,1.44 0.55,1.4 Z')} />
      <path className="detail" d={R('M0.3,2.3 L1.6,2.38 M0.05,3.1 L1.4,3.18 M-0.2,3.9 L1.15,3.98')} />
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
      <path className="detail" d={R(`M0.05,-0.9 L6.95,-0.9 ${repeat(0.3, 6.8, 0.394, (x) => `M${x},-1.1 L${x},-0.98`)} M2.3,-0.38 L5.0,-0.38 L5.0,0.3 L2.3,0.3 Z M0.75,-0.58 Q1.65,-0.62 1.95,-0.2 L1.95,0.12 Q1.55,0.36 0.75,0.32`) + O(1.12, -0.12, 0.17)} />
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
        <path className="detail" d={T(`M${f(RF)},-0.9 L${f(HX - 0.1)},-0.9 ${repeat(RF + 0.25, HX - 0.3, 0.394, (x) => `M${x},-1.1 L${x},-0.98`)} ${repeat(RF + 1.1, HX - 1.6, 1.6, (x) => `M${x},-0.2 L${f(x + 1.1)},-0.2 Q${f(x + 1.27)},-0.2 ${f(x + 1.27)},-0.03 Q${f(x + 1.27)},0.14 ${f(x + 1.1)},0.14 L${x},0.14 Q${f(x - 0.17)},0.14 ${f(x - 0.17)},-0.03 Q${f(x - 0.17)},-0.2 ${x},-0.2 Z`)} M${f(RF + 0.15)},-0.9 L${f(RF + 0.15)},0.95`)} />
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
    ot = px(e1 + 2.3, cy - 1.25);
  } else if (matches(opt, /reflex|510/i)) {
    od = 'M2.8,-1.1 L2.8,-1.6 L3.3,-1.6 L3.62,-3.0 Q3.7,-3.25 3.96,-3.25 L5.6,-3.25 Q5.86,-3.25 5.9,-3.0 L6.0,-1.6 L6.0,-1.1 Z M3.86,-1.75 L4.06,-2.97 L5.5,-2.97 L5.64,-1.75 Z';
    odet = 'M3.0,-1.35 L5.8,-1.35';
    ot = px(4.7, -3.25);
  } else {
    const cy = -2.3;
    od = `M2.6,${f(cy - 0.8)} L7.2,${f(cy - 0.8)} Q7.45,${f(cy - 0.8)} 7.45,${f(cy - 0.55)} L7.45,${f(cy + 0.55)} Q7.45,${f(cy + 0.8)} 7.2,${f(cy + 0.8)} L2.6,${f(cy + 0.8)} Q2.35,${f(cy + 0.8)} 2.35,${f(cy + 0.55)} L2.35,${f(cy - 0.55)} Q2.35,${f(cy - 0.8)} 2.6,${f(cy - 0.8)} Z M4.4,${f(cy - 0.8)} L4.4,${f(cy - 1.2)} L5.2,${f(cy - 1.2)} L5.2,${f(cy - 0.8)}`;
    odet = `M3.4,${f(cy + 0.8)} L3.4,-1.1 L6.4,-1.1 L6.4,${f(cy + 0.8)} M2.8,${f(cy - 0.8)} L2.8,${f(cy + 0.8)} M7.0,${f(cy - 0.8)} L7.0,${f(cy + 0.8)}`;
    ot = px(4.8, cy - 1.2);
  }
  P.push({ slot: 'optic', z: 14, row: 'top', target: ot,
    el: <><path fillRule="evenodd" d={T(od)} /><path className="detail" d={T(odet)} /></> });

  const front = BX + (mz ? mlen : 0);
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
      const m = MODELS['p365' + (a(b.slide, 'len') ?? g)];
      const ml = a(b.mag, 'len');
      return { m, frame: MODELS['p365' + g], gripH: P365_H[g], magH: ml ? P365_H[ml] : P365_H[g], grooves: 0 };
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

function pistol(platform: Platform, b: Build): Scene {
  const S = 58;
  const spec = pistolSpec(platform, b);
  const { m } = spec;
  const sig = m.brand === 'sig';
  const micro = m.sh < 1.0;
  const SL = m.slide;
  const SH = m.sh;
  const tang = Math.max(0.4, m.oal - m.slide);
  const threaded = !!b.barrel?.attrs.threaded;
  const device = platform.slots.some((s) => s.id === 'muzzle') && b.muzzle ? (b.muzzle.attrs.kind === 'comp' ? 1.25 : 0.5) : 0;
  const front = SL + Math.max(threaded ? 0.58 : 0, device ? device + 0.04 : 0);
  // Center the gun on the sheet.
  const ox = f((720 - (tang + front) * S) / 2 + tang * S);
  const oy = 112;
  const T = makeT(S, ox, oy);
  const px = (x: number, y: number): [number, number] => [f(ox + x * S), f(oy + y * S)];
  const has = (id: string) => platform.slots.some((s) => s.id === id);
  const P: Piece[] = [];

  // Vertical datums, measured down from the top of the slide.
  const yRail = SH + (micro ? 0.4 : 0.46); // bottom of the dust cover
  const yWeb = SH + 0.36; // top of the back strap, under the beavertail
  const yTrig = SH + 0.8;
  const gB = SH + (micro ? 1.22 : sig ? 1.4 : 1.36); // bottom of the trigger guard
  const yGB = spec.gripH - SIGHT - BASE; // bottom of the grip
  const yMB = spec.magH - SIGHT; // bottom of the magazine floor plate

  // Horizontal datums. The heel of the grip sits just inside the published overall length,
  // the back strap rises from it at the grip angle, and the trigger sits at the published reach.
  const heel = -tang + (sig ? 0.1 : 0.06);
  // The back strap stands a little more upright than the front strap (palm swell at the top).
  const bk = (y: number) => f(heel + (yGB - y) * m.rake * 0.78);
  const xt = f(bk(yTrig) + m.reach); // trigger face
  const frTop = xt - (sig ? 0.4 : 0.42);
  const fr = (y: number) => f(frTop - (y - yRail) * m.rake);
  const gF = f(xt + (micro ? 0.86 : sig ? 1.0 : 1.04)); // front of the trigger guard
  const dust = f(spec.frame.slide - (sig ? 0.42 : 0.58));

  /* Frame or grip module */
  const frameSlot = has('frame') ? 'frame' : 'grip';
  let strap = '';
  if (spec.grooves) {
    const y0 = gB + 0.22;
    const step = (yGB - 0.25 - y0) / spec.grooves;
    for (let i = 0; i < spec.grooves; i++) {
      const ya = y0 + step * i;
      const yb = ya + step;
      strap += ` Q${f(fr((ya + yb) / 2) - 0.14)},${f((ya + yb) / 2)} ${fr(yb)},${f(yb)}`;
    }
    strap += ` L${fr(yGB - 0.1)},${f(yGB - 0.1)}`;
  } else {
    strap = ` L${fr(yGB - 0.1)},${f(yGB - 0.1)}`;
  }
  const guardOuter = sig
    ? `L${f(gF - 0.1)},${f(yRail)} Q${f(gF + 0.02)},${f(yRail + 0.1)} ${gF},${f(yRail + 0.35)} Q${f(gF - 0.02)},${f(gB)} ${f(gF - 0.45)},${f(gB)} L${f(fr(gB) + 0.3)},${f(gB)} Q${fr(gB)},${f(gB)} ${fr(gB + 0.18)},${f(gB + 0.18)}`
    : `L${f(gF - 0.04)},${f(yRail)} L${gF},${f(yRail + 0.08)} L${f(gF - 0.04)},${f(gB - 0.12)} Q${f(gF - 0.06)},${f(gB)} ${f(gF - 0.2)},${f(gB)} L${f(fr(gB) + 0.18)},${f(gB)} Q${fr(gB)},${f(gB)} ${fr(gB + 0.14)},${f(gB + 0.14)}`;
  const tail = sig
    ? `L${f(bk(yWeb + 0.22) + 0.02)},${f(yWeb + 0.22)} Q${f(bk(yWeb) - 0.06)},${f(yWeb - 0.02)} ${f(-tang + 0.2)},${f(SH + 0.24)} Q${f(-tang)},${f(SH + 0.22)} ${f(-tang + 0.02)},${f(SH + 0.08)} Q${f(-tang + 0.06)},${SH} ${f(-tang + 0.24)},${SH}`
    : `L${f(bk(yWeb + 0.2))},${f(yWeb + 0.2)} Q${f(bk(yWeb) - 0.05)},${f(yWeb - 0.04)} ${f(-tang + 0.16)},${f(SH + 0.2)} L${f(-tang)},${f(SH + 0.16)} L${f(-tang + 0.04)},${f(SH + 0.04)} L${f(-tang + 0.2)},${SH}`;
  const frameD = `M0.3,${SH} L${f(dust - 0.06)},${SH} L${dust},${f(SH + 0.08)} L${dust},${f(yRail - 0.08)} Q${dust},${f(yRail)} ${f(dust - 0.1)},${f(yRail)} ${guardOuter}${strap} Q${fr(yGB)},${f(yGB)} ${f(fr(yGB) - 0.14)},${f(yGB)} L${f(bk(yGB) + 0.1)},${f(yGB)} Q${f(bk(yGB) - 0.04)},${f(yGB)} ${f(bk(yGB - 0.12))},${f(yGB - 0.12)} ${tail} Z`;
  const hole = sig
    ? `M${f(fr(yRail) + 0.12)},${f(yRail)} L${f(gF - 0.18)},${f(yRail)} Q${f(gF - 0.14)},${f(gB - 0.14)} ${f(gF - 0.5)},${f(gB - 0.14)} L${f(fr(gB - 0.14) + 0.36)},${f(gB - 0.14)} Q${f(fr(gB - 0.3) + 0.1)},${f(gB - 0.16)} ${f(fr(yRail + 0.3) + 0.12)},${f(yRail + 0.3)} Z`
    : `M${f(fr(yRail) + 0.12)},${f(yRail)} L${f(gF - 0.16)},${f(yRail)} L${f(gF - 0.2)},${f(gB - 0.24)} Q${f(gF - 0.22)},${f(gB - 0.14)} ${f(gF - 0.32)},${f(gB - 0.14)} L${f(fr(gB - 0.14) + 0.28)},${f(gB - 0.14)} Q${f(fr(gB - 0.14) + 0.12)},${f(gB - 0.16)} ${f(fr(yRail + 0.3) + 0.12)},${f(yRail + 0.3)} Z`;
  // Grip texture panel, rail slot, magazine release, takedown and slide stop
  const tex0 = yWeb + 0.5;
  const tex1 = yGB - 0.2;
  const panel = `M${f(bk(tex0) + 0.14)},${f(tex0)} L${f(fr(tex0) - (spec.grooves ? 0.3 : 0.16))},${f(tex0)} L${f(fr(tex1) - (spec.grooves ? 0.3 : 0.16))},${f(tex1)} L${f(bk(tex1) + 0.14)},${f(tex1)} Z`;
  const railSlot = dust - xt > 2.2
    ? `M${f(dust - 0.9)},${f(yRail - 0.18)} L${f(dust - 0.7)},${f(yRail - 0.18)} L${f(dust - 0.7)},${f(yRail)} M${f(dust - 0.9)},${f(yRail - 0.18)} L${f(dust - 0.9)},${f(yRail)}`
    : '';
  const railLine = `M${f(gF + 0.1)},${f(yRail - 0.14)} L${f(dust - 0.06)},${f(yRail - 0.14)}`;
  const magRel = `M${f(fr(yRail + 0.14) - 0.02)},${f(yRail + 0.1)} L${f(fr(yRail + 0.14) + 0.12)},${f(yRail + 0.1)} L${f(fr(yRail + 0.42) + 0.12)},${f(yRail + 0.38)} L${f(fr(yRail + 0.42) - 0.02)},${f(yRail + 0.38)} Z`;
  const takedown = sig
    ? `${O2(xt + 0.32, SH + 0.18, 0.1)} M${f(xt + 0.32)},${f(SH + 0.28)} L${f(xt + 0.22)},${f(SH + 0.4)}`
    : `M${f(xt - 0.02)},${f(SH + 0.08)} L${f(xt + 0.3)},${f(SH + 0.08)} L${f(xt + 0.3)},${f(SH + 0.22)} L${f(xt - 0.02)},${f(SH + 0.22)} Z`;
  const stop = sig
    ? `M${f(xt - 1.3)},${f(SH + 0.04)} L${f(xt + 0.05)},${f(SH + 0.04)} Q${f(xt + 0.12)},${f(SH + 0.1)} ${f(xt + 0.05)},${f(SH + 0.16)} L${f(xt - 1.0)},${f(SH + 0.16)} L${f(xt - 1.2)},${f(SH + 0.3)} L${f(xt - 1.42)},${f(SH + 0.3)} Z`
    : `M${f(xt - 1.22)},${f(SH + 0.03)} L${f(xt - 0.42)},${f(SH + 0.03)} Q${f(xt - 0.36)},${f(SH + 0.09)} ${f(xt - 0.42)},${f(SH + 0.14)} L${f(xt - 1.22)},${f(SH + 0.14)} Z`;
  P.push({ slot: frameSlot, z: 3, row: 'bottom', target: px((bk(yGB - 0.9) + fr(yGB - 0.9)) / 2, yGB - 0.9),
    el: <>
      <path fillRule="evenodd" d={T(`${frameD} ${hole}`)} />
      <path className="detail" d={T(`${panel} ${railSlot} ${railLine} ${magRel} ${stop}`) + ''} />
      <path className="detail" d={T(takedown)} />
    </> });

  /* Magazine: hidden inside the grip, floor plate and any extension visible */
  const mTop = yWeb + 0.12;
  const mIn = Math.min(yMB, yGB);
  P.push({ slot: 'mag', z: 2, row: 'bottom', target: px((bk(yMB) + fr(yMB)) / 2, yMB - 0.06),
    el: <>
      <path className="hidden-line" d={T(`M${f(bk(mTop) + 0.3)},${f(mTop)} L${f(fr(mTop) - 0.34)},${f(mTop)} L${f(fr(mIn) - 0.34)},${f(mIn)} L${f(bk(mIn) + 0.3)},${f(mIn)} Z`)} />
      <path d={T(`M${f(bk(yGB) + 0.1)},${f(yGB)} L${f(fr(yGB) - 0.1)},${f(yGB)} L${f(fr(yMB - BASE) - 0.14)},${f(yMB - BASE)} Q${f(fr(yMB) + 0.04)},${f(yMB - BASE)} ${f(fr(yMB) - 0.04)},${f(yMB)} L${f(bk(yMB) + 0.04)},${f(yMB)} Q${f(bk(yMB) - 0.04)},${f(yMB - BASE / 2)} ${f(bk(yMB - BASE) + 0.08)},${f(yMB - BASE)} Z`)} />
    </> });

  /* Trigger and fire control */
  const trig = has('fcg') ? 'fcg' : 'fcu';
  const flat = trig === 'fcg' ? matches(b.fcg, /flat|Apex/i) : matches(b.fcu, /flat|X-Series/i);
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
  const port0 = sig ? (micro ? 1.38 : 1.7) : micro || SH < 1.1 ? 1.42 : 1.55;
  const port1 = port0 + (micro ? 1.02 : sig ? 1.3 : SH < 1.1 ? 1.1 : 1.28);
  const comp = matches(b.slide, /Comp|Spectre/);
  const frontSerr = matches(b.slide, /serration|Gen5|MOS|ZEV|Spectre|XFull|M18/i);
  const cut = (b.slide?.attrs.cut as string | undefined) ?? 'none';
  const slideD = sig
    ? `M0,0.16 Q0,0 0.16,0 L${f(SL - 0.5)},0 Q${f(SL - 0.04)},0 ${f(SL)},0.36 L${f(SL)},${f(SH - 0.42)} Q${f(SL)},${f(SH - 0.3)} ${f(SL - 0.12)},${f(SH - 0.18)} L${f(SL - 0.3)},${SH} L0.06,${SH} L0,${f(SH - 0.06)} Z`
    : `M0,0.06 Q0,0 0.06,0 L${f(SL - 0.14)},0 L${SL},0.14 L${SL},${f(SH - 0.42)} L${f(SL - 0.3)},${SH} L0.06,${SH} L0,${f(SH - 0.06)} Z`;
  const rearSerr = repeat(0.2, sig ? 1.05 : 0.98, sig ? 0.13 : 0.11, (x) => `M${x},${sig ? 0.24 : 0.16} L${f(x - 0.06)},${f(SH - 0.22)}`);
  const fSerr = frontSerr ? repeat(SL - 1.45, SL - 0.75, 0.12, (x) => `M${x},${sig ? 0.3 : 0.16} L${f(x - 0.06)},${f(SH - 0.28)}`) : '';
  const lighten = matches(b.slide, /Octane|Lightening/) ? repeat(port1 + 0.35, SL - 1.6, 0.42, (x) => `M${x},0.06 L${f(x + 0.26)},0.06 L${f(x + 0.2)},0.3 L${f(x - 0.06)},0.3 Z`) : '';
  const ports = comp ? repeat(SL - 0.95, SL - 0.35, 0.22, (x) => `M${x},0 L${f(x + 0.07)},0.26 L${f(x + 0.14)},0`) : '';
  const edge = `M0.08,${sig ? 0.22 : 0.12} L${f(SL - (sig ? 0.4 : 0.16))},${sig ? 0.22 : 0.12} M0.12,${f(SH - 0.18)} L${f(SL - (sig ? 0.24 : 0.48))},${f(SH - 0.18)}`;
  const plate = cut !== 'none' ? `M0.86,0 L0.86,0.12 L2.66,0.12 L2.66,0` : '';
  const extractor = `M${f(port0 - 0.24)},0.28 L${f(port0 - 0.04)},0.28 L${f(port0 - 0.04)},0.42 L${f(port0 - 0.24)},0.42 Z`;
  P.push({ slot: 'slide', z: 8, row: 'top', target: px(SL - (frontSerr ? 0.6 : 1.0), SH * 0.5),
    el: <>
      <path fillRule="evenodd" d={T(`${slideD} M${f(port0)},0 L${f(port0)},0.5 L${f(port1)},0.5 L${f(port1)},0 Z`)} />
      <path className="detail" d={T(`${edge} ${rearSerr} ${fSerr} ${lighten} ${ports} ${plate} ${extractor}`)} />
    </> });

  /* Barrel: hood shows in the ejection port; the rest is hidden; threads run past the slide */
  const bc = sig ? 0.42 : 0.36; // bore line
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
  const sy = SH - 0.24;
  P.push({ slot: springSlot, internal: true, z: 20, row: 'top', target: px(SL - 1.5, sy),
    el: <path d={T(`M${f(port0 + 0.5)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy - 0.08)} L${f(SL - 0.06)},${f(sy + 0.08)} L${f(port0 + 0.5)},${f(sy + 0.08)} Z ${repeat(port0 + 0.7, SL - 0.3, 0.15, (x) => `M${x},${f(sy - 0.12)} L${f(x + 0.08)},${f(sy + 0.12)}`)}`)} /> });
  if (has('spk'))
    P.push({ slot: 'spk', internal: true, z: 20, row: 'top', target: px(0.6, bc),
      el: <path d={T(`M0.06,${f(bc - 0.09)} L${f(port0 - 0.3)},${f(bc - 0.09)} L${f(port0 - 0.3)},${f(bc + 0.09)} L0.06,${f(bc + 0.09)} Z M0.06,${f(bc - 0.2)} L0.24,${f(bc - 0.2)} L0.24,${f(bc + 0.2)} L0.06,${f(bc + 0.2)}`)} /> });

  /* Sights */
  const sh = b.sights?.attrs.height === 'suppressor' ? 0.36 : SIGHT;
  const sightSlot = has('sights') ? 'sights' : undefined;
  const sightsD = `M0.2,0 L0.26,${-sh} L0.7,${-sh} L0.74,0 Z M0.38,${-sh} L0.42,${f(-sh + 0.08)} L0.54,${f(-sh + 0.08)} L0.58,${-sh} M${f(SL - 0.62)},0 L${f(SL - 0.56)},${f(-sh + 0.02)} L${f(SL - 0.4)},${f(-sh + 0.02)} L${f(SL - 0.34)},0 Z`;
  P.push({ slot: sightSlot, z: 10, row: 'top', target: px(0.48, -sh), el: <path d={T(sightsD)} /> });

  /* Optic */
  const fp = (b.optic?.attrs.footprint as string) ?? (cut === 'none' ? 'rmr' : cut);
  const enclosed = fp === 'acro' || matches(b.optic, /EPS|enclosed/i);
  let od: string;
  if (enclosed) od = 'M0.9,0 L0.9,-0.86 Q0.9,-1.0 1.04,-1.0 L2.52,-1.0 Q2.66,-1.0 2.66,-0.86 L2.66,0 Z M1.08,-0.18 L1.08,-0.82 L2.48,-0.82 L2.48,-0.18 Z';
  else if (fp === 'rmsc' || fp === 'rmrcc') od = 'M0.9,0 L1.0,-0.58 Q1.08,-0.8 1.32,-0.8 L2.0,-0.8 Q2.26,-0.8 2.32,-0.56 L2.44,0 Z M1.16,-0.14 L1.26,-0.62 L2.08,-0.62 L2.18,-0.14 Z';
  else od = 'M0.9,0 L1.0,-0.66 Q1.08,-1.0 1.38,-1.0 L2.18,-1.0 Q2.48,-0.98 2.54,-0.64 L2.66,0 Z M1.18,-0.15 L1.28,-0.8 L2.28,-0.8 L2.4,-0.15 Z';
  P.push({ slot: 'optic', z: 11, row: 'top', target: px(1.78, -0.9), el: <path fillRule="evenodd" d={T(od)} /> });

  const rear = Math.min(-tang, bk(Math.max(yGB, yMB)));
  const vx = f(ox + (front + 0.5) * S);
  return {
    width: 720, height: 560, pieces: P,
    center: [f(ox + (-tang - 0.4) * S), f(ox + (front + 0.4) * S), f(oy + bc * S)],
    dims: [[f(ox + rear * S), f(ox + front * S), 540, `${inch2(front - rear)} overall`]],
    vdims: [[vx, f(oy - sh * S), f(oy + yMB * S), `${inch2(yMB + sh)} tall`]],
    rows: [26, 500],
    spec: `${inch2(m.barrel)} barrel · ${inch2(SL)} slide`,
  };
}

const inch2 = (n: number) => `${n.toFixed(2)}"`;
const O2 = (x: number, y: number, r: number) =>
  `M${f(x - r)},${f(y)} Q${f(x - r)},${f(y - r)} ${f(x)},${f(y - r)} Q${f(x + r)},${f(y - r)} ${f(x + r)},${f(y)} Q${f(x + r)},${f(y + r)} ${f(x)},${f(y + r)} Q${f(x - r)},${f(y + r)} ${f(x - r)},${f(y)} Z`;

/* ================================================================== render */

export function sceneFor(platform: Platform, build: Build): Scene {
  return platform.family === 'Rifle' ? rifle(platform, build) : pistol(platform, build);
}

export function Blueprint({ platform, build, states, active, onPick, onHover, compact }: {
  platform: Platform;
  build: Build;
  states: Record<string, RegionState>;
  active?: string | null;
  onPick?: (slot: string) => void;
  onHover?: (slot: string | null) => void;
  /** Thumbnail mode: no callouts, dimensions or interaction. */
  compact?: boolean;
}) {
  const scene = sceneFor(platform, build);
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
        return (
          <g
            key={p.slot}
            className={cls}
            role="button"
            tabIndex={0}
            aria-label={`${numberOf.get(slot.id)}. ${slot.name}${part ? `: ${part.brand} ${part.name}` : ', empty'}`}
            onClick={() => onPick(slot.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(slot.id); } }}
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
      {!compact && scene.dims.map(([x0, x1, y, text], i) => (
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
