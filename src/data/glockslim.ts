import type { Build, Issue, Platform } from '../types';
import { parts, pick } from './helpers';
import { holsters, pistolAddonRules, pistolAddonSlots, pistolCases, pistolLights } from './addons';

/**
 * G43X and G48 use the same frame and magazines; the G48 has a longer slide and barrel.
 * Source: https://www.activeresponsetraining.net/shooting-the-new-glock-48-and-43x ("The 48 has the same frame as the 43X")
 */
const LEN: Record<string, number> = { '43X': 1, '48': 2 };

const slots = [
  { id: 'frame', name: 'Frame', group: 'Lower', required: true, hint: 'Serialized. The G43X and G48 use the same frame, so it takes either slide.' },
  { id: 'fcg', name: 'Trigger & frame parts', group: 'Lower', required: true, hint: 'Slimline parts only. Double-stack Glock triggers won\'t fit.' },
  { id: 'slide', name: 'Slide', group: 'Upper', required: true, hint: 'Either slide fits the frame. The barrel and recoil spring must match the slide.' },
  { id: 'spk', name: 'Slide parts kit', group: 'Upper', required: true, hint: 'Same kit for both slides.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Must match the slide length.' },
  { id: 'rsa', name: 'Recoil spring assembly', group: 'Upper', required: true, hint: 'Must match the slide length.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: true, hint: 'Slimline sights; double-stack Glock rear sights also fit.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'MOS slides take the Shield RMSc footprint directly. Holosun K needs a plate.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'All slimline 9mm mags fit both frames.' },
  ...pistolAddonSlots,
];

const allParts = [
  ...parts('frame', [
    { id: 'gs-frame-43x', brand: 'Glock', name: 'G43X Frame (OEM, stripped)', specs: ['Slimline', 'Rail-less', 'Fits G43X and G48 slides'], attrs: {}, serialized: true,
      offers: [['GS', 164.99], ['BRN', 172.99]], pick: pick('value', 'Takes either slide, so you can swap later.') },
    { id: 'gs-frame-43xr', brand: 'Glock', name: 'G43X Rail Frame (OEM, stripped)', specs: ['Slimline', 'Accessory rail', 'Fits G43X and G48 slides'], attrs: { rail: 'glockslim' }, serialized: true,
      offers: [['GS', 174.99]], pick: pick('premium', 'Adds a rail for a compact weapon light.') },
    { id: 'gs-frame-48', brand: 'Glock', name: 'G48 Frame (OEM, stripped)', specs: ['Slimline', 'Rail-less', 'Same frame as the G43X'], attrs: {}, serialized: true,
      offers: [['GS', 164.99], ['BRN', 172.99]], pick: pick('budget', 'The same frame as the G43X, sold with G48 pistols.') },
  ]),
  ...parts('fcg', [
    { id: 'gs-fcg-oem', brand: 'Glock', name: 'OEM Slimline Lower Parts Kit', specs: ['G43X/G48', 'Stock trigger'], attrs: {},
      offers: [['GS', 89.99], ['BRN', 94.99]], pick: pick('budget', 'Factory parts, factory reliability.') },
    { id: 'gs-fcg-apex', brand: 'Apex', name: 'Action Enhancement Trigger + LPK, G43X/G48', specs: ['G43X/G48', 'Flat face', 'Lighter pull'], attrs: {},
      offers: [['BRN', 199.99], ['OP', 204.99]], pick: pick('value', 'Cleaner break and shorter reset on a small gun.') },
  ]),
  ...parts('slide', [
    { id: 'gs-slide-43x', brand: 'Glock', name: 'G43X Slide (OEM, stripped)', specs: ['3.41" length', 'No optic cut'], attrs: { len: '43X', cut: 'none' },
      offers: [['GS', 189.99]], pick: pick('budget', 'Factory short slide for deep carry.') },
    { id: 'gs-slide-43xmos', brand: 'Glock', name: 'G43X MOS Slide (OEM, stripped)', specs: ['3.41" length', 'Shield RMSc cut'], attrs: { len: '43X', cut: 'rmsc' },
      offers: [['GS', 239.99], ['BRN', 249.99]] },
    { id: 'gs-slide-48', brand: 'Glock', name: 'G48 Slide (OEM, stripped)', specs: ['4.17" length', 'No optic cut'], attrs: { len: '48', cut: 'none' },
      offers: [['GS', 189.99]] },
    { id: 'gs-slide-48mos', brand: 'Glock', name: 'G48 MOS Slide (OEM, stripped)', specs: ['4.17" length', 'Shield RMSc cut'], attrs: { len: '48', cut: 'rmsc' },
      offers: [['GS', 239.99], ['BRN', 249.99]], pick: pick('value', 'Longer sight radius plus a direct-mount optic cut.') },
  ]),
  ...parts('spk', [
    { id: 'gs-spk-oem', brand: 'Glock', name: 'OEM Slimline Slide Parts Kit', specs: ['G43X/G48'], attrs: {},
      offers: [['GS', 74.99], ['BRN', 79.99]], pick: pick('value', 'The one kit both slides use.') },
  ]),
  ...parts('barrel', [
    { id: 'gs-bbl-43x', brand: 'Glock', name: 'G43X Barrel (OEM)', specs: ['3.41"', 'Marksman rifling'], attrs: { len: '43X' },
      offers: [['GS', 129.99], ['BRN', 134.99]], pick: pick('budget', 'Factory barrel for the short slide.') },
    { id: 'gs-bbl-48', brand: 'Glock', name: 'G48 Barrel (OEM)', specs: ['4.17"', 'Marksman rifling'], attrs: { len: '48' },
      offers: [['GS', 129.99], ['BRN', 134.99]], pick: pick('value', 'Factory barrel for the long slide.') },
    { id: 'gs-bbl-48tp', brand: 'True Precision', name: 'G48 Axiom Barrel', specs: ['4.17"', 'Match grade', 'Stainless'], attrs: { len: '48' },
      offers: [['BRN', 214.99], ['OP', 209.99]] },
    { id: 'gs-bbl-43xtp', brand: 'True Precision', name: 'G43X Axiom Barrel', specs: ['3.41"', 'Match grade', 'Stainless'], attrs: { len: '43X' },
      offers: [['BRN', 214.99], ['OP', 209.99]] },
  ]),
  ...parts('rsa', [
    { id: 'gs-rsa-43x', brand: 'Glock', name: 'G43X Recoil Spring Assembly (OEM)', specs: ['G43X length'], attrs: { len: '43X' }, offers: [['GS', 16.99], ['BRN', 18.99]] },
    { id: 'gs-rsa-48', brand: 'Glock', name: 'G48 Recoil Spring Assembly (OEM)', specs: ['G48 length'], attrs: { len: '48' }, offers: [['GS', 16.99], ['BRN', 18.99]] },
  ]),
  ...parts('sights', [
    { id: 'gs-sight-oem', brand: 'Glock', name: 'OEM Polymer Sights (Slimline)', specs: ['Standard height'], attrs: { height: 'standard' },
      offers: [['GS', 9.99]], pick: pick('budget', 'Factory sights.') },
    { id: 'gs-sight-ameriglo', brand: 'AmeriGlo', name: 'Suppressor Height Tritium Sights, G43X/G48', specs: ['Suppressor height', 'Tritium'], attrs: { height: 'suppressor' },
      offers: [['BRN', 99.99], ['OP', 94.99]], pick: pick('value', 'Co-witness with a micro dot and glow at night.') },
  ]),
  ...parts('optic', [
    { id: 'gs-opt-507k', brand: 'Holosun', name: 'HS507K X2', specs: ['Holosun K footprint', 'Multi-reticle'], attrs: { footprint: 'k' },
      offers: [['PA', 269.99], ['OP', 274.99]], pick: pick('value', 'The common pick for slim Glocks. Needs a plate on the standard MOS cut.') },
    { id: 'gs-opt-rmsc', brand: 'Shield', name: 'RMSc 4 MOA', specs: ['RMSc footprint', 'Very low profile'], attrs: { footprint: 'rmsc' },
      offers: [['BRN', 299.99], ['OP', 289.99]] },
    { id: 'gs-opt-epsc', brand: 'Holosun', name: 'EPS Carry', specs: ['Holosun K footprint', 'Enclosed emitter'], attrs: { footprint: 'k' },
      offers: [['PA', 349.99], ['OP', 354.99]] },
    { id: 'gs-opt-rmr', brand: 'Trijicon', name: 'RMR Type 2, 3.25 MOA', specs: ['RMR footprint'], attrs: { footprint: 'rmr' },
      offers: [['BRN', 449.99], ['OP', 439.99]] },
  ]),
  ...parts('mag', [
    { id: 'gs-mag-oem10', brand: 'Glock', name: 'G43X/G48 10-Round Magazine (OEM)', specs: ['10 rd', 'Flush'], attrs: { kind: 'oem' },
      offers: [['GS', 29.99], ['BRN', 31.99], ['PA', 29.99]], pick: pick('value', 'Factory mag, flush with the grip.') },
    { id: 'gs-mag-s15', brand: 'Shield Arms', name: 'S15 15-Round Magazine', specs: ['15 rd', 'Flush', 'Steel body'], attrs: { kind: 's15' },
      offers: [['BRN', 44.99], ['OP', 46.99]], pick: pick('premium', '15 rounds in the same flush size as the factory 10.') },
  ]),
];

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { slide, barrel, rsa, optic, sights, mag } = b;
  const L = (p: typeof slide) => (p ? LEN[p.attrs.len as string] : 0);
  if (slide && barrel && L(barrel) !== L(slide))
    out.push({ severity: 'error', slots: ['slide', 'barrel'], message: `A G${slide.attrs.len} slide needs a G${slide.attrs.len} barrel.` });
  if (slide && rsa && L(rsa) !== L(slide))
    out.push({ severity: 'error', slots: ['slide', 'rsa'], message: `A G${slide.attrs.len} slide needs the G${slide.attrs.len} recoil spring.` });
  if (slide && optic) {
    if (slide.attrs.cut === 'none')
      out.push({ severity: 'error', slots: ['slide', 'optic'], message: 'This slide has no optic cut. Choose a MOS slide or skip the optic.' });
    else if (optic.attrs.footprint === 'k')
      // Glock's original slimline MOS cut has four RMSc recoil bosses; K optics have two pockets. Late-2025 "MOS-K" slides take K directly.
      out.push({ severity: 'warn', slots: ['slide', 'optic'], message: 'This MOS cut is made for RMSc. Holosun K optics need an adapter plate, unless the slide is a newer MOS-K.' });
    else if (slide.attrs.cut !== optic.attrs.footprint)
      out.push({ severity: 'error', slots: ['slide', 'optic'], message: 'Slimline MOS slides take the RMSc footprint. An RMR is too wide for this slide.' });
  }
  if (optic && sights && sights.attrs.height === 'standard')
    out.push({ severity: 'info', slots: ['optic', 'sights'], message: 'Standard-height sights won\'t co-witness with a dot.' });
  if (mag?.attrs.kind === 's15')
    out.push({ severity: 'info', slots: ['mag'], message: 'Shield Arms recommends their steel magazine catch with S15 mags, especially in older frames.' });
  const len = slide?.attrs.len as string | undefined;
  out.push(...pistolAddonRules(b, b.frame?.attrs.rail as 'glockslim' | undefined, 'frame', len && `g${len.toLowerCase()}`, `Glock ${len}`));
  return out;
}

