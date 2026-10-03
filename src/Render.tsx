import type { ReactNode } from 'react';
import type { Build, Part, Platform } from './types';

/**
 * Side-profile illustration of a build, drawn from the selected parts' attributes:
 * barrel and handguard length, gas system, stock and optic type, slide and grip size,
 * magazine length. Everything here is our own vector art; no retailer imagery.
 */

export type RegionState = 'empty' | 'ok' | 'warn' | 'error';

type Mat = 'metal' | 'poly' | 'coyote' | 'glass';

interface Piece {
  /** Slot this drawing belongs to; absent for context drawn on platforms without that slot. */
  slot?: string;
  /** Internal parts are drawn as dashed x-ray outlines. */
  internal?: boolean;
  mat?: Mat;
  /** Draw order: lower first. */
  z?: number;
  target: [number, number];
  row: 'top' | 'bottom';
  el: ReactNode;
}

interface Scene {
  viewBox: [number, number, number, number];
  pieces: Piece[];
  /** Overall length dimension: [x from, x to, y, label] */
  dim: [number, number, number, string];
  /** y of the top and bottom rows of callout bubbles */
  rows: [number, number];
}

const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
const has = (p: Part | undefined, re: RegExp) => !!p && re.test(`${p.name} ${p.specs.join(' ')}`);
const fmtIn = (n: number) => `${n.toFixed(1).replace(/\.0$/, '')} in`;

/* ------------------------------------------------------------------ rifles */

const GAS_POS: Record<string, number> = { pistol: 4, carbine: 7.5, midlength: 9.5, rifle: 12.5 };

