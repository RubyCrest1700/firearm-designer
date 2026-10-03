import type { Build, Issue, Part, Slot } from '../types';
import { parts } from './helpers';

/**
 * Add-ons: lights, lasers, magnifiers, rail sections, slings, cases and holsters. Most of these mount
 * anywhere, so the checks only cover the measurable interfaces: mount type (Picatinny or M-LOK), the
 * pistol's accessory rail, magnifier height behind a red dot, QD sockets for the sling, case length
 * against the rifle's length, and a holster molded for the slide, light and muzzle.
 * Research and sources: /mnt/project-files/firearm-builder/research/armalite-and-accessories.md
 */

const G = 'Add-ons';

// ---------- Rifles ----------

export const rifleAddonSlots: Slot[] = [
  { id: 'light', name: 'Weapon light', group: G, required: false, hint: 'Mounts to M-LOK directly or to a Picatinny rail section.' },
  { id: 'laser', name: 'Laser', group: G, required: false, hint: 'Most lasers clamp to Picatinny; add a rail section on an M-LOK handguard.' },
  { id: 'magnifier', name: 'Magnifier', group: G, required: false, hint: 'Sits behind a 1x red dot at the same height. Not for scopes or LPVOs.' },
  { id: 'rail', name: 'Rail section', group: G, required: false, hint: 'Adds a Picatinny rail to an M-LOK handguard.' },
  { id: 'qdmount', name: 'Sling mount', group: G, required: false, hint: 'Adds a QD sling socket to an M-LOK handguard.' },
  { id: 'sling', name: 'Sling', group: G, required: false, hint: 'QD slings need a QD socket at the front and the stock.' },
  { id: 'case', name: 'Case', group: G, required: false, hint: 'Pick a case at least 2" longer than the rifle.' },
];

export const rifleAddonParts: Part[] = [
  ...parts('light', [
    { id: 'r-light-hlx', brand: 'Streamlight', name: 'ProTac Rail Mount HL-X', specs: ['1,000 lm', 'Picatinny clamp', 'M-LOK mount included'], attrs: { mount: 'both' },
      offers: [['PA', 119.99]] },
    { id: 'r-light-m600', brand: 'SureFire', name: 'M600DF Scout Light', specs: ['1,500 lm', 'Picatinny (M75 thumbscrew)'], attrs: { mount: 'pic' },
      offers: [['BRN', 399.0], ['OP', 399.0]] },
    { id: 'r-light-rein', brand: 'Cloud Defensive', name: 'REIN Micro', specs: ['M-LOK inline mount', 'High candela'], attrs: { mount: 'mlok' },
      offers: [['BRN', 369.99]] },
  ]),
  ...parts('laser', [
    { id: 'r-laser-cmr301', brand: 'Crimson Trace', name: 'CMR-301 Rail Master Pro', specs: ['Light + green laser', 'Picatinny and M-LOK mounts', 'Class 3R'], attrs: { mount: 'both' },
      offers: [['BRN', 317.99]] },
    { id: 'r-laser-ls117', brand: 'Holosun', name: 'LS117G Green Laser', specs: ['Green laser', 'QD Picatinny mount', 'Class IIIa'], attrs: { mount: 'pic' },
      offers: [['OP', 299.99]] },
  ]),
  ...parts('magnifier', [
    { id: 'r-mag-hm3x', brand: 'Holosun', name: 'HM3X 3x Magnifier', specs: ['3x', 'Flip-to-side QD mount', 'Absolute or lower 1/3 (spacer)'], attrs: { heights: ['1.41', '1.535'] },
      offers: [['PA', 199.99]] },
    { id: 'r-mag-vmx3t', brand: 'Vortex', name: 'VMX-3T Magnifier', specs: ['3x', 'Flip mount', 'Absolute or lower 1/3 (shim)'], attrs: { heights: ['1.41', '1.535'] },
      offers: [['PA', 279.99]] },
  ]),
  ...parts('rail', [
    { id: 'r-rail-5', brand: 'Magpul', name: 'M-LOK Polymer Rail Section, 5 Slots', specs: ['Picatinny', '5 slots', 'Fits one light or laser'], attrs: { slots: 5 },
      offers: [['MAGPUL', 11.95], ['PA', 11.95]] },
    { id: 'r-rail-9', brand: 'Magpul', name: 'M-LOK Polymer Rail Section, 9 Slots', specs: ['Picatinny', '9 slots', 'Fits a light and a laser'], attrs: { slots: 9 },
      offers: [['MAGPUL', 15.95]] },
  ]),
  ...parts('qdmount', [
    { id: 'r-qd-magpul', brand: 'Magpul', name: 'M-LOK QD Sling Mount', specs: ['QD socket', 'One M-LOK slot'], attrs: {},
      offers: [['MAGPUL', 20.95], ['PA', 20.95]] },
  ]),
  ...parts('sling', [
    { id: 'r-sling-ms4', brand: 'Magpul', name: 'MS4 Dual QD Sling Gen2', specs: ['1 or 2 point', 'Two QD swivels included'], attrs: { attach: 'qd' },
      offers: [['MAGPUL', 79.95], ['PA', 79.95]] },
  ]),
  ...parts('case', [
    { id: 'r-case-sav36', brand: 'Savior Equipment', name: 'American Classic Double Rifle Case, 36"', specs: ['Soft', '35" interior', 'Two rifles'], attrs: { interior: 35 },
      offers: [['BRN', 87.97]] },
    { id: 'r-case-sav42', brand: 'Savior Equipment', name: 'American Classic Double Rifle Case, 42"', specs: ['Soft', '41" interior', 'Two rifles'], attrs: { interior: 41 },
      offers: [['BRN', 92.97]] },
    { id: 'r-case-v700', brand: 'Pelican', name: 'Vault V700 Takedown Case', specs: ['Hard', '36.5" interior'], attrs: { interior: 36.5 },
      offers: [['OP', 169.95]] },
    { id: 'r-case-v730', brand: 'Pelican', name: 'Vault V730 Tactical Rifle Case', specs: ['Hard', '44" interior'], attrs: { interior: 44 },
      offers: [['OP', 209.95]] },
  ]),
];

