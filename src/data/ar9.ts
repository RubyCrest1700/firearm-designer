import type { Build, Issue, Placement, Platform } from '../types';
import { boreIssue, parts, pick, threadIssue } from './helpers';
import { rifleAddonParts, rifleAddonRules, rifleAddonSlots } from './addons';
import { ironParts, ironRules, ironsSlot } from './irons';

/**
 * AR-9: a 9mm AR built on a dedicated pistol-caliber lower. It runs straight blowback, so there is no gas
 * block or gas tube; a heavy bolt and a heavy buffer hold the action shut instead. The lower decides the
 * magazine (Glock or Colt SMG pattern), and last-round bolt hold-open only works with a bolt made for that
 * lower's hold-open system. Upper receivers, barrel nuts, handguards, charging handles, triggers, grips and
 * stocks are standard AR-15 parts. Barrels are threaded 1/2x28.
 * Sources: https://support.aeroprecisionusa.com/hc/en-us/articles/14130603136535-What-do-I-need-to-build-my-EPC-9,
 * https://www.80percentarms.com/blog/ar9-lrbho-explained/
 */
const MAG_LABEL: Record<string, string> = { glock: 'Glock', colt: 'Colt SMG' };
/** Who makes each lower's bolt hold-open system, as named on the bolts. */
const LRBHO_LABEL: Record<string, string> = { aero: 'Aero Precision EPC', psa: 'PSA', nfa: 'New Frontier Armory', fm: 'FM Products', jp: 'JP Enterprises' };

