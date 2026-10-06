import type { Build, Issue, Part, Platform } from '../types';
import { parts, pick } from './helpers';
import { rifleAddonParts } from './addons';

/**
 * AKM (7.62x39) and AK-74 (5.45x39). AK receivers aren't sold as modular uppers and lowers, so a build starts from
 * a complete rifle (the serialized part) and swaps in furniture, an optic mount, a muzzle device and a trigger.
 * Anything not swapped is the factory part. What decides fit:
 *  - Muzzle threads: most AKMs are M14x1 left-hand; AK-74s and AK-103 pattern 7.62 rifles are M24x1.5 right-hand.
 *  - The rear trunnion: stamped fixed-stock rifles take standard AKM/AK-74 stocks; side folders and the Zastava M70
 *    (Yugoslav pattern) don't.
 *  - Optics: there is no top rail. A side-rail mount, a gas tube rail or a railed dust cover carries the optic.
 * Sources: https://en.wikipedia.org/wiki/AKM, https://en.wikipedia.org/wiki/AK-74
 */
type Cal = 'akm' | 'ak74';

const PATTERN: Record<string, string> = { yugo: 'Zastava M70 (Yugoslav pattern)', folder: 'side-folding' };

const slots = (cal: Cal) => [
  { id: 'rifle', name: 'Base rifle', group: 'Core', required: true, hint: 'Serialized. AKs are sold as complete rifles; the rest are upgrades to one.' },
  { id: 'stock', name: 'Upgrade stock', group: 'Furniture', required: false, hint: 'Standard stamped AKM/AK-74 stocks need a fixed-stock rear trunnion.' },
  { id: 'grip', name: 'Pistol grip', group: 'Furniture', required: false, hint: 'Optional. AK grips fit across makers.' },
  { id: 'handguard', name: 'Handguard', group: 'Furniture', required: false, hint: 'Optional. M-LOK handguards take lights and grips.' },
  { id: 'mount', name: 'Optic mount', group: 'Optics', required: false, hint: 'AKs have no top rail. Side mounts need a rifle with a side rail.' },
  { id: 'optic', name: 'Optic', group: 'Optics', required: false, hint: 'Needs an optic mount.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Barrel', required: false, hint: cal === 'akm' ? 'Most AKMs are threaded M14x1 left-hand; AK-103 pattern rifles M24x1.5.' : 'AK-74s are threaded M24x1.5 right-hand.' },
  { id: 'trigger', name: 'Trigger group', group: 'Internals', required: false, hint: 'Optional. Single-hook semi-auto groups drop into stamped and milled AKs.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: cal === 'akm' ? '7.62x39 magazines.' : '5.45x39 magazines. They don\'t interchange with 7.62x39 mags.' },
  { id: 'case', name: 'Case', group: 'Add-ons', required: false, hint: 'Pick a case at least 2" longer than the rifle.' },
];

/** Factory parts' weights in ounces, which src/weight.ts subtracts when an upgrade replaces them. */
const W = { w_stock: 17, w_grip: 3, w_handguard: 6, w_trigger: 4.4, w_mount: 0 };

