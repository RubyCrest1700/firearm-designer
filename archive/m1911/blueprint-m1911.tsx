// Shelved 2026-10-05: the 1911 and 2011 were pulled from the site (not modular enough for now). This is the
// drawing code that lived at the end of src/Blueprint.tsx, kept so the platforms can come back later. It expects
// Blueprint.tsx's helpers (makeT, f, n3, matches, repeat, OC, stadium, movePath, Piece, Scene, px...) and
// src/data/m1911.ts registered in src/data/index.ts.

/* ==================================================================== 1911s */

/**
 * 1911 and 2011, right side. The layout follows John Browning's own patent drawing of the Government Model
 * (US 984,519 FIG. 1), measured off the figure at its 8.5" overall length; its engraved lines are redrawn clean
 * here. Upgrade parts (beavertails, hammers, safeties, magwells) are drawn to the makers' published shapes.
 * The 2011s keep the 1911's slide and lockwork on a double-stack grip module with a railed dust cover.
 * Inches, x from the slide's rear and y down from its top, laid out for a 5" Government; shorter slides move
 * everything ahead of the trigger guard back, and the C2's short grip moves the grip's bottom up.
 */
const M11_SLIDE: Record<string, number> = { gov: 7.48, cmd: 6.73, '5': 7.48, '425': 6.73, '44': 6.88, '39': 6.38 };
const M11_BARREL: Record<string, number> = { gov: 5, cmd: 4.25, '5': 5, '425': 4.25, '44': 4.4, '39': 3.9 };
const M11_BORE = 0.56;

function mapPath(d: string, map: Map2) {
  return d.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_, x, y) => {
    const [a, c] = map(Number(x), Number(y));
    return `${n3(a)},${n3(c)}`;
  });
}

