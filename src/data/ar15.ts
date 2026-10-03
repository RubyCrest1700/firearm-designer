import type { Build, Issue, Platform } from '../types';
import { parts, pick, threadIssue } from './helpers';

/** Approximate gas port distance from the receiver face, in inches. */
const PORT_DISTANCE: Record<string, number> = { pistol: 4.5, carbine: 7.5, midlength: 9.5, rifle: 12.5 };

const slots = [
  { id: 'lower', name: 'Stripped lower receiver', group: 'Lower', required: true, hint: 'The serialized part. Ships to your FFL.' },
  { id: 'lpk', name: 'Lower parts kit', group: 'Lower', required: true, hint: 'Pins, springs, mag catch, bolt catch, safety. Minus the trigger.' },
  { id: 'trigger', name: 'Trigger group', group: 'Lower', required: true, hint: 'Mil-spec small-pin pocket fits every lower listed here.' },
  { id: 'buffer', name: 'Buffer system', group: 'Lower', required: true, hint: 'Receiver extension (tube), spring, buffer, end plate, castle nut.' },
  { id: 'stock', name: 'Stock', group: 'Lower', required: true, hint: 'Must match the buffer tube: carbine, A5 or rifle.' },
  { id: 'grip', name: 'Pistol grip', group: 'Lower', required: true, hint: 'All standard AR-15 grips fit.' },
  { id: 'upper', name: 'Stripped upper receiver', group: 'Upper', required: true, hint: 'Flat-top, mil-spec barrel nut threads.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Sets caliber, gas system length, gas journal and muzzle threads.' },
  { id: 'gasblock', name: 'Gas block', group: 'Upper', required: true, hint: 'Must match the barrel journal diameter.' },
  { id: 'gastube', name: 'Gas tube', group: 'Upper', required: true, hint: 'Must match the barrel gas system length.' },
  { id: 'handguard', name: 'Handguard', group: 'Upper', required: true, hint: 'Free-float rails need a low-profile gas block.' },
  { id: 'bcg', name: 'Bolt carrier group', group: 'Upper', required: true, hint: '5.56 bolts also run .223 Wylde and .300 BLK.' },
  { id: 'charging', name: 'Charging handle', group: 'Upper', required: true, hint: 'Any mil-spec handle fits.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Accessories', required: false, hint: 'Thread pitch must match the barrel.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Prices include a mount where noted.' },
];