function rifleScene(platform: Platform, b: Build): Scene {
  const S = 20; // px per inch
  const big = platform.id === 'ar10';
  const R0 = big ? 290 : 300; // rear of receiver
  const RF = big ? 500 : 480; // front of upper receiver
  const Mb = big ? 226 : 214; // bottom of magwell
  const M0 = R0 + 96;
  const M1 = R0 + (big ? 162 : 156);
  const P: Piece[] = [];

  // Buffer tube
  const tubeKind = (b.buffer?.attrs.tube as string) ?? ((b.stock?.attrs.fits as string[] | undefined)?.[0] === 'rifle' ? 'rifle' : 'carbine');
  const tubeLen = (tubeKind === 'rifle' ? 9.8 : tubeKind === 'a5' ? 8 : 7.2) * S;
  const TR = R0 - tubeLen;
  P.push({ slot: 'buffer', mat: 'metal', z: 1, row: 'bottom', target: [R0 - tubeLen / 2, 139],
    el: <path d={`M${TR},121 L${R0 - 8},121 L${R0 - 8},117 L${R0},117 L${R0},143 L${R0 - 8},143 L${R0 - 8},139 L${TR},139 Z`} /> });

  // Stock
  const stock = b.stock;
  let stockPath: string;
  let rear: number;
  if (has_(stock, /A2/)) {
    rear = TR - 8;
    stockPath = `M${rear},106 Q${rear + 6},104 ${rear + 30},110 L${R0 - 10},119 L${R0 - 10},141 L${rear + 60},190 Q${rear + 40},204 ${rear},206 Z M${rear + 4},110 L${rear + 4},202`;
  } else if (has_(stock, /PRS|Precision/)) {
    rear = TR - 8;
    stockPath = `M${rear},104 L${R0 - 50},104 Q${R0 - 30},104 ${R0 - 22},118 L${R0 - 10},119 L${R0 - 10},141 L${rear + 120},150 L${rear + 110},198 L${rear + 70},198 L${rear + 64},160 L${rear + 40},204 L${rear},206 Z M${rear + 4},106 L${rear + 4},202 M${rear + 30},110 L${R0 - 60},110`;
  } else {
    const bulky = has_(stock, /UBR/);
    rear = TR - 22;
    const top = bulky ? 104 : 110;
    stockPath = `M${rear},${top} L${rear + 18},${top} L${rear + 128},117 L${rear + 150},117 L${rear + 150},143 L${rear + 130},146 L${rear + 44},${bulky ? 200 : 194} Q${rear + 20},202 ${rear},202 Z M${rear + 5},${top + 2} L${rear + 5},199 M${rear + 30},150 L${rear + 110},132`;
  }
  P.push({ slot: 'stock', mat: 'poly', z: 2, row: 'bottom', target: [rear + 40, 160], el: <path d={stockPath} /> });

  // Lower receiver, grip, trigger, controls, magazine
  P.push({ slot: 'mag', mat: 'poly', z: 1, row: 'bottom', target: [M0 + 40, Mb + 50],
    el: big
      ? <path d={`M${M0 + 3},${Mb} L${M1 - 3},${Mb} L${M1 + 8},${Mb + 96} Q${M1 + 8},${Mb + 104} ${M1},${Mb + 104} L${M0 + 20},${Mb + 108} Q${M0 + 12},${Mb + 108} ${M0 + 11},${Mb + 100} Z M${M0 + 10},${Mb + 30} L${M1 + 1},${Mb + 28} M${M0 + 13},${Mb + 60} L${M1 + 4},${Mb + 58}`} />
      : <path d={`M${M0 + 3},${Mb} L${M1 - 3},${Mb} L${M1 + 18},${Mb + 76} Q${M1 + 20},${Mb + 84} ${M1 + 12},${Mb + 86} L${M0 + 28},${Mb + 92} Q${M0 + 20},${Mb + 93} ${M0 + 18},${Mb + 85} Z M${M0 + 10},${Mb + 26} L${M1 + 3},${Mb + 22}`} /> });
  P.push({ slot: 'lower', mat: 'metal', z: 3, row: 'bottom', target: [M0 + 30, 170],
    el: <path d={`M${R0 + 2},152 L${RF - 6},152 L${RF - 6},170 L${M1 + 3},178 L${M1 + 3},${Mb} L${M0},${Mb} L${M0},182 L${R0 + 30},182 L${R0 + 14},194 L${R0 + 2},192 Z M${R0 + 12},160 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0 M${RF - 16},160 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0`} /> });
  P.push({ slot: 'grip', mat: 'poly', z: 4, row: 'bottom', target: [R0 + 34, 236],
    el: <path d={`M${R0 + 30},182 L${R0 + 70},182 L${R0 + 44},266 Q${R0 + 40},272 ${R0 + 30},271 L${R0 + 6},267 Q${R0 - 2},265 ${R0},257 Z M${R0 + 22},205 L${R0 + 52},207 M${R0 + 16},228 L${R0 + 46},230 M${R0 + 10},250 L${R0 + 38},252`} /> });
  P.push({ slot: 'lpk', mat: 'metal', z: 5, row: 'bottom', target: [R0 + 42, 166],
    el: <path d={`M${R0 + 42},166 m-6,0 a6,6 0 1,0 12,0 a6,6 0 1,0 -12,0 M${R0 + 68},184 L${R0 + 68},212 Q${R0 + 70},216 ${R0 + 76},216 L${M0 + 24},216 Q${M0 + 28},215 ${M0 + 30},210 M${M1 - 2},162 L${M1 + 8},162 L${M1 + 8},172 L${M1 - 2},172 Z`} /> });
  P.push({ slot: 'trigger', mat: 'metal', z: 5, row: 'bottom', target: [R0 + 84, 198],
    el: <path d={`M${R0 + 84},182 Q${R0 + 76},196 ${R0 + 86},208 L${R0 + 89},207 Q${R0 + 81},196 ${R0 + 88},182 Z`} /> });

  // Upper receiver group
  P.push({ slot: 'upper', mat: 'metal', z: 3, row: 'top', target: [R0 + 150, 140],
    el: <path d={`M${R0 - 6},112 L${RF},112 L${RF},152 L${R0 + 2},152 L${R0 - 6},142 Z M${R0},104 L${RF},104 L${RF},112 L${R0},112 Z ${railTeeth(R0 + 4, RF, 104, 12)} M${R0 + 92},122 L${R0 + 152},122 L${R0 + 152},140 L${R0 + 92},140 Z M${R0 + 14},132 m-7,0 a7,7 0 1,0 14,0 a7,7 0 1,0 -14,0`} /> });
  P.push({ slot: 'charging', mat: 'metal', z: 4, row: 'top', target: [R0 - 24, 120],
    el: <path d={`M${R0 - 38},114 L${R0 - 2},114 L${R0 - 2},126 L${R0 - 38},126 Q${R0 - 44},126 ${R0 - 44},120 Q${R0 - 44},114 ${R0 - 38},114 Z`} /> });
  P.push({ slot: 'bcg', internal: true, z: 9, row: 'top', target: [R0 + 50, 132],
    el: <path d={`M${R0 + 4},120 L${RF - 40},120 L${RF - 40},144 L${R0 + 4},144 Z M${RF - 40},128 L${RF - 20},128 L${RF - 20},138 L${RF - 40},138`} /> });

  // Barrel, handguard, gas system, muzzle
  const L = num(b.barrel?.attrs.length, big ? 18 : 16);
  const BX = RF + L * S; // muzzle end of barrel
  const hg = b.handguard;
  const freeFloat = hg ? hg.attrs.freeFloat !== false : true;
  const H = num(hg?.attrs.length, freeFloat ? (big ? 15 : 13.5) : 9);
  const HX = RF + H * S;
  const gas = (b.barrel?.attrs.gas as string) ?? (b.gastube?.attrs.length as string) ?? 'midlength';
  const GX = RF + GAS_POS[gas] * S;
  const gasInside = GX + 12 < HX;

  P.push({ slot: 'barrel', mat: 'metal', z: 2, row: 'top', target: [Math.max(HX, RF) + (BX - Math.max(HX, RF)) / 2, 129],
    el: <path d={`M${RF},123 L${BX},124 L${BX},134 L${RF},135 Z`} /> });
  P.push({ slot: 'gastube', internal: true, z: 9, row: 'top', target: [RF + (GX - RF) / 2, 116],
    el: <path d={`M${RF - 30},116 L${GX},116`} /> });
  const fsb = b.gasblock?.attrs.profile === 'fsb';
  P.push({ slot: 'gasblock', internal: gasInside && !fsb, mat: 'metal', z: gasInside ? 9 : 6, row: 'top', target: [GX, 120],
    el: fsb
      ? <path d={`M${GX - 14},112 L${GX + 14},112 L${GX + 14},140 L${GX - 14},140 Z M${GX - 6},112 L${GX - 3},76 L${GX + 3},76 L${GX + 6},112 M${GX - 10},140 L${GX - 10},152 L${GX + 10},152 L${GX + 10},140`} />
      : <path d={`M${GX - 12},115 L${GX + 12},115 L${GX + 12},140 L${GX - 12},140 Z`} /> });
  if (freeFloat) {
    P.push({ slot: 'handguard', mat: 'metal', z: 7, row: 'top', target: [RF + (HX - RF) * 0.4, 104],
      el: <path d={`M${RF},104 L${HX - 6},104 Q${HX},104 ${HX},110 L${HX},148 Q${HX},154 ${HX - 6},154 L${RF},154 Z M${RF},98 L${HX - 4},98 L${HX - 4},104 L${RF},104 Z ${railTeeth(RF + 6, HX - 6, 98, 12)} ${mlokSlots(RF + 26, HX - 20)}`} /> });
  } else {
    const end = RF + H * S;
    P.push({ slot: 'handguard', mat: 'poly', z: 7, row: 'top', target: [RF + (end - RF) * 0.5, 108],
      el: <path d={`M${RF},104 L${RF + 14},104 L${RF + 14},154 L${RF},154 Z M${RF + 14},108 Q${RF + 18},104 ${RF + 30},104 L${end - 16},104 Q${end - 6},106 ${end - 6},116 L${end - 6},142 Q${end - 6},152 ${end - 16},154 L${RF + 30},154 Q${RF + 18},154 ${RF + 14},150 Z ${ribs(RF + 34, end - 20, 110, 148)} M${end - 6},112 L${end + 4},116 L${end + 4},142 L${end - 6},146`} /> });
  }
  const mz = b.muzzle;
  let mzPath: string;
  let mzLen: number;
  if (has_(mz, /brake/i)) {
    mzLen = 52;
    mzPath = `M${BX},118 L${BX + mzLen - 4},118 Q${BX + mzLen},118 ${BX + mzLen},122 L${BX + mzLen},136 Q${BX + mzLen},140 ${BX + mzLen - 4},140 L${BX},140 Z ${ports(BX + 10, BX + mzLen - 8, 118, 140, 9)}`;
  } else if (has_(mz, /comp/i)) {
    mzLen = 44;
    mzPath = `M${BX},119 L${BX + mzLen},119 L${BX + mzLen},139 L${BX},139 Z M${BX + 12},119 L${BX + 12},126 M${BX + 22},119 L${BX + 22},126 M${BX + 32},119 L${BX + 32},126`;
  } else {
    mzLen = 44;
    mzPath = `M${BX},120 L${BX + 6},120 L${BX + 10},118 L${BX + mzLen},118 L${BX + mzLen},140 L${BX + 10},140 L${BX + 6},138 L${BX},138 Z M${BX + 16},118 L${BX + 16},128 M${BX + 24},118 L${BX + 24},128 M${BX + 32},118 L${BX + 32},128`;
  }
  P.push({ slot: 'muzzle', mat: 'metal', z: 6, row: 'top', target: [BX + mzLen / 2, 122], el: <path d={mzPath} /> });

  // Optic on the upper rail
  const opt = b.optic;
  const cx = R0 + 100;
  let optPath: string;
  if (has_(opt, /\d+-\d+x/i)) {
    const big56 = has_(opt, /x5\d/);
    const ob = big56 ? 22 : 15;
    const fr = big56 ? 120 : 92;
    optPath = `M${cx - 96},${74 - 15} L${cx - 62},${74 - 13} L${cx - 54},${74 - 9} L${cx + 40},${74 - 9} L${cx + fr - 26},${74 - ob} L${cx + fr},${74 - ob} L${cx + fr},${74 + ob} L${cx + fr - 26},${74 + ob} L${cx + 40},${74 + 9} L${cx - 54},${74 + 9} L${cx - 62},${74 + 13} L${cx - 96},${74 + 15} Z M${cx - 8},${65} L${cx - 8},50 L${cx + 14},50 L${cx + 14},65 M${cx - 40},83 L${cx - 40},104 L${cx - 24},104 L${cx - 24},83 M${cx + 24},83 L${cx + 24},104 L${cx + 40},104 L${cx + 40},83`;
  } else if (has_(opt, /reflex|510/i)) {
    optPath = `M${cx - 30},104 L${cx - 30},92 L${cx + 34},92 L${cx + 34},104 Z M${cx - 22},92 L${cx - 8},66 L${cx + 26},62 L${cx + 30},92 M${cx - 10},88 L${cx},72 L${cx + 22},70 L${cx + 24},88`;
  } else {
    optPath = `M${cx - 36},68 L${cx + 36},68 Q${cx + 40},68 ${cx + 40},72 L${cx + 40},92 Q${cx + 40},96 ${cx + 36},96 L${cx - 36},96 Q${cx - 40},96 ${cx - 40},92 L${cx - 40},72 Q${cx - 40},68 ${cx - 36},68 Z M${cx - 8},68 L${cx - 8},60 L${cx + 8},60 L${cx + 8},68 M${cx - 26},96 L${cx - 26},104 L${cx + 26},104 L${cx + 26},96`;
  }
  P.push({ slot: 'optic', mat: 'metal', z: 8, row: 'top', target: [cx, 70], el: <path d={optPath} /> });

  const front = BX + (mz ? mzLen : 0);
  const oal = (front - rear) / S;
  return {
    viewBox: [40, 0, 960, 400],
    pieces: P,
    rows: [22, 356],
    dim: [rear, front, 386, `${fmtIn(oal)} overall · ${fmtIn(L)} barrel`],
  };
}

