import type { Build, Issue, Platform } from '../types';
import { parts, pick, sightHeightIssues } from './helpers';
import { holsters, pistolAddonRules, pistolAddonSlots, pistolCases, pistolLights } from './addons';

/** Slide and dust-cover lengths, shortest to longest. */
const LEN_RANK: Record<string, number> = { subcompact: 1, compact: 2, full: 3 };
const LEN_LABEL: Record<string, string> = { subcompact: 'subcompact (3.6")', compact: 'compact (3.9")', full: 'full-size (4.7")' };
/** Grip module size -> [dust cover length, magazine well length] */
const GRIP: Record<string, [string, string]> = {
  full: ['full', 'full'],
  carry: ['compact', 'full'],
  compact: ['compact', 'compact'],
  subcompact: ['subcompact', 'subcompact'],
};

const slots = [
  { id: 'fcu', name: 'Fire control unit', group: 'Core', required: true, hint: 'The serialized chassis. Everything else is a swappable part.' },
  { id: 'grip', name: 'Grip module', group: 'Core', required: true, hint: 'Sets grip length and dust cover length.' },
  { id: 'slide', name: 'Slide assembly', group: 'Upper', required: true, hint: 'Comes with sights and slide parts installed.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Length and caliber must match the slide.' },
  { id: 'spring', name: 'Recoil spring', group: 'Upper', required: true, hint: 'Matched to slide length.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: false, hint: 'Optional. Slides come with standard-height sights; suppressor height co-witnesses with a dot.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Sig optic-ready slides use the Romeo1Pro / DeltaPoint footprint.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: true, hint: 'Should be at least as long as the grip.' },
  ...pistolAddonSlots,
];

