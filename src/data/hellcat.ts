import type { Build, Issue, Part, Platform } from '../types';
import { parts, pick, threadIssue, sightHeightIssues } from './helpers';
import { holsters, pistolAddonRules, pistolAddonSlots, pistolCases, pistolLights } from './addons';

/**
 * Springfield Armory Hellcat (3") and Hellcat Pro (3.7"). Springfield sells complete pistols only, so a build
 * starts from one (the serialized part) and swaps in upgrades. Barrels and recoil springs are made for one
 * slide length. Aftermarket Pro-length slides (Apex, True Precision) are sold to fit the 3" frame too, with a
 * Pro barrel and Pro recoil spring. The OSP slide cut takes Shield RMSc-footprint dots directly.
 * Sources: https://www.springfield-armory.com/hellcat-series-handguns/,
 * https://www.apextactical.com/ (Hellcat slide listing)
 */
const SIZE: Record<string, string> = { '3': '3" Hellcat', pro: 'Hellcat Pro' };

const slots = [
  { id: 'pistol', name: 'Base pistol', group: 'Core', required: true, hint: 'Serialized. Springfield sells the Hellcat as a complete pistol; the rest are upgrades to it.' },
  { id: 'slide', name: 'Upgrade slide', group: 'Upper', required: false, hint: 'Optional. Pro-length slides fit both frames with a Pro barrel and recoil spring.' },
  { id: 'barrel', name: 'Upgrade barrel', group: 'Upper', required: false, hint: 'Optional. Made for the 3" or the Pro slide.' },
  { id: 'rsa', name: 'Recoil spring', group: 'Upper', required: false, hint: 'Optional. Made for the 3" or the Pro slide.' },
  { id: 'trigger', name: 'Trigger', group: 'Lower', required: false, hint: 'Optional. Fits every Hellcat model.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: false, hint: 'Optional. Optic-height sights co-witness with a dot.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'OSP slides take the Shield RMSc footprint with no plate.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Accessories', required: false, hint: 'Threaded barrels are 1/2x28.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Hellcat and Hellcat Pro magazines are sold separately; match the frame.' },
  ...pistolAddonSlots,
];

