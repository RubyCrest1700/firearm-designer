import type { Build, Issue, Part, Platform } from '../types';
import { parts, pick, threadIssue } from './helpers';
import { holsters, pistolAddonRules, pistolAddonSlots, pistolCases, pistolLights } from './addons';

/**
 * Smith & Wesson M&P9 M2.0. S&W doesn't sell bare frames, so a build starts from a complete pistol (the
 * serialized part) and swaps in upgrade slides, barrels, triggers and sights. Anything not swapped is the
 * factory part that came on the pistol. Full size and Compact parts are not interchangeable: slides,
 * barrels and recoil springs are made for one length. M2.0 slides don't fit the original M&P (1.0).
 * Sources: https://en.wikipedia.org/wiki/Smith_%26_Wesson_M%26P
 */
const SIZE: Record<string, string> = { fs: 'Full Size', c: 'Compact' };
/** CORE plates that ship with Optics Ready pistols, by footprint (S&W's plate numbers). The DeltaPoint Pro plate is sold separately. */
const CORE: Record<string, string> = { rmr: 'plate 1', rmsc: 'plate 2', venom: 'plate 5' };
const FP: Record<string, string> = { rmr: 'RMR', rmsc: 'RMSc', venom: 'Venom/FastFire', dpp: 'DeltaPoint Pro', acro: 'Acro', k: 'Holosun K' };