/**
 * Rifle length from the receiver face back to the butt. M4: 29.75" collapsed and 33" extended with a 14.5"
 * barrel and a 2.25" A2 flash hider, which leaves 13" for receiver and stock collapsed, plus 3.25" of travel.
 * An M16A2 (fixed A2 stock) is 39.6" with a 20" barrel. AR-10 receivers add about 1.6". Source:
 * https://en.wikipedia.org/wiki/M4_carbine. These are estimates; the case check allows a 2" margin.
 */
const REAR = { carbine: 13, rifle: 17.4 };
const TRAVEL = 3.25;
const AR10_EXTRA = 1.6;

export function rifleLength(b: Build, large: boolean): { collapsed: number; extended: number } | undefined {
  const { barrel, muzzle, handguard, stock } = b;
  if (!barrel) return undefined;
  const bl = barrel.attrs.length as number;
  const front = Math.max(bl + (muzzle ? 2.25 : 0), (handguard?.attrs.length as number | undefined) ?? 0);
  const fixed = !!stock && Array.isArray(stock.attrs.fits) && (stock.attrs.fits as string[]).includes('rifle');
  const rear = (fixed ? REAR.rifle : REAR.carbine) + (large ? AR10_EXTRA : 0);
  const collapsed = front + rear;
  return { collapsed, extended: collapsed + (fixed || !stock ? 0 : TRAVEL) };
}

const MOUNT_LABEL: Record<string, string> = { pic: 'Picatinny', mlok: 'M-LOK', both: 'Picatinny or M-LOK' };