const rifles = (cal: Cal): Part[] => cal === 'akm' ? parts('rifle', [
  { id: 'akm-psa-gf3', brand: 'Palmetto State Armory', name: 'PSAK-47 GF3 Forged Classic Polymer Rifle', specs: ['7.62x39', '16" barrel', 'M14x1 LH', 'Side rail'],
    attrs: { thread: 'M14x1 LH', bullet: .311, rail: true, stock: 'std', hg: 'std', oal: 34.6, barrel: 16, furniture: 'polymer', stockShape: 'akm', cover: 'ribbed', gasBlock: 45, receiver: 'stamped', ...W, w_muzzle: 2.3 }, serialized: true,
    offers: [['PSA', 799.99]], pick: pick('budget', 'Forged trunnions and bolt at a fair price, with a side rail for an optic mount.') },
  { id: 'akm-rak47', brand: 'Riley Defense', name: 'RAK-47 Classic Rifle', specs: ['7.62x39', '16.25" barrel', 'M14x1 LH', 'Side rail'],
    attrs: { thread: 'M14x1 LH', bullet: .311, rail: true, stock: 'std', hg: 'std', oal: 34.75, barrel: 16.25, furniture: 'laminate', stockShape: 'akm', cover: 'ribbed', gasBlock: 45, receiver: 'stamped', ...W, w_muzzle: 2.3 }, serialized: true,
    offers: [['PA', 749.99]] },
  { id: 'akm-wasr', brand: 'Century Arms', name: 'WASR-10 V2 Rifle', specs: ['7.62x39', '16.25" barrel', 'M14x1 LH', 'Romanian import'],
    attrs: { thread: 'M14x1 LH', bullet: .311, rail: true, stock: 'std', hg: 'std', oal: 34.75, barrel: 16.25, furniture: 'polymer', stockShape: 'akm', cover: 'ribbed', gasBlock: 45, receiver: 'stamped', ...W, w_muzzle: 2.3 }, serialized: true,
    offers: [['PA', 899.99], ['OP', 909.99]] },
  { id: 'akm-zpap', brand: 'Zastava Arms', name: 'ZPAPM70 Rifle, 1.5mm Receiver, Bulged Trunnion', specs: ['7.62x39', '16.3" barrel', 'M14x1 LH', 'Yugoslav pattern'],
    attrs: { thread: 'M14x1 LH', bullet: .311, rail: true, stock: 'yugo', hg: 'yugo', oal: 35.0, barrel: 16.3, furniture: 'walnut', stockShape: 'akm', cover: 'smooth', gasBlock: 90, receiver: 'yugo', ...W, w_muzzle: 2.3 }, serialized: true,
    offers: [['PA', 979.99], ['OP', 989.99]] },
  { id: 'akm-psa-103', brand: 'Palmetto State Armory', name: 'AK-103 Classic Polymer Rifle', specs: ['7.62x39', '16.3" barrel', 'M24x1.5 RH', 'Side rail'],
    attrs: { thread: 'M24x1.5', bullet: .311, rail: true, stock: 'std', hg: 'std', oal: 37.2, barrel: 16.3, furniture: 'polymer', stockShape: 'akm', cover: 'smooth', gasBlock: 90, receiver: 'stamped', ...W, w_muzzle: 3.5 }, serialized: true,
    offers: [['PSA', 1099.99]] },
  { id: 'akm-kr103', brand: 'Kalashnikov USA', name: 'KR-103 Rifle', specs: ['7.62x39', '16.33" barrel', 'M24x1.5 RH', 'Side rail'],
    attrs: { thread: 'M24x1.5', bullet: .311, rail: true, stock: 'std', hg: 'std', oal: 37.2, barrel: 16.33, furniture: 'polymer100', stockShape: 'fixed100', cover: 'smooth', gasBlock: 90, receiver: 'stamped', ...W, w_muzzle: 3.5 }, serialized: true,
    offers: [['OP', 1199.99], ['PA', 1219.99]], pick: pick('premium', 'US-made AK-103 pattern with a hard-chromed barrel and AK-74 style brake threads.') },
  { id: 'akm-sam7sf', brand: 'Arsenal', name: 'SAM7SF-84 Milled Rifle, Side Folding Stock', specs: ['7.62x39', '16.3" barrel', 'M24x1.5 RH', 'Milled receiver'],
    attrs: { thread: 'M24x1.5', bullet: .311, rail: true, stock: 'folder', hg: 'std', oal: 37.2, barrel: 16.3, furniture: 'polymer100', stockShape: 'folder-right', cover: 'smooth', gasBlock: 90, receiver: 'milled', ...W, w_muzzle: 3.5 }, serialized: true,
    offers: [['OP', 2099.99]] },
]) : parts('rifle', [
  { id: 'a74-psa', brand: 'Palmetto State Armory', name: 'AK-74 Classic Polymer Rifle', specs: ['5.45x39', '16" barrel', 'M24x1.5 RH', 'Side rail'],
    attrs: { thread: 'M24x1.5', bullet: .221, rail: true, stock: 'std', hg: 'std', oal: 37.0, barrel: 16, furniture: 'polymer', stockShape: 'akm', cover: 'smooth', gasBlock: 90, receiver: 'stamped', ...W, w_muzzle: 4 }, serialized: true,
    offers: [['PSA', 899.99]], pick: pick('value', 'Forged trunnions, a factory 74 brake and a side rail.') },
  { id: 'a74-rak74', brand: 'Riley Defense', name: 'RAK-74 Classic Rifle', specs: ['5.45x39', '16.25" barrel', 'M24x1.5 RH', 'Side rail'],
    attrs: { thread: 'M24x1.5', bullet: .221, rail: true, stock: 'std', hg: 'std', oal: 37.25, barrel: 16.25, furniture: 'laminate', stockShape: 'ak74', cover: 'smooth', gasBlock: 90, receiver: 'stamped', ...W, w_muzzle: 4 }, serialized: true,
    offers: [['PA', 849.99]] },
]);