function m1911(platform: Platform, b: Build): Scene {
  const S = 58, oy = 112;
  const P: Piece[] = [];
  const pistol = b.pistol;
  const dbl = platform.id === 'm2011';
  /** An upgrade slot left empty shows the factory part, which belongs to the base pistol. */
  const own = (slot: string) => (b[slot] ? slot : 'pistol');
  const size = (pistol?.attrs.size as string | undefined) ?? (dbl ? '5' : 'gov');
  const comp = !!pistol?.attrs.comp;
  const SL = comp ? M11_SLIDE['44'] : M11_SLIDE[size];
  const d = M11_SLIDE.gov - SL;
  const dh = pistol?.attrs.grip === 'c2' ? 0.5 : 0;
  // Everything ahead of the trigger guard moves back with a shorter slide; the grip's bottom moves up (and forward,
  // along the grip angle) on a short grip.
  const map: Map2 = (x, y) => [(x > 4.3 ? x - d : x) + (y > 3.0 ? 0.15 * dh : 0), y > 3.0 ? y - dh : y];
  const beaver = b.gripsafety ? true : pistol?.attrs.tang !== 'gi';
  const ring = b.hammer ? true : pistol?.attrs.hammer !== 'spur';
  const rear = beaver ? -1.04 : -0.95;
  const threaded = !!b.barrel?.attrs.threaded;
  let front = SL + (dbl ? 0.04 : 0.12) + (threaded ? 0.6 : 0) + (comp ? 1.1 : 0);
  const pl = b.light;
  const lightLen = pl ? (matches(pl, /X300/) ? 3.25 : 2.15) : 0;
  if (pl) front = Math.max(front, 4.45 + lightLen);
  const ox = f((720 - (front - rear) * S) / 2 - rear * S);
  const T0 = makeT(S, ox, oy);
  const T = (dd: string) => T0(mapPath(dd, map));
  const px = (x: number, y: number): [number, number] => { const [a, c] = map(x, y); return [f(ox + a * S), f(oy + c * S)]; };

  /* Frame: the steel 1911 frame, or the 2011's steel frame on its polymer grip module, with the trigger guard,
   * slide stop and magazine catch */
  const frameD = dbl
    ? 'M0.12,0.97 L7.28,0.97 L7.28,1.62 L4.0,1.62 Q3.92,1.62 3.92,1.72 L3.9,2.38 Q3.9,2.6 3.68,2.6 L2.7,2.6 Q2.25,2.62 2.05,2.78 L1.5,4.6 Q1.6,4.72 1.85,4.85 L1.92,5.3 L-1.12,5.3 L-1.05,4.85 Q-0.85,4.72 -0.75,4.6 L-0.3,2.93 Q-0.15,2.65 -0.05,2.35 L-0.05,2.1 Q-0.1,1.8 -0.42,1.65 Q-0.5,1.5 -0.5,1.3 Q-0.4,1.1 -0.1,1.0 L-0.1,0.97 Z '
      + 'M2.75,1.55 L3.55,1.55 Q3.76,1.55 3.76,1.75 L3.76,2.3 Q3.76,2.46 3.6,2.46 L2.7,2.46 Q2.55,2.44 2.55,2.2 L2.55,1.8 Q2.55,1.57 2.75,1.55 Z'
    // Traced from a Colt Government photo: the back strap tucks in under the tang, then the flat mainspring housing
    // runs straight to the heel; the trigger guard sweeps up into the front strap.
    : 'M0.12,0.97 L5.75,0.97 L5.75,1.5 L4.0,1.5 Q3.75,1.55 3.74,1.95 L3.73,2.1 Q3.7,2.45 3.35,2.57 Q3.2,2.59 3.0,2.59 L2.7,2.59 Q2.25,2.62 2.0,2.72 Q1.9,2.76 1.88,2.8 L1.12,5.02 L-0.85,5.02 Q-1.02,5.02 -1.02,4.85 L-0.3,2.93 Q-0.15,2.65 -0.05,2.35 L-0.05,2.1 Q-0.1,1.8 -0.42,1.65 '
      + (beaver ? 'Q-0.5,1.5 -0.5,1.3 Q-0.4,1.1 -0.1,1.0 ' : 'Q-0.6,1.55 -0.84,1.5 Q-0.94,1.42 -0.84,1.33 Q-0.5,1.2 -0.1,1.04 ')
      + 'L-0.1,0.97 Z M2.68,1.56 L3.25,1.56 Q3.66,1.6 3.65,2.0 Q3.64,2.4 3.3,2.5 Q3.1,2.53 2.95,2.5 Q2.88,2.4 2.78,2.34 Q2.55,2.3 2.52,2.15 L2.52,1.8 Q2.52,1.58 2.68,1.56 Z';
  // Magazine catch button behind the guard, and the plunger tube along the frame flat between the two safeties
  let frameDet = `${OC(1.9, 2.27, 0.12)} ${OC(1.9, 2.27, 0.06)}`;
  if (!dbl) frameDet += ' M0.6,1.0 L1.9,1.0 Q1.96,1.0 1.96,1.06 Q1.96,1.12 1.9,1.12 L0.6,1.12 Q0.54,1.12 0.54,1.06 Q0.54,1.0 0.6,1.0 Z';
  if (dbl) {
    // The grip module's seam under the frame, the rail's cross slots, the grip texture panel and the magwell's lip.
    frameDet += ' M-0.05,1.62 L4.0,1.62 M4.5,1.48 L7.2,1.48';
    for (let x = 4.75; x < 7.1; x += 0.394) frameDet += ` M${f(x)},1.48 L${f(x)},1.62`;
    frameDet += ' M-0.1,3.1 L1.9,3.1 Q1.98,3.1 1.96,3.2 L1.62,4.45 L-0.55,4.45 L-0.2,3.2 Q-0.18,3.1 -0.1,3.1 Z M-1.05,4.85 L1.85,4.85';
    // hatching clipped to that panel: its left edge runs (-0.2,3.2)-(-0.55,4.45), its right edge (1.96,3.2)-(1.62,4.45)
    for (let k = 0; k < 14; k++) {
      const xb = -0.6 + k * 0.2, xt = xb + 0.65; // bottom (y 4.45) and top (y 3.15) ends of one stroke
      const lx = (y: number) => -0.2 - (0.35 * (y - 3.2)) / 1.25, rx = (y: number) => 1.96 - (0.34 * (y - 3.2)) / 1.25;
      const pts: [number, number][] = [];
      for (let t = 0; t <= 1.0001; t += 0.05) { const x = xb + (xt - xb) * t, y = 4.45 - 1.3 * t; if (x > lx(y) && x < rx(y)) pts.push([x, y]); }
      if (pts.length > 1) frameDet += ` M${f(pts[0][0])},${f(pts[0][1])} L${f(pts[pts.length - 1][0])},${f(pts[pts.length - 1][1])}`;
    }
  }
  P.push({ slot: 'pistol', z: 3, row: 'bottom', target: px(3.0, dbl ? 2.74 : 2.5), el: <>
    <path fillRule="evenodd" d={T(frameD)} />
    <path className="detail" d={T(frameDet)} />
  </> });

  /* Slide, with the ejection port, rear serrations and slide stop notch; the 1911's barrel bushing and spring plug */
  const slideD = (dbl
    ? 'M0.2,0 L7.42,0 Q7.48,0 7.48,0.06 L7.48,0.97 L0,0.97 L0,0.2 Q0,0 0.2,0 Z'
    : 'M0.3,0 L7.42,0 Q7.48,0 7.48,0.06 L7.48,1.42 Q7.48,1.47 7.43,1.47 L5.77,1.47 L5.77,1.1 Q5.77,0.97 5.64,0.97 L0.46,0.97 L0.46,0.82 L0.3,0.82 L0.3,0.97 L0,0.97 L0,0.2 Q0,0 0.2,0 Z')
    + ' M2.48,0.1 L3.9,0.1 L3.9,0.6 L2.48,0.6 Z';
  let serr = '';
  for (let x = 0.42; x < 1.8; x += 0.075) serr += `M${f(x)},0.4 L${f(x)},0.92 `;
  if (dbl) for (let x = 6.1; x < 6.9; x += 0.075) serr += `M${f(x)},0.4 L${f(x)},0.92 `;
  const slideDet = `M0.3,0.09 L7.4,0.09 ${serr} M2.04,0.97 Q2.13,0.86 2.22,0.97`;
  P.push({ slot: 'pistol', z: 8, row: 'top', target: px(5.2, 0.5), el: <>
    <path fillRule="evenodd" d={T(slideD)} />
    <path className="detail" d={T(slideDet)} />
    {!dbl && <path d={T(`M7.48,0.2 L7.6,0.2 L7.6,0.92 L7.48,0.92 Z M7.48,1.04 L7.54,1.04 L7.54,1.38 L7.48,1.38 Z ${OC(7.38, 1.22, 0.12)}`)} />}
  </> });

  /* Slide stop: thumb piece forward of the grip, the lever along the frame and its pin above the trigger guard */
  P.push({ slot: 'pistol', z: 6.5, row: 'bottom', target: px(2.2, 1.11), el: <>
    <path d={T('M2.0,1.0 L2.4,1.0 Q2.46,1.0 2.46,1.05 L3.14,1.05 Q3.3,1.03 3.3,1.1 Q3.3,1.17 3.14,1.15 L2.46,1.15 Q2.46,1.22 2.4,1.22 L2.0,1.22 Q1.95,1.22 1.95,1.17 L1.95,1.05 Q1.95,1.0 2.0,1.0 Z')} />
    <path className="detail" d={T(`${OC(3.22, 1.1, 0.07)} ${repeat(2.0, 2.4, 0.06, (x) => `M${x},1.03 L${x},1.19`)}`)} />
  </> });

  /* Barrel: hood in the ejection port, the rest hidden in the slide; threads past the bushing */
  const bx = (dbl ? 7.52 : 7.6) - d;
  P.push({ slot: dbl ? 'pistol' : own('barrel'), z: 9, row: 'top', target: px(3.2, 0.34), el: <>
    <path d={T('M2.52,0.13 L3.86,0.13 L3.86,0.57 L2.52,0.57 Z')} />
    <path className="detail" d={T('M2.68,0.13 L2.68,0.57')} />
    <path className="hidden-line" d={T(`M3.92,${M11_BORE - 0.29} L7.48,${M11_BORE - 0.29} M3.92,${M11_BORE + 0.29} L7.48,${M11_BORE + 0.29}`)} />
    {dbl && <path d={T0(`M${f(SL)},${M11_BORE - 0.27} L${f(bx)},${M11_BORE - 0.27} L${f(bx)},${M11_BORE + 0.27} L${f(SL)},${M11_BORE + 0.27} Z`)} />}
    {threaded && <path d={T0(`M${f(bx)},${M11_BORE - 0.2} L${f(bx + 0.6)},${M11_BORE - 0.2} L${f(bx + 0.6)},${M11_BORE + 0.2} L${f(bx)},${M11_BORE + 0.2} Z ${repeat(bx + 0.08, bx + 0.54, 0.07, (x) => `M${x},${M11_BORE - 0.2} L${f(x + 0.03)},${M11_BORE + 0.2}`)}`)} />}
  </> });

  /* Compensator (Staccato XC): a block on the barrel ahead of the slide, ported on top */
  if (comp) {
    let ports = '';
    for (let k = 0; k < 3; k++) { const x = SL + 0.22 + k * 0.28; ports += `M${f(x)},0.06 L${f(x + 0.06)},0.34 L${f(x + 0.18)},0.34 L${f(x + 0.14)},0.06 `; }
    P.push({ slot: 'pistol', z: 9.5, row: 'top', target: [f(ox + (SL + 0.55) * S), f(oy + 0.5 * S)], el: <>
      <path d={T0(`M${f(SL)},0.06 L${f(SL + 1.0)},0.06 Q${f(SL + 1.1)},0.06 ${f(SL + 1.1)},0.16 L${f(SL + 1.1)},0.97 L${f(SL)},0.97 Z`)} />
      <path className="detail" d={T0(`${ports} M${f(SL + 1.1)},${M11_BORE} L${f(SL + 0.98)},${M11_BORE}`)} />
    </> });
  }

  /* Recoil spring and guide rod (internal) */
  const rod = !!b.spring?.attrs.rod || dbl;
  P.push({ slot: dbl ? 'pistol' : own('spring'), internal: true, z: 20, row: 'top', target: px(5.0, 1.22), el:
    <path d={T(`M${rod ? 3.5 : 4.4},1.12 L7.44,1.12 L7.44,1.32 L${rod ? 3.5 : 4.4},1.32 Z ${repeat(4.5, 7.3, 0.16, (x) => `M${x},1.08 L${f(x + 0.08)},1.36`)}`)} /> });

  /* Hammer, cocked: the GI spur, or the Commander-style ring hammer most upgrades and modern 1911s use */
  const hammerD = ring
    ? 'M-0.02,0.97 L-0.04,0.62 Q-0.1,0.34 -0.36,0.32 Q-0.62,0.36 -0.62,0.6 Q-0.6,0.76 -0.42,0.8 Q-0.32,0.86 -0.3,0.97 Z ' + OC(-0.36, 0.56, 0.11)
    // GI spur: the body stops half an inch below the slide top, and the spur tilts up and back from it
    : 'M0,1.0 L0,0.36 L-0.12,0.34 Q-0.3,0.29 -0.45,0.23 Q-0.55,0.19 -0.6,0.24 Q-0.62,0.3 -0.55,0.32 Q-0.4,0.36 -0.25,0.42 Q-0.12,0.5 -0.08,0.65 L-0.05,1.0 Z';
  P.push({ slot: dbl ? 'pistol' : own('hammer'), z: 2.5, row: 'top', target: px(ring ? -0.3 : -0.42, ring ? 0.45 : 0.3), el: <>
    <path fillRule="evenodd" d={T(hammerD)} />
    {!ring && <path className="detail" d={T('M-0.32,0.28 L-0.35,0.33 M-0.39,0.26 L-0.42,0.31 M-0.46,0.24 L-0.49,0.29 M-0.53,0.22 L-0.56,0.27')} />}
  </> });

  /* Grip safety: the GI spur, or a beavertail with a memory bump */
  const gsD = beaver
    ? 'M-0.1,1.02 Q-0.55,0.95 -0.9,0.8 Q-1.1,0.75 -1.12,0.92 Q-1.1,1.12 -0.95,1.3 Q-0.7,1.55 -0.5,1.78 Q-0.2,1.98 -0.1,2.2 Q-0.18,2.45 -0.24,2.65 Q-0.28,2.8 -0.3,2.93 L-0.12,2.93 Q0.02,2.65 0.1,2.35 L0.1,2.1 Q0.05,1.75 -0.25,1.55 Q-0.35,1.42 -0.3,1.3 Q-0.22,1.15 -0.1,1.1 Z'
    : 'M-0.1,1.04 Q-0.5,1.2 -0.84,1.33 Q-0.94,1.42 -0.84,1.5 Q-0.6,1.55 -0.42,1.65 Q-0.1,1.8 -0.05,2.1 L-0.05,2.35 Q-0.15,2.65 -0.3,2.93 L-0.12,2.93 Q0.02,2.65 0.1,2.35 L0.1,2.1 Q0.05,1.75 -0.25,1.55 Q-0.35,1.42 -0.3,1.3 Q-0.22,1.15 -0.1,1.1 Z';
  P.push({ slot: dbl ? 'pistol' : own('gripsafety'), z: 5, row: 'bottom', target: px(beaver ? -0.7 : -0.55, 1.4), el: <path d={T(gsD)} /> });

  /* Thumb safety: pivots at the frame's rear; extended and ambidextrous safeties have a longer, wider pad */
  const ext = dbl || b.safety ? true : pistol?.attrs.safety !== 'gi';
  const safD = ext
    ? 'M-0.12,1.02 L0.28,0.98 L0.9,1.0 Q0.98,1.02 0.97,1.12 L0.92,1.3 Q0.88,1.4 0.78,1.4 L0.3,1.44 Q0.22,1.44 0.2,1.36 L0.2,1.2 L-0.05,1.2 Q-0.15,1.2 -0.15,1.1 Z'
    : 'M-0.12,1.02 L0.28,0.98 L0.56,1.0 Q0.62,1.02 0.6,1.1 L0.55,1.26 Q0.5,1.36 0.4,1.4 L0.3,1.44 Q0.22,1.44 0.2,1.36 L0.2,1.2 L-0.05,1.2 Q-0.15,1.2 -0.15,1.1 Z';
  P.push({ slot: dbl ? 'pistol' : own('safety'), z: 6, row: 'top', target: px(0.32, 1.25), el: <>
    <path d={T(safD)} />
    <path className="detail" d={T(`${OC(-0.06, 1.1, 0.06)} ` + (ext ? 'M0.3,1.1 L0.9,1.16 M0.28,1.2 L0.88,1.26 M0.3,1.3 L0.8,1.36' : 'M0.3,1.1 L0.56,1.16 M0.28,1.2 L0.55,1.26 M0.3,1.3 L0.48,1.36'))} />
  </> });

  /* Grip panels (1911): screws in double diamonds on wood, a plain inset on G10 and polymer; the wraparound
   * rubber grip covers the front strap with finger grooves */
  if (!dbl) {
    const g = b.grips;
    const kind = (g?.attrs.kind as string | undefined) ?? (ring ? 'g10' : 'wood');
    // The panel's corners come from the photo; the rubber wraparound follows the front strap with finger grooves.
    let wrapFront = '';
    for (let y = 2.8; y <= 4.86; y += 0.08) wrapFront += ` L${f(1.88 - 0.345 * (y - 2.8) + 0.04 + 0.05 * Math.sin((2 * Math.PI * (y - 2.6)) / 0.55))},${f(y)}`;
    const panel = kind === 'wrap'
      ? `M0.55,1.22 L1.85,1.22 Q1.92,1.22 1.92,1.3 L1.72,2.55 Q1.9,2.65 1.9,2.8${wrapFront} L1.1,4.92 L-0.9,4.92 L0.45,1.3 Q0.47,1.22 0.55,1.22 Z`
      : 'M0.55,1.22 L1.85,1.22 Q1.92,1.22 1.92,1.3 L1.68,2.7 L1.0,4.92 L-0.9,4.92 L0.45,1.3 Q0.47,1.22 0.55,1.22 Z';
    const screw = (x: number, y: number) => `${OC(x, y, 0.07)} M${f(x - 0.05)},${f(y + 0.03)} L${f(x + 0.05)},${f(y - 0.03)}`;
    let det = `${screw(1.18, 1.59)} ${screw(0.1, 4.5)}`;
    if (kind === 'wood') {
      det += ' M1.18,1.3 L1.33,1.59 L1.18,1.9 L1.03,1.59 Z M0.1,4.2 L0.25,4.5 L0.1,4.8 L-0.05,4.5 Z';
      // checkering: a diagonal cross-hatch, clipped to the panel's outline
      const poly = [[0.5, 1.28], [1.86, 1.28], [1.62, 2.7], [0.95, 4.87], [-0.8, 4.87]];
      const inside = (x: number, y: number) => {
        let c = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i], [xj, yj] = poly[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
        return c;
      };
      const hatch = (x0: number, y0: number, x1: number, y1: number) => {
        let out = '', on = false;
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, ok = inside(x, y);
          if (ok && !on) out += ` M${f(x)},${f(y)}`;
          else if (ok) out += ` L${f(x)},${f(y)}`;
          on = ok;
        }
        return out;
      };
      for (let k = -10; k < 30; k++) det += hatch(-1.0 + k * 0.1, 5.0, 0.2 + k * 0.1, 1.2) + hatch(2.0 - k * 0.1, 1.2, 3.2 - k * 0.1, 5.0);
    }
    if (kind !== 'wrap' && kind !== 'wood') det += ' M0.6,1.3 L1.78,1.3 Q1.84,1.3 1.84,1.38 L1.6,2.7 L0.94,4.84 L-0.76,4.84 L0.52,1.38 Q0.54,1.3 0.6,1.3 Z';
    P.push({ slot: own('grips'), z: 4, row: 'bottom', target: px(1.05, 3.2), el: <>
      <path d={T(panel)} />
      <path className="detail" d={T(det)} />
    </> });

    /* Mainspring housing, or a magwell that replaces it */
    const mw = b.magwell;
    // The flat housing runs straight down the raked back strap from the grip safety to the heel, serrated.
    const back = (y: number) => -0.3 - 0.365 * (y - 2.93);
    let msh = 'M-0.3,2.93 L-0.12,2.93 L-0.78,5.02 L-0.85,5.02 Q-1.02,5.02 -1.02,4.85 Z';
    let mshDet = '';
    for (let y = 3.05; y < 4.9; y += 0.1) mshDet += `M${f(back(y) + 0.03)},${f(y)} L${f(back(y) + 0.16)},${f(y)} `;
    if (mw?.attrs.kind === 'well') {
      msh += ' M-0.95,4.8 L1.2,4.8 L1.3,5.2 L-1.08,5.2 Z';
      mshDet = mshDet.split('M').filter((s) => s && parseFloat(s.split(',')[1]) < 4.75).map((s) => 'M' + s).join('') + ' M-1.02,4.95 L1.24,4.95';
    }
    P.push({ slot: own('magwell'), z: 4.5, row: 'bottom', target: px(-0.82, 4.5), el: <>
      <path d={T(msh)} />
      <path className="detail" d={T(mshDet)} />
    </> });
  }

  /* Magazine floor plate: flush, or a base pad below the grip; 2011 magazines longer than the grip stick out */
  const mag = b.mag;
  let magD: string, magDet = '';
  if (dbl) {
    const flush = dh ? 16 : 17;
    const e = mag ? Math.max(0, ((mag.attrs.rounds as number) - flush) * 0.15) : 0;
    const y0 = 5.3, y1 = y0 + e + 0.12;
    magD = `M-0.9,${y0} L1.75,${y0} L1.75,${f(y1 - 0.06)} Q1.75,${f(y1)} 1.69,${f(y1)} L-0.84,${f(y1)} Q-0.9,${f(y1)} -0.9,${f(y1 - 0.06)} Z`;
    if (e > 0.25) for (let t = 0.18; t < e - 0.06; t += 0.2) magDet += `M-0.84,${f(y0 + t)} L1.69,${f(y0 + t)} `;
  } else {
    magD = mag?.attrs.pad
      ? 'M-0.9,5.02 L1.12,5.02 L1.12,5.22 Q1.12,5.28 1.06,5.28 L-0.84,5.28 Q-0.9,5.28 -0.9,5.22 Z'
      : 'M-0.88,5.02 L1.12,5.02 L1.1,5.1 L-0.86,5.1 Z';
  }
  P.push({ slot: own('mag'), z: 1, row: 'bottom', target: px(0.7, dbl ? 5.4 : 5.2), el: <>
    <path d={T(magD)} />
    {magDet && <path className="detail" d={T(magDet)} />}
  </> });

  /* 2011 magwell: a wider flare over the grip module's own */
  if (dbl && b.magwell)
    P.push({ slot: 'magwell', z: 4.5, row: 'bottom', target: px(0.7, 5.05), el: <>
      <path d={T('M-0.85,4.62 L1.58,4.62 L1.98,5.38 L-1.2,5.38 Z')} />
      <path className="detail" d={T('M-1.0,4.9 L1.75,4.9')} />
    </> });

  /* Trigger: the 1911's sliding shoe, short (GI), medium or long; 2011s have a flat shoe */
  const len = dbl ? 'flat' : (b.trigger?.attrs.len as string | undefined) ?? (ring ? 'medium' : 'short');
  // The shoe fills the back of the guard opening top to bottom, with a slightly dished face; its stirrup rides in
  // the frame behind it.
  const xf = len === 'long' ? 2.82 : len === 'short' ? 2.62 : 2.72;
  const trigD = len === 'flat'
    ? `M2.52,1.6 L${f(xf + 0.1)},1.6 L${f(xf + 0.06)},2.3 Q${f(xf + 0.06)},2.34 ${f(xf + 0.02)},2.34 L2.52,2.34 Z`
    : `M2.52,1.58 L${f(xf + 0.06)},1.58 Q${f(xf - 0.25)},1.95 ${f(xf - 0.04)},2.32 L2.52,2.32 Z`;
  const trigDet = b.trigger && matches(b.trigger, /3-Hole/) ? [1.76, 1.95, 2.14].map((y) => OC(xf - 0.14, y, 0.04)).join(' ') : '';
  P.push({ slot: dbl ? 'pistol' : own('trigger'), z: 5.5, row: 'bottom', target: px(xf - 0.15, 1.95), el: <>
    <path d={T(trigD)} />
    {trigDet && <path className="detail" d={T(trigDet)} />}
  </> });

  /* Sights: GI blades, low Novak-style sights, an adjustable rear, or suppressor-height sights */
  const sg = b.sights;
  const sk = sg ? 'novak' : (pistol?.attrs.sight === 'gi' ? 'gi' : pistol?.attrs.sight === 'adj' ? 'adj' : 'novak');
  const sh = sg?.attrs.height === 'suppressor' ? 0.36 : sk === 'gi' ? 0.1 : sk === 'adj' ? 0.24 : 0.2;
  const fs0 = 6.96, fs1 = 7.24;
  let sightsD: string, sightDet = '';
  if (sk === 'gi') sightsD = `M0.48,0 L0.5,-0.1 L0.68,-0.1 L0.7,0 Z M7.02,0 L7.04,-0.13 L7.18,-0.13 L7.24,0 Z`;
  else {
    const r0 = sk === 'adj' ? 0.18 : 0.12, r1 = sk === 'adj' ? 1.0 : 0.8;
    sightsD = (sk === 'adj'
      ? `M${r0},0 L${f(r0 + 0.02)},${-sh} L${f(r1 - 0.06)},${-sh} L${r1},${f(-sh + 0.12)} L${r1},0 Z`
      : `M${r0},0 L${f(r0 + 0.02)},${-sh} L${f(r1 - 0.28)},${-sh} Q${f(r1 - 0.2)},${-sh} ${f(r1 - 0.16)},${f(-sh + 0.08)} L${r1},0 Z`)
      + ` M${fs0},0 L${f(fs0 + 0.06)},${f(-sh + 0.02)} L${f(fs1 - 0.04)},${f(-sh + 0.02)} L${fs1},0 Z`;
    const mid = (r0 + r1) / 2 - 0.08;
    sightDet = `M${f(mid - 0.08)},${-sh} L${f(mid - 0.08)},${f(-sh + 0.08)} L${f(mid + 0.08)},${f(-sh + 0.08)} L${f(mid + 0.08)},${-sh} `
      + `M${f(r0 + 0.04)},-0.03 L${f(r1 - 0.06)},-0.03 ` + (sg ? O2(mid, -sh / 2 + 0.02, 0.045) + ' ' + O2((fs0 + fs1) / 2, -sh / 2 + 0.02, 0.045) : '');
  }
  P.push({ slot: own('sights'), z: 10, row: 'top', target: px(0.45, -sh), el: <>
    <path d={T(sightsD)} />
    {sightDet && <path className="detail" d={T(sightDet)} />}
  </> });

  /* Optic (2011): on the maker's plate ahead of the rear sight */
  if (dbl) {
    const fp = (b.optic?.attrs.footprint as string) ?? 'rmr';
    const po = pistolOptic(b.optic, fp);
    P.push({ slot: 'optic', z: 11, row: 'top', target: px(1.0 + po.len / 2, -po.h), el: <>
      <path fillRule="evenodd" d={T0(movePath(po.od, 1.0, 0))} />
      <path className="detail" d={T0(movePath(po.odet, 1.0, 0))} />
    </> });
  }

  /* Weapon light (2011), under the dust cover rail */
  if (pl) {
    const h = matches(pl, /X300/) ? 1.12 : 0.92;
    const lx1 = 4.45 + lightLen, lx0 = 4.45, ly0 = 1.48;
    P.push({ slot: 'light', z: 4, row: 'bottom', target: [f(ox + (lx0 + lightLen / 2) * S), f(oy + (ly0 + h) * S)], el: <>
      <path d={T0(`M${f(lx0)},${f(ly0)} L${f(lx1 - 0.1)},${f(ly0)} Q${f(lx1)},${f(ly0)} ${f(lx1)},${f(ly0 + 0.1)} L${f(lx1)},${f(ly0 + h - 0.1)} Q${f(lx1)},${f(ly0 + h)} ${f(lx1 - 0.1)},${f(ly0 + h)} L${f(lx0 + 0.35)},${f(ly0 + h)} Q${f(lx0)},${f(ly0 + h)} ${f(lx0)},${f(ly0 + h - 0.3)} Z`)} />
      <path className="detail" d={T0(`M${f(lx1 - 0.1)},${f(ly0 + 0.16)} L${f(lx1 - 0.1)},${f(ly0 + h - 0.16)} M${f(lx0 + 0.15)},${f(ly0 + 0.3)} L${f(lx0 + 0.15)},${f(ly0 + 0.6)} M${f(lx0 + 0.35)},${f(ly0 + 0.12)} L${f(lx1 - 0.4)},${f(ly0 + 0.12)}`)} />
    </> });
  }

  const yTop = dbl && b.optic ? -pistolOptic(b.optic, (b.optic.attrs.footprint as string) ?? 'rmr').h : -sh;
  const yBot = map(0, dbl ? 5.3 + 0.12 + (mag ? Math.max(0, ((mag.attrs.rounds as number) - (dh ? 16 : 17)) * 0.15) : 0) : mag?.attrs.pad ? 5.34 : 5.17)[1];
  const vx = f(ox + (front + 0.5) * S);
  const barrel = comp ? 5 : M11_BARREL[size];
  return {
    width: 720, height: 560, pieces: P,
    center: [f(ox + (rear - 0.3) * S), f(ox + (front + 0.4) * S), f(oy + M11_BORE * S)],
    dims: [[f(ox + rear * S), f(ox + front * S), 540, `${inch2(front - rear)} overall`]],
    vdims: [[vx, f(oy + yTop * S), f(oy + yBot * S), `${inch2(yBot - yTop)} tall`]],
    rows: [26, 500],
    spec: `${dbl ? '9mm' : pistol?.attrs.cal === '9' ? '9mm' : '.45 ACP'} · ${inch2(barrel)} barrel · ${inch2(SL)} slide`,
  };
}