export function rifleAddonRules(b: Build, large: boolean): Issue[] {
  const out: Issue[] = [];
  const { handguard, light, laser, magnifier, optic, rail, qdmount, sling, stock } = b;
  const hgPic = handguard?.attrs.interface === 'pic';
  const picOnly = [light, laser].filter((p): p is Part => !!p && p.attrs.mount === 'pic');
  for (const dev of picOnly)
    if (handguard && !hgPic && !rail)
      out.push({ severity: 'warn', slots: [dev.slot, 'rail'], message: `The ${dev.brand} ${dev.name} clamps to a Picatinny rail, and this handguard is M-LOK. Add an M-LOK rail section.` });
  if (picOnly.length === 2 && rail && (rail.attrs.slots as number) < 9 && !hgPic)
    out.push({ severity: 'warn', slots: ['rail', 'light', 'laser'], message: 'A 5-slot rail section fits one light or laser. Use the 9-slot section, or mount the second device elsewhere.' });
  if (rail && !picOnly.length)
    out.push({ severity: 'info', slots: ['rail'], message: `Nothing in this build needs the rail section; your ${[light, laser].filter(Boolean).map((p) => MOUNT_LABEL[p!.attrs.mount as string]).join(' and ') || 'add-ons'} mount directly.` });

  if (magnifier) {
    const kind = optic?.attrs.kind as string | undefined;
    if (!optic)
      out.push({ severity: 'warn', slots: ['magnifier', 'optic'], message: 'A magnifier needs a red dot in front of it. Add a red dot optic.' });
    else if (kind !== 'dot')
      out.push({ severity: 'error', slots: ['magnifier', 'optic'], message: `A magnifier works only behind a 1x red dot. The ${optic.brand} ${optic.name} is a ${kind === 'lpvo' ? 'variable-power scope' : 'scope'}, which already magnifies.` });
    else if (optic.attrs.height && !(magnifier.attrs.heights as string[]).includes(String(optic.attrs.height)))
      out.push({ severity: 'warn', slots: ['magnifier', 'optic'], message: `The dot sits at ${optic.attrs.height}" and this magnifier mounts at ${(magnifier.attrs.heights as string[]).join('" or ')}". The two must line up.` });
    else if (optic.attrs.height)
      out.push({ severity: 'info', slots: ['magnifier'], message: `Set the magnifier to the dot's ${optic.attrs.height === '1.41' ? 'absolute co-witness (1.41")' : 'lower 1/3 (1.535")'} height so the two line up.` });
  }

  if (sling?.attrs.attach === 'qd') {
    if (stock && !stock.attrs.qd)
      out.push({ severity: 'warn', slots: ['sling', 'stock'], message: `The ${stock.brand} ${stock.name} has no QD socket for the rear swivel. Add a QD end plate, or choose a stock with a QD socket.` });
    if (handguard && !qdmount && !handguard.attrs.qd)
      out.push({ severity: 'warn', slots: ['sling', 'qdmount'], message: 'This handguard has no QD socket for the front swivel. Add an M-LOK QD sling mount.' });
  } else if (qdmount && !sling)
    out.push({ severity: 'info', slots: ['qdmount'], message: 'The QD mount is ready for a sling with QD swivels.' });

  const len = rifleLength(b, large);
  if (b.case && len) {
    const room = b.case.attrs.interior as number;
    const c = Math.round(len.collapsed * 10) / 10;
    const e = Math.round(len.extended * 10) / 10;
    if (len.collapsed > room)
      out.push({ severity: 'error', slots: ['case'], message: `This rifle is about ${c}" long${len.extended > len.collapsed ? ' with the stock collapsed' : ''}, and the case is ${room}" inside. Choose a longer case.` });
    else if (len.collapsed + 2 > room)
      out.push({ severity: 'warn', slots: ['case'], message: `This rifle is about ${c}" long and the case is ${room}" inside. That's under the 2" of room case makers recommend, so it may be a tight fit.` });
    else if (len.extended > room)
      out.push({ severity: 'info', slots: ['case'], message: `About ${c}" collapsed and ${e}" extended. It fits the ${room}" case with the stock collapsed.` });
  }
  return out;
}

// ---------- Pistols ----------

export const pistolAddonSlots: Slot[] = [
  { id: 'light', name: 'Weapon light', group: G, required: false, hint: 'Must fit the frame\'s accessory rail.' },
  { id: 'holster', name: 'Holster', group: G, required: false, hint: 'Molded for one pistol size, with or without a light.' },
  { id: 'case', name: 'Case', group: G, required: false, hint: 'Any pistol case fits; check length if you run a light or comp.' },
];

/** Accessory rails: Glock universal (G17/19/26), Glock slimline Rail frames, Sig P365 proprietary, 1913 Picatinny (P320). */
export type PistolRail = 'glock' | 'glockslim' | 'p365' | 'pic';
const RAIL_LABEL: Record<string, string> = { glock: 'Glock accessory rail', glockslim: 'Glock 43X/48 Rail frame', p365: 'P365 rail', pic: '1913 Picatinny rail' };

export const pistolLights: Part[] = parts('light', [
  { id: 'p-light-tlr7a', brand: 'Streamlight', name: 'TLR-7A', specs: ['500 lm', 'Glock and 1913 rail keys'], attrs: { rails: ['glock', 'pic'], light: 'tlr7a' },
    offers: [['BRN', 139.99], ['PA', 134.99]] },
  { id: 'p-light-x300', brand: 'SureFire', name: 'X300U-A', specs: ['1,000 lm', 'Universal and Picatinny mounts'], attrs: { rails: ['glock', 'pic'], light: 'x300' },
    offers: [['BRN', 379.0], ['OP', 389.0]] },
  { id: 'p-light-tlr7sub-g', brand: 'Streamlight', name: 'TLR-7 Sub, Glock 43X/48 Rail', specs: ['500 lm', 'Glock slimline rail'], attrs: { rails: ['glockslim'], light: 'tlr7sub' },
    offers: [['BRN', 145.0]] },
  { id: 'p-light-tlr7sub-s', brand: 'Streamlight', name: 'TLR-7 Sub, Sig P365/XL', specs: ['500 lm', 'P365 rail'], attrs: { rails: ['p365'], light: 'tlr7sub' },
    offers: [['BRN', 145.0]] },
]);

