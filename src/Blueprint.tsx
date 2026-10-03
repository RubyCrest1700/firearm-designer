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

interface Dims { slide: number; dust: number; grip: number; mag: number; brand: 'glock' | 'sig' }

const GLOCK: Record<string, [number, number]> = { glock17: [7.28, 3.55], glock19: [6.85, 3.1], glock26: [6.3, 2.3] };
const GLOCK_MAG: Record<number, number> = { 3: 3.55, 2: 3.1, 1: 2.3 };
const SLIM: Record<string, number> = { '43X': 6.5, '48': 7.28 };
const P320_SLIDE: Record<string, number> = { full: 7.9, compact: 7.2, subcompact: 6.7 };
const P320_GRIP: Record<string, [string, number]> = { full: ['full', 3.55], carry: ['compact', 3.55], compact: ['compact', 3.35], subcompact: ['subcompact', 2.75] };
const P365_SLIDE: Record<string, number> = { std: 5.8, xl: 6.6 };
const P365_GRIP: Record<string, number> = { std: 2.35, xl: 2.85 };
const P365_MAG: Record<string, number> = { std: 2.35, xl: 2.85, ext: 3.2 };

function pistolDims(platform: Platform, b: Build): Dims {
  const a = (p: Part | undefined, k: string) => p?.attrs[k] as string | undefined;
  switch (platform.id) {
    case 'glock43x': {
      const slide = SLIM[a(b.slide, 'len') ?? '48'];
      const frame = SLIM[a(b.frame, 'len') ?? a(b.slide, 'len') ?? '48'];
      return { slide, dust: frame - 0.62, grip: 3.1, mag: 3.1, brand: 'glock' };
    }
    case 'p320': {
      const [dust, grip] = P320_GRIP[a(b.grip, 'size') ?? 'carry'];
      const slide = P320_SLIDE[a(b.slide, 'length') ?? dust];
      const ms = a(b.mag, 'size');
      return { slide, dust: P320_SLIDE[dust] - 0.62, grip, mag: ms ? P320_GRIP[ms][1] : grip, brand: 'sig' };
    }
    case 'p365': {
      const grip = P365_GRIP[a(b.grip, 'len') ?? 'xl'];
      const slide = P365_SLIDE[a(b.slide, 'len') ?? 'xl'];
      const m = a(b.mag, 'len');
      return { slide, dust: 5.2, grip, mag: m ? P365_MAG[m] : grip, brand: 'sig' };
    }
    default: {
      const [slide, grip] = GLOCK[platform.id] ?? GLOCK.glock19;
      const ms = b.mag?.attrs.size as number | undefined;
      return { slide, dust: slide - 0.62, grip, mag: ms ? GLOCK_MAG[ms] : grip, brand: 'glock' };
    }
  }
}