const has_ = has;

function railTeeth(x0: number, x1: number, y: number, step: number) {
  let d = '';
  for (let x = x0 + step / 2; x < x1 - 2; x += step) d += `M${x},${y} L${x},${y + 6} `;
  return d;
}
function mlokSlots(x0: number, x1: number) {
  let d = '';
  for (let x = x0; x + 26 < x1; x += 44) d += `M${x},124 L${x + 26},124 L${x + 26},134 L${x},134 Z `;
  return d;
}
function ribs(x0: number, x1: number, y0: number, y1: number) {
  let d = '';
  for (let x = x0; x < x1; x += 10) d += `M${x},${y0} L${x},${y1} `;
  return d;
}
function ports(x0: number, x1: number, y0: number, y1: number, step: number) {
  let d = '';
  for (let x = x0; x < x1; x += step) d += `M${x},${y0 + 4} L${x},${y1 - 4} `;
  return d;
}

/* ----------------------------------------------------------------- pistols */

interface PistolDims { slide: number; dust: number; grip: number; mag: number }

const GLOCK: Record<string, [number, number]> = { glock17: [7.3, 3.95], glock19: [6.85, 3.55], glock26: [6.4, 2.85] };
const GLOCK_MAG: Record<number, number> = { 3: 3.95, 2: 3.55, 1: 2.85 };
const SLIM: Record<string, number> = { '43X': 6.5, '48': 7.25 };
const P320_SLIDE: Record<string, number> = { full: 7.85, compact: 7.2, subcompact: 6.7 };
const P320_GRIP: Record<string, [string, number]> = { full: ['full', 3.85], carry: ['compact', 3.85], compact: ['compact', 3.45], subcompact: ['subcompact', 2.95] };
const P365_SLIDE: Record<string, number> = { std: 5.8, xl: 6.6 };
const P365_GRIP: Record<string, number> = { std: 2.75, xl: 3.2 };
const P365_MAG: Record<string, number> = { std: 2.75, xl: 3.2, ext: 3.55 };