const LIGHT_NAME: Record<string, string> = { tlr7a: 'TLR-7A', x300: 'X300', tlr7sub: 'TLR-7 Sub' };

/**
 * Holsters molded for one slide length. `fit` is the slide size the holster is molded for; `light` is the
 * light it carries, if any. All listed holsters are optic-cut and open at the muzzle. Prices are samples.
 */
export function holsters(prefix: string, sizes: [fit: string, label: string][], lights: string[]): Part[] {
  const list = sizes.flatMap(([fit, label]) => [
    { id: `${prefix}-hol-${fit}`, brand: 'Vedder', name: `LightTuck IWB, ${label}`, specs: ['Kydex IWB', 'Optic cut', 'Open bottom'], attrs: { fit, fitLabel: label, light: '' },
      offers: [['BRN', 64.99]] as [string, number][] },
    ...lights.map((l) => ({ id: `${prefix}-hol-${fit}-${l}`, brand: 'Vedder', name: `LightTuck IWB, ${label} + ${LIGHT_NAME[l]}`, specs: ['Kydex IWB', `Carries ${LIGHT_NAME[l]}`, 'Optic cut', 'Open bottom'],
      attrs: { fit, fitLabel: label, light: l }, offers: [['BRN', 74.99]] as [string, number][] })),
  ]);
  return parts('holster', list);
}

export const pistolCases: Part[] = parts('case', [
  { id: 'p-case-savior', brand: 'Savior Equipment', name: 'Specialist Double Pistol Case, 14"', specs: ['Soft', 'Two pistols', 'Mag pouches'], attrs: {},
    offers: [['BRN', 54.97]] },
  { id: 'p-case-pelican', brand: 'Pelican', name: '1170 Protector Case', specs: ['Hard', 'Watertight', 'Lockable'], attrs: {},
    offers: [['OP', 109.95]] },
]);

/**
 * `frameRail` is the rail on the chosen frame or grip (undefined: no rail). `size` is the slide size a holster
 * must be molded for, with a label for messages.
 */
export function pistolAddonRules(b: Build, frameRail: PistolRail | undefined, railSlot: string, size: string | undefined, sizeLabel: string): Issue[] {
  const out: Issue[] = [];
  const { light, holster, optic, muzzle, barrel, slide } = b;
  if (light) {
    if (!frameRail && b[railSlot])
      out.push({ severity: 'error', slots: ['light', railSlot], message: `This ${railSlot === 'grip' ? 'grip module' : 'frame'} has no accessory rail, so there's nothing to mount a light on.${railSlot === 'frame' ? ' Choose a Rail frame.' : ''}` });
    else if (frameRail && !(light.attrs.rails as string[]).includes(frameRail))
      out.push({ severity: 'error', slots: ['light', railSlot], message: `This light is made for the ${(light.attrs.rails as string[]).map((r) => RAIL_LABEL[r]).join(' or ')}; this pistol has the ${RAIL_LABEL[frameRail]}.` });
  }
  if (holster) {
    const hl = holster.attrs.light as string;
    if (hl && !light)
      out.push({ severity: 'error', slots: ['holster', 'light'], message: `This holster is molded around a ${LIGHT_NAME[hl]} and won't hold the pistol without one. Add the light or choose the plain version.` });
    else if (hl && light && light.attrs.light !== hl)
      out.push({ severity: 'error', slots: ['holster', 'light'], message: `This holster is molded for a ${LIGHT_NAME[hl]}, not the ${light.brand} ${light.name}.` });
    else if (!hl && light)
      out.push({ severity: 'error', slots: ['holster', 'light'], message: 'A pistol with a light won\'t go into a holster made without one. Choose the light-bearing version.' });
    if (size && holster.attrs.fit !== size)
      out.push({ severity: 'warn', slots: ['holster', slide ? 'slide' : railSlot], message: `This holster is molded for the ${holster.attrs.fitLabel}, and this build is a ${sizeLabel}. It may not hold it securely.` });
    const extras = [optic && 'optic', (slide?.attrs.comp || muzzle) && 'muzzle device', barrel?.attrs.threaded && !muzzle && 'threaded barrel'].filter(Boolean);
    if (extras.length)
      out.push({ severity: 'info', slots: ['holster'], message: `This holster is optic-cut and open at the muzzle, so it clears the ${extras.join(' and ')}.` });
  }
  return out;
}