const allParts = [
  ...parts('pistol', [
    { id: 'hc-3', brand: 'Springfield Armory', name: 'Hellcat 3" OSP', specs: ['9mm', '3" barrel', '11+1 and 13+1', 'Optic cut'],
      attrs: { size: '3', cut: 'rmsc', threaded: false, w_slide: 7.0, w_barrel: 2.6, w_rsa: 0.4, w_trigger: 0.3, w_sights: 0.2 }, serialized: true,
      offers: [['BRN', 653.0], ['PSA', 499.99]], pick: pick('budget', 'The smallest Hellcat, and still optic-ready.') },
    { id: 'hc-pro', brand: 'Springfield Armory', name: 'Hellcat Pro OSP 3.7"', specs: ['9mm', '3.7" barrel', '15+1', 'Picatinny rail'],
      attrs: { size: 'pro', cut: 'rmsc', threaded: false, w_slide: 8.0, w_barrel: 3.1, w_rsa: 0.4, w_trigger: 0.3, w_sights: 0.2 }, serialized: true,
      offers: [['BRN', 670.0], ['PSA', 529.99]], pick: pick('value', 'Full grip and a longer sight radius, still carry-sized.') },
    { id: 'hc-prot', brand: 'Springfield Armory', name: 'Hellcat Pro OSP Threaded 4.4"', specs: ['9mm', '4.4" threaded barrel', '1/2x28', '15+1'],
      attrs: { size: 'pro', cut: 'rmsc', threaded: true, thread: '1/2x28', w_slide: 8.0, w_barrel: 3.1, w_rsa: 0.4, w_trigger: 0.3, w_sights: 0.2 }, serialized: true,
      offers: [['BRN', 688.0]] },
    { id: 'hc-procomp', brand: 'Springfield Armory', name: 'Hellcat Pro Comp OSP', specs: ['9mm', '3.7" barrel', 'Built-in compensator', '17+1'],
      attrs: { size: 'pro', cut: 'rmsc', threaded: false, comp: true, w_slide: 8.0, w_barrel: 3.1, w_rsa: 0.4, w_trigger: 0.3, w_sights: 0.2 }, serialized: true,
      offers: [['BRN', 723.0]], pick: pick('premium', 'The ported slide keeps the muzzle flat for fast follow-ups.') },
  ]),
  ...parts('slide', [
    { id: 'hc-slide-tp', brand: 'True Precision', name: 'Axiom Hellcat Pro Slide, Optic Cut (stripped)', specs: ['Pro length', 'RMSc cut', 'Fits 3" and Pro frames'],
      attrs: { size: 'pro', cut: 'rmsc' }, offers: [['BRN', 395.0]] },
  ]),
  ...parts('barrel', [
    { id: 'hc-bbl-3', brand: 'Springfield Armory', name: 'Hellcat 3" Barrel', specs: ['3"', 'Factory'], attrs: { size: '3', threaded: false },
      offers: [['BRN', 125.0]] },
    { id: 'hc-bbl-3t', brand: 'Springfield Armory', name: 'Hellcat 3.8" Threaded Barrel', specs: ['For the 3" slide', 'Threaded 1/2x28'], attrs: { size: '3', threaded: true, thread: '1/2x28' },
      offers: [['BRN', 169.99]] },
    { id: 'hc-bbl-pro', brand: 'Springfield Armory', name: 'Hellcat Pro 3.7" Barrel', specs: ['3.7"', 'Factory'], attrs: { size: 'pro', threaded: false },
      offers: [['BRN', 125.0]] },
    { id: 'hc-bbl-prot', brand: 'Springfield Armory', name: 'Hellcat Pro 4.4" Threaded Barrel', specs: ['For the Pro slide', 'Threaded 1/2x28'], attrs: { size: 'pro', threaded: true, thread: '1/2x28' },
      offers: [['BRN', 169.99]] },
    { id: 'hc-bbl-tp', brand: 'True Precision', name: 'Hellcat Pro Threaded Barrel', specs: ['For the Pro slide', 'Threaded 1/2x28', 'Match grade'], attrs: { size: 'pro', threaded: true, thread: '1/2x28' },
      offers: [['BRN', 189.99]] },
    { id: 'hc-bbl-apex', brand: 'Apex Tactical', name: 'Hellcat Pro Drop-In Barrel', specs: ['3.7"', 'Match grade', 'Drop-in'], attrs: { size: 'pro', threaded: false },
      offers: [['BRN', 225.0]] },
  ]),
  ...parts('rsa', [
    { id: 'hc-rsa-3', brand: 'Springfield Armory', name: 'Hellcat Recoil Spring Assembly', specs: ['3" slide', 'Factory'], attrs: { size: '3' }, mpn: 'HC0980',
      offers: [['BRN', 13.5]] },
    { id: 'hc-rsa-apex', brand: 'Apex Tactical', name: 'Hellcat Pro Recoil Spring Assembly', specs: ['Pro slide', 'Captured'], attrs: { size: 'pro' },
      offers: [['BRN', 45.0]] },
  ]),
  ...parts('trigger', [
    { id: 'hc-trig-apex', brand: 'Apex Tactical', name: 'Action Enhancement Kit, Hellcat', specs: ['Flat face', 'Lighter pull', 'All Hellcat models'], attrs: { flat: true },
      offers: [['BRN', 85.99]], pick: pick('value', 'Flat shoe and a lighter, smoother pull for under ninety dollars.') },
  ]),
  ...parts('sights', [
    { id: 'hc-sight-nf', brand: 'Night Fision', name: 'Optic Ready Night Sights, Hellcat', specs: ['Optic height', 'Tritium'], attrs: { height: 'suppressor' },
      offers: [['OP', 107.99]], pick: pick('premium', 'Tall enough to co-witness with a dot.') },
    { id: 'hc-sight-trooper', brand: 'AmeriGlo', name: 'Trooper Night Sights, Hellcat', specs: ['Standard height', 'Tritium', 'Big front dot'], attrs: { height: 'standard' },
      offers: [['OP', 87.86]] },
    { id: 'hc-sight-ag', brand: 'AmeriGlo', name: 'Optic Compatible Sights, Hellcat', specs: ['Optic height', 'Black rear'], attrs: { height: 'suppressor' },
      offers: [['OP', 33.57]], pick: pick('value', 'Inexpensive tall sights for a dot.') },
  ]),
  ...parts('optic', [
    { id: 'hc-opt-rmsc', brand: 'Shield', name: 'RMSc 4 MOA', specs: ['RMSc footprint', 'Very low profile'], attrs: { footprint: 'rmsc' },
      offers: [['BRN', 299.99], ['OP', 289.99]] },
    { id: 'hc-opt-r0', brand: 'Sig Sauer', name: 'RomeoZero Elite', specs: ['RMSc footprint', 'Direct mount'], attrs: { footprint: 'rmsc' },
      offers: [['OP', 189.99]] },
    { id: 'hc-opt-507k', brand: 'Holosun', name: 'HS507K X2', specs: ['Holosun K footprint', 'Multi-reticle'], attrs: { footprint: 'k' },
      offers: [['PA', 269.99], ['OP', 274.99]], pick: pick('value', 'Popular micro dot; mounts on the OSP cut with a plate.') },
    { id: 'hc-opt-407k', brand: 'Holosun', name: 'HS407K X2', specs: ['Holosun K footprint', '6 MOA dot'], attrs: { footprint: 'k' },
      offers: [['PA', 229.99], ['OP', 234.99]] },
    { id: 'hc-opt-eps', brand: 'Holosun', name: 'EPS Carry', specs: ['Holosun K footprint', 'Enclosed emitter'], attrs: { footprint: 'k' },
      offers: [['PA', 349.99], ['OP', 359.99]], pick: pick('premium', 'Enclosed emitter keeps lint off the lens on a carry gun.') },
  ]),
  ...parts('muzzle', [
    { id: 'hc-mz-tp', brand: 'Springfield Armory', name: 'Thread Protector, 1/2x28', specs: ['1/2x28', 'Thread protector'], attrs: { thread: '1/2x28', kind: 'protector' },
      offers: [['BRN', 14.99]] },
  ]),
  ...parts('mag', [
    { id: 'hc-mag-11', brand: 'Springfield Armory', name: 'Hellcat 11-Round Magazine', specs: ['11 rd', 'Flush, 3" frame'], attrs: { size: '3', ext: 0 },
      offers: [['BRN', 30.99]], pick: pick('budget', 'Flush with the 3" grip for the smallest carry profile.') },
    { id: 'hc-mag-13', brand: 'Springfield Armory', name: 'Hellcat 13-Round Magazine', specs: ['13 rd', 'Extended, 3" frame'], attrs: { size: '3', ext: 0.42 },
      offers: [['BRN', 42.99]] },
    { id: 'hc-mag-15', brand: 'Springfield Armory', name: 'Hellcat 15-Round Magazine', specs: ['15 rd', 'Extended, 3" frame'], attrs: { size: '3', ext: 0.8 },
      offers: [['BRN', 42.99]] },
    { id: 'hc-mag-10', brand: 'Springfield Armory', name: 'Hellcat 10-Round Magazine', specs: ['10 rd', 'Flush, 3" frame', 'Restricted states'], attrs: { size: '3', ext: 0 },
      offers: [['BRN', 30.99]] },
    { id: 'hc-mag-p15', brand: 'Springfield Armory', name: 'Hellcat Pro 15-Round Magazine', specs: ['15 rd', 'Flush, Pro frame'], attrs: { size: 'pro', ext: 0 },
      offers: [['BRN', 42.99]], pick: pick('value', 'Flush with the Pro grip.') },
    { id: 'hc-mag-p17', brand: 'Springfield Armory', name: 'Hellcat Pro 17-Round Magazine', specs: ['17 rd', 'Extended, Pro frame'], attrs: { size: 'pro', ext: 0.4 },
      offers: [['BRN', 42.99]] },
    { id: 'hc-mag-p10', brand: 'Springfield Armory', name: 'Hellcat Pro 10-Round Magazine', specs: ['10 rd', 'Flush, Pro frame', 'Restricted states'], attrs: { size: 'pro', ext: 0 },
      offers: [['BRN', 30.99]] },
  ]),
];