function pistolDims(platform: Platform, b: Build): PistolDims {
  const a = (p: Part | undefined, k: string) => p?.attrs[k] as string | undefined;
  switch (platform.id) {
    case 'glock43x': {
      const slide = SLIM[a(b.slide, 'len') ?? '48'];
      const frame = SLIM[a(b.frame, 'len') ?? a(b.slide, 'len') ?? '48'];
      return { slide, dust: frame - 0.3, grip: 3.45, mag: 3.45 };
    }
    case 'p320': {
      const [dust, grip] = P320_GRIP[a(b.grip, 'size') ?? 'carry'];
      const slide = P320_SLIDE[a(b.slide, 'length') ?? dust];
      const magSize = a(b.mag, 'size');
      return { slide, dust: P320_SLIDE[dust] - 0.35, grip, mag: magSize ? P320_GRIP[magSize][1] : grip };
    }
    case 'p365': {
      const grip = P365_GRIP[a(b.grip, 'len') ?? 'xl'];
      const slide = P365_SLIDE[a(b.slide, 'len') ?? 'xl'];
      const m = a(b.mag, 'len');
      return { slide, dust: 5.45, grip, mag: m ? P365_MAG[m] : grip };
    }
    default: {
      const [slide, grip] = GLOCK[platform.id] ?? GLOCK.glock19;
      const ms = b.mag?.attrs.size as number | undefined;
      return { slide, dust: slide - 0.3, grip, mag: ms ? GLOCK_MAG[ms] : grip };
    }
  }
}