const allParts = [
  ...parts('lower', [
    { id: 'ar-lower-anderson', brand: 'Anderson', name: 'AM-15 Stripped Lower', specs: ['Forged 7075-T6', 'Mil-spec'], attrs: {}, serialized: true,
      offers: [['PSA', 49.99], ['PA', 54.99], ['BRN', 59.99, false]], pick: pick('budget', 'Forged, mil-spec, and usually the cheapest lower on the market.') },
    { id: 'ar-lower-psa', brand: 'Palmetto State Armory', name: 'PA-15 Stripped Lower', specs: ['Forged 7075-T6', 'Mil-spec'], attrs: {}, serialized: true,
      offers: [['PSA', 64.99]] },
    { id: 'ar-lower-aero', brand: 'Aero Precision', name: 'M4E1 Stripped Lower', specs: ['Forged 7075-T6', 'Threaded bolt catch pin', 'Integrated trigger guard'], attrs: {}, serialized: true,
      offers: [['AERO', 109.99], ['PA', 104.99], ['BRN', 114.99]], pick: pick('value', 'Better fit and finish than budget lowers for about $50 more, and the threaded bolt catch pin makes assembly easier.') },
    { id: 'ar-lower-seekins', brand: 'Seekins Precision', name: 'SP223 Billet Lower', specs: ['Billet 7075-T6', 'Ambi bolt release', 'Flared magwell'], attrs: {}, serialized: true,
      offers: [['BRN', 264.99], ['OP', 259.0]], pick: pick('premium', 'Billet lower with ambidextrous bolt release built in.') },
  ]),
  ...parts('lpk', [
    { id: 'ar-lpk-psa', brand: 'Palmetto State Armory', name: 'Lower Parts Kit, Minus FCG/Grip', specs: ['Mil-spec'], attrs: {},
      offers: [['PSA', 29.99]], pick: pick('budget', 'Covers everything you need besides trigger and grip.') },
    { id: 'ar-lpk-aero', brand: 'Aero Precision', name: 'AR15 Lower Parts Kit, Minus FCG/Grip', specs: ['Mil-spec'], attrs: {},
      offers: [['AERO', 39.99], ['PA', 37.99], ['BRN', 42.99]], pick: pick('value', 'Consistent springs and detents; pairs with the Aero lower.') },
    { id: 'ar-lpk-bcm', brand: 'Bravo Company', name: 'Enhanced Lower Parts Kit, Minus FCG/Grip', specs: ['Mil-spec', 'Ambi safety'], attrs: {},
      offers: [['BRN', 74.99], ['MID', 76.99]], pick: pick('premium', 'Adds an ambidextrous safety selector.') },
  ]),
  ...parts('trigger', [
    { id: 'ar-trig-psa', brand: 'Palmetto State Armory', name: 'EPT Enhanced Polished Trigger', specs: ['Single stage', '~6 lb', 'Polished'], attrs: {},
      offers: [['PSA', 39.99]], pick: pick('budget', 'Polished mil-spec parts: smoother than a bare mil-spec trigger for little more.') },
    { id: 'ar-trig-alg', brand: 'ALG Defense', name: 'ACT Trigger', specs: ['Single stage', '~5.5 lb', 'NP3 coated'], attrs: {},
      offers: [['BRN', 69.0], ['PA', 69.99], ['MID', 71.99]], pick: pick('value', 'Made by Geissele\'s sister company. The best trigger under $100.') },
    { id: 'ar-trig-rise', brand: 'Rise Armament', name: 'RA-535 Advanced Performance', specs: ['Single stage', '3.5 lb', 'Drop-in cassette'], attrs: {},
      offers: [['BRN', 119.0], ['OP', 109.99], ['PA', 114.99]] },
    { id: 'ar-trig-geissele', brand: 'Geissele', name: 'SSA-E Two Stage', specs: ['Two stage', '3.5 lb total'], attrs: {},
      offers: [['BRN', 240.0], ['PA', 240.0], ['MID', 249.99, false]], pick: pick('premium', 'The two-stage trigger most serious builds use.') },
  ]),
  ...parts('buffer', [
    { id: 'ar-buf-psa', brand: 'Palmetto State Armory', name: 'Carbine Buffer Kit', specs: ['Carbine tube', 'H buffer'], attrs: { tube: 'carbine' },
      offers: [['PSA', 34.99]], pick: pick('budget', 'Complete carbine kit with an H buffer, which suits most 16" builds.') },
    { id: 'ar-buf-aero', brand: 'Aero Precision', name: 'Carbine Buffer Kit, H Buffer', specs: ['Carbine tube', 'H buffer', 'Staked castle nut'], attrs: { tube: 'carbine' },
      offers: [['AERO', 54.99], ['PA', 52.99], ['BRN', 59.99]], pick: pick('value', 'Arrives with the castle nut ready to stake. Fewer steps, same fit.') },
    { id: 'ar-buf-vltor', brand: 'VLTOR', name: 'A5 Receiver Extension System', specs: ['A5 tube', 'A5H2 buffer'], attrs: { tube: 'a5' },
      offers: [['BRN', 109.99], ['MID', 114.99]], pick: pick('premium', 'Longer spring and buffer for a softer, more reliable cycle. Fits carbine stocks.') },
    { id: 'ar-buf-rifle', brand: 'Aero Precision', name: 'Rifle Buffer Kit (A2)', specs: ['Rifle tube', 'Rifle buffer'], attrs: { tube: 'rifle' },
      offers: [['AERO', 59.99], ['BRN', 64.99]] },
  ]),
  ...parts('stock', [
    { id: 'ar-stock-moesl', brand: 'Magpul', name: 'MOE SL Carbine Stock', specs: ['Collapsible', 'Mil-spec diameter'], attrs: { fits: ['carbine', 'a5'] },
      offers: [['PA', 49.95], ['BRN', 54.95], ['PSA', 49.99], ['MID', 51.99]], pick: pick('value', 'Slim, snag-free, and fits both carbine and A5 tubes.') },
    { id: 'ar-stock-psa', brand: 'Palmetto State Armory', name: 'Classic M4 Stock', specs: ['Collapsible', 'Mil-spec diameter'], attrs: { fits: ['carbine', 'a5'] },
      offers: [['PSA', 19.99]], pick: pick('budget', 'Basic M4 stock. Works, and is easy to upgrade later.') },
    { id: 'ar-stock-bcm', brand: 'Bravo Company', name: 'Gunfighter Stock Mod 0', specs: ['Collapsible', 'QD sling mounts'], attrs: { fits: ['carbine', 'a5'] },
      offers: [['BRN', 59.95], ['MID', 61.99]], pick: pick('premium', 'Ambi QD sockets and a solid cheek weld.') },
    { id: 'ar-stock-a2', brand: 'Generic', name: 'A2 Fixed Rifle Stock', specs: ['Fixed', 'Rifle length'], attrs: { fits: ['rifle'] },
      offers: [['PSA', 24.99], ['BRN', 32.99]] },
    { id: 'ar-stock-prs', brand: 'Magpul', name: 'PRS Gen3 Precision Stock', specs: ['Fixed', 'Adjustable cheek and LOP'], attrs: { fits: ['rifle'] },
      offers: [['PA', 254.95], ['BRN', 259.95], ['OP', 249.99]] },
  ]),
  ...parts('grip', [
    { id: 'ar-grip-moe', brand: 'Magpul', name: 'MOE Grip', specs: ['Polymer', 'Storage core'], attrs: {},
      offers: [['PA', 19.95], ['PSA', 19.99], ['BRN', 21.95]], pick: pick('budget', 'The default grip for a reason.') },
    { id: 'ar-grip-bcm', brand: 'Bravo Company', name: 'Gunfighter Grip Mod 3', specs: ['Steeper angle'], attrs: {},
      offers: [['BRN', 19.95], ['MID', 21.99]], pick: pick('value', 'More vertical angle suits modern stances.') },
    { id: 'ar-grip-k2', brand: 'Magpul', name: 'MOE-K2+ Grip', specs: ['Rubber overmold', 'Near-vertical'], attrs: {},
      offers: [['PA', 27.95], ['OP', 26.5]] },
  ]),
  ...parts('upper', [
    { id: 'ar-upper-psa', brand: 'Palmetto State Armory', name: 'Stripped Upper w/ FA & Dust Cover', specs: ['Forged 7075-T6', 'M4 feed ramps'], attrs: {},
      offers: [['PSA', 59.99]], pick: pick('budget', 'Forward assist and dust cover already installed.') },
    { id: 'ar-upper-aero', brand: 'Aero Precision', name: 'M4E1 Threaded Stripped Upper', specs: ['Forged 7075-T6', 'Threaded receiver face'], attrs: {},
      offers: [['AERO', 89.99], ['PA', 94.99], ['BRN', 99.99]], pick: pick('value', 'Tighter tolerances and a matched look with the M4E1 lower.') },
    { id: 'ar-upper-bcm', brand: 'Bravo Company', name: 'M4 Upper Receiver (Assembled)', specs: ['Forged 7075-T6', 'HPT/MPI tested'], attrs: {},
      offers: [['BRN', 149.95]], pick: pick('premium', 'Inspection-grade upper with forward assist and dust cover fitted.') },
  ]),
  ...parts('barrel', [
    { id: 'ar-bbl-psa16', brand: 'Palmetto State Armory', name: '16" 5.56 NATO Carbine, Nitride', specs: ['16"', '5.56 NATO', 'Carbine gas', '.750 journal', '1:7', '1/2x28 thread'],
      attrs: { caliber: '5.56', bolt: '5.56', length: 16, gas: 'carbine', journal: '.750', thread: '1/2x28' },
      offers: [['PSA', 109.99]], pick: pick('budget', 'Reliable carbine-gas barrel at the lowest price.') },
    { id: 'ar-bbl-ba16', brand: 'Ballistic Advantage', name: '16" 5.56 Midlength Modern Series', specs: ['16"', '5.56 NATO', 'Midlength gas', '.750 journal', '1:7', '1/2x28 thread'],
      attrs: { caliber: '5.56', bolt: '5.56', length: 16, gas: 'midlength', journal: '.750', thread: '1/2x28' },
      offers: [['PA', 159.99], ['BRN', 169.99], ['OP', 164.99]], pick: pick('value', 'Midlength gas runs softer than carbine gas on a 16" barrel.') },
    { id: 'ar-bbl-faxon', brand: 'Faxon', name: '16" Gunner Pencil, 5.56', specs: ['16"', '5.56 NATO', 'Midlength gas', '.625 journal', 'Light profile', '1/2x28 thread'],
      attrs: { caliber: '5.56', bolt: '5.56', length: 16, gas: 'midlength', journal: '.625', thread: '1/2x28' },
      offers: [['BRN', 229.99], ['OP', 219.0]] },
    { id: 'ar-bbl-bcm', brand: 'Bravo Company', name: '16" Mid-16 Standard, 5.56', specs: ['16"', '5.56 NATO', 'Midlength gas', '.750 journal', 'Chrome lined', '1/2x28 thread'],
      attrs: { caliber: '5.56', bolt: '5.56', length: 16, gas: 'midlength', journal: '.750', thread: '1/2x28' },
      offers: [['BRN', 254.95], ['MID', 259.99]], pick: pick('premium', 'Chrome-lined, HPT/MPI tested, duty-grade.') },
    { id: 'ar-bbl-criterion', brand: 'Criterion', name: '18" Hybrid SPR, .223 Wylde', specs: ['18"', '.223 Wylde', 'Rifle gas', '.750 journal', '1:8', '1/2x28 thread'],
      attrs: { caliber: '.223 Wylde', bolt: '5.56', length: 18, gas: 'rifle', journal: '.750', thread: '1/2x28' },
      offers: [['BRN', 279.0], ['PA', 284.99]] },
    { id: 'ar-bbl-ba10', brand: 'Ballistic Advantage', name: '10.3" 5.56 Carbine Hanson', specs: ['10.3"', '5.56 NATO', 'Carbine gas', '.750 journal', '1/2x28 thread'],
      attrs: { caliber: '5.56', bolt: '5.56', length: 10.3, gas: 'carbine', journal: '.750', thread: '1/2x28' },
      offers: [['PA', 164.99], ['OP', 169.99]] },
    { id: 'ar-bbl-300', brand: 'Ballistic Advantage', name: '16" .300 BLK Pistol-Length', specs: ['16"', '.300 Blackout', 'Pistol gas', '.750 journal', '5/8x24'],
      attrs: { caliber: '.300 BLK', bolt: '5.56', length: 16, gas: 'pistol', journal: '.750', thread: '5/8x24' },
      offers: [['PA', 164.99], ['BRN', 174.99]] },
  ]),
  ...parts('gasblock', [
    { id: 'ar-gb-aero750', brand: 'Aero Precision', name: 'Low Profile Gas Block .750', specs: ['.750', 'Low profile', 'Set screw'], attrs: { journal: '.750', profile: 'low' },
      offers: [['AERO', 24.99], ['PA', 22.99], ['BRN', 26.99]], pick: pick('value', 'Simple, fits under any free-float rail.') },
    { id: 'ar-gb-sa750', brand: 'Superlative Arms', name: 'Adjustable Bleed-Off Gas Block .750', specs: ['.750', 'Low profile', 'Adjustable'], attrs: { journal: '.750', profile: 'low' },
      offers: [['BRN', 84.99], ['OP', 89.0]], pick: pick('premium', 'Tune recoil and suppressed gas without tools.') },
    { id: 'ar-gb-aero625', brand: 'Aero Precision', name: 'Low Profile Gas Block .625', specs: ['.625', 'Low profile', 'Set screw'], attrs: { journal: '.625', profile: 'low' },
      offers: [['AERO', 24.99], ['BRN', 26.99]] },
    { id: 'ar-gb-fsb', brand: 'Palmetto State Armory', name: 'A2 Front Sight Base .750, F-Marked', specs: ['.750', 'Fixed front sight'], attrs: { journal: '.750', profile: 'fsb' },
      offers: [['PSA', 39.99], ['BRN', 49.99]] },
  ]),
  ...parts('gastube', [
    { id: 'ar-gt-pistol', brand: 'Aero Precision', name: 'Pistol-Length Gas Tube', specs: ['Pistol length'], attrs: { length: 'pistol' }, offers: [['AERO', 11.99], ['BRN', 13.99]] },
    { id: 'ar-gt-carbine', brand: 'Aero Precision', name: 'Carbine-Length Gas Tube', specs: ['Carbine length'], attrs: { length: 'carbine' }, offers: [['AERO', 11.99], ['PSA', 9.99], ['BRN', 13.99]] },
    { id: 'ar-gt-mid', brand: 'Aero Precision', name: 'Midlength Gas Tube', specs: ['Midlength'], attrs: { length: 'midlength' }, offers: [['AERO', 11.99], ['PSA', 9.99], ['BRN', 13.99]] },
    { id: 'ar-gt-rifle', brand: 'Aero Precision', name: 'Rifle-Length Gas Tube', specs: ['Rifle length'], attrs: { length: 'rifle' }, offers: [['AERO', 12.99], ['BRN', 14.99]] },
  ]),
  ...parts('handguard', [
    { id: 'ar-hg-psa', brand: 'Palmetto State Armory', name: '13.5" Lightweight M-LOK Rail', specs: ['13.5"', 'Free float', 'M-LOK'], attrs: { freeFloat: true, length: 13.5 },
      offers: [['PSA', 49.99]], pick: pick('budget', 'Free-float on a budget, with the barrel nut included.') },
    { id: 'ar-hg-mi', brand: 'Midwest Industries', name: 'Combat Rail 15" M-LOK', specs: ['15"', 'Free float', 'M-LOK'], attrs: { freeFloat: true, length: 15 },
      offers: [['PA', 149.99], ['BRN', 159.99], ['OP', 154.95]], pick: pick('value', 'Full-length rail with anti-rotation tabs and good QD placement.') },
    { id: 'ar-hg-bcm', brand: 'Bravo Company', name: 'MCMR-13 M-LOK Rail', specs: ['13"', 'Free float', 'M-LOK', 'Proprietary nut'], attrs: { freeFloat: true, length: 13 },
      offers: [['BRN', 224.95], ['MID', 229.99]], pick: pick('premium', 'Lightweight, stiff, and the reference rail for midlength builds.') },
    { id: 'ar-hg-moe', brand: 'Magpul', name: 'MOE Drop-In Handguard, Midlength', specs: ['Drop-in', 'Midlength', 'Needs A2 front sight base'], attrs: { freeFloat: false, dropIn: 'midlength', length: 9 },
      offers: [['PA', 34.95], ['BRN', 36.95]] },
  ]),
  ...parts('bcg', [
    { id: 'ar-bcg-psa', brand: 'Palmetto State Armory', name: 'M16 Nitride BCG', specs: ['Full auto profile', 'Nitride', 'MPI'], attrs: { bolt: '5.56' },
      offers: [['PSA', 69.99]], pick: pick('budget', 'Full-auto profile carrier, MPI tested, staked gas key.') },
    { id: 'ar-bcg-toolcraft', brand: 'Toolcraft', name: 'M16 Nitride BCG', specs: ['Full auto profile', 'Nitride', 'HPT/MPI'], attrs: { bolt: '5.56' },
      offers: [['BRN', 124.99], ['PA', 119.99]], pick: pick('value', 'Toolcraft makes BCGs for many big brands. HPT/MPI at a fair price.') },
    { id: 'ar-bcg-bcm', brand: 'Bravo Company', name: 'BCG M16 Auto Rated', specs: ['Phosphate', 'Chrome-lined carrier', 'HPT/MPI'], attrs: { bolt: '5.56' },
      offers: [['BRN', 189.95], ['MID', 194.99]], pick: pick('premium', 'Duty-grade, individually tested.') },
    { id: 'ar-bcg-grendel', brand: 'Faxon', name: '6.5 Grendel BCG', specs: ['Type II bolt', 'Nitride'], attrs: { bolt: '6.5G' },
      offers: [['BRN', 169.0]] },
  ]),
  ...parts('charging', [
    { id: 'ar-ch-aero', brand: 'Aero Precision', name: 'Mil-Spec Charging Handle', specs: ['Mil-spec'], attrs: {},
      offers: [['AERO', 19.99], ['PSA', 17.99]], pick: pick('budget', 'Standard handle, works with everything.') },
    { id: 'ar-ch-bcm', brand: 'Bravo Company', name: 'Gunfighter Charging Handle Mod 4', specs: ['Ambi-friendly latch'], attrs: {},
      offers: [['BRN', 59.95], ['MID', 62.99]], pick: pick('value', 'Larger latch and gas deflection. A common first upgrade.') },
    { id: 'ar-ch-radian', brand: 'Radian', name: 'Raptor Ambidextrous Charging Handle', specs: ['Ambidextrous'], attrs: {},
      offers: [['BRN', 89.95], ['PA', 89.99], ['OP', 92.95]], pick: pick('premium', 'Fully ambidextrous, works great with optics.') },
  ]),
  ...parts('muzzle', [
    { id: 'ar-mz-a2', brand: 'Generic', name: 'A2 Birdcage Flash Hider', specs: ['1/2x28', 'Flash hider'], attrs: { thread: '1/2x28', kind: 'flash' },
      offers: [['PSA', 9.99], ['BRN', 12.99]], pick: pick('budget', 'Standard flash hider, crush washer included.') },
    { id: 'ar-mz-lantac', brand: 'Lantac', name: 'Dragon Muzzle Brake 5.56', specs: ['1/2x28', 'Brake'], attrs: { thread: '1/2x28', kind: 'brake' },
      offers: [['BRN', 89.95], ['PA', 94.99]], pick: pick('value', 'Cuts recoil a lot, with less side blast than most brakes.') },
    { id: 'ar-mz-warcomp', brand: 'SureFire', name: 'WarComp 5.56', specs: ['1/2x28', 'Flash hider/comp', 'Suppressor mount'], attrs: { thread: '1/2x28', kind: 'flash' },
      offers: [['BRN', 149.0], ['OP', 145.0]], pick: pick('premium', 'Also serves as the mount for a SureFire suppressor.') },
    { id: 'ar-mz-pa', brand: 'Precision Armament', name: 'M4-72 Severe Duty Brake (5/8x24)', specs: ['5/8x24', 'Brake'], attrs: { thread: '5/8x24', kind: 'brake' },
      offers: [['BRN', 94.99], ['PA', 99.99]] },
  ]),
  ...parts('optic', [
    { id: 'ar-opt-vortex', brand: 'Vortex', name: 'Strike Eagle 1-6x24 + Mount', specs: ['LPVO', '1-6x', 'Mount included'], attrs: {},
      offers: [['PA', 299.99], ['OP', 309.99], ['BRN', 319.99]], pick: pick('value', '1x for close range, 6x for distance. Mount in the box.') },
    { id: 'ar-opt-holosun', brand: 'Holosun', name: 'HS510C Open Reflex', specs: ['Red dot', 'Solar', 'Mount included'], attrs: {},
      offers: [['PA', 299.99], ['OP', 294.99]], pick: pick('budget', 'Fast, rugged, and runs on solar plus battery.') },
    { id: 'ar-opt-aimpoint', brand: 'Aimpoint', name: 'PRO Patrol Rifle Optic', specs: ['Red dot', '2 MOA', 'Mount included'], attrs: {},
      offers: [['BRN', 439.0], ['OP', 432.0], ['MID', 449.99]], pick: pick('premium', 'Battery lasts about 3 years left on. Duty-proven.') },
  ]),
];

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { barrel, gasblock, gastube, handguard, stock, buffer, bcg, muzzle } = b;
  if (barrel && gastube && barrel.attrs.gas !== gastube.attrs.length)
    out.push({ severity: 'error', slots: ['barrel', 'gastube'], message: `The barrel is ${barrel.attrs.gas}-length gas but the gas tube is ${gastube.attrs.length}-length. They must match.` });
  if (barrel && gasblock && barrel.attrs.journal !== gasblock.attrs.journal)
    out.push({ severity: 'error', slots: ['barrel', 'gasblock'], message: `The barrel has a ${barrel.attrs.journal}" gas journal but the gas block is ${gasblock.attrs.journal}".` });
  if (handguard && gasblock) {
    if (handguard.attrs.freeFloat && gasblock.attrs.profile === 'fsb')
      out.push({ severity: 'error', slots: ['handguard', 'gasblock'], message: 'An A2 front sight base will not fit under a free-float handguard. Use a low-profile gas block.' });
    if (!handguard.attrs.freeFloat && gasblock.attrs.profile === 'low')
      out.push({ severity: 'error', slots: ['handguard', 'gasblock'], message: 'Drop-in handguards are held by the front sight base cap. Pair it with an A2 front sight base.' });
  }
  if (handguard && barrel && !handguard.attrs.freeFloat && handguard.attrs.dropIn !== barrel.attrs.gas)
    out.push({ severity: 'error', slots: ['handguard', 'barrel'], message: `This drop-in handguard is ${handguard.attrs.dropIn} length but the barrel is ${barrel.attrs.gas} gas.` });
  if (handguard && barrel && handguard.attrs.freeFloat) {
    const hg = handguard.attrs.length as number;
    const bl = barrel.attrs.length as number;
    if (hg >= bl)
      out.push({ severity: 'warn', slots: ['handguard', 'barrel'], message: `A ${hg}" handguard is as long as the ${bl}" barrel. A muzzle device won't fit and the rail will cover the muzzle.` });
    else if (hg > bl - 1)
      out.push({ severity: 'warn', slots: ['handguard', 'barrel'], message: `A ${hg}" handguard on a ${bl}" barrel leaves almost no barrel past the rail to install a muzzle device or wrench. Builders usually go at least 1" shorter than the barrel.` });
    const port = PORT_DISTANCE[barrel.attrs.gas as string];
    if (hg < port + 1)
      out.push({ severity: 'info', slots: ['handguard', 'barrel'], message: `The gas block sits about ${port}" from the receiver, so a ${hg}" handguard leaves it exposed. That works, but looks unfinished.` });
  }
  if (stock && buffer && !(stock.attrs.fits as string[]).includes(buffer.attrs.tube as string))
    out.push({ severity: 'error', slots: ['stock', 'buffer'], message: `This stock fits ${(stock.attrs.fits as string[]).join(' or ')} buffer tubes, but the buffer kit is a ${buffer.attrs.tube} tube.` });
  if (bcg && barrel && bcg.attrs.bolt !== barrel.attrs.bolt)
    out.push({ severity: 'error', slots: ['bcg', 'barrel'], message: `A ${barrel.attrs.caliber} barrel needs a ${barrel.attrs.bolt} bolt; this BCG has a ${bcg.attrs.bolt} bolt face.` });
  const thread = threadIssue(barrel, muzzle);
  if (thread) out.push(thread);
  if (barrel && (barrel.attrs.length as number) < 16 && stock)
    out.push({ severity: 'warn', slots: ['barrel', 'stock'], message: `A barrel under 16" with a stock makes a short-barreled rifle under the NFA. Approve an ATF Form 1 before assembly, or build it as a pistol without a stock.` });
  return out;
}