const slots = [
  { id: 'lower', name: 'Stripped lower receiver', group: 'Lower', required: true, hint: 'Serialized. A dedicated 9mm lower; it decides Glock or Colt magazines.' },
  { id: 'lpk', name: 'Lower parts kit', group: 'Lower', required: true, hint: 'Standard AR-15 kits work; the 9mm mag catch and ejector come with most lowers.' },
  { id: 'trigger', name: 'Trigger group', group: 'Lower', required: true, hint: 'Mil-spec small-pin. Single-stage triggers suit blowback best.' },
  { id: 'buffer', name: 'Buffer system', group: 'Lower', required: true, hint: 'Blowback needs a heavy 9mm buffer (about 8 oz) on a carbine tube.' },
  { id: 'stock', name: 'Stock or brace', group: 'Lower', required: true, hint: 'Any carbine stock. Under a 16" barrel a stock makes it an SBR.' },
  { id: 'grip', name: 'Pistol grip', group: 'Lower', required: true, hint: 'All standard AR-15 grips fit.' },
  { id: 'upper', name: 'Stripped upper receiver', group: 'Upper', required: true, hint: 'A standard AR-15 upper works; the forward assist isn\'t used.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: '9mm blowback, standard AR-15 barrel nut, 1/2x28 muzzle threads.' },
  { id: 'handguard', name: 'Handguard', group: 'Upper', required: true, hint: 'Any AR-15 free-float rail. Short rails suit short barrels.' },
  { id: 'bcg', name: 'Bolt carrier group', group: 'Upper', required: true, hint: '9mm blowback bolt. Match it to the lower for last-round hold-open.' },
  { id: 'charging', name: 'Charging handle', group: 'Upper', required: true, hint: 'Any mil-spec handle fits.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Accessories', required: false, hint: 'Must be 1/2x28 and bored for 9mm; 5.56 devices are too narrow.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Glock or Colt SMG pattern, to match the lower.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Prices include a mount where noted.' },
  ironsSlot,
  ...rifleAddonSlots,
];

const allParts = [
  ...parts('lower', [
    { id: 'a9-lower-psa', brand: 'Palmetto State Armory', name: 'PX-9 Forged Stripped Lower w/ Mag Catch & Ejector', specs: ['Glock magazines', 'Forged', 'Last-round hold-open (PSA bolt)'],
      attrs: { mag: 'glock', lrbho: 'psa', kit: true }, serialized: true, offers: [['PSA', 129.99]], pick: pick('budget', 'Cheapest forged Glock-mag lower, ships with its mag catch and ejector.') },
    { id: 'a9-lower-aero', brand: 'Aero Precision', name: 'EPC-9 Stripped Lower', specs: ['Glock magazines', 'Forged 7075-T6', 'Last-round hold-open (EPC bolt)', 'Takes .40 S&W too'],
      attrs: { mag: 'glock', lrbho: 'aero', kit: false }, serialized: true, offers: [['AERO', 139.99], ['PA', 144.99], ['BRN', 149.99]], pick: pick('value', 'The most common AR-9 lower, with full parts support from Aero.') },
    { id: 'a9-lower-nfa', brand: 'New Frontier Armory', name: 'C-9 Gen 2 Billet Stripped Lower', specs: ['Glock magazines', 'Billet', 'Last-round hold-open (ramped bolt)'],
      attrs: { mag: 'glock', lrbho: 'nfa', kit: true }, serialized: true, offers: [['PA', 169.99], ['OP', 174.99]] },
    { id: 'a9-lower-fm', brand: 'FM Products', name: 'FM-9 Billet Stripped Lower', specs: ['Glock magazines', 'Billet', 'Last-round hold-open (FM-9 bolt)'],
      attrs: { mag: 'glock', lrbho: 'fm', kit: true }, serialized: true, offers: [['PA', 189.99], ['OP', 199.99]] },
    { id: 'a9-lower-jp', brand: 'JP Enterprises', name: 'GMR-15 Billet Stripped Lower', specs: ['Glock magazines', 'Billet', 'Last-round hold-open (GMR-15 bolt)'],
      attrs: { mag: 'glock', lrbho: 'jp', kit: true }, serialized: true, offers: [['BRN', 329.99], ['OP', 339.99]], pick: pick('premium', 'Competition-grade billet lower with a reliable hold-open.') },
    { id: 'a9-lower-spikes', brand: "Spike's Tactical", name: '9mm Stripped Lower (Colt Pattern)', specs: ['Colt SMG magazines', 'Forged', 'Spider logo'],
      attrs: { mag: 'colt', kit: true }, serialized: true, offers: [['PA', 149.99]] },
  ]),
  ...parts('lpk', [
    { id: 'a9-lpk-aero', brand: 'Aero Precision', name: 'EPC Lower Parts Kit, Minus FCG/Grip', specs: ['9mm mag catch and bolt catch', 'For EPC-9 lowers'], attrs: { epc: true },
      offers: [['AERO', 59.99], ['PA', 62.99]], pick: pick('value', 'Has the EPC-9\'s own mag catch and bolt catch.') },
    { id: 'a9-lpk-psa', brand: 'Palmetto State Armory', name: 'Lower Parts Kit, Minus FCG/Grip', specs: ['Mil-spec AR-15'], attrs: { epc: false },
      offers: [['PSA', 39.99]], pick: pick('budget', 'Pins, springs and safety; the PX-9 brings its own mag catch.') },
  ]),
  ...parts('trigger', [
    { id: 'a9-trig-psa', brand: 'Palmetto State Armory', name: 'EPT Enhanced Polished Trigger', specs: ['Single stage', '~6 lb', 'Polished'], attrs: {},
      offers: [['PSA', 39.99]], pick: pick('budget', 'A mil-spec style trigger runs reliably in blowback.') },
    { id: 'a9-trig-alg', brand: 'ALG Defense', name: 'ACT Trigger', specs: ['Single stage', '~5.5 lb', 'NP3 coated'], attrs: {},
      offers: [['BRN', 69.0], ['PA', 69.99]] },
    { id: 'a9-trig-angstadt', brand: 'Angstadt Arms', name: 'Enhanced AR9 PCC Trigger', specs: ['Single stage', 'Made for 9mm blowback'], attrs: { pcc: true },
      offers: [['PA', 99.99]], pick: pick('value', 'Tuned for 9mm blowback at a fair price.') },
    { id: 'a9-trig-cmc', brand: 'CMC Triggers', name: '9mm PCC Single-Stage Trigger, Flat', specs: ['Single stage', '3.5 lb', 'Drop-in', 'Made for 9mm blowback'], attrs: { pcc: true },
      offers: [['OP', 169.99], ['PA', 164.99]], pick: pick('premium', 'Light drop-in trigger built for PCC competition.') },
  ]),
  ...parts('buffer', [
    { id: 'a9-buf-aero', brand: 'Aero Precision', name: 'EPC Buffer Kit', specs: ['Carbine tube', '7.7 oz 9mm buffer', 'Spring'], attrs: { tube: 'carbine', oz: 7.7 },
      offers: [['AERO', 89.99], ['PA', 92.99]], pick: pick('value', 'Complete kit: tube, spring and a 9mm buffer.') },
    { id: 'a9-buf-kak', brand: 'KAK Industry', name: '9mm Carbine Buffer, Extended (8 oz)', specs: ['8 oz 9mm buffer', 'Use with a carbine tube and spring'], attrs: { tube: 'carbine', oz: 8 },
      offers: [['PA', 34.99], ['OP', 36.99]], pick: pick('budget', 'Cheapest way to get the weight a 9mm needs.') },
    { id: 'a9-buf-spikes', brand: "Spike's Tactical", name: 'ST-9X 9mm Heavy Buffer', specs: ['9mm heavy buffer', 'Use with a carbine tube and spring'], attrs: { tube: 'carbine', oz: 8.5 },
      offers: [['PA', 44.99]], pick: pick('premium', 'Heavy buffer with a softer recoil impulse.') },
    { id: 'a9-buf-std', brand: 'Palmetto State Armory', name: 'Carbine Buffer Kit (5.56)', specs: ['Carbine tube', 'H buffer, about 3.8 oz'], attrs: { tube: 'carbine', oz: 3.8 },
      offers: [['PSA', 49.99]] },
  ]),
  ...parts('stock', [
    { id: 'a9-stock-psa', brand: 'Palmetto State Armory', name: 'Classic M4 Stock', specs: ['Collapsible', 'Mil-spec diameter'], attrs: { brace: false },
      offers: [['PSA', 19.99]], pick: pick('budget', 'Basic and cheap.') },
    { id: 'a9-stock-moesl', brand: 'Magpul', name: 'MOE SL Carbine Stock', specs: ['Collapsible', 'Mil-spec diameter', 'QD socket'], attrs: { brace: false, qd: true },
      offers: [['PA', 49.95], ['BRN', 54.95]], pick: pick('value', 'Light and solid.') },
    { id: 'a9-stock-b5', brand: 'B5 Systems', name: 'Bravo Stock', specs: ['Collapsible', 'Mil-spec diameter', 'QD sockets'], attrs: { brace: false, qd: true },
      offers: [['PA', 54.99]], pick: pick('premium', 'Comfortable cheek weld and QD sockets.') },
    { id: 'a9-stock-ctr', brand: 'Magpul', name: 'CTR Carbine Stock', specs: ['Collapsible', 'Friction lock', 'Mil-spec diameter', 'QD socket'], attrs: { brace: false, qd: true },
      offers: [['PA', 69.95], ['BRN', 74.95]] },
    { id: 'a9-brace-sba3', brand: 'SB Tactical', name: 'SBA3 Pistol Stabilizing Brace', specs: ['Brace', 'Adjustable', 'Carbine tube'], attrs: { brace: true },
      offers: [['PA', 99.99]] },
    { id: 'a9-brace-sba4', brand: 'SB Tactical', name: 'SBA4 Pistol Stabilizing Brace', specs: ['Brace', 'Adjustable', 'Carbine tube'], attrs: { brace: true },
      offers: [['PA', 119.99]] },
  ]),
  ...parts('grip', [
    { id: 'a9-grip-moe', brand: 'Magpul', name: 'MOE Grip', specs: ['Polymer', 'Storage core'], attrs: {},
      offers: [['PA', 19.95], ['PSA', 19.99]], pick: pick('budget', 'The default grip.') },
    { id: 'a9-grip-bcm', brand: 'Bravo Company', name: 'Gunfighter Grip Mod 3', specs: ['Steeper angle'], attrs: {},
      offers: [['BRN', 19.95]], pick: pick('value', 'More vertical angle suits a short PCC.') },
    { id: 'a9-grip-k2', brand: 'Magpul', name: 'MOE-K2+ Grip', specs: ['Rubber overmold', 'Near-vertical'], attrs: {},
      offers: [['PA', 29.95], ['BRN', 29.95]], pick: pick('premium', 'Grippy and near-vertical.') },
  ]),
  ...parts('upper', [
    { id: 'a9-upper-psa', brand: 'Palmetto State Armory', name: 'Stripped Upper w/ FA & Dust Cover', specs: ['Standard AR-15', 'Forged 7075-T6'], attrs: {},
      offers: [['PSA', 59.99]], pick: pick('budget', 'A plain AR-15 upper works fine for 9mm.') },
    { id: 'a9-upper-aero', brand: 'Aero Precision', name: 'EPC-9 Enhanced Upper Receiver w/ LRBHO', specs: ['Made for the EPC-9', 'No forward assist', 'Threaded receiver face'], attrs: {},
      offers: [['AERO', 139.99], ['PA', 144.99]], pick: pick('value', 'Matches the EPC-9 lower.') },
    { id: 'a9-upper-m4e1', brand: 'Aero Precision', name: 'M4E1 Threaded Stripped Upper', specs: ['Standard AR-15', 'Forged 7075-T6', 'Threaded receiver face'], attrs: {},
      offers: [['AERO', 99.99], ['PA', 104.99]], pick: pick('premium', 'Tight-fitting upper with a threaded face for Aero rails.') },
  ]),
  ...parts('barrel', [
    { id: 'a9-bbl-ba45', brand: 'Ballistic Advantage', name: '4.5" 9mm EPC Barrel, Modern Series', specs: ['4.5"', '9mm', 'Blowback', '1/2x28'],
      attrs: { caliber: '9mm', bullet: .355, length: 4.5, thread: '1/2x28' }, offers: [['PA', 109.99], ['BRN', 114.99]] },
    { id: 'a9-bbl-aero55', brand: 'Aero Precision', name: '5.5" 9mm CMV Barrel', specs: ['5.5"', '9mm', 'Blowback', '1:10 twist', '1/2x28'],
      attrs: { caliber: '9mm', bullet: .355, length: 5.5, thread: '1/2x28' }, offers: [['AERO', 119.99], ['PA', 119.99]] },
    { id: 'a9-bbl-faxon85', brand: 'Faxon Firearms', name: '8.5" 9mm Duty Series Light Taper', specs: ['8.5"', '9mm', 'Blowback', '4150 QPQ', '1/2x28'],
      attrs: { caliber: '9mm', bullet: .355, length: 8.5, thread: '1/2x28' }, offers: [['PA', 139.99], ['OP', 144.99]], pick: pick('value', 'A popular pistol length, nitrided and accurate.') },
    { id: 'a9-bbl-faxon105', brand: 'Faxon Firearms', name: '10.5" 9mm Duty Series Light Taper', specs: ['10.5"', '9mm', 'Blowback', '4150 QPQ', '1/2x28'],
      attrs: { caliber: '9mm', bullet: .355, length: 10.5, thread: '1/2x28' }, offers: [['PA', 149.99], ['OP', 154.99]] },
    { id: 'a9-bbl-aero16', brand: 'Aero Precision', name: '16" 9mm CMV Barrel', specs: ['16"', '9mm', 'Blowback', '1:10 twist', '1/2x28'],
      attrs: { caliber: '9mm', bullet: .355, length: 16, thread: '1/2x28' }, offers: [['AERO', 149.99], ['PA', 149.99]], pick: pick('budget', 'A 16" barrel keeps it a rifle, so a stock is legal without paperwork.') },
    { id: 'a9-bbl-faxon16', brand: 'Faxon Firearms', name: '16" 9mm Duty Series Light Taper', specs: ['16"', '9mm', 'Blowback', '4150 QPQ', '1/2x28'],
      attrs: { caliber: '9mm', bullet: .355, length: 16, thread: '1/2x28' }, offers: [['PA', 179.99], ['OP', 184.99]], pick: pick('premium', 'Light, accurate 16" for a PCC carbine.') },
  ]),
  ...parts('handguard', [
    { id: 'a9-hg-mi7', brand: 'Midwest Industries', name: 'Combat Rail 7" M-LOK', specs: ['7"', 'Free float', 'M-LOK', 'Proprietary nut'], attrs: { freeFloat: true, length: 7 },
      offers: [['PA', 129.95], ['BRN', 134.95]] },
    { id: 'a9-hg-bcm7', brand: 'Bravo Company', name: 'MCMR-7 M-LOK Rail', specs: ['7"', 'Free float', 'M-LOK', 'Proprietary nut'], attrs: { freeFloat: true, length: 7 },
      offers: [['BRN', 179.95]] },
    { id: 'a9-hg-aero9', brand: 'Aero Precision', name: 'ATLAS S-ONE 9.2" M-LOK', specs: ['9.2"', 'Free float', 'M-LOK', 'Proprietary nut'], attrs: { freeFloat: true, length: 9.2 },
      offers: [['AERO', 139.99], ['PA', 134.99]], pick: pick('value', 'Fits Aero uppers, covers an 8.5" barrel.') },
    { id: 'a9-hg-psa', brand: 'Palmetto State Armory', name: '13.5" Lightweight M-LOK Rail', specs: ['13.5"', 'Free float', 'M-LOK'], attrs: { freeFloat: true, length: 13.5 },
      offers: [['PSA', 69.99]], pick: pick('budget', 'Cheap, light, long enough for a 16" carbine.') },
    { id: 'a9-hg-bcm13', brand: 'Bravo Company', name: 'MCMR-13 M-LOK Rail', specs: ['13"', 'Free float', 'M-LOK', 'Proprietary nut'], attrs: { freeFloat: true, length: 13 },
      offers: [['BRN', 199.95]], pick: pick('premium', 'Light, strong and slim.') },
    { id: 'a9-hg-aero15', brand: 'Aero Precision', name: 'ATLAS S-ONE 15" M-LOK', specs: ['15"', 'Free float', 'M-LOK', 'Proprietary nut'], attrs: { freeFloat: true, length: 15 },
      offers: [['AERO', 169.99], ['PA', 164.99]] },
  ]),
  ...parts('bcg', [
    { id: 'a9-bcg-toolcraft', brand: 'Toolcraft', name: '9mm Bolt Carrier Group Gen 2, Black Nitride', specs: ['9mm blowback', 'Nitride'], attrs: { lrbho: [] },
      offers: [['PA', 119.99]] },
    { id: 'a9-bcg-psa', brand: 'Palmetto State Armory', name: 'AR-9 9mm Bolt Carrier Group, Nitride', specs: ['9mm blowback', 'Nitride', 'Works the PX-9 hold-open'], attrs: { lrbho: ['psa'] },
      offers: [['PSA', 99.99]], pick: pick('budget', 'Made for the PX-9, so the bolt locks back on empty.') },
    { id: 'a9-bcg-aero', brand: 'Aero Precision', name: '9mm BCG, Direct Blowback, Nitride', specs: ['9mm blowback', 'Nitride', 'Works the EPC-9 hold-open'], attrs: { lrbho: ['aero'] },
      offers: [['AERO', 159.99], ['PA', 164.99]], pick: pick('value', 'Made for the EPC-9, so the bolt locks back on empty.') },
    { id: 'a9-bcg-kak', brand: 'KAK Industry', name: 'Enhanced 9mm Bolt Carrier Group', specs: ['9mm blowback', 'Ramped bolt face for hold-open'], attrs: { lrbho: ['nfa'] },
      offers: [['PA', 134.99]] },
    { id: 'a9-bcg-faxon', brand: 'Faxon Firearms', name: 'Gen 2 9mm PCC Blowback Full-Mass BCG, Nitride', specs: ['9mm blowback', 'Full mass', 'Glock and Colt magazines'], attrs: { lrbho: [] },
      offers: [['PA', 199.99], ['OP', 209.99]] },
    { id: 'a9-bcg-jp', brand: 'JP Enterprises', name: 'GMR-15 9mm Bolt Assembly', specs: ['9mm blowback', 'Tuned for the GMR-15', 'Works the GMR-15 hold-open'], attrs: { lrbho: ['jp'] },
      offers: [['BRN', 299.99]], pick: pick('premium', 'Matched to the GMR-15 lower, so the bolt locks back on empty.') },
  ]),
  ...parts('charging', [
    { id: 'a9-ch-aero', brand: 'Aero Precision', name: 'Mil-Spec Charging Handle', specs: ['Mil-spec'], attrs: {},
      offers: [['AERO', 24.99], ['PA', 24.99]], pick: pick('budget', 'Standard handle.') },
    { id: 'a9-ch-bcm', brand: 'Bravo Company', name: 'Gunfighter Charging Handle Mod 4', specs: ['Ambi-friendly latch'], attrs: {},
      offers: [['BRN', 49.95]], pick: pick('value', 'Bigger latch, easier to run.') },
    { id: 'a9-ch-radian', brand: 'Radian', name: 'Raptor Ambidextrous Charging Handle', specs: ['Ambidextrous'], attrs: {},
      offers: [['BRN', 89.95], ['PA', 89.99]], pick: pick('premium', 'Ambidextrous and easy to grab.') },
  ]),
  ...parts('muzzle', [
    { id: 'a9-mz-kak', brand: 'KAK Industry', name: 'Slimline Flash Can 1/2x28', specs: ['1/2x28', 'Flash can', 'Bored for 9mm'], attrs: { thread: '1/2x28', kind: 'flash', bore: .36 },
      offers: [['PA', 24.99]], pick: pick('budget', 'Pushes blast forward, cheap.') },
    { id: 'a9-mz-psa', brand: 'Palmetto State Armory', name: 'AK-V 9mm Flash Can Linear Comp 1/2x28', specs: ['1/2x28', 'Linear comp', 'Bored for 9mm'], attrs: { thread: '1/2x28', kind: 'flash', bore: .36 },
      offers: [['PSA', 29.99]], pick: pick('value', 'Keeps blast off to the side, for indoor ranges.') },
    { id: 'a9-mz-odin', brand: 'Odin Works', name: 'Atlas 9 Compensator 1/2x28', specs: ['1/2x28', 'Compensator', '9mm'], attrs: { thread: '1/2x28', kind: 'comp', bore: .38 },
      offers: [['OP', 74.99]], pick: pick('premium', 'Flattens muzzle rise for competition.') },
    { id: 'a9-mz-a2', brand: 'Generic', name: 'A2 Birdcage 5.56 (1/2x28)', specs: ['1/2x28', 'Flash hider', '5.56 bore'], attrs: { thread: '1/2x28', kind: 'flash', bore: .224 },
      offers: [['PSA', 9.99]] },
  ]),
  ...parts('mag', [
    { id: 'a9-mag-gl9', brand: 'Magpul', name: 'PMAG 21 GL9', specs: ['21 rd', 'Glock pattern'], attrs: { family: 'glock', rounds: 21 },
      offers: [['MAGPUL', 17.95], ['PA', 16.99], ['BRN', 17.99]], pick: pick('value', 'Cheap, tough and holds 21.') },
    { id: 'a9-mag-g17', brand: 'Glock', name: 'G17 9mm Magazine, 17 Round', specs: ['17 rd', 'Glock pattern', 'Factory'], attrs: { family: 'glock', rounds: 17 },
      offers: [['GS', 29.99], ['BRN', 31.99]], pick: pick('premium', 'Factory Glock reliability.') },
    { id: 'a9-mag-g33', brand: 'Glock', name: 'G18 9mm Magazine, 33 Round', specs: ['33 rd', 'Glock pattern', 'Factory'], attrs: { family: 'glock', rounds: 33 },
      offers: [['GS', 39.99], ['BRN', 42.99]] },
    { id: 'a9-mag-metalform', brand: 'Metalform', name: '9mm SMG Magazine, 32 Round, Stainless', specs: ['32 rd', 'Colt SMG pattern'], attrs: { family: 'colt', rounds: 32 },
      offers: [['BRN', 29.99]] },
    { id: 'a9-mag-psasmg', brand: 'Palmetto State Armory', name: '9mm SMG Magazine, 32 Round', specs: ['32 rd', 'Colt SMG pattern'], attrs: { family: 'colt', rounds: 32 },
      offers: [['PSA', 19.99]] },
  ]),
  ...parts('optic', [
    { id: 'a9-opt-holosun', brand: 'Holosun', name: 'HS510C Open Reflex', specs: ['Red dot', 'Solar', 'Mount included', 'Absolute co-witness'], attrs: { kind: 'dot', height: '1.41' },
      offers: [['PA', 299.99], ['OP', 309.99]], pick: pick('value', 'Fast red dot for close-range 9mm.') },
    { id: 'a9-opt-romeo5x', brand: 'Sig Sauer', name: 'ROMEO5X 1x20 Red Dot', specs: ['Red dot', '2 MOA', 'Mount included', 'Absolute (1.41") or lower 1/3 (1.63") riser'], attrs: { kind: 'dot', height: '1.41' },
      offers: [['PA', 179.99], ['OP', 184.99]], pick: pick('budget', 'Proven, affordable dot.') },
    { id: 'a9-opt-aimpoint', brand: 'Aimpoint', name: 'PRO Patrol Rifle Optic', specs: ['Red dot', '2 MOA', 'QRP2 mount + spacer', 'Lower 1/3'], attrs: { kind: 'dot', height: '1.535' },
      offers: [['PA', 469.0], ['OP', 479.0]], pick: pick('premium', 'Always-on duty-grade dot.') },
    { id: 'a9-opt-exps3', brand: 'EOTech', name: 'EXPS3 Holographic Sight', specs: ['Holographic', '68 MOA ring + 1 MOA dot', 'QD mount built in', 'Lower 1/3 co-witness'], attrs: { kind: 'dot' },
      offers: [['PA', 699.0], ['OP', 709.0]] },
  ]),
];

function rules(b: Build, place: Placement = {}): Issue[] {
  const out: Issue[] = [];
  const { lower, lpk, buffer, stock, barrel, handguard, bcg, muzzle, mag } = b;
  if (lower && mag && mag.attrs.family !== lower.attrs.mag)
    out.push({ severity: 'error', slots: ['lower', 'mag'], message: `This lower takes ${MAG_LABEL[lower.attrs.mag as string]} magazines; this is a ${MAG_LABEL[mag.attrs.family as string]} magazine.` });
  if (lower && lpk && lower.attrs.lrbho === 'aero' && !lpk.attrs.epc)
    out.push({ severity: 'error', slots: ['lower', 'lpk'], message: 'The EPC-9 lower uses its own magazine catch and bolt catch, which come in Aero\'s EPC parts kit, not a standard AR-15 kit.' });
  if (lower && lpk && lower.attrs.lrbho !== 'aero' && lpk.attrs.epc)
    out.push({ severity: 'warn', slots: ['lower', 'lpk'], message: 'The EPC kit\'s magazine catch and bolt catch are made for Aero\'s EPC-9 lower. The pins, springs and safety fit, but use the catch parts that came with this lower.' });
  if (lower && bcg && lower.attrs.lrbho && !(bcg.attrs.lrbho as string[]).includes(lower.attrs.lrbho as string))
    out.push({ severity: 'info', slots: ['lower', 'bcg'], message: `This lower's last-round hold-open is made for ${LRBHO_LABEL[lower.attrs.lrbho as string]} bolts. With this bolt the gun still runs, but it may not lock open on an empty magazine.` });
  if (buffer && (buffer.attrs.oz as number) < 5)
    out.push({ severity: 'error', slots: ['buffer'], message: `A ${buffer.attrs.oz} oz 5.56 buffer is too light for 9mm blowback. The bolt slams open, batters the receiver and can bounce out of battery. Use a 9mm buffer of about 8 oz.` });
  const thread = threadIssue(barrel, muzzle) ?? boreIssue(barrel, muzzle);
  if (thread) out.push(thread);
  if (barrel && stock) {
    const short = (barrel.attrs.length as number) < 16;
    if (short && !stock.attrs.brace)
      out.push({ severity: 'warn', slots: ['barrel', 'stock'], message: `A barrel under 16" with a stock makes a short-barreled rifle under the NFA. Approve an ATF Form 1 before assembly, or build it as a pistol with a brace.` });
    if (!short && stock.attrs.brace)
      out.push({ severity: 'info', slots: ['barrel', 'stock'], message: 'With a 16" barrel this is a rifle, so a regular stock is legal and usually more comfortable than a brace.' });
    if (short && stock.attrs.brace)
      out.push({ severity: 'info', slots: ['stock'], message: 'Brace rules have changed several times. Check current federal and state law before building a braced pistol.' });
  }
  if (handguard && barrel) {
    const hg = handguard.attrs.length as number;
    const bl = barrel.attrs.length as number;
    if (hg >= bl && !muzzle)
      out.push({ severity: 'warn', slots: ['handguard', 'muzzle'], message: `The ${hg}" rail runs ${(hg - bl).toFixed(1)}" past the end of the ${bl}" barrel and there's no muzzle device. The muzzle would sit inside the rail, so blast hits the rail. Add a muzzle device, installed before the rail.` });
    else if (hg >= bl)
      out.push({ severity: 'info', slots: ['handguard', 'barrel'], message: `The ${hg}" rail runs ${(hg - bl).toFixed(1)}" past the end of the ${bl}" barrel, a popular shrouded look. Install the muzzle device before the rail, and make sure it fits inside the rail.` });
  }
  out.push(...rifleAddonRules(b, false, place));
  out.push(...ironRules(b, b.gasblock));
  return out;
}

export const ar9: Platform = {
  id: 'ar9',
  name: 'AR-9',
  family: 'Rifle',
  maker: 'AR Platform',
  blurb: '9mm blowback AR on a dedicated lower. Pick Glock or Colt magazines first; the rest is mostly AR-15.',
  slots,
  parts: [...allParts, ...ironParts('a9', false), ...rifleAddonParts],
  rules,
  // Plain: no sights or optic, no muzzle device (none here is a factory-style 9mm hider) and a Glock 17 magazine.
  base: ['a9-lower-psa', 'a9-lpk-psa', 'a9-trig-psa', 'a9-buf-kak', 'a9-stock-psa', 'a9-grip-moe', 'a9-upper-psa', 'a9-bbl-aero16', 'a9-hg-psa', 'a9-bcg-psa', 'a9-ch-aero', 'a9-mag-g17'],
  presets: {
    budget: ['a9-lower-psa', 'a9-lpk-psa', 'a9-trig-psa', 'a9-buf-kak', 'a9-stock-psa', 'a9-grip-moe', 'a9-upper-psa', 'a9-bbl-aero16', 'a9-hg-psa', 'a9-bcg-psa', 'a9-ch-aero', 'a9-mz-kak', 'a9-mag-gl9', 'a9-opt-romeo5x'],
    value: ['a9-lower-aero', 'a9-lpk-aero', 'a9-trig-angstadt', 'a9-buf-aero', 'a9-brace-sba3', 'a9-grip-bcm', 'a9-upper-aero', 'a9-bbl-faxon85', 'a9-hg-aero9', 'a9-bcg-aero', 'a9-ch-bcm', 'a9-mz-psa', 'a9-mag-gl9', 'a9-opt-holosun'],
    premium: ['a9-lower-jp', 'a9-lpk-psa', 'a9-trig-cmc', 'a9-buf-spikes', 'a9-stock-b5', 'a9-grip-k2', 'a9-upper-m4e1', 'a9-bbl-faxon16', 'a9-hg-bcm13', 'a9-bcg-jp', 'a9-ch-radian', 'a9-mz-odin', 'a9-mag-g17', 'a9-opt-aimpoint'],
  },
};