function pistolScene(platform: Platform, b: Build): Scene {
  const S = 40;
  const d = pistolDims(platform, b);
  const x0 = 140;
  const yS = 100; // slide top
  const yF = 146; // slide bottom / frame top
  const yFB = 176; // dust cover bottom
  const xS = x0 + d.slide * S;
  const xDC = x0 + d.dust * S;
  const gripPx = d.grip * S;
  const yG = yF + gripPx;
  const k = 0.24; // grip rake, px back per px down
  const gfx = x0 + 80; // front of grip at the frame
  const gbx = x0 + 2; // back of grip at the frame
  const back = (y: number) => gbx - (y - yF) * k;
  const fwd = (y: number) => gfx - (y - yFB) * k;
  const frameSlot = platform.slots.some((s) => s.id === 'frame') ? 'frame' : 'grip';
  const trigSlot = platform.slots.some((s) => s.id === 'fcg') ? 'fcg' : 'fcu';
  const springSlot = platform.slots.some((s) => s.id === 'rsa') ? 'rsa' : 'spring';
  const coyote = has(b.slide, /Coyote/);
  const P: Piece[] = [];

  P.push({ slot: frameSlot, mat: has(b.grip, /Alloy|AXG/) ? 'metal' : 'poly', z: 2, row: 'bottom', target: [back(yG - 40) + 30, yG - 40],
    el: <g><path d={`M${x0 + 4},${yF} L${xDC},${yF} L${xDC},${yFB - 6} Q${xDC},${yFB} ${xDC - 6},${yFB} L${gfx},${yFB} L${fwd(yG)},${yG - 4} Q${fwd(yG) - 2},${yG} ${fwd(yG) - 8},${yG} L${back(yG) + 6},${yG} Q${back(yG)},${yG} ${back(yG)},${yG - 6} L${back(yF + 40)},${yF + 40} Q${x0 - 12},${yF + 18} ${x0 - 14},${yF + 6} Q${x0 - 10},${yF} ${x0 + 4},${yF} Z ${gripTexture(back, fwd, yFB + 20, yG - 14)}`} />
      <path fillRule="evenodd" d={`M${gfx - 4},${yFB - 2} Q${gfx - 4},${yFB + 46} ${gfx + 34},${yFB + 46} L${gfx + 62},${yFB + 46} Q${gfx + 86},${yFB + 44} ${gfx + 88},${yFB - 2} Z M${gfx + 5},${yFB} Q${gfx + 5},${yFB + 38} ${gfx + 34},${yFB + 38} L${gfx + 62},${yFB + 38} Q${gfx + 78},${yFB + 36} ${gfx + 80},${yFB} Z`} />
    </g> });

  const magTopL = back(yFB) + 14;
  const magTopR = fwd(yFB) - 12;
  const protrude = Math.max(0, d.mag - d.grip) * S;
  const yM = yG + protrude;
  P.push({ slot: 'mag', mat: 'poly', z: 3, row: 'bottom', target: [(back(yM) + fwd(yM)) / 2, yM + 6],
    el: <g>
      <path className="xray" d={`M${magTopL},${yFB + 4} L${magTopR},${yFB + 4} L${magTopR - (yG - yFB) * k},${yG} L${magTopL - (yG - yFB) * k},${yG} Z`} />
      <path d={`${protrude ? `M${back(yG) + 8},${yG} L${fwd(yG) - 10},${yG} L${fwd(yM) - 10},${yM} L${back(yM) + 8},${yM} Z ` : ''}M${back(yM) + 2},${yM} L${fwd(yM) - 4},${yM} L${fwd(yM + 12) - 6},${yM + 12} L${back(yM + 12) + 2},${yM + 12} Z`} />
    </g> });

  const fcu = trigSlot === 'fcu';
  P.push({ slot: trigSlot, mat: 'metal', z: 4, row: 'bottom', target: [gfx + 30, yFB + 18],
    el: <g>
      <path d={`M${gfx + 30},${yFB + 2} Q${gfx + 22},${yFB + 18} ${gfx + 32},${yFB + 30} L${gfx + 36},${yFB + 29} Q${gfx + 27},${yFB + 18} ${gfx + 35},${yFB + 2} Z`} />
      {fcu && <path className="xray" d={`M${x0 + 10},${yF + 4} L${x0 + 150},${yF + 4} L${x0 + 150},${yFB - 4} L${x0 + 10},${yFB - 4} Z`} />}
    </g> });

  P.push({ slot: 'slide', mat: coyote ? 'coyote' : 'metal', z: 5, row: 'top', target: [xS - 60, yS + 8],
    el: <path d={`M${x0},${yS + 8} Q${x0},${yS} ${x0 + 8},${yS} L${xS - 10},${yS} Q${xS},${yS} ${xS},${yS + 10} L${xS},${yF} L${x0 - 4},${yF} L${x0 - 4},${yS + 20} Z ${serrations(x0 + 10, yS + 10, yF - 8)} M${x0 + 66},${yS} L${x0 + 66},${yS + 16} L${x0 + 118},${yS + 16} L${x0 + 118},${yS}${has(b.slide, /Comp|Spectre/) ? ` M${xS - 40},${yS} L${xS - 36},${yS + 10} M${xS - 28},${yS} L${xS - 24},${yS + 10} M${xS - 16},${yS} L${xS - 12},${yS + 10}` : ''}`} /> });

  const threaded = !!b.barrel?.attrs.threaded;
  P.push({ slot: 'barrel', internal: true, mat: 'metal', z: 9, row: 'top', target: [x0 + 160, yS + 20],
    el: <g>
      <path className="xray" d={`M${x0 + 66},${yS + 12} L${xS},${yS + 14} L${xS},${yS + 32} L${x0 + 66},${yS + 32} Z`} />
      {threaded && <path className="solid" d={`M${xS},${yS + 15} L${xS + 22},${yS + 15} L${xS + 22},${yS + 31} L${xS},${yS + 31} Z M${xS + 6},${yS + 15} L${xS + 6},${yS + 31} M${xS + 11},${yS + 15} L${xS + 11},${yS + 31} M${xS + 16},${yS + 15} L${xS + 16},${yS + 31}`} />}
    </g> });
  P.push({ slot: springSlot, internal: true, z: 9, row: 'top', target: [xS - 50, yF - 8],
    el: <path d={zigzag(x0 + 130, xS - 10, yF - 12, yF - 4)} /> });
  P.push({ slot: 'spk', internal: true, z: 9, row: 'top', target: [x0 + 30, yS + 22],
    el: <path d={`M${x0 + 4},${yS + 18} L${x0 + 64},${yS + 18} L${x0 + 64},${yS + 26} L${x0 + 4},${yS + 26} Z`} /> });

  const sh = b.sights?.attrs.height === 'suppressor' ? 13 : 7;
  P.push({ slot: 'sights', mat: 'metal', z: 6, row: 'top', target: [x0 + 16, yS - sh / 2],
    el: <path d={`M${x0 + 6},${yS} L${x0 + 8},${yS - sh} L${x0 + 28},${yS - sh} L${x0 + 30},${yS} Z M${xS - 26},${yS} L${xS - 24},${yS - sh} L${xS - 16},${yS - sh} L${xS - 14},${yS} Z`} /> });

  const fp = (b.optic?.attrs.footprint as string) ?? 'rmr';
  const ox = x0 + 36;
  let op: string;
  if (fp === 'acro' || has(b.optic, /EPS|enclosed/i)) op = `M${ox},${yS} L${ox},${yS - 34} Q${ox},${yS - 40} ${ox + 6},${yS - 40} L${ox + 64},${yS - 40} Q${ox + 70},${yS - 40} ${ox + 70},${yS - 34} L${ox + 70},${yS} Z M${ox + 8},${yS - 32} L${ox + 62},${yS - 32} L${ox + 62},${yS - 10} L${ox + 8},${yS - 10} Z`;
  else if (fp === 'rmsc') op = `M${ox},${yS} L${ox + 6},${yS - 28} Q${ox + 8},${yS - 32} ${ox + 14},${yS - 32} L${ox + 46},${yS - 32} Q${ox + 52},${yS - 32} ${ox + 54},${yS - 26} L${ox + 64},${yS} Z M${ox + 14},${yS - 24} L${ox + 48},${yS - 24} L${ox + 54},${yS - 8} L${ox + 10},${yS - 8} Z`;
  else op = `M${ox},${yS} L${ox + 8},${yS - 32} Q${ox + 10},${yS - 38} ${ox + 18},${yS - 38} L${ox + 54},${yS - 38} Q${ox + 62},${yS - 38} ${ox + 64},${yS - 30} L${ox + 74},${yS} Z M${ox + 16},${yS - 30} L${ox + 56},${yS - 30} L${ox + 64},${yS - 8} L${ox + 12},${yS - 8} Z`;
  P.push({ slot: 'optic', mat: 'metal', z: 7, row: 'top', target: [ox + 34, yS - 34], el: <path d={op} /> });

  const front = xS + (threaded ? 22 : 0);
  const rear = back(yG);
  return {
    viewBox: [60, 0, 480, 436],
    pieces: P,
    rows: [22, 384],
    dim: [rear, front, 422, `${fmtIn((front - x0 + 4) / S)} long · ${fmtIn((yM + 12 - yS) / S)} tall`],
  };
}