/** Furniture, mounts, triggers and optics fit both calibers; each platform gets its own copy with its own ids. */
const shared = (cal: Cal): Part[] => {
  const p = cal === 'akm' ? 'akm' : 'a74';
  return [
    ...parts('stock', [
      { id: `${p}-stock-zhukov`, brand: 'Magpul', name: 'ZHUKOV-S Stock, Stamped AK', specs: ['Side folding', 'Stamped AKM/AK-74', 'Fixed-stock trunnion'], attrs: { kind: 'zhukov', folds: true },
        offers: [['PA', 109.95], ['BRN', 109.95]], pick: pick('premium', 'Folds to the left and adds a cheek riser option, on the factory trunnion.') },
      { id: `${p}-stock-moe`, brand: 'Magpul', name: 'MOE AK Stock', specs: ['Fixed', 'Stamped AKM/AK-74', 'Rubber butt pad'], attrs: { kind: 'moe', folds: false },
        offers: [['PA', 79.95], ['BRN', 79.95]], pick: pick('value', 'A longer, more comfortable fixed stock than the factory one.') },
      { id: `${p}-stock-strike`, brand: 'ATI', name: 'Strikeforce AK-47 Adjustable Stock', specs: ['6-position', 'Stamped AK', 'Adapter included'], attrs: { kind: 'adjustable', folds: false },
        offers: [['PA', 64.99]] },
    ]),
    ...parts('grip', [
      { id: `${p}-grip-moe`, brand: 'Magpul', name: 'MOE AK Grip', specs: ['Textured', 'Storage core option'], attrs: { kind: 'moe' },
        offers: [['PA', 19.95], ['BRN', 19.95]] },
      { id: `${p}-grip-moeplus`, brand: 'Magpul', name: 'MOE AK+ Grip', specs: ['Rubber overmold', 'Storage core option'], attrs: { kind: 'moe' },
        offers: [['PA', 24.95], ['BRN', 24.95]], pick: pick('value', 'Fuller grip with a rubber overmold, the most common AK upgrade.') },
      { id: `${p}-grip-uspalm`, brand: 'US Palm', name: 'AK Battle Grip', specs: ['Textured polymer', 'Thumb shelf'], attrs: { kind: 'uspalm' },
        offers: [['PA', 24.95]] },
      { id: `${p}-grip-hogue`, brand: 'Hogue', name: 'AK-47 Overmolded Grip', specs: ['Rubber', 'Finger grooves'], attrs: { kind: 'hogue' },
        offers: [['BRN', 24.95]] },
    ]),
    ...parts('handguard', [
      { id: `${p}-hg-moe`, brand: 'Magpul', name: 'MOE AK Hand Guard', specs: ['Lower handguard', 'M-LOK slots', 'Stamped AKM/AK-74'], attrs: { kind: 'lower', mlok: true },
        offers: [['PA', 34.95], ['BRN', 34.95]], pick: pick('value', 'Drop-in lower handguard with M-LOK slots and a heat shield.') },
      { id: `${p}-hg-zhukov`, brand: 'Magpul', name: 'ZHUKOV Hand Guard', specs: ['Upper and lower', 'M-LOK', 'Stamped AKM/AK-74'], attrs: { kind: 'full', mlok: true },
        offers: [['PA', 99.95], ['BRN', 99.95]], pick: pick('premium', 'Replaces both handguards with one M-LOK shell; installs on the factory retainer.') },
      { id: `${p}-hg-uspalm`, brand: 'US Palm', name: 'AK Battle Rail Handguard', specs: ['Lower handguard', 'Picatinny rails', 'Stamped AKM/AK-74'], attrs: { kind: 'lower', mlok: false },
        offers: [['PA', 49.95]] },
    ]),
    ...parts('mount', [
      { id: `${p}-mount-ultimak`, brand: 'Ultimak', name: 'M1-B Gas Tube Optic Mount', specs: ['Replaces gas tube', 'Forward (scout) position', 'Low height'], attrs: { kind: 'gastube' },
        offers: [['PA', 129.95], ['BRN', 129.95]], pick: pick('value', 'Puts a red dot low and forward, with both eyes open; no side rail needed.') },
      { id: `${p}-mount-mi`, brand: 'Midwest Industries', name: 'AK Side Mount, Gen 2', specs: ['Left side rail', 'Lever release', 'Picatinny top'], attrs: { kind: 'side' },
        offers: [['PA', 89.95], ['BRN', 89.95]] },
      { id: `${p}-mount-rsr`, brand: 'RS Regulate', name: 'AK-300 Series Side Mount with AKR Upper', specs: ['Left side rail', 'Return to zero', 'Low over the dust cover'], attrs: { kind: 'side' },
        offers: [['OP', 214.0]], pick: pick('premium', 'The side mount most AK shooters trust to hold zero.') },
      { id: `${p}-mount-tws`, brand: 'Texas Weapon Systems', name: 'Dog Leg Rail Gen 3', specs: ['Railed dust cover', 'Stamped AKM/AK-74', 'Replaces the rear sight leaf'], attrs: { kind: 'cover' },
        offers: [['PA', 169.95]] },
    ]),
    ...parts('optic', [
      { id: `${p}-opt-510c`, brand: 'Holosun', name: 'HS510C Reflex Sight', specs: ['Open reflex', 'Solar', '2 MOA dot + 65 MOA ring'], attrs: { kind: 'dot' },
        offers: [['PA', 329.99], ['OP', 334.99]], pick: pick('value', 'A big window and a ring reticle, quick on a forward mount.') },
      { id: `${p}-opt-t2`, brand: 'Aimpoint', name: 'Micro T-2, 2 MOA, with LRP Mount', specs: ['Micro red dot', 'Night vision settings', 'Picatinny mount'], attrs: { kind: 'dot', height: '1.535' },
        offers: [['BRN', 879.0], ['OP', 869.99]], pick: pick('premium', 'Duty-grade dot with years of battery life.') },
      { id: `${p}-opt-exps3`, brand: 'EOTech', name: 'EXPS3-0 Holographic Sight', specs: ['Holographic', '68 MOA ring + 1 MOA dot', 'Quick detach'], attrs: { kind: 'dot' },
        offers: [['OP', 739.0], ['BRN', 749.0]] },
      { id: `${p}-opt-se16`, brand: 'Vortex', name: 'Strike Eagle 1-6x24 with Cantilever Mount', specs: ['1-6x LPVO', 'Illuminated', '30mm mount'], attrs: { kind: 'lpvo' },
        offers: [['OP', 349.99], ['BRN', 349.99]] },
    ]),
    ...parts('trigger', [
      { id: `${p}-trig-tapco`, brand: 'Tapco', name: 'G2 Single Hook Trigger Group', specs: ['Single hook', 'US made', 'Smoother than factory'], attrs: { kind: 'tapco' },
        offers: [['PA', 32.99]] },
      { id: `${p}-trig-algel`, brand: 'ALG Defense', name: 'AKT-EL Enhanced Lightweight Trigger', specs: ['Single hook', '~4.5 lb', 'Nickel boron'], attrs: { kind: 'alg' },
        offers: [['PA', 69.99], ['BRN', 69.99]], pick: pick('value', 'A cleaner, lighter pull that drops in.') },
      { id: `${p}-trig-algul`, brand: 'ALG Defense', name: 'AKT-UL Ultimate Trigger', specs: ['Single hook', '~3.5 lb', 'Nickel boron'], attrs: { kind: 'alg' },
        offers: [['PA', 99.99], ['BRN', 99.99]], pick: pick('premium', 'ALG\'s lightest, crispest AK trigger.') },
    ]),
  ];
};

