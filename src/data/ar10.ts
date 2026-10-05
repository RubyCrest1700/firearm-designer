import type { Build, Issue, Placement, Platform } from '../types';
import { boreIssue, parts, pick, threadIssue } from './helpers';
import { rifleAddonParts, rifleAddonRules, rifleAddonSlots } from './addons';

/**
 * AR-10 / LR-308 (.308 Win and 6.5 Creedmoor). Unlike the AR-15 there is no single
 * standard: DPMS "LR-308" and Armalite "AR-10" patterns differ in receivers, charging
 * handles and magazines, and DPMS uppers come in high and low profile.
 */
const PORT_DISTANCE: Record<string, number> = { carbine: 7.5, midlength: 9.5, rifle: 12.5 };
const PATTERN_LABEL: Record<string, string> = { 'dpms-high': 'DPMS high-profile', 'dpms-low': 'DPMS low-profile', armalite: 'Armalite' };
const family = (p: unknown) => (String(p).startsWith('dpms') ? 'DPMS' : 'Armalite');
/**
 * DPMS and Armalite differ in barrel nut thread (DPMS 1-7/16"-16, Armalite 1-7/16"-18), barrel extension,
 * bolt carrier and gas tube length, so none of those cross over. Source:
 * https://308ar.com/ar-10-308-ar-compatibility-reference-guide/
 */
const NUT: Record<string, string> = { DPMS: '1-7/16"-16', Armalite: '1-7/16"-18' };