const allParts = [
  ...parts('fcu', [
    { id: 'p-fcu-std', brand: 'Sig Sauer', name: 'P320 Fire Control Unit', specs: ['Curved trigger', 'All sizes'], attrs: {}, serialized: true,
      offers: [['SIG', 159.99], ['BRN', 169.99, false]], pick: pick('value', 'Fits every grip module and slide size.') },
    { id: 'p-fcu-x', brand: 'Sig Sauer', name: 'P320 X-Series Fire Control Unit', specs: ['Flat trigger', 'All sizes'], attrs: {}, serialized: true,
      offers: [['SIG', 189.99]], pick: pick('premium', 'Flat-faced X-Series trigger with a cleaner break.') },
  ]),
  ...parts('grip', [
    { id: 'p-grip-compact', brand: 'Sig Sauer', name: 'Grip Module, Compact, Medium', specs: ['Compact', '9/.40/.357', '15 rd mags'], attrs: { size: 'compact', caliber: '9' },
      offers: [['SIG', 49.99], ['BRN', 54.99], ['MID', 52.99]], pick: pick('budget', 'The standard compact grip. Easy to carry.') },
    { id: 'p-grip-xcarry', brand: 'Sig Sauer', name: 'X-Series Carry Grip Module', specs: ['Carry (full grip, compact dust cover)', '9/.40/.357', '17 rd mags'], attrs: { size: 'carry', caliber: '9' },
      offers: [['SIG', 59.99], ['BRN', 64.99]], pick: pick('value', 'Full-length grip with a compact dust cover, the M18 layout.') },
    { id: 'p-grip-xfull', brand: 'Sig Sauer', name: 'X-Series Full Grip Module', specs: ['Full size', '9/.40/.357', '17 rd mags'], attrs: { size: 'full', caliber: '9' },
      offers: [['SIG', 59.99], ['BRN', 64.99]] },
    { id: 'p-grip-carry', brand: 'Sig Sauer', name: 'Grip Module, Carry, Medium', specs: ['Carry (full grip, compact dust cover)', '9/.40/.357', '17 rd mags'], attrs: { size: 'carry', caliber: '9' },
      offers: [['SIG', 49.99], ['BRN', 54.99]] },
    { id: 'p-grip-wilson', brand: 'Wilson Combat', name: 'P320 Grip Module, Carry', specs: ['Carry (full grip, compact dust cover)', '9/.40/.357', 'Aggressive texture', '17 rd mags'], attrs: { size: 'carry', caliber: '9' },
      offers: [['BRN', 139.95]] },
    { id: 'p-grip-sub', brand: 'Sig Sauer', name: 'Grip Module, Subcompact, Small', specs: ['Subcompact', '9/.40/.357', '12 rd mags'], attrs: { size: 'subcompact', caliber: '9' },
      offers: [['SIG', 49.99], ['MID', 52.99]] },
    { id: 'p-grip-axg', brand: 'Sig Sauer', name: 'AXG Alloy Grip Module, Carry', specs: ['Carry', 'Aluminum', '9mm', '17 rd mags'], attrs: { size: 'carry', caliber: '9' },
      offers: [['SIG', 249.99], ['BRN', 259.99]], pick: pick('premium', 'Heavier alloy frame that soaks up recoil.') },
    { id: 'p-grip-45', brand: 'Sig Sauer', name: 'Grip Module, Full, Medium (.45 ACP)', specs: ['Full size', '.45 ACP', '10 rd mags'], attrs: { size: 'full', caliber: '45' },
      offers: [['SIG', 49.99]] },
  ]),
  ...parts('slide', [
    { id: 'p-slide-compact', brand: 'Sig Sauer', name: 'P320 Compact Slide Assembly, 9mm', specs: ['Compact 3.9"', '9mm', 'No optic cut', 'SIGLITE sights'], attrs: { length: 'compact', caliber: '9mm', cut: 'none' },
      offers: [['SIG', 249.99], ['BRN', 259.99]], pick: pick('budget', 'Complete slide with night sights.') },
    { id: 'p-slide-compor', brand: 'Sig Sauer', name: 'P320 Compact Slide Assembly, 9mm, Optic Ready', specs: ['Compact 3.9"', '9mm', 'Optic ready', 'X-Ray3 sights'], attrs: { length: 'compact', caliber: '9mm', cut: 'romeo1pro' },
      offers: [['SIG', 299.99], ['BRN', 309.99]] },
    { id: 'p-slide-m18', brand: 'Sig Sauer', name: 'P320 M18 Slide Assembly, 9mm', specs: ['Compact 3.9"', '9mm', 'Optic ready', 'Coyote'], attrs: { length: 'compact', caliber: '9mm', cut: 'romeo1pro', rearSight: 'off' },
      offers: [['SIG', 379.99], ['BRN', 389.99]], pick: pick('value', 'Army M18 pattern, optic ready, suits the Carry grip.') },
    { id: 'p-slide-xfull', brand: 'Sig Sauer', name: 'P320 XFull Slide Assembly, 9mm', specs: ['Full 4.7"', '9mm', 'Optic ready'], attrs: { length: 'full', caliber: '9mm', cut: 'romeo1pro', rearSight: 'off' },
      offers: [['SIG', 399.99], ['BRN', 409.99]], pick: pick('premium', 'Longest sight radius, optic ready.') },
    { id: 'p-slide-sub', brand: 'Sig Sauer', name: 'P320 Subcompact Slide Assembly, 9mm', specs: ['Subcompact 3.6"', '9mm', 'No optic cut'], attrs: { length: 'subcompact', caliber: '9mm', cut: 'none' },
      offers: [['SIG', 259.99]] },
    { id: 'p-slide-45', brand: 'Sig Sauer', name: 'P320 Full Slide Assembly, .45 ACP', specs: ['Full 4.7"', '.45 ACP', 'No optic cut'], attrs: { length: 'full', caliber: '.45 ACP', cut: 'none' },
      offers: [['SIG', 279.99]] },
  ]),
  ...parts('barrel', [
    { id: 'p-bbl-c9', brand: 'Sig Sauer', name: 'P320 Barrel, Compact 3.9", 9mm', specs: ['Compact 3.9"', '9mm'], attrs: { length: 'compact', caliber: '9mm' },
      offers: [['SIG', 119.99], ['BRN', 124.99]], pick: pick('budget', 'Factory barrel, drop-in.') },
    { id: 'p-bbl-faxonc', brand: 'Faxon', name: 'P320 Compact 3.9" Flame Fluted, 9mm', specs: ['Compact 3.9"', '9mm', 'Match grade'], attrs: { length: 'compact', caliber: '9mm' },
      offers: [['BRN', 179.99], ['OP', 174.99]], pick: pick('value', 'Match-grade upgrade for compact and carry builds.') },
    { id: 'p-bbl-tpc', brand: 'True Precision', name: 'P320 Compact Axiom Barrel, 9mm', specs: ['Compact 3.9"', '9mm', 'Match grade'], attrs: { length: 'compact', caliber: '9mm' },
      offers: [['BRN', 199.99], ['OP', 194.99]] },
    { id: 'p-bbl-f9', brand: 'Sig Sauer', name: 'P320 Barrel, Full 4.7", 9mm', specs: ['Full 4.7"', '9mm'], attrs: { length: 'full', caliber: '9mm' },
      offers: [['SIG', 119.99], ['BRN', 124.99]], pick: pick('premium', 'Factory full-size barrel.') },
    { id: 'p-bbl-s9', brand: 'Sig Sauer', name: 'P320 Barrel, Subcompact 3.6", 9mm', specs: ['Subcompact 3.6"', '9mm'], attrs: { length: 'subcompact', caliber: '9mm' },
      offers: [['SIG', 119.99]] },
    { id: 'p-bbl-f45', brand: 'Sig Sauer', name: 'P320 Barrel, Full 4.7", .45 ACP', specs: ['Full 4.7"', '.45 ACP'], attrs: { length: 'full', caliber: '.45 ACP' },
      offers: [['SIG', 129.99]] },
  ]),
  ...parts('spring', [
    { id: 'p-spr-c', brand: 'Sig Sauer', name: 'Recoil Spring Assembly, Compact', specs: ['Compact 3.9"'], attrs: { length: 'compact' }, offers: [['SIG', 24.99], ['BRN', 27.99]] },
    { id: 'p-spr-f', brand: 'Sig Sauer', name: 'Recoil Spring Assembly, Full', specs: ['Full 4.7"'], attrs: { length: 'full' }, offers: [['SIG', 24.99], ['BRN', 27.99]] },
    { id: 'p-spr-s', brand: 'Sig Sauer', name: 'Recoil Spring Assembly, Subcompact', specs: ['Subcompact 3.6"'], attrs: { length: 'subcompact' }, offers: [['SIG', 24.99]] },
  ]),
  // Sig #8 front and #8 rear dovetails, shared with the P365. Sample prices until a price source is added.
  ...parts('sights', [
    { id: 'p-sight-xray3', brand: 'Sig Sauer', name: 'X-RAY3 Day/Night Sights', specs: ['Standard height', 'Tritium'], attrs: { height: 'standard' },
      offers: [['SIG', 99.99]] },
    { id: 'p-sight-xray3s', brand: 'Sig Sauer', name: 'X-RAY3 Suppressor Height Day/Night Sights', specs: ['Suppressor height', 'Tritium'], attrs: { height: 'suppressor' },
      offers: [['SIG', 119.99]], pick: pick('value', 'Tall enough to see through a red dot.') },
    { id: 'p-sight-nf', brand: 'Night Fision', name: 'Suppressor Height Night Sights, Sig P320/P365', specs: ['Suppressor height', 'Tritium'], attrs: { height: 'suppressor' },
      offers: [['PA', 139.99]], pick: pick('premium', 'Tall tritium sights that co-witness with a dot.') },
    { id: 'p-sight-si', brand: 'Strike Industries', name: 'Strike Iron Sights, P320 Suppressor Height', specs: ['Suppressor height', 'Plain steel'], attrs: { height: 'suppressor' },
      offers: [['RA', 64.95]], pick: pick('budget', 'Low-cost tall sights.') },
  ]),
  ...parts('optic', [
    { id: 'p-opt-r1p', brand: 'Sig Sauer', name: 'Romeo1Pro 6 MOA', specs: ['Romeo1Pro footprint', 'Direct mount'], attrs: { footprint: 'romeo1pro' },
      offers: [['SIG', 249.99], ['OP', 239.99], ['PA', 244.99]], pick: pick('value', 'Mounts straight to Sig optic-ready slides, no plate.') },
    { id: 'p-opt-romeox', brand: 'Sig Sauer', name: 'RomeoX Pro', specs: ['Romeo1Pro footprint', 'Larger window'], attrs: { footprint: 'romeo1pro' },
      offers: [['SIG', 349.99], ['OP', 339.99]], pick: pick('premium', 'Bigger window, same direct-mount footprint.') },
    { id: 'p-opt-407c', brand: 'Holosun', name: 'HS407C X2', specs: ['RMR footprint', '2 MOA dot'], attrs: { footprint: 'rmr' },
      offers: [['PA', 249.99], ['OP', 254.99]] },
    { id: 'p-opt-507c', brand: 'Holosun', name: 'HS507C X2', specs: ['RMR footprint'], attrs: { footprint: 'rmr' },
      offers: [['PA', 299.99], ['OP', 309.99]] },
  ]),
  ...parts('mag', [
    { id: 'p-mag-mecgar17', brand: 'Mec-Gar', name: 'P320 17-Round, 9mm', specs: ['Full', '17 rd', '9mm'], attrs: { size: 'full', caliber: '9mm' },
      offers: [['MID', 29.99], ['PA', 31.99], ['BRN', 32.99]], pick: pick('value', 'Mec-Gar makes Sig\'s factory mags. Same mag, lower price.') },
    { id: 'p-mag-sig17', brand: 'Sig Sauer', name: 'P320 17-Round, 9mm (OEM)', specs: ['Full', '17 rd', '9mm'], attrs: { size: 'full', caliber: '9mm' },
      offers: [['SIG', 41.99], ['BRN', 44.99]], pick: pick('premium', 'Factory magazine.') },
    { id: 'p-mag-sig15', brand: 'Sig Sauer', name: 'P320 15-Round Compact, 9mm (OEM)', specs: ['Compact', '15 rd', '9mm'], attrs: { size: 'compact', caliber: '9mm' },
      offers: [['SIG', 41.99], ['MID', 39.99]], pick: pick('budget', 'Flush fit in the compact grip.') },
    { id: 'p-mag-sig12', brand: 'Sig Sauer', name: 'P320 12-Round Subcompact, 9mm (OEM)', specs: ['Subcompact', '12 rd', '9mm'], attrs: { size: 'subcompact', caliber: '9mm' },
      offers: [['SIG', 41.99]] },
    { id: 'p-mag-sig45', brand: 'Sig Sauer', name: 'P320 10-Round, .45 ACP (OEM)', specs: ['Full', '10 rd', '.45 ACP'], attrs: { size: 'full', caliber: '.45 ACP' },
      offers: [['SIG', 44.99]] },
  ]),
];

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { grip, slide, barrel, spring, optic, mag } = b;
  if (grip && slide) {
    const [dust] = GRIP[grip.attrs.size as string];
    if (LEN_RANK[dust] > LEN_RANK[slide.attrs.length as string])
      out.push({ severity: 'error', slots: ['grip', 'slide'], message: `This grip module has a ${LEN_LABEL[dust]} dust cover, which sticks out past a ${LEN_LABEL[slide.attrs.length as string]} slide. Use a shorter grip or a longer slide.` });
    const gripIs45 = grip.attrs.caliber === '45';
    const slideIs45 = slide.attrs.caliber === '.45 ACP';
    if (gripIs45 !== slideIs45)
      out.push({ severity: 'error', slots: ['grip', 'slide'], message: `A ${slide.attrs.caliber} slide needs a ${slideIs45 ? '.45 ACP' : '9mm/.40/.357'} grip module.` });
  }
  if (slide && barrel) {
    if (barrel.attrs.length !== slide.attrs.length)
      out.push({ severity: 'error', slots: ['slide', 'barrel'], message: `The barrel is ${LEN_LABEL[barrel.attrs.length as string]} but the slide is ${LEN_LABEL[slide.attrs.length as string]}.` });
    if (barrel.attrs.caliber !== slide.attrs.caliber)
      out.push({ severity: 'error', slots: ['slide', 'barrel'], message: `The barrel is ${barrel.attrs.caliber} but the slide is ${slide.attrs.caliber}.` });
  }
  if (slide && spring && spring.attrs.length !== slide.attrs.length)
    out.push({ severity: 'error', slots: ['slide', 'spring'], message: `A ${LEN_LABEL[slide.attrs.length as string]} slide needs the matching recoil spring.` });
  // On the M18 and X-Series slides the rear sight is part of the optic cover plate, so it comes off with the plate.
  if (optic && slide?.attrs.rearSight === 'off')
    out.push({ severity: 'info', slots: ['slide', 'optic'], message: 'On this slide the rear sight is part of the optic cover plate, so it comes off when the optic goes on. Only the front sight is left.' });
  else out.push(...sightHeightIssues(b.sights, optic, false));
  if (slide && optic) {
    if (slide.attrs.cut === 'none')
      out.push({ severity: 'error', slots: ['slide', 'optic'], message: 'This slide has no optic cut. Choose an optic-ready slide or skip the optic.' });
    else if (slide.attrs.cut !== optic.attrs.footprint)
      out.push({ severity: 'warn', slots: ['slide', 'optic'], message: 'This optic uses the RMR footprint. Sig optic-ready slides need an RMR adapter plate (about $40).' });
  }
  if (mag && slide && mag.attrs.caliber !== slide.attrs.caliber)
    out.push({ severity: 'error', slots: ['mag', 'slide'], message: `${mag.attrs.caliber} magazines won't feed a ${slide.attrs.caliber} slide.` });
  if (mag && grip) {
    const [, well] = GRIP[grip.attrs.size as string];
    const m = mag.attrs.size as string;
    if (LEN_RANK[m] < LEN_RANK[well])
      out.push({ severity: 'warn', slots: ['mag', 'grip'], message: `A ${m} magazine sits recessed in a ${grip.attrs.size} grip. It locks in, but is hard to strip out during a reload.` });
    else if (LEN_RANK[m] > LEN_RANK[well])
      out.push({ severity: 'info', slots: ['mag', 'grip'], message: `A ${m} magazine extends below this grip. It works and adds capacity.` });
  }
  // Every P320 grip module has a 1913-style accessory rail.
  const len = slide?.attrs.length as string | undefined;
  out.push(...pistolAddonRules(b, 'pic', 'grip', len, `P320 ${len ? len[0].toUpperCase() + len.slice(1) : ''}`));
  return out;
}

export const p320: Platform = {
  id: 'p320',
  name: 'Sig P320',
  family: 'Pistol',
  maker: 'Sig Sauer',
  blurb: 'Modular 9mm built around a serialized fire control unit. Swap sizes freely.',
  slots,
  parts: [...allParts, ...pistolLights.filter((l) => (l.attrs.rails as string[]).includes('pic')),
    ...holsters('p320', [['subcompact', 'P320 Subcompact'], ['compact', 'P320 Compact'], ['full', 'P320 Full']], ['tlr7a', 'x300']), ...pistolCases],
  rules,
  presets: {
    budget: ['p-fcu-std', 'p-grip-compact', 'p-slide-compact', 'p-bbl-c9', 'p-spr-c', 'p-mag-sig15'],
    value: ['p-fcu-std', 'p-grip-xcarry', 'p-slide-m18', 'p-bbl-faxonc', 'p-spr-c', 'p-opt-r1p', 'p-mag-mecgar17'],
    premium: ['p-fcu-x', 'p-grip-xfull', 'p-slide-xfull', 'p-bbl-f9', 'p-spr-f', 'p-opt-romeox', 'p-mag-sig17'],
  },
};