const own = (b: Build, slot: string): Part | undefined => b[slot] ?? b.pistol;

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { pistol, slide, barrel, rsa, optic, mag } = b;
  const frame = pistol?.attrs.size as string | undefined;
  const sSize = (slide ?? pistol)?.attrs.size as string | undefined;
  const sSlot = slide ? 'slide' : 'pistol';
  const t = threadIssue(own(b, 'barrel'), b.muzzle);
  if (t) out.push(t.message.startsWith('This barrel') && !barrel ? { ...t, slots: ['muzzle', 'pistol'], message: 'This pistol\'s barrel isn\'t threaded. Add a threaded upgrade barrel for the muzzle device.' } : t);
  if (pistol?.attrs.comp && (barrel?.attrs.threaded || b.muzzle) && !slide)
    out.push({ severity: 'error', slots: ['pistol', barrel?.attrs.threaded ? 'barrel' : 'muzzle'], message: 'The Pro Comp\'s slide has a built-in compensator, so a threaded barrel or muzzle device won\'t clear it.' });
  if (slide && frame === '3')
    out.push({ severity: 'info', slots: ['slide', 'pistol'], message: `${slide.brand} sells this Pro-length slide for the 3" frame too. Run it with a Hellcat Pro barrel and recoil spring; the slide sits past the front of the frame.` });
  if (barrel && sSize && barrel.attrs.size !== sSize)
    out.push({ severity: 'error', slots: ['barrel', sSlot], message: `This barrel is made for the ${SIZE[barrel.attrs.size as string]} slide; this build has the ${SIZE[sSize]} slide.` });
  if (slide && !barrel && pistol && pistol.attrs.size !== slide.attrs.size)
    out.push({ severity: 'error', slots: ['slide', 'barrel'], message: 'The factory 3" barrel is too short for a Pro-length slide. Add a Hellcat Pro barrel.' });
  if (rsa && sSize && rsa.attrs.size !== sSize)
    out.push({ severity: 'error', slots: ['rsa', sSlot], message: `This recoil spring is made for the ${SIZE[rsa.attrs.size as string]} slide; this build has the ${SIZE[sSize]} slide.` });
  if (slide && !rsa && pistol && pistol.attrs.size !== slide.attrs.size)
    out.push({ severity: 'error', slots: ['slide', 'rsa'], message: 'The factory 3" recoil spring is too short for a Pro-length slide. Add a Hellcat Pro recoil spring.' });
  if (optic && optic.attrs.footprint === 'k')
    out.push(slide?.attrs.k
      ? { severity: 'info', slots: ['optic', 'slide'], message: 'This slide is cut for Holosun K optics directly; no plate needed.' }
      : { severity: 'warn', slots: ['optic', sSlot], message: 'The OSP cut is made for the Shield RMSc footprint. Holosun K optics need an adapter plate.' });
  out.push(...sightHeightIssues(b.sights, optic, barrel ? !!barrel.attrs.threaded && { slot: 'barrel' } : !!pistol?.attrs.threaded && { slot: 'pistol' }));
  if (mag && frame && mag.attrs.size !== frame)
    out.push({ severity: 'warn', slots: ['mag', 'pistol'], message: `Springfield sells this magazine for the ${SIZE[mag.attrs.size as string]}. We couldn't confirm it fits the ${SIZE[frame]}; check with Springfield.` });
  // The 3" frame has Springfield's short proprietary rail; the Pro has a 1913 rail.
  out.push(...pistolAddonRules(b, frame === 'pro' ? 'pic' : frame ? 'hellcat' : undefined, 'pistol', sSize, sSize ? SIZE[sSize] : 'Hellcat'));
  return out;
}

export const hellcat: Platform = {
  id: 'hellcat',
  name: 'Springfield Hellcat',
  family: 'Pistol',
  maker: 'Springfield Armory',
  blurb: 'Micro-compact 9mm, 3" or Pro. Start from a factory pistol and upgrade the slide, barrel and trigger.',
  slots,
  parts: [...allParts, ...pistolLights.filter((l) => ['p-light-tlr7sub-h', 'p-light-tlr7sub-p'].includes(l.id)),
    ...holsters('hc', [['3', 'Hellcat 3"'], ['pro', 'Hellcat Pro']], ['tlr7sub']), ...pistolCases],
  rules,
  presets: {
    budget: ['hc-3', 'hc-mag-11'],
    value: ['hc-pro', 'hc-trig-apex', 'hc-sight-ag', 'hc-opt-rmsc', 'hc-mag-p15'],
    premium: ['hc-procomp', 'hc-trig-apex', 'hc-sight-nf', 'hc-opt-rmsc', 'hc-mag-p15'],
  },
};
