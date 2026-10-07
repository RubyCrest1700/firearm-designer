// Archived from src/Blueprint.tsx on 2026-10-07 when the AKM and AK-74 were shelved (see README.md).
// It uses the drawing helpers in src/Blueprint.tsx (f, pic, makeT, inch, Scene, Piece, ...); paste it back above
// the render section and route 'AK Platform' to ak() in sceneFor() to bring it back.

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
