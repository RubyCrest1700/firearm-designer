import type { Build, Issue, Platform } from '../types';
import { parts, pick } from './helpers';

/** Grip length: standard (micro) < XL. Magazines are sized to a grip. */
const GRIP_LEN: Record<string, number> = { std: 1, xl: 2 };
const SLIDE_LABEL: Record<string, string> = { std: '3.1" P365', xl: '3.7" P365XL' };

const slots = [
  { id: 'fcu', name: 'Fire control unit', group: 'Core', required: true, hint: 'The serialized chassis. Fits every P365 grip and slide.' },
  { id: 'grip', name: 'Grip module', group: 'Core', required: true, hint: 'Standard (micro) or XL length.' },
  { id: 'slide', name: 'Slide assembly', group: 'Upper', required: true, hint: 'Comes with sights and slide parts. 3.1" or 3.7".' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Must match the slide length.' },
  { id: 'spring', name: 'Recoil spring', group: 'Upper', required: true, hint: 'Must match the slide length.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Optic-ready P365 slides take the RMSc / Romeo Zero footprint.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: true, hint: 'Match the mag to the grip length for a flush fit.' },
];

const allParts = [
  ...parts('fcu', [
    { id: 'p365-fcu', brand: 'Sig Sauer', name: 'P365 Fire Control Unit', specs: ['Curved trigger', 'All P365 sizes'], attrs: {}, serialized: true,
      offers: [['SIG', 159.99]], pick: pick('value', 'Fits every P365 grip module and slide.') },
    { id: 'p365-fcu-flat', brand: 'Sig Sauer', name: 'P365 Fire Control Unit, Flat Trigger', specs: ['Flat trigger', 'All P365 sizes'], attrs: {}, serialized: true,
      offers: [['SIG', 179.99]], pick: pick('premium', 'Flat-faced trigger with a more consistent finger position.') },
  ]),
  ...parts('grip', [
    { id: 'p365-grip-std', brand: 'Sig Sauer', name: 'P365 Grip Module, Standard', specs: ['Micro length', '10 rd flush'], attrs: { len: 'std' },
      offers: [['SIG', 49.99], ['BRN', 54.99]], pick: pick('budget', 'The smallest, easiest-to-hide configuration.') },
    { id: 'p365-grip-xl', brand: 'Sig Sauer', name: 'P365XL Grip Module', specs: ['XL length', '12 rd flush', 'Accessory rail'], attrs: { len: 'xl' },
      offers: [['SIG', 49.99], ['BRN', 54.99], ['MID', 52.99]], pick: pick('value', 'Full firing grip, still easy to carry.') },
    { id: 'p365-grip-wilson', brand: 'Wilson Combat', name: 'P365XL Grip Module', specs: ['XL length', 'Aggressive texture', 'Flared magwell'], attrs: { len: 'xl' },
      offers: [['BRN', 104.99], ['OP', 99.95]], pick: pick('premium', 'Better texture and a flared magwell for faster reloads.') },
  ]),
  ...parts('slide', [
    { id: 'p365-slide-std', brand: 'Sig Sauer', name: 'P365 Slide Assembly, 3.1", Optic Ready', specs: ['3.1"', 'RMSc cut', 'X-Ray3 sights'], attrs: { len: 'std', cut: 'rmsc' },
      offers: [['SIG', 299.99], ['BRN', 309.99]], pick: pick('budget', 'Short slide that still takes a micro dot.') },
    { id: 'p365-slide-xl', brand: 'Sig Sauer', name: 'P365XL Slide Assembly, 3.7", Optic Ready', specs: ['3.7"', 'RMSc cut', 'X-Ray3 sights'], attrs: { len: 'xl', cut: 'rmsc' },
      offers: [['SIG', 319.99], ['BRN', 329.99]], pick: pick('value', 'Longer sight radius and less muzzle flip.') },
    { id: 'p365-slide-spectre', brand: 'Sig Sauer', name: 'P365XL Spectre Comp Slide Assembly', specs: ['3.7"', 'Integrated comp', 'RMSc cut'], attrs: { len: 'xl', cut: 'rmsc', comp: true },
      offers: [['SIG', 449.99]], pick: pick('premium', 'Built-in compensator noticeably flattens recoil.') },
  ]),
  ...parts('barrel', [
    { id: 'p365-bbl-std', brand: 'Sig Sauer', name: 'P365 Barrel, 3.1"', specs: ['3.1"'], attrs: { len: 'std' },
      offers: [['SIG', 109.99]], pick: pick('budget', 'Factory barrel.') },
    { id: 'p365-bbl-xl', brand: 'Sig Sauer', name: 'P365XL Barrel, 3.7"', specs: ['3.7"'], attrs: { len: 'xl' },
      offers: [['SIG', 109.99]], pick: pick('value', 'Factory barrel.') },
    { id: 'p365-bbl-xlthr', brand: 'Sig Sauer', name: 'P365XL Barrel, 3.7", Threaded', specs: ['3.7"', 'Threaded 1/2x28'], attrs: { len: 'xl', threaded: true, thread: '1/2x28' },
      offers: [['SIG', 139.99], ['BRN', 144.99]] },
    { id: 'p365-bbl-tp', brand: 'True Precision', name: 'P365XL Axiom Barrel', specs: ['3.7"', 'Match grade'], attrs: { len: 'xl' },
      offers: [['BRN', 189.99], ['OP', 184.99]] },
  ]),
  ...parts('spring', [
    { id: 'p365-spr-std', brand: 'Sig Sauer', name: 'P365 Recoil Spring Assembly', specs: ['3.1" slide'], attrs: { len: 'std' }, offers: [['SIG', 19.99], ['BRN', 22.99]] },
    { id: 'p365-spr-xl', brand: 'Sig Sauer', name: 'P365XL Recoil Spring Assembly', specs: ['3.7" slide'], attrs: { len: 'xl' }, offers: [['SIG', 19.99], ['BRN', 22.99]] },
  ]),
  ...parts('optic', [
    { id: 'p365-opt-r0', brand: 'Sig Sauer', name: 'RomeoZero Elite', specs: ['RMSc footprint', 'Direct mount'], attrs: { footprint: 'rmsc' },
      offers: [['SIG', 199.99], ['OP', 189.99]], pick: pick('budget', 'Cheapest dot that mounts directly.') },
    { id: 'p365-opt-507k', brand: 'Holosun', name: 'HS507K X2', specs: ['RMSc footprint', 'Multi-reticle'], attrs: { footprint: 'rmsc' },
      offers: [['PA', 269.99], ['OP', 274.99]], pick: pick('value', 'The most common P365 dot. Fits with no plate.') },
    { id: 'p365-opt-eps', brand: 'Holosun', name: 'EPS Carry', specs: ['RMSc footprint', 'Enclosed emitter'], attrs: { footprint: 'rmsc' },
      offers: [['PA', 349.99], ['OP', 359.99]], pick: pick('premium', 'Enclosed emitter keeps lint and rain off the lens.') },
    { id: 'p365-opt-rmrcc', brand: 'Trijicon', name: 'RMRcc 3.25 MOA', specs: ['RMRcc footprint'], attrs: { footprint: 'rmrcc' },
      offers: [['BRN', 399.99], ['OP', 389.99]] },
  ]),
  ...parts('mag', [
    { id: 'p365-mag-10', brand: 'Sig Sauer', name: 'P365 10-Round Magazine', specs: ['10 rd', 'Standard grip flush'], attrs: { len: 'std' },
      offers: [['SIG', 39.99], ['PA', 37.99], ['MID', 38.99]], pick: pick('budget', 'Flush with the standard grip.') },
    { id: 'p365-mag-12', brand: 'Sig Sauer', name: 'P365XL 12-Round Magazine', specs: ['12 rd', 'XL grip flush'], attrs: { len: 'xl' },
      offers: [['SIG', 39.99], ['PA', 37.99], ['BRN', 41.99]], pick: pick('value', 'Flush with the XL grip.') },
    { id: 'p365-mag-15', brand: 'Sig Sauer', name: 'P365 15-Round Extended Magazine', specs: ['15 rd', 'Extended'], attrs: { len: 'ext' },
      offers: [['SIG', 44.99], ['PA', 42.99]], pick: pick('premium', 'Spare-mag capacity for a carry gun.') },
  ]),
];

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { grip, slide, barrel, spring, optic, mag } = b;
  if (slide && barrel && barrel.attrs.len !== slide.attrs.len)
    out.push({ severity: 'error', slots: ['slide', 'barrel'], message: `A ${SLIDE_LABEL[slide.attrs.len as string]} slide needs the matching barrel.` });
  if (slide && spring && spring.attrs.len !== slide.attrs.len)
    out.push({ severity: 'error', slots: ['slide', 'spring'], message: `A ${SLIDE_LABEL[slide.attrs.len as string]} slide needs the matching recoil spring.` });
  if (barrel?.attrs.threaded && slide?.attrs.comp)
    out.push({ severity: 'error', slots: ['slide', 'barrel'], message: 'The Spectre Comp slide has a built-in compensator. A threaded barrel won\'t clear it.' });
  if (slide && optic && slide.attrs.cut !== optic.attrs.footprint)
    out.push({ severity: 'warn', slots: ['slide', 'optic'], message: 'The RMRcc uses its own footprint. You need an RMRcc adapter plate for the P365 slide (about $50).' });
  if (grip && slide && grip.attrs.len === 'xl' && slide.attrs.len === 'std')
    out.push({ severity: 'info', slots: ['grip', 'slide'], message: 'XL grip with the short slide is the P365X layout: full grip, shorter slide.' });
  if (mag && grip) {
    const m = mag.attrs.len === 'ext' ? 3 : GRIP_LEN[mag.attrs.len as string];
    const g = GRIP_LEN[grip.attrs.len as string];
    if (m < g)
      out.push({ severity: 'warn', slots: ['mag', 'grip'], message: 'A standard 10-round mag sits up inside the XL grip. It locks in but is hard to strip out.' });
    else if (m > g)
      out.push({ severity: 'info', slots: ['mag', 'grip'], message: 'This magazine extends below the grip. It works and adds capacity.' });
  }
  return out;
}

export const p365: Platform = {
  id: 'p365',
  name: 'Sig P365',
  family: 'Pistol',
  blurb: 'Micro-compact 9mm on a serialized fire control unit. Mix grips and slides freely.',
  slots,
  parts: allParts,
  rules,
  presets: {
    budget: ['p365-fcu', 'p365-grip-std', 'p365-slide-std', 'p365-bbl-std', 'p365-spr-std', 'p365-mag-10'],
    value: ['p365-fcu', 'p365-grip-xl', 'p365-slide-xl', 'p365-bbl-xl', 'p365-spr-xl', 'p365-opt-507k', 'p365-mag-12'],
    premium: ['p365-fcu-flat', 'p365-grip-wilson', 'p365-slide-spectre', 'p365-bbl-xl', 'p365-spr-xl', 'p365-opt-eps', 'p365-mag-12'],
  },
};