const muzzles = (cal: Cal): Part[] => cal === 'akm' ? parts('muzzle', [
  { id: 'akm-mz-slant', brand: 'Century Arms', name: 'AKM Slant Muzzle Brake, M14x1 LH', specs: ['M14x1 LH', 'Factory style', 'Pushes the muzzle down'], attrs: { thread: 'M14x1 LH', bore: .33, kind: 'slant' },
    offers: [['PA', 14.99]] },
  { id: 'akm-mz-pws', brand: 'Primary Weapons Systems', name: 'FSC47 Compensator, M14x1 LH', specs: ['M14x1 LH', 'Flash hider and compensator'], attrs: { thread: 'M14x1 LH', bore: .33, kind: 'comp' },
    offers: [['PA', 99.95], ['BRN', 99.95]], pick: pick('value', 'Cuts flash and muzzle climb without the blast of a brake.') },
  { id: 'akm-mz-jmac14', brand: 'JMAC Customs', name: 'RRD-4C Muzzle Brake, M14x1 LH', specs: ['M14x1 LH', 'Three-chamber brake'], attrs: { thread: 'M14x1 LH', bore: .33, kind: 'brake' },
    offers: [['PA', 99.99]] },
  { id: 'akm-mz-jmac24', brand: 'JMAC Customs', name: 'RRD-4C Muzzle Brake, M24x1.5 RH, 7.62', specs: ['M24x1.5 RH', 'Three-chamber brake', '7.62 bore'], attrs: { thread: 'M24x1.5', bore: .33, kind: 'brake' },
    offers: [['PA', 99.99]], pick: pick('premium', 'Flat-shooting brake for M24x1.5 threaded 7.62 rifles.') },
]) : parts('muzzle', [
  { id: 'a74-mz-74', brand: 'Arsenal', name: 'AK-74 Style Two-Chamber Muzzle Brake, M24x1.5 RH', specs: ['M24x1.5 RH', 'Factory style', '5.45 bore'], attrs: { thread: 'M24x1.5', bore: .24, kind: 'brake74' },
    offers: [['OP', 39.99]] },
  { id: 'a74-mz-pws', brand: 'Primary Weapons Systems', name: 'FSC74 Compensator, M24x1.5 RH', specs: ['M24x1.5 RH', 'Flash hider and compensator'], attrs: { thread: 'M24x1.5', bore: .24, kind: 'comp' },
    offers: [['PA', 99.95], ['BRN', 99.95]], pick: pick('value', 'Less flash than the factory brake with most of its recoil control.') },
  { id: 'a74-mz-jmac', brand: 'JMAC Customs', name: 'RRD-4C Muzzle Brake, M24x1.5 RH, 5.45', specs: ['M24x1.5 RH', 'Three-chamber brake', '5.45 bore'], attrs: { thread: 'M24x1.5', bore: .24, kind: 'brake' },
    offers: [['PA', 99.99]], pick: pick('premium', 'A flatter-shooting brake than the factory 74.') },
]);