export const glockSlim: Platform = {
  id: 'glock43x',
  name: 'Glock 43X / 48',
  family: 'Pistol',
  maker: 'Glock',
  blurb: 'Slimline single-stack-width 9mm. The two models share frames, parts and mags.',
  slots,
  parts: [...allParts, ...pistolLights.filter((l) => (l.attrs.rails as string[]).includes('glockslim')),
    ...holsters('gs', [['g43x', 'Glock 43X'], ['g48', 'Glock 48']], ['tlr7sub']), ...pistolCases],
  rules,
  presets: {
    budget: ['gs-frame-48', 'gs-fcg-oem', 'gs-slide-48', 'gs-spk-oem', 'gs-bbl-48', 'gs-rsa-48', 'gs-sight-oem', 'gs-mag-oem10'],
    value: ['gs-frame-43x', 'gs-fcg-apex', 'gs-slide-48mos', 'gs-spk-oem', 'gs-bbl-48', 'gs-rsa-48', 'gs-sight-ameriglo', 'gs-opt-507k', 'gs-mag-oem10'],
    premium: ['gs-frame-43xr', 'gs-fcg-apex', 'gs-slide-48mos', 'gs-spk-oem', 'gs-bbl-48tp', 'gs-rsa-48', 'gs-sight-ameriglo', 'gs-opt-rmsc', 'gs-mag-s15'],
  },
};