export const ar15: Platform = {
  id: 'ar15',
  name: 'AR-15',
  family: 'Rifle',
  blurb: 'Mil-spec AR-15 / M4 pattern. Build from a stripped lower up.',
  slots,
  parts: allParts,
  rules,
  presets: {
    budget: ['ar-lower-anderson', 'ar-lpk-psa', 'ar-trig-psa', 'ar-buf-psa', 'ar-stock-psa', 'ar-grip-moe', 'ar-upper-psa', 'ar-bbl-psa16', 'ar-gb-aero750', 'ar-gt-carbine', 'ar-hg-psa', 'ar-bcg-psa', 'ar-ch-aero', 'ar-mz-a2'],
    value: ['ar-lower-aero', 'ar-lpk-aero', 'ar-trig-alg', 'ar-buf-aero', 'ar-stock-moesl', 'ar-grip-bcm', 'ar-upper-aero', 'ar-bbl-ba16', 'ar-gb-aero750', 'ar-gt-mid', 'ar-hg-mi', 'ar-bcg-toolcraft', 'ar-ch-bcm', 'ar-mz-a2', 'ar-opt-vortex'],
    premium: ['ar-lower-seekins', 'ar-lpk-bcm', 'ar-trig-geissele', 'ar-buf-vltor', 'ar-stock-bcm', 'ar-grip-k2', 'ar-upper-bcm', 'ar-bbl-bcm', 'ar-gb-sa750', 'ar-gt-mid', 'ar-hg-bcm', 'ar-bcg-bcm', 'ar-ch-radian', 'ar-mz-warcomp', 'ar-opt-aimpoint'],
  },
};