const mags = (cal: Cal): Part[] => cal === 'akm' ? parts('mag', [
  { id: 'akm-mag-moe', brand: 'Magpul', name: 'PMAG 30 AK/AKM MOE', specs: ['30 rd', 'Polymer', '7.62x39'], attrs: { rounds: 30, steel: false },
    offers: [['PA', 15.95], ['BRN', 15.95]], pick: pick('budget', 'Light, cheap and reliable.') },
  { id: 'akm-mag-m3', brand: 'Magpul', name: 'PMAG 30 AK/AKM GEN M3', specs: ['30 rd', 'Polymer', 'Steel locking lugs'], attrs: { rounds: 30, steel: false },
    offers: [['PA', 21.95], ['BRN', 21.95]], pick: pick('value', 'Magpul\'s toughest AK mag, with steel lugs front and rear.') },
  { id: 'akm-mag-uspalm', brand: 'US Palm', name: 'AK30R 30-Round Magazine', specs: ['30 rd', 'Polymer', 'Steel reinforced'], attrs: { rounds: 30, steel: false },
    offers: [['PA', 19.95]] },
  { id: 'akm-mag-circle10', brand: 'Bulgarian Surplus', name: 'Circle 10 30-Round Steel Magazine', specs: ['30 rd', 'Steel', 'Military surplus'], attrs: { rounds: 30, steel: true },
    offers: [['PA', 49.99]] },
]) : parts('mag', [
  { id: 'a74-mag-m3', brand: 'Magpul', name: 'PMAG 30 AK74 GEN M3', specs: ['30 rd', 'Polymer', '5.45x39'], attrs: { rounds: 30, steel: false },
    offers: [['PA', 24.95], ['BRN', 24.95]], pick: pick('budget', 'The standard 5.45 mag today.') },
  { id: 'a74-mag-bulg', brand: 'Bulgarian Surplus', name: '5.45x39 30-Round Polymer Magazine', specs: ['30 rd', 'Polymer', 'Military surplus'], attrs: { rounds: 30, steel: false },
    offers: [['PA', 29.99]] },
]);

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { rifle, stock, handguard, mount, optic, muzzle } = b;
  if (rifle && muzzle) {
    const rt = rifle.attrs.thread as string, mt = muzzle.attrs.thread as string;
    if (rt !== mt)
      out.push({ severity: 'error', slots: ['muzzle', 'rifle'], message: `This rifle's barrel is threaded ${rt === 'M24x1.5' ? 'M24x1.5 right-hand' : rt} but the muzzle device is ${mt === 'M24x1.5' ? 'M24x1.5 right-hand' : mt}. They won't screw together.` });
    else if ((muzzle.attrs.bore as number) < (rifle.attrs.bullet as number))
      out.push({ severity: 'error', slots: ['muzzle', 'rifle'], message: `This muzzle device is made for 5.45 (.221") bullets and the rifle fires 7.62x39 (.311"). The threads match, but the bullet would strike the device.` });
  }
  const pat = rifle?.attrs.stock as string | undefined;
  if (stock && pat === 'folder')
    out.push({ severity: 'error', slots: ['stock', 'rifle'], message: `This rifle has a ${PATTERN.folder} rear trunnion. Stamped fixed-stock upgrades need a fixed-stock trunnion, which is a gunsmith job.` });
  else if (stock && pat === 'yugo')
    out.push({ severity: 'warn', slots: ['stock', 'rifle'], message: `This rifle has a ${PATTERN.yugo} rear trunnion. Standard AKM stocks don't fit it without an M70 version or fitting. Check the stock maker's fit list.` });
  if (handguard && rifle?.attrs.hg === 'yugo')
    out.push({ severity: 'warn', slots: ['handguard', 'rifle'], message: 'Zastava M70 handguards are longer than AKM ones. Check that this handguard is listed for the ZPAP M70 before buying.' });
  const kind = mount?.attrs.kind as string | undefined;
  if (mount && kind === 'side' && rifle && !rifle.attrs.rail)
    out.push({ severity: 'error', slots: ['mount', 'rifle'], message: 'A side mount clamps to the side rail on the receiver, and this rifle has none.' });
  if (optic && !mount)
    out.push({ severity: 'error', slots: ['optic', 'mount'], message: 'AKs have no top rail for an optic. Add an optic mount: a side mount, a gas tube rail or a railed dust cover.' });
  if (optic && kind === 'gastube' && optic.attrs.kind === 'lpvo')
    out.push({ severity: 'warn', slots: ['optic', 'mount'], message: 'A gas tube mount puts the optic well forward, where a magnified scope has too little eye relief. Use a side mount for a scope.' });
  else if (optic && kind === 'gastube')
    out.push({ severity: 'info', slots: ['optic', 'mount'], message: 'A forward-mounted dot works best with both eyes open.' });
  if (kind === 'gastube' && handguard?.attrs.kind === 'full')
    out.push({ severity: 'warn', slots: ['mount', 'handguard'], message: 'The ZHUKOV replaces the upper handguard, and a gas tube rail replaces the gas tube under it. We couldn\'t confirm the two fit together. Check with Magpul first.' });
  if (kind === 'cover')
    out.push({ severity: 'info', slots: ['mount'], message: 'A railed dust cover replaces the rear sight leaf. Zero the optic before relying on it.' });
  if (kind === 'side' && (stock?.attrs.folds || (!stock && pat === 'folder')))
    out.push({ severity: 'info', slots: ['mount', stock ? 'stock' : 'rifle'], message: 'Stocks fold to the left, where a side mount sits. With the optic on, the stock may not fold flat. Check the mount maker\'s note on folding stocks.' });
  if (b.case && rifle) {
    const len = rifle.attrs.oal as number;
    const room = b.case.attrs.interior as number;
    if (len > room)
      out.push({ severity: 'error', slots: ['case'], message: `This rifle is about ${len}" long, and the case is ${room}" inside. Choose a longer case.` });
    else if (len + 2 > room)
      out.push({ severity: 'warn', slots: ['case'], message: `This rifle is about ${len}" long and the case is ${room}" inside. That's under the 2" of room case makers recommend.` });
  }
  return out;
}