const slots = [
  { id: 'pistol', name: 'Base pistol', group: 'Core', required: true, hint: 'Serialized. S&W sells the M2.0 as a complete pistol; the rest are upgrades to it.' },
  { id: 'slide', name: 'Upgrade slide', group: 'Upper', required: false, hint: 'Optional. Must match the frame size: Full Size or Compact.' },
  { id: 'barrel', name: 'Upgrade barrel', group: 'Upper', required: false, hint: 'Optional. Made for one slide length.' },
  { id: 'rsa', name: 'Recoil spring', group: 'Upper', required: false, hint: 'Optional. Made for one slide length.' },
  { id: 'trigger', name: 'Trigger', group: 'Lower', required: false, hint: 'Optional. Drop-in triggers for the M2.0 frame.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: false, hint: 'Optional. Suppressor height co-witnesses with a dot.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Optics Ready slides take S&W CORE plates for most footprints.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Accessories', required: false, hint: 'Threaded barrels are 1/2x28.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Full Size mags work in both frames; Compact mags are made for the Compact.' },
  ...pistolAddonSlots,
];

const allParts = [
  ...parts('pistol', [
    { id: 'mp-fs', brand: 'Smith & Wesson', name: 'M&P9 M2.0 Full Size 4.25", Optics Ready', specs: ['9mm', '4.25" barrel', '17+1', 'CORE plates'],
      attrs: { size: 'fs', cut: 'core', threaded: false, w_slide: 10.5, w_barrel: 4.2, w_rsa: 0.6, w_trigger: 0.4, w_sights: 0.2 }, serialized: true,
      offers: [['BRN', 599.0], ['PSA', 549.99]], pick: pick('value', 'The all-round M2.0: full grip, optic plates in the box.') },
    { id: 'mp-c4', brand: 'Smith & Wesson', name: 'M&P9 M2.0 Compact 4", Optics Ready', specs: ['9mm', '4" barrel', '15+1', 'CORE plates'],
      attrs: { size: 'c', cut: 'core', threaded: false, w_slide: 9.8, w_barrel: 3.9, w_rsa: 0.6, w_trigger: 0.4, w_sights: 0.2 }, serialized: true,
      offers: [['BRN', 616.0], ['PSA', 529.99]], pick: pick('budget', 'Shorter grip and slide, easier to carry.') },
    { id: 'mp-fst', brand: 'Smith & Wesson', name: 'M&P9 M2.0 Full Size 4.625" Threaded, Optics Ready', specs: ['9mm', '4.625" threaded barrel', '1/2x28', '17+1'],
      attrs: { size: 'fs', cut: 'core', threaded: true, thread: '1/2x28', w_slide: 10.5, w_barrel: 4.2, w_rsa: 0.6, w_trigger: 0.4, w_sights: 0.2 }, serialized: true,
      offers: [['BRN', 649.0]], pick: pick('premium', 'Ready for a suppressor or comp out of the box.') },
  ]),
  ...parts('slide', [
    { id: 'mp-slide-fs', brand: 'Smith & Wesson', name: 'M2.0 Optics Ready Slide, 4.25" (stripped)', specs: ['Full Size', 'CORE cut', 'Front serrations'], attrs: { size: 'fs', cut: 'core' },
      offers: [['BRN', 299.0]], mpn: '14158' },
    { id: 'mp-slide-c', brand: 'Smith & Wesson', name: 'M2.0 Optics Ready Slide, 4" Compact (stripped)', specs: ['Compact', 'CORE cut', 'Front serrations'], attrs: { size: 'c', cut: 'core' },
      offers: [['BRN', 299.0]], mpn: '14157' },
  ]),
  ...parts('barrel', [
    { id: 'mp-bbl-sw', brand: 'Smith & Wesson', name: 'M2.0 4.625" Threaded Barrel', specs: ['For the 4.25" slide', 'Threaded 1/2x28'], attrs: { size: 'fs', threaded: true, thread: '1/2x28' },
      offers: [['BRN', 127.0]], mpn: '14401' },
    { id: 'mp-bbl-faxfs', brand: 'Faxon', name: 'M&P M2.0 Full Size Threaded Barrel', specs: ['Full Size', 'Threaded 1/2x28', 'Match grade'], attrs: { size: 'fs', threaded: true, thread: '1/2x28' },
      offers: [['PA', 131.0]] },
    { id: 'mp-bbl-eb', brand: 'Ed Brown', name: 'M&P M2.0 4.25" Threaded Barrel', specs: ['Full Size', 'Threaded 1/2x28', 'Match grade'], attrs: { size: 'fs', threaded: true, thread: '1/2x28' },
      offers: [['BRN', 199.0]] },
    { id: 'mp-bbl-faxc', brand: 'Faxon', name: 'M&P M2.0 Compact 4" Threaded Barrel', specs: ['Compact', 'Threaded 1/2x28', 'Match grade'], attrs: { size: 'c', threaded: true, thread: '1/2x28' },
      offers: [['PA', 128.0]] },
    { id: 'mp-bbl-apexc', brand: 'Apex Tactical', name: 'M&P M2.0 Compact 4" Threaded Drop-In Barrel', specs: ['Compact', 'Threaded 1/2x28', 'Drop-in'], attrs: { size: 'c', threaded: true, thread: '1/2x28' },
      offers: [['BRN', 234.95]] },
  ]),
  ...parts('rsa', [
    { id: 'mp-rsa-fs', brand: 'Smith & Wesson', name: 'M2.0 Full Size Recoil Spring Assembly', specs: ['Full Size', 'Factory spring'], attrs: { size: 'fs' },
      offers: [['BRN', 26.79]], mpn: '279740000' },
  ]),
  ...parts('trigger', [
    { id: 'mp-trig-apexflat', brand: 'Apex Tactical', name: 'Flat-Faced Forward Set Trigger Kit, M2.0', specs: ['Flat face', 'Shorter reset', 'Polymer shoe'], attrs: { flat: true },
      offers: [['BRN', 110.0]], pick: pick('value', 'A flat shoe and cleaner break for about a hundred dollars.') },
    { id: 'mp-trig-apexcurve', brand: 'Apex Tactical', name: 'Curved Forward Set Trigger Kit, M2.0', specs: ['Curved face', 'Shorter reset', 'Aluminum shoe'], attrs: { flat: false },
      offers: [['BRN', 180.0]] },
    { id: 'mp-trig-timney', brand: 'Timney Triggers', name: 'Alpha Competition Trigger, M&P', specs: ['Flat face', '~3.5 lb', 'Fits M&P 1.0 and M2.0'], attrs: { flat: true },
      offers: [['BRN', 149.99]], pick: pick('premium', 'The lightest, crispest pull you can drop into an M&P.') },
  ]),
  ...parts('sights', [
    { id: 'mp-sight-hdxr', brand: 'Trijicon', name: 'HD XR Night Sights, S&W M&P', specs: ['Standard height', 'Tritium', 'Bright front'], attrs: { height: 'standard' },
      offers: [['OP', 134.99]] },
    { id: 'mp-sight-sup', brand: 'Trijicon', name: 'Suppressor Night Sights, S&W M&P', specs: ['Suppressor height', 'Tritium'], attrs: { height: 'suppressor' },
      offers: [['OP', 160.0]], pick: pick('premium', 'Tall enough to see under a dot or over a suppressor.') },
  ]),
  ...parts('optic', [
    { id: 'mp-opt-507c', brand: 'Holosun', name: 'HS507C X2', specs: ['RMR footprint', 'Multi-reticle', 'Solar'], attrs: { footprint: 'rmr' },
      offers: [['PA', 299.99], ['OP', 309.99]], pick: pick('value', 'Mounts on the RMR plate that comes with the pistol.') },
    { id: 'mp-opt-rmr', brand: 'Trijicon', name: 'RMR Type 2, 3.25 MOA', specs: ['RMR footprint', 'Duty-grade'], attrs: { footprint: 'rmr' },
      offers: [['BRN', 449.99], ['OP', 439.99]], pick: pick('premium', 'The duty standard, on the included plate.') },
    { id: 'mp-opt-407k', brand: 'Holosun', name: 'HS407K X2', specs: ['Holosun K footprint', '6 MOA dot'], attrs: { footprint: 'k' },
      offers: [['PA', 229.99], ['OP', 234.99]] },
    { id: 'mp-opt-venom', brand: 'Vortex', name: 'Venom 3 MOA', specs: ['Venom/FastFire footprint', 'Top-load battery'], attrs: { footprint: 'venom' },
      offers: [['OP', 249.99], ['BRN', 249.99]] },
    { id: 'mp-opt-dpp', brand: 'Leupold', name: 'DeltaPoint Pro 2.5 MOA', specs: ['DeltaPoint Pro footprint', 'Large window'], attrs: { footprint: 'dpp' },
      offers: [['OP', 399.99], ['BRN', 409.99]] },
    { id: 'mp-opt-acro', brand: 'Aimpoint', name: 'Acro P-2', specs: ['Acro footprint', 'Enclosed emitter'], attrs: { footprint: 'acro' },
      offers: [['BRN', 519.0], ['OP', 509.99]] },
  ]),
  ...parts('muzzle', [
    { id: 'mp-mz-tp', brand: 'Smith & Wesson', name: 'Thread Protector, 1/2x28', specs: ['1/2x28', 'Thread protector'], attrs: { thread: '1/2x28', kind: 'protector' },
      offers: [['BRN', 14.99]] },
  ]),
  ...parts('mag', [
    { id: 'mp-mag-17', brand: 'Smith & Wesson', name: 'M&P9 M2.0 17-Round Magazine', specs: ['17 rd', 'Full Size flush'], attrs: { size: 'fs', ext: false },
      offers: [['PA', 42.0], ['BRN', 44.99]], pick: pick('value', 'Flush with the Full Size grip; works in the Compact too.') },
    { id: 'mp-mag-15', brand: 'Smith & Wesson', name: 'M&P9 M2.0 Compact 15-Round Magazine', specs: ['15 rd', 'Compact flush'], attrs: { size: 'c', ext: false },
      offers: [['PA', 42.0]], pick: pick('budget', 'Flush with the Compact grip.') },
    { id: 'mp-mag-23', brand: 'Smith & Wesson', name: 'M&P9 23-Round Magazine', specs: ['23 rd', 'Extended'], attrs: { size: 'fs', ext: true },
      offers: [['PA', 51.0]] },
    { id: 'mp-mag-10', brand: 'Smith & Wesson', name: 'M&P9 10-Round Magazine', specs: ['10 rd', 'Full Size body', 'Restricted states'], attrs: { size: 'fs', ext: false },
      offers: [['PA', 34.99]] },
  ]),
];

/** The slide, barrel or pistol whose attribute applies: the upgrade part if one is chosen, otherwise the factory part. */
const own = (b: Build, slot: string): Part | undefined => b[slot] ?? b.pistol;

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { pistol, slide, barrel, rsa, optic, mag } = b;
  const frame = pistol?.attrs.size as string | undefined;
  const sSize = (slide ?? pistol)?.attrs.size as string | undefined;
  const sSlot = slide ? 'slide' : 'pistol';
  const t = threadIssue(own(b, 'barrel'), b.muzzle);
  if (t) out.push(t.message.startsWith('This barrel') && !barrel ? { ...t, slots: ['muzzle', 'pistol'], message: 'This pistol\'s barrel isn\'t threaded. Add a threaded upgrade barrel for the muzzle device.' } : t);
  if (slide && frame && slide.attrs.size !== frame)
    out.push({ severity: 'warn', slots: ['slide', 'pistol'], message: `This is a ${SIZE[slide.attrs.size as string]} slide on a ${SIZE[frame]} frame. S&W sells them as matched sizes and we couldn't confirm the mix fits. Check with S&W first.` });
  if (barrel && sSize && barrel.attrs.size !== sSize)
    out.push({ severity: 'error', slots: ['barrel', sSlot], message: `This barrel is made for the ${SIZE[barrel.attrs.size as string]} slide; this build has the ${SIZE[sSize]} slide.` });
  if (rsa && sSize && rsa.attrs.size !== sSize)
    out.push({ severity: 'error', slots: ['rsa', sSlot], message: `This recoil spring is made for the ${SIZE[rsa.attrs.size as string]} slide; this build has the ${SIZE[sSize]} slide.` });
  if (optic && (slide ?? pistol)) {
    const fp = optic.attrs.footprint as string;
    if (CORE[fp])
      out.push({ severity: 'info', slots: ['optic', sSlot], message: `Uses CORE ${CORE[fp]}${slide ? ', which comes with Optics Ready pistols. A bare slide may not include it' : ', included with the pistol'}.` });
    else if (fp === 'dpp')
      out.push({ severity: 'warn', slots: ['optic', sSlot], message: 'The DeltaPoint Pro needs S&W\'s CORE DPP plate kit, sold separately (about $49).' });
    else
      out.push({ severity: 'warn', slots: ['optic', sSlot], message: `S&W's CORE plates don't include the ${FP[fp]} footprint. You need an aftermarket M&P plate for it.` });
  }
  if (optic && b.sights?.attrs.height !== 'suppressor')
    out.push({ severity: 'info', slots: ['optic', 'sights'], message: 'Standard-height sights sit below the dot. Suppressor-height sights co-witness through it.' });
  if (mag && frame) {
    if (mag.attrs.size === 'c' && frame === 'fs')
      out.push({ severity: 'warn', slots: ['mag', 'pistol'], message: 'S&W lists the 15-round magazine for the Compact. In the Full Size grip it sits up inside the frame and is hard to strip out.' });
    else if (mag.attrs.size === 'fs' && frame === 'c')
      out.push({ severity: 'info', slots: ['mag', 'pistol'], message: 'Full Size magazines work in the Compact and stick out below the grip.' });
  }
  if (b.muzzle?.attrs.kind === 'protector')
    out.push({ severity: 'info', slots: ['muzzle'], message: 'A thread protector just covers the threads; swap it for a comp or suppressor mount later.' });
  out.push(...pistolAddonRules(b, 'pic', 'pistol', sSize, sSize ? `M&P9 M2.0 ${SIZE[sSize]}` : 'M&P9 M2.0'));
  return out;
}

export const mp: Platform = {
  id: 'mp2',
  name: 'S&W M&P 2.0',
  family: 'Pistol',
  maker: 'Smith & Wesson',
  blurb: 'Full Size or Compact 9mm. Start from a factory pistol and upgrade the slide, barrel and trigger.',
  slots,
  parts: [...allParts, ...pistolLights.filter((l) => ['p-light-tlr7a', 'p-light-x300'].includes(l.id)),
    ...holsters('mp', [['fs', 'M&P9 M2.0 Full Size'], ['c', 'M&P9 M2.0 Compact']], ['tlr7a', 'x300']), ...pistolCases],
  rules,
  presets: {
    budget: ['mp-c4', 'mp-mag-15'],
    value: ['mp-fs', 'mp-trig-apexflat', 'mp-opt-507c', 'mp-sight-sup', 'mp-mag-17'],
    premium: ['mp-fst', 'mp-trig-timney', 'mp-sight-sup', 'mp-opt-rmr', 'mp-mz-tp', 'mp-mag-17'],
  },
};