const slots = [
  { id: 'lower', name: 'Stripped lower receiver', group: 'Lower', required: true, hint: 'Serialized. DPMS or Armalite pattern decides the rest of the build.' },
  { id: 'lpk', name: 'Lower parts kit', group: 'Lower', required: true, hint: 'Pattern-specific: DPMS and Armalite parts kits differ.' },
  { id: 'trigger', name: 'Trigger group', group: 'Lower', required: true, hint: 'AR-15 small-pin triggers fit both patterns.' },
  { id: 'buffer', name: 'Buffer system', group: 'Lower', required: true, hint: 'Use a .308 buffer and spring for reliable cycling.' },
  { id: 'stock', name: 'Stock', group: 'Lower', required: true, hint: 'AR-15 stocks fit AR-10 buffer tubes.' },
  { id: 'grip', name: 'Pistol grip', group: 'Lower', required: true, hint: 'Any AR-15 grip fits.' },
  { id: 'upper', name: 'Stripped upper receiver', group: 'Upper', required: true, hint: 'Must match the lower\'s pattern. DPMS uppers are high or low profile.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Sets caliber, gas length, journal and muzzle threads (usually 5/8x24).' },
  { id: 'gasblock', name: 'Gas block', group: 'Upper', required: true, hint: 'Must match the barrel journal diameter.' },
  { id: 'gastube', name: 'Gas tube', group: 'Upper', required: true, hint: 'Must match the barrel gas system length.' },
  { id: 'handguard', name: 'Handguard', group: 'Upper', required: true, hint: 'Must match the upper\'s barrel nut thread (DPMS or Armalite).' },
  { id: 'bcg', name: 'Bolt carrier group', group: 'Upper', required: true, hint: 'DPMS and Armalite bolt carriers differ. 6.5 CM uses the .308 bolt face.' },
  { id: 'charging', name: 'Charging handle', group: 'Upper', required: true, hint: 'DPMS and Armalite charging handles differ.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Accessories', required: false, hint: 'Most .308 barrels are threaded 5/8x24.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'SR-25 pattern (Magpul PMAG LR/SR) mags fit DPMS and current Armalite A-series lowers.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Prices include a mount where noted.' },
  ...rifleAddonSlots,
];

const allParts = [
  ...parts('lower', [
    { id: 'a10-lower-aero', brand: 'Aero Precision', name: 'M5 Stripped Lower', specs: ['DPMS high-profile pattern', 'Threaded bolt catch pin'], attrs: { pattern: 'dpms-high' }, serialized: true,
      offers: [['AERO', 149.99], ['PA', 154.99], ['BRN', 159.99]], pick: pick('value', 'The most common AR-10 lower; huge parts support.') },
    { id: 'a10-lower-psa', brand: 'Palmetto State Armory', name: 'PA-10 Stripped Lower', specs: ['DPMS low-profile pattern'], attrs: { pattern: 'dpms-low' }, serialized: true,
      offers: [['PSA', 99.99]], pick: pick('budget', 'Cheapest way into a .308 AR.') },
    { id: 'a10-lower-armalite', brand: 'Armalite', name: 'AR-10 Stripped Lower', specs: ['Armalite pattern'], attrs: { pattern: 'armalite' }, serialized: true,
      offers: [['BRN', 229.99], ['MID', 234.99]] },
    { id: 'a10-lower-seekins', brand: 'Seekins Precision', name: 'SP10 Billet Lower', specs: ['DPMS high-profile pattern', 'Billet', 'Ambi bolt release'], attrs: { pattern: 'dpms-high' }, serialized: true,
      offers: [['BRN', 349.99], ['OP', 339.0]], pick: pick('premium', 'Billet, ambidextrous, takes PMAG LR mags.') },
  ]),
  ...parts('lpk', [
    { id: 'a10-lpk-dpms', brand: 'Aero Precision', name: 'AR-10/M5 Lower Parts Kit, Minus FCG/Grip', specs: ['DPMS pattern'], attrs: { family: 'DPMS' },
      offers: [['AERO', 49.99], ['PA', 47.99]], pick: pick('value', 'Matches DPMS-pattern lowers, including PSA and Aero.') },
    { id: 'a10-lpk-armalite', brand: 'Armalite', name: 'AR-10 Lower Parts Kit', specs: ['Armalite pattern'], attrs: { family: 'Armalite' },
      offers: [['BRN', 79.99]] },
  ]),
  ...parts('trigger', [
    { id: 'a10-trig-psa', brand: 'Palmetto State Armory', name: 'EPT Enhanced Polished Trigger', specs: ['Single stage', '~6 lb', 'Polished'], attrs: {},
      offers: [['PSA', 39.99]], pick: pick('budget', 'Smoother than mil-spec for little more.') },
    { id: 'a10-trig-alg', brand: 'ALG Defense', name: 'ACT Trigger', specs: ['Single stage', '~5.5 lb'], attrs: {},
      offers: [['BRN', 69.0], ['PA', 69.99]], pick: pick('value', 'The best trigger under $100.') },
    { id: 'a10-trig-geissele', brand: 'Geissele', name: 'SSA-E Two Stage', specs: ['Two stage', '3.5 lb total'], attrs: {},
      offers: [['BRN', 240.0], ['PA', 240.0]], pick: pick('premium', 'A two-stage suits a precision .308.') },
    { id: 'a10-trig-larue', brand: 'LaRue Tactical', name: 'MBT-2S Two Stage', specs: ['Two stage', '~4.5 lb total'], attrs: {},
      offers: [['BRN', 99.99], ['OP', 99.95]] },
  ]),
  ...parts('buffer', [
    { id: 'a10-buf-aero', brand: 'Aero Precision', name: 'AR-10 Carbine Buffer Kit', specs: ['Carbine tube', '.308 buffer + spring'], attrs: {},
      offers: [['AERO', 69.99], ['PA', 67.99]], pick: pick('value', 'Buffer weight and spring tuned for .308.') },
    { id: 'a10-buf-psa', brand: 'Palmetto State Armory', name: 'PA-10 Carbine Buffer Kit', specs: ['Carbine tube', '.308 buffer'], attrs: {},
      offers: [['PSA', 49.99]], pick: pick('budget', 'Complete kit at the lowest price.') },
  ]),
  ...parts('stock', [
    { id: 'a10-stock-moesl', brand: 'Magpul', name: 'MOE SL Carbine Stock', specs: ['Collapsible', 'QD socket'], attrs: { qd: true },
      offers: [['PA', 49.95], ['BRN', 54.95]], pick: pick('value', 'Light, solid, fits AR-10 carbine tubes.') },
    { id: 'a10-stock-psa', brand: 'Palmetto State Armory', name: 'Classic M4 Stock', specs: ['Collapsible'], attrs: {},
      offers: [['PSA', 19.99]], pick: pick('budget', 'Basic and cheap.') },
    { id: 'a10-stock-ubr', brand: 'Magpul', name: 'UBR Gen2 Collapsible Stock', specs: ['Collapsible', 'Adjustable cheek', 'QD sockets'], attrs: { qd: true },
      offers: [['PA', 239.95], ['BRN', 249.95]], pick: pick('premium', 'Precision-style stock that still collapses.') },
    { id: 'a10-stock-ctr', brand: 'Magpul', name: 'CTR Carbine Stock', specs: ['Collapsible', 'Friction lock', 'QD socket'], attrs: { qd: true },
      offers: [['PA', 69.95], ['BRN', 74.95]] },
  ]),
  ...parts('grip', [
    { id: 'a10-grip-moe', brand: 'Magpul', name: 'MOE Grip', specs: ['Polymer'], attrs: {},
      offers: [['PA', 19.95], ['PSA', 19.99]], pick: pick('budget', 'The default grip.') },
    { id: 'a10-grip-bcm', brand: 'Bravo Company', name: 'Gunfighter Grip Mod 3', specs: ['Steeper angle'], attrs: {},
      offers: [['BRN', 19.95]], pick: pick('value', 'More vertical angle.') },
  ]),
  ...parts('upper', [
    { id: 'a10-upper-aero', brand: 'Aero Precision', name: 'M5 Stripped Upper', specs: ['DPMS high-profile pattern', 'Forward assist'], attrs: { pattern: 'dpms-high' },
      offers: [['AERO', 129.99], ['PA', 134.99]], pick: pick('value', 'Pairs with the M5 lower; Aero and Seekins rails fit it.') },
    { id: 'a10-upper-psa', brand: 'Palmetto State Armory', name: 'PA-10 Stripped Upper', specs: ['DPMS low-profile pattern'], attrs: { pattern: 'dpms-low' },
      offers: [['PSA', 89.99]], pick: pick('budget', 'Matches the PA-10 lower.') },
    { id: 'a10-upper-armalite', brand: 'Armalite', name: 'AR-10 Stripped Upper', specs: ['Armalite pattern'], attrs: { pattern: 'armalite' },
      offers: [['BRN', 179.99]] },
    { id: 'a10-upper-seekins', brand: 'Seekins Precision', name: 'SP10 Billet Upper', specs: ['DPMS high-profile pattern', 'Billet'], attrs: { pattern: 'dpms-high' },
      offers: [['BRN', 299.99], ['OP', 289.0]], pick: pick('premium', 'Matched billet set with the SP10 lower.') },
  ]),
  ...parts('barrel', [
    { id: 'a10-bbl-psa18', brand: 'Palmetto State Armory', name: '18" .308 Win Midlength, Nitride', specs: ['18"', '.308 Win', 'Midlength gas', '.750 journal', '5/8x24'],
      attrs: { caliber: '.308 Win', bullet: .308, length: 18, gas: 'midlength', journal: '.750', thread: '5/8x24', family: 'DPMS' },
      offers: [['PSA', 179.99]], pick: pick('budget', 'Solid all-round .308 barrel.') },
    { id: 'a10-bbl-ba18', brand: 'Ballistic Advantage', name: '18" .308 Win Rifle-Length Performance', specs: ['18"', '.308 Win', 'Rifle gas', '.750 journal', '5/8x24'],
      attrs: { caliber: '.308 Win', bullet: .308, length: 18, gas: 'rifle', journal: '.750', thread: '5/8x24', family: 'DPMS' },
      offers: [['PA', 259.99], ['BRN', 269.99]], pick: pick('value', 'Rifle-length gas runs smooth and soft on an 18" .308.') },
    { id: 'a10-bbl-criterion', brand: 'Criterion', name: '20" 6.5 Creedmoor Rifle-Length', specs: ['20"', '6.5 Creedmoor', 'Rifle gas', '.875 journal', '5/8x24'],
      attrs: { caliber: '6.5 CM', bullet: .264, length: 20, gas: 'rifle', journal: '.875', thread: '5/8x24', family: 'DPMS' },
      offers: [['BRN', 329.0], ['PA', 334.99]], pick: pick('premium', 'Match-grade 6.5 CM for long-range work.') },
    { id: 'a10-bbl-aero16', brand: 'Aero Precision', name: '16" .308 Win Midlength', specs: ['16"', '.308 Win', 'Midlength gas', '.750 journal', '5/8x24'],
      attrs: { caliber: '.308 Win', bullet: .308, length: 16, gas: 'midlength', journal: '.750', thread: '5/8x24', family: 'DPMS' },
      offers: [['AERO', 229.99], ['PA', 224.99]] },
    { id: 'a10-bbl-ba20', brand: 'Ballistic Advantage', name: '20" .308 Win Heavy Rifle-Length, Modern Series', specs: ['20"', '.308 Win', 'Rifle gas', '.750 journal', '1:10', 'Heavy profile', '5/8x24'],
      attrs: { caliber: '.308 Win', bullet: .308, length: 20, gas: 'rifle', journal: '.750', thread: '5/8x24', family: 'DPMS' },
      offers: [['PA', 199.99], ['BRN', 209.99]] },
  ]),
  ...parts('gasblock', [
    { id: 'a10-gb-750', brand: 'Aero Precision', name: 'Low Profile Gas Block .750', specs: ['.750', 'Low profile'], attrs: { journal: '.750' },
      offers: [['AERO', 24.99], ['PA', 22.99]], pick: pick('value', 'Simple, fits under any free-float rail.') },
    { id: 'a10-gb-sa750', brand: 'Superlative Arms', name: 'Adjustable Bleed-Off Gas Block .750', specs: ['.750', 'Adjustable'], attrs: { journal: '.750' },
      offers: [['BRN', 84.99]] },
    { id: 'a10-gb-875', brand: 'Superlative Arms', name: 'Adjustable Bleed-Off Gas Block .875', specs: ['.875', 'Adjustable'], attrs: { journal: '.875' },
      offers: [['BRN', 89.99], ['OP', 92.0]], pick: pick('premium', 'Tune gas for suppressed or hot loads.') },
  ]),
  ...parts('gastube', [
    { id: 'a10-gt-mid', brand: 'Aero Precision', name: 'AR-10 Midlength Gas Tube', specs: ['Midlength'], attrs: { length: 'midlength', family: 'DPMS' }, offers: [['AERO', 13.99], ['PSA', 11.99]] },
    { id: 'a10-gt-rifle', brand: 'Aero Precision', name: 'AR-10 Rifle-Length Gas Tube', specs: ['Rifle length'], attrs: { length: 'rifle', family: 'DPMS' }, offers: [['AERO', 14.99], ['BRN', 16.99]] },
  ]),
  ...parts('handguard', [
    { id: 'a10-hg-atlas', brand: 'Aero Precision', name: 'ATLAS S-ONE 15" M-LOK, AR-10', specs: ['15"', 'DPMS high-profile', 'M-LOK'], attrs: { pattern: 'dpms-high', length: 15 },
      offers: [['AERO', 189.99], ['PA', 184.99]], pick: pick('value', 'Built for the M5 upper.') },
    { id: 'a10-hg-psa', brand: 'Palmetto State Armory', name: 'PA-10 15" M-LOK Rail', specs: ['15"', 'DPMS low-profile', 'M-LOK'], attrs: { pattern: 'dpms-low', length: 15 },
      offers: [['PSA', 79.99]], pick: pick('budget', 'Made for the PA-10 upper.') },
    { id: 'a10-hg-seekins', brand: 'Seekins Precision', name: 'SP3R V3 15" Rail', specs: ['15"', 'DPMS high-profile', 'M-LOK'], attrs: { pattern: 'dpms-high', length: 15 },
      offers: [['BRN', 239.99], ['OP', 235.0]], pick: pick('premium', 'Stiff precision rail, ARCA-friendly.') },
    { id: 'a10-hg-armalite', brand: 'Armalite', name: 'AR-10 Tactical 15" Handguard', specs: ['15"', 'Armalite pattern'], attrs: { pattern: 'armalite', length: 15 },
      offers: [['BRN', 199.99]] },
  ]),
  ...parts('bcg', [
    { id: 'a10-bcg-psa', brand: 'Palmetto State Armory', name: 'PA-10 .308 Nitride BCG', specs: ['.308 / 6.5 CM', 'Nitride'], attrs: { family: 'DPMS' },
      offers: [['PSA', 129.99]], pick: pick('budget', 'Runs .308 and 6.5 CM.') },
    { id: 'a10-bcg-toolcraft', brand: 'Toolcraft', name: 'AR-10 .308 Nitride BCG', specs: ['.308 / 6.5 CM', 'Nitride', 'MPI'], attrs: { family: 'DPMS' },
      offers: [['BRN', 169.99], ['PA', 164.99]], pick: pick('value', 'Well-made and fairly priced.') },
    { id: 'a10-bcg-jp', brand: 'JP Enterprises', name: 'LMOS .308 Bolt Carrier', specs: ['.308 / 6.5 CM', 'Low-mass', 'Enhanced bolt'], attrs: { family: 'DPMS' },
      offers: [['BRN', 349.99]], pick: pick('premium', 'Low-mass carrier for a flatter-shooting precision rifle.') },
    { id: 'a10-bcg-young', brand: 'Young Manufacturing', name: 'AR-10 Armalite Black Nitride BCG', specs: ['Armalite pattern', '.308 / 6.5 CM', 'Nitride'], attrs: { family: 'Armalite' },
      offers: [['YM', 199.95]] },
  ]),
  ...parts('charging', [
    { id: 'a10-ch-dpms', brand: 'Aero Precision', name: 'AR-10/M5 Charging Handle', specs: ['DPMS pattern'], attrs: { family: 'DPMS' },
      offers: [['AERO', 29.99], ['PSA', 24.99]], pick: pick('budget', 'Standard DPMS-pattern handle.') },
    { id: 'a10-ch-radian', brand: 'Radian', name: 'Raptor .308 Ambi Charging Handle', specs: ['DPMS pattern', 'Ambidextrous'], attrs: { family: 'DPMS' },
      offers: [['BRN', 99.95], ['PA', 99.99]], pick: pick('value', 'Ambi, and easy to grab with a big scope.') },
    { id: 'a10-ch-armalite', brand: 'Armalite', name: 'AR-10 Charging Handle', specs: ['Armalite pattern'], attrs: { family: 'Armalite' },
      offers: [['BRN', 49.99]] },
  ]),
  ...parts('muzzle', [
    { id: 'a10-mz-pa', brand: 'Precision Armament', name: 'M4-72 Severe Duty Brake (5/8x24)', specs: ['5/8x24', 'Brake'], attrs: { thread: '5/8x24', kind: 'brake', bore: .308 },
      offers: [['BRN', 94.99], ['PA', 99.99]], pick: pick('value', 'Big recoil reduction for .308.') },
    { id: 'a10-mz-a2', brand: 'Generic', name: 'A2 Flash Hider .308 (5/8x24)', specs: ['5/8x24', 'Flash hider'], attrs: { thread: '5/8x24', kind: 'flash', bore: .308 },
      offers: [['PSA', 14.99]], pick: pick('budget', 'Basic flash hider.') },
    { id: 'a10-mz-a2-556', brand: 'Generic', name: 'A2 Birdcage 5.56 (1/2x28)', specs: ['1/2x28', 'Flash hider'], attrs: { thread: '1/2x28', kind: 'flash', bore: .224 },
      offers: [['PSA', 9.99]] },
    { id: 'a10-mz-sf3p', brand: 'SureFire', name: 'SOCOM 3-Prong Flash Hider 7.62 (5/8x24)', specs: ['5/8x24', 'Flash hider', 'Suppressor mount'], attrs: { thread: '5/8x24', kind: 'flash', bore: .308 },
      offers: [['PA', 169.0], ['BRN', 169.0]] },
  ]),
  ...parts('mag', [
    { id: 'a10-mag-pmag', brand: 'Magpul', name: 'PMAG 20 LR/SR Gen M3', specs: ['20 rd', 'SR-25 pattern', 'DPMS and Armalite'], attrs: { family: 'SR-25' },
      offers: [['PA', 24.95], ['MID', 25.99], ['BRN', 26.99]], pick: pick('value', 'The standard DPMS-pattern magazine.') },
    { id: 'a10-mag-armalite', brand: 'Armalite', name: 'AR-10 20-Round Magazine', specs: ['20 rd', 'SR-25 pattern', 'Armalite A-series'], attrs: { family: 'SR-25' },
      offers: [['BRN', 39.99]] },
  ]),
  ...parts('optic', [
    { id: 'a10-opt-vortex', brand: 'Vortex', name: 'Strike Eagle 1-8x24 + Mount', specs: ['LPVO', '1-8x'], attrs: { kind: 'lpvo' },
      offers: [['PA', 349.99], ['OP', 359.99]], pick: pick('value', 'Versatile from close range out to 600 yards.') },
    { id: 'a10-opt-venom', brand: 'Vortex', name: 'Venom 5-25x56 FFP + Mount', specs: ['Precision scope', 'FFP'], attrs: { kind: 'scope' },
      offers: [['PA', 649.99], ['OP', 639.99]], pick: pick('premium', 'First-focal-plane scope for long-range 6.5 CM.') },
    { id: 'a10-opt-slx16', brand: 'Primary Arms', name: 'SLx 1-6x24 SFP Gen IV + Mount', specs: ['LPVO', '1-6x', 'Mount included'], attrs: { kind: 'lpvo' },
      offers: [['PA', 399.98]] },
  ]),
];

function rules(b: Build, place: Placement = {}): Issue[] {
  const out: Issue[] = [];
  const { lower, upper, lpk, handguard, charging, mag, barrel, gasblock, gastube, muzzle } = b;
  if (lower && upper && lower.attrs.pattern !== upper.attrs.pattern) {
    const sameFamily = family(lower.attrs.pattern) === family(upper.attrs.pattern);
    out.push({
      severity: sameFamily ? 'warn' : 'error',
      slots: ['lower', 'upper'],
      message: sameFamily
        ? `A ${PATTERN_LABEL[upper.attrs.pattern as string]} upper on a ${PATTERN_LABEL[lower.attrs.pattern as string]} lower will fit, but the receivers won't line up flush at the rear.`
        : `${PATTERN_LABEL[upper.attrs.pattern as string]} uppers don't fit ${PATTERN_LABEL[lower.attrs.pattern as string]} lowers.`,
    });
  }
  if (lower && lpk && lpk.attrs.family !== family(lower.attrs.pattern))
    out.push({ severity: 'error', slots: ['lower', 'lpk'], message: `A ${family(lower.attrs.pattern)}-pattern lower needs a ${family(lower.attrs.pattern)} parts kit (bolt catch and mag catch differ).` });
  if (upper && handguard && family(handguard.attrs.pattern) !== family(upper.attrs.pattern)) {
    const u = family(upper.attrs.pattern);
    const h = family(handguard.attrs.pattern);
    out.push({ severity: 'error', slots: ['upper', 'handguard'], message: `The ${u} barrel nut is threaded ${NUT[u]}; this handguard is made for the ${h} ${NUT[h]} nut.` });
  } else if (upper && handguard && handguard.attrs.pattern !== upper.attrs.pattern)
    out.push({ severity: 'warn', slots: ['upper', 'handguard'], message: `This handguard is made for ${PATTERN_LABEL[handguard.attrs.pattern as string]} uppers. It mounts on a ${PATTERN_LABEL[upper.attrs.pattern as string]} upper, but its top rail won't line up exactly with the receiver rail.` });
  for (const [slot, part, what] of [['barrel', barrel, 'barrel extension'], ['bcg', b.bcg, 'bolt carrier'], ['gastube', gastube, 'gas tube length']] as const)
    if (upper && part && part.attrs.family && part.attrs.family !== family(upper.attrs.pattern))
      out.push({ severity: 'error', slots: ['upper', slot], message: `${family(upper.attrs.pattern)} and ${part.attrs.family} patterns use a different ${what}. This part is ${part.attrs.family} pattern.${family(upper.attrs.pattern) === 'Armalite' && slot !== 'bcg' ? ' Armalite sells its barrels and gas tubes mainly as factory spares, so few are sold separately.' : ''}` });
  if (upper && charging && charging.attrs.family !== family(upper.attrs.pattern))
    out.push({ severity: 'error', slots: ['upper', 'charging'], message: `${family(upper.attrs.pattern)} uppers need a ${family(upper.attrs.pattern)}-pattern charging handle.` });
  // DPMS and current Armalite (A-series) lowers both take SR-25 pattern magazines; only the old AR-10B used
  // modified M14 mags. Sources: https://sadefensejournal.com/armalites-ar-10a/,
  // https://armalite.com/product/ar10-tactical-rifles/ar-10-18-tactical-rifle/ (ships with a Magpul PMAG)
  if (lower && mag && mag.attrs.family !== 'SR-25')
    out.push({ severity: 'error', slots: ['lower', 'mag'], message: `This lower takes SR-25 pattern magazines.` });
  if (barrel && gastube && barrel.attrs.gas !== gastube.attrs.length)
    out.push({ severity: 'error', slots: ['barrel', 'gastube'], message: `The barrel is ${barrel.attrs.gas}-length gas but the gas tube is ${gastube.attrs.length}-length.` });
  if (barrel && gasblock && barrel.attrs.journal !== gasblock.attrs.journal)
    out.push({ severity: 'error', slots: ['barrel', 'gasblock'], message: `The barrel has a ${barrel.attrs.journal}" gas journal but the gas block is ${gasblock.attrs.journal}".` });
  const thread = threadIssue(barrel, muzzle) ?? boreIssue(barrel, muzzle);
  if (thread) out.push(thread);
  if (handguard && barrel) {
    const hg = handguard.attrs.length as number;
    const bl = barrel.attrs.length as number;
    if (hg >= bl && !muzzle)
      out.push({ severity: 'warn', slots: ['handguard', 'muzzle'], message: `The ${hg}" rail runs ${(hg - bl).toFixed(1)}" past the end of the ${bl}" barrel and there's no muzzle device. The muzzle would sit inside the rail, so blast and fouling hit the rail. Add a muzzle device, installed before the rail.` });
    else if (hg >= bl)
      out.push({ severity: 'info', slots: ['handguard', 'barrel'], message: `The ${hg}" rail runs ${(hg - bl).toFixed(1)}" past the end of the ${bl}" barrel, a popular shrouded look. Install the muzzle device before the rail, and make sure it fits inside the rail.` });
    else if (hg > bl - 1)
      out.push({ severity: 'info', slots: ['handguard', 'barrel'], message: `A ${hg}" rail on a ${bl}" barrel ends almost at the muzzle. Install the muzzle device before the rail, since there's little room for a wrench afterwards.` });
    const port = PORT_DISTANCE[barrel.attrs.gas as string];
    if (hg < port + 1)
      out.push({ severity: 'info', slots: ['handguard', 'barrel'], message: `The gas block sits about ${port}" out, so a ${hg}" handguard leaves it exposed.` });
  }
  out.push(...rifleAddonRules(b, true, place));
  return out;
}

export const ar10: Platform = {
  id: 'ar10',
  name: 'AR-10',
  family: 'Rifle',
  maker: 'AR Platform',
  blurb: '.308 Win / 6.5 Creedmoor. Pick DPMS or Armalite pattern first; most parts follow from it.',
  slots,
  parts: [...allParts, ...rifleAddonParts],
  rules,
  presets: {
    budget: ['a10-lower-psa', 'a10-lpk-dpms', 'a10-trig-psa', 'a10-buf-psa', 'a10-stock-psa', 'a10-grip-moe', 'a10-upper-psa', 'a10-bbl-psa18', 'a10-gb-750', 'a10-gt-mid', 'a10-hg-psa', 'a10-bcg-psa', 'a10-ch-dpms', 'a10-mz-a2', 'a10-mag-pmag'],
    value: ['a10-lower-aero', 'a10-lpk-dpms', 'a10-trig-alg', 'a10-buf-aero', 'a10-stock-moesl', 'a10-grip-bcm', 'a10-upper-aero', 'a10-bbl-ba18', 'a10-gb-750', 'a10-gt-rifle', 'a10-hg-atlas', 'a10-bcg-toolcraft', 'a10-ch-radian', 'a10-mz-pa', 'a10-mag-pmag', 'a10-opt-vortex'],
    premium: ['a10-lower-seekins', 'a10-lpk-dpms', 'a10-trig-geissele', 'a10-buf-aero', 'a10-stock-ubr', 'a10-grip-bcm', 'a10-upper-seekins', 'a10-bbl-criterion', 'a10-gb-875', 'a10-gt-rifle', 'a10-hg-seekins', 'a10-bcg-jp', 'a10-ch-radian', 'a10-mz-pa', 'a10-mag-pmag', 'a10-opt-venom'],
  },
};