function make(cal: Cal): Platform {
  const p = cal === 'akm' ? 'akm' : 'a74';
  return {
    id: cal,
    name: cal === 'akm' ? 'AKM' : 'AK-74',
    family: 'Rifle',
    maker: 'AK Platform',
    blurb: cal === 'akm'
      ? '7.62x39 AK. Start from a complete rifle and upgrade the furniture, optic mount, muzzle device and trigger.'
      : '5.45x39 AK. Start from a complete rifle and upgrade the furniture, optic mount, muzzle device and trigger.',
    slots: slots(cal),
    parts: [...rifles(cal), ...shared(cal), ...muzzles(cal), ...mags(cal), ...rifleAddonParts.filter((x) => x.slot === 'case')],
    rules,
    presets: cal === 'akm' ? {
      budget: ['akm-psa-gf3', 'akm-mag-moe'],
      value: ['akm-psa-gf3', `${p}-stock-moe`, `${p}-grip-moeplus`, `${p}-hg-moe`, `${p}-mount-ultimak`, `${p}-opt-510c`, `${p}-trig-algel`, 'akm-mz-pws', 'akm-mag-m3'],
      premium: ['akm-kr103', `${p}-stock-zhukov`, `${p}-grip-moeplus`, `${p}-hg-zhukov`, `${p}-mount-rsr`, `${p}-opt-t2`, `${p}-trig-algul`, 'akm-mz-jmac24', 'akm-mag-m3'],
    } : {
      budget: ['a74-rak74', 'a74-mag-m3'],
      value: ['a74-psa', `${p}-stock-moe`, `${p}-grip-moeplus`, `${p}-hg-moe`, `${p}-mount-ultimak`, `${p}-opt-510c`, `${p}-trig-algel`, 'a74-mz-pws', 'a74-mag-m3'],
      premium: ['a74-psa', `${p}-stock-zhukov`, `${p}-grip-moeplus`, `${p}-hg-zhukov`, `${p}-mount-rsr`, `${p}-opt-t2`, `${p}-trig-algul`, 'a74-mz-jmac', 'a74-mag-m3'],
    },
  };
}

export const akm = make('akm');
export const ak74 = make('ak74');