function gripTexture(back: (y: number) => number, fwd: (y: number) => number, y0: number, y1: number) {
  let d = '';
  for (let y = y0; y < y1; y += 9) d += `M${back(y) + 12},${y} L${fwd(y) - 14},${y} `;
  return d;
}
function serrations(x: number, y0: number, y1: number) {
  let d = '';
  for (let i = 0; i < 6; i++) d += `M${x + i * 7},${y0} L${x + i * 7 - 4},${y1} `;
  return d;
}
function zigzag(x0: number, x1: number, y0: number, y1: number) {
  let d = `M${x0},${y0}`;
  let up = false;
  for (let x = x0 + 8; x <= x1; x += 8) { d += ` L${x},${up ? y0 : y1}`; up = !up; }
  return d;
}

/* ------------------------------------------------------------------ render */

export function BuildRender({ platform, build, states, active, onPick, onHover }: {
  platform: Platform;
  build: Build;
  states: Record<string, RegionState>;
  active: string | null;
  onPick: (slot: string) => void;
  onHover: (slot: string | null) => void;
}) {
  const scene = platform.family === 'Rifle' ? rifleScene(platform, build) : pistolScene(platform, build);
  const slotIds = new Set(platform.slots.map((s) => s.id));
  const numberOf = new Map(platform.slots.map((s, i) => [s.id, i + 1]));
  const pieces = scene.pieces
    .map((p) => (p.slot && !slotIds.has(p.slot) ? { ...p, slot: undefined } : p))
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const [vx, vy, vw, vh] = scene.viewBox;
  const labels = placeLabels(pieces.filter((p) => p.slot), vx + 20, vx + vw - 20, scene.rows);
  const [dx0, dx1, dy, dtext] = scene.dim;

  return (
    <svg className="render" viewBox={`${vx} ${vy} ${vw} ${vh}`} role="group" aria-label={`${platform.name} build illustration`}>
      <defs>
        <linearGradient id="mat-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="s-metal-hi" />
          <stop offset="0.55" className="s-metal" />
          <stop offset="1" className="s-metal-lo" />
        </linearGradient>
        <linearGradient id="mat-poly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="s-poly-hi" />
          <stop offset="1" className="s-poly" />
        </linearGradient>
        <linearGradient id="mat-coyote" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="s-coyote-hi" />
          <stop offset="1" className="s-coyote" />
        </linearGradient>
      </defs>
      {pieces.map((p, i) => {
        const state: RegionState | 'static' = p.slot ? states[p.slot] ?? 'empty' : 'static';
        const cls = ['part', `mat-${p.mat ?? 'metal'}`, state, p.internal ? 'internal' : '', p.slot && p.slot === active ? 'active' : ''].join(' ');
        if (!p.slot) return <g key={i} className={cls} aria-hidden="true">{p.el}</g>;
        const slot = platform.slots.find((s) => s.id === p.slot)!;
        return (
          <g
            key={p.slot}
            className={cls}
            role="button"
            tabIndex={0}
            aria-label={`${numberOf.get(slot.id)}. ${slot.name}${build[slot.id] ? `: ${build[slot.id]!.brand} ${build[slot.id]!.name}` : ', empty'}`}
            onClick={() => onPick(slot.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(slot.id); } }}
            onMouseEnter={() => onHover(slot.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(slot.id)}
            onBlur={() => onHover(null)}
          >
            {p.el}
            <circle className="hit" cx={p.target[0]} cy={p.target[1]} r="14" />
          </g>
        );
      })}
      {labels.map(({ slot, x, y, tx, ty }) => {
        const state = states[slot] ?? 'empty';
        const dir = y < ty ? 1 : -1;
        return (
          <g key={'c-' + slot} className={'callout ' + state + (slot === active ? ' active' : '')} aria-hidden="true">
            <path d={`M${x},${y + dir * 12} L${x},${y + dir * 22} L${tx},${ty}`} />
            <circle cx={tx} cy={ty} r="2.5" className="tip" />
            <circle cx={x} cy={y} r="12" className="bubble" />
            <text x={x} y={y} dy="0.36em" textAnchor="middle">{numberOf.get(slot)}</text>
          </g>
        );
      })}
      <g className="dim" aria-hidden="true">
        <path d={`M${dx0},${dy - 8} L${dx0},${dy + 8} M${dx1},${dy - 8} L${dx1},${dy + 8} M${dx0},${dy} L${dx1},${dy}`} />
        <path className="arrow" d={`M${dx0 + 8},${dy - 4} L${dx0},${dy} L${dx0 + 8},${dy + 4} M${dx1 - 8},${dy - 4} L${dx1},${dy} L${dx1 - 8},${dy + 4}`} />
        <rect x={(dx0 + dx1) / 2 - dtext.length * 3.6 - 10} y={dy - 9} width={dtext.length * 7.2 + 20} height="18" className="dim-bg" />
        <text x={(dx0 + dx1) / 2} y={dy} dy="0.35em" textAnchor="middle">{dtext}</text>
      </g>
    </svg>
  );
}

/** Spread callout bubbles along a top and a bottom row so they never overlap. */
function placeLabels(pieces: Piece[], minX: number, maxX: number, rows: [number, number]) {
  const out: { slot: string; x: number; y: number; tx: number; ty: number }[] = [];
  const GAP = 30;
  for (const row of ['top', 'bottom'] as const) {
    const items = pieces.filter((p) => p.row === row).sort((a, b) => a.target[0] - b.target[0]);
    const xs = items.map((p) => p.target[0]);
    for (let i = 0; i < xs.length; i++) xs[i] = Math.max(xs[i], i ? xs[i - 1] + GAP : minX);
    for (let i = xs.length - 1; i >= 0; i--) xs[i] = Math.min(xs[i], i < xs.length - 1 ? xs[i + 1] - GAP : maxX);
    const y = row === 'top' ? rows[0] : rows[1];
    items.forEach((p, i) => out.push({ slot: p.slot!, x: xs[i], y, tx: p.target[0], ty: p.target[1] }));
  }
  return out;
}