function pistol(platform: Platform, b: Build): Scene {
  const S = 60;
  const ox = 170;
  const oy = 120;
  const T = makeT(S, ox, oy);
  const px = (x: number, y: number): [number, number] => [f(ox + x * S), f(oy + y * S)];
  const d = pistolDims(platform, b);
  const sig = d.brand === 'sig';
  const SL = d.slide;
  const DC = d.dust;
  const rake = sig ? 0.27 : 0.31; // grip angle, inches back per inch down
  const GT = 1.74; // where the grip leaves the frame
  const GB = GT + d.grip; // bottom of grip
  const bk = (y: number) => f(0.5 - (y - GT) * rake); // back strap x at height y
  const fr = (y: number) => f(2.32 - (y - GT) * rake); // front strap x at height y
  const has = (id: string) => platform.slots.some((s) => s.id === id);
  const P: Piece[] = [];

  // Frame / grip module
  const frameSlot = has('frame') ? 'frame' : 'grip';
  const guard = sig
    ? `M2.32,1.72 Q2.32,2.62 2.89,2.64 L3.39,2.64 Q3.84,2.6 3.89,1.72 Z M2.48,1.72 Q2.48,2.48 2.92,2.49 L3.36,2.49 Q3.7,2.46 3.73,1.72 Z`
    : `M2.32,1.72 L2.34,2.42 Q2.39,2.64 2.64,2.64 L3.48,2.64 Q3.68,2.64 3.72,2.44 L3.84,1.72 Z M2.48,1.72 L2.5,2.34 Q2.53,2.49 2.67,2.49 L3.42,2.49 Q3.55,2.49 3.57,2.35 L3.67,1.72 Z`;
  P.push({ slot: frameSlot, z: 3, row: 'bottom', target: px((bk(GB - 0.9) + fr(GB - 0.9)) / 2, GB - 0.9),
    el: <>
      <path d={T(`M0.16,1.12 L${f(DC - 0.25)},1.12 L${f(DC)},1.2 L${f(DC)},1.56 Q${f(DC)},1.74 ${f(DC - 0.2)},1.74 L2.32,1.74 L${fr(GB - 0.08)},${f(GB - 0.08)} Q${fr(GB)},${f(GB)} ${f(fr(GB) - 0.12)},${f(GB)} L${f(bk(GB) + 0.08)},${f(GB)} Q${f(bk(GB) - 0.06)},${f(GB)} ${f(bk(GB) - 0.04)},${f(GB - 0.12)} L${bk(GT + 0.25)},${f(GT + 0.25)} Q${f(bk(GT) - 0.04)},1.46 0.04,1.38 Q-0.3,1.32 -0.34,1.2 Q-0.3,1.12 0.16,1.12 Z`)} />
      <path fillRule="evenodd" d={T(guard)} />
      <path className="detail" d={T(`M${f(DC - 1.9)},1.6 ${repeat(DC - 1.75, DC - 0.6, 0.38, (x) => `M${x},1.6 L${x},1.74`)} ${repeat(GT + 0.6, GB - 0.35, 0.22, (y) => `M${f(bk(y) + 0.22)},${y} L${f(fr(y) - 0.22)},${y}`)} M2.14,1.86 L2.34,1.86 L2.31,2.1 L2.11,2.1 Z M2.7,1.16 L3.4,1.16 L3.4,1.3 L2.7,1.3 Z`)} />
    </> });

  // Magazine: hidden inside the grip; any part below the grip is visible
  const MB = GT + d.mag;
  const out = MB > GB + 0.02;
  P.push({ slot: 'mag', z: 2, row: 'bottom', target: px((bk(MB) + fr(MB)) / 2, MB + 0.08),
    el: <>
      <path className="hidden-line" d={T(`M${f(bk(GT + 0.1) + 0.28)},${f(GT + 0.1)} L${f(fr(GT + 0.1) - 0.3)},${f(GT + 0.1)} L${f(fr(Math.min(MB, GB)) - 0.3)},${f(Math.min(MB, GB))} L${f(bk(Math.min(MB, GB)) + 0.28)},${f(Math.min(MB, GB))} Z`)} />
      <path d={T(`${out ? `M${f(bk(GB) + 0.2)},${f(GB)} L${f(fr(GB) - 0.22)},${f(GB)} L${f(fr(MB) - 0.22)},${f(MB)} L${f(bk(MB) + 0.2)},${f(MB)} Z ` : ''}M${f(bk(MB) + 0.02)},${f(MB)} L${f(fr(MB) - 0.06)},${f(MB)} L${f(fr(MB + 0.18) - 0.1)},${f(MB + 0.18)} L${f(bk(MB + 0.18) + 0.04)},${f(MB + 0.18)} Z`)} />
    </> });

  // Trigger / fire control
  const trig = has('fcg') ? 'fcg' : 'fcu';
  P.push({ slot: trig, z: 5, row: 'bottom', target: px(2.95, 2.2),
    el: <>
      <path d={T('M2.88,1.74 Q2.72,2.06 2.94,2.4 L3.06,2.38 Q2.88,2.06 3.03,1.74 Z')} />
      {trig === 'fcu' && <path className="hidden-line" d={T('M0.25,1.18 L3.6,1.18 L3.6,1.62 L0.25,1.62 Z M0.6,1.18 L0.6,1.62')} />}
    </> });

  // Slide
  const comp = matches(b.slide, /Comp|Spectre/);
  const slideD = sig
    ? `M0.12,0 L${f(SL - 0.35)},0 Q${f(SL)},0.02 ${f(SL)},0.38 L${f(SL)},0.86 Q${f(SL - 0.05)},1.12 ${f(SL - 0.3)},1.12 L0.1,1.12 L0,1.0 L0,0.12 Q0,0 0.12,0 Z`
    : `M0.06,0 L${f(SL - 0.1)},0 Q${f(SL)},0 ${f(SL)},0.12 L${f(SL)},0.74 L${f(SL - 0.34)},1.12 L0.1,1.12 L0,1.02 L0,0.08 Q0,0 0.06,0 Z`;
  P.push({ slot: 'slide', z: 8, row: 'top', target: px(SL - 1.0, 0.2),
    el: <>
      <path d={T(slideD)} />
      <path className="detail" d={T(`M0.1,0.84 L${f(SL - (sig ? 0.2 : 0.55))},0.84 ${repeat(0.3, 1.0, 0.12, (x) => `M${x},0.12 L${f(x - 0.08)},0.78`)} M1.62,0 L1.62,0.42 L2.92,0.42 L2.92,0 ${comp ? repeat(SL - 1.05, SL - 0.3, 0.25, (x) => `M${x},0 L${f(x + 0.08)},0.3 L${f(x + 0.16)},0`) : ''}`)} />
    </> });

  // Barrel: hood in the ejection port, the rest hidden; threads past the slide
  const threaded = !!b.barrel?.attrs.threaded;
  P.push({ slot: 'barrel', z: 9, row: 'top', target: px(2.25, 0.2),
    el: <>
      <path d={T('M1.66,0.04 L2.88,0.04 L2.88,0.38 L1.66,0.38 Z')} />
      <path className="hidden-line" d={T(`M2.88,0.18 L${f(SL)},0.18 M2.88,0.62 L${f(SL)},0.62 M1.5,0.38 L1.5,0.62 L2.88,0.62`)} />
      {threaded && <path d={T(`M${f(SL)},0.2 L${f(SL + 0.58)},0.2 L${f(SL + 0.58)},0.6 L${f(SL)},0.6 Z ${repeat(SL + 0.1, SL + 0.5, 0.08, (x) => `M${x},0.2 L${x},0.6`)}`)} />}
    </> });

  const springSlot = has('rsa') ? 'rsa' : 'spring';
  P.push({ slot: springSlot, internal: true, z: 20, row: 'top', target: px(SL - 1.3, 0.8),
    el: <path d={T(`M2.05,0.72 L${f(SL - 0.08)},0.72 L${f(SL - 0.08)},0.88 L2.05,0.88 Z ${repeat(2.3, SL - 0.35, 0.16, (x) => `M${x},0.68 L${f(x + 0.08)},0.92`)}`)} /> });
  P.push({ slot: 'spk', internal: true, z: 20, row: 'top', target: px(0.6, 0.38),
    el: <path d={T('M0.04,0.28 L1.9,0.28 L1.9,0.48 L0.04,0.48 Z M0.04,0.18 L0.2,0.18 L0.2,0.58 L0.04,0.58')} /> });

  const sh = b.sights?.attrs.height === 'suppressor' ? 0.36 : 0.2;
  P.push({ slot: 'sights', z: 10, row: 'top', target: px(0.55, -sh),
    el: <path d={T(`M0.28,0 L0.32,${-sh} L0.82,${-sh} L0.86,0 Z M${f(SL - 0.62)},0 L${f(SL - 0.58)},${f(-sh + 0.02)} L${f(SL - 0.38)},${f(-sh + 0.02)} L${f(SL - 0.34)},0 Z`)} /> });

  const fp = (b.optic?.attrs.footprint as string) ?? 'rmr';
  const enclosed = fp === 'acro' || matches(b.optic, /EPS|enclosed/i);
  let od: string;
  if (enclosed) od = 'M1.0,0 L1.0,-0.86 Q1.0,-1.0 1.14,-1.0 L2.62,-1.0 Q2.76,-1.0 2.76,-0.86 L2.76,0 Z M1.18,-0.18 L1.18,-0.82 L2.58,-0.82 L2.58,-0.18 Z';
  else if (fp === 'rmsc') od = 'M1.0,0 L1.12,-0.58 Q1.2,-0.8 1.44,-0.8 L2.12,-0.8 Q2.38,-0.8 2.44,-0.56 L2.56,0 Z M1.28,-0.14 L1.38,-0.62 L2.2,-0.62 L2.3,-0.14 Z';
  else od = 'M1.0,0 L1.1,-0.64 Q1.18,-0.98 1.48,-0.98 L2.28,-0.98 Q2.58,-0.96 2.64,-0.62 L2.76,0 Z M1.28,-0.15 L1.38,-0.78 L2.38,-0.78 L2.5,-0.15 Z';
  P.push({ slot: 'optic', z: 11, row: 'top', target: px(1.88, -0.9), el: <path fillRule="evenodd" d={T(od)} /> });

  const rear = Math.min(bk(Math.max(GB, MB)), -0.34);
  const front = SL + (threaded ? 0.58 : 0);
  const height = Math.max(MB + 0.18, GB) + (b.optic ? 1.0 : sh);
  return {
    width: 760, height: 560, pieces: P,
    center: [f(ox + -0.6 * S), f(ox + (front + 0.6) * S), f(oy + 0.4 * S)],
    dims: [[f(ox + rear * S), f(ox + front * S), 540, `${inch(front - rear)} long · ${inch(height)} tall`]],
    rows: [26, 496],
    spec: `${inch(SL)} slide · ${inch(d.grip)} grip`,
  };
}

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
    ? (platform.family === 'Rifle' ? `40 60 ${scene.width - 60} ${scene.height - 140}` : `40 40 ${scene.width - 140} ${scene.height - 120}`)
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
          <g key={'c-' + slot} className={'bp-callout ' + (states[slot] ?? 'empty') + (slot === active ? ' active' : '')} aria-hidden="true">
            <path d={`M${x},${y + dir * 12} L${x},${y + dir * 22} L${tx},${ty}`} />
            <circle cx={tx} cy={ty} r="2.4" className="tip" />
            <circle cx={x} cy={y} r="12" className="bubble" />
            <text x={x} y={y} dy="0.36em" textAnchor="middle">{numberOf.get(slot)}</text>
          </g>
        );
      })}
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
