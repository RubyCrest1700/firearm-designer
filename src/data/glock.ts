import type { Build, Issue, Part, Platform, Tier } from '../types';
import { parts, pick } from './helpers';

/**
 * Double-stack 9mm Glocks (G17, G19, G26). Trigger parts, slide parts, sights and optics
 * are shared across the three models; frames, slides, barrels, recoil springs and the
 * magazines' flush fit are model-specific.
 */
type Model = 'G17' | 'G19' | 'G26';

const SIZE: Record<Model, number> = { G17: 3, G19: 2, G26: 1 };
const MODEL_DESC: Record<Model, string> = {
  G17: 'Full-size 9mm, 4.49" barrel. The duty and competition standard.',
  G19: 'Compact 9mm, 4.02" barrel. The most popular carry Glock.',
  G26: 'Subcompact 9mm, 3.43" barrel. Takes G19 and G17 mags too.',
};

/** Gen3 and Gen4 slides, barrels and slide parts interchange; Gen5 is its own family. */
const family = (gen: unknown) => (gen === 'gen5' ? 'Gen5' : 'Gen3/4');
const springFor = (gen: unknown) => (gen === 'gen3' ? 'single' : 'dual');

const slots = [
  { id: 'frame', name: 'Frame', group: 'Lower', required: true, hint: 'The serialized part. Its generation decides the rest of the build.' },
  { id: 'fcg', name: 'Trigger & frame parts', group: 'Lower', required: true, hint: 'Trigger, housing, connector, locking block, pins. Same across G17/19/26.' },
  { id: 'slide', name: 'Slide', group: 'Upper', required: true, hint: 'Gen3/4 and Gen5 slides do not interchange.' },
  { id: 'spk', name: 'Slide parts kit', group: 'Upper', required: true, hint: 'Firing pin, extractor, safety plunger, backplate.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Gen5 Marksman barrels only fit Gen5 slides.' },
  { id: 'rsa', name: 'Recoil spring assembly', group: 'Upper', required: true, hint: 'Gen3 frames use a single spring; Gen4/5 use dual.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: true, hint: 'Suppressor height co-witnesses with most optics.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Footprint must match the slide cut.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Longer Glock 9mm mags fit shorter grips and stick out below.' },
];

/** Model-specific parts. `{M}` is replaced with the model name, `{m}` with its number. */
function modelParts(M: Model): Part[] {
  const n = M.slice(1);
  const t = (s: string) => s.replace(/\{M\}/g, M).replace(/\{m\}/g, n);
  const d = M === 'G17' ? 5 : M === 'G26' ? -5 : 0; // small per-model price spread
  const list: Part[] = [
    ...parts('frame', [
      { id: `g${n}-frame-g3`, brand: 'Glock', name: t('{M} Gen3 Frame (OEM, stripped)'), specs: ['Gen3', 'Rails', 'Finger grooves'], attrs: { gen: 'gen3' }, serialized: true,
        offers: [['GS', 159.99 + d], ['BRN', 169.99 + d, false]], pick: pick('budget', 'Gen3 has the widest selection of cheap aftermarket parts.') },
      ...(M !== 'G26' ? [{ id: `g${n}-frame-lw`, brand: 'Lone Wolf', name: t('Timberwolf {M} Frame'), specs: ['Gen3 compatible', 'Interchangeable backstraps', 'No finger grooves'], attrs: { gen: 'gen3' }, serialized: true,
        offers: [['BRN', 164.99 + d], ['MID', 169.99 + d]] as [string, number][], pick: pick('value', 'Better ergonomics than OEM Gen3, and still takes cheap Gen3 parts.') }] : []),
      { id: `g${n}-frame-g4`, brand: 'Glock', name: t('{M} Gen4 Frame (OEM, stripped)'), specs: ['Gen4', 'Backstraps', 'Dual-spring channel'], attrs: { gen: 'gen4' }, serialized: true,
        offers: [['GS', 164.99 + d]], ...(M === 'G26' ? { pick: pick('value', 'Backstraps let you fit the short grip to your hand.') } : {}) },
      { id: `g${n}-frame-g5`, brand: 'Glock', name: t('{M} Gen5 Frame (OEM, stripped)'), specs: ['Gen5', 'Ambi slide stop', 'No finger grooves'], attrs: { gen: 'gen5' }, serialized: true,
        offers: [['GS', 179.99 + d], ['BRN', 184.99 + d]], pick: pick('premium', 'Newest design, ambidextrous slide stop, flared magwell.') },
    ]),
    ...parts('slide', [
      { id: `g${n}-slide-g3`, brand: 'Glock', name: t('{M} Gen3 Slide (OEM, stripped)'), specs: ['Gen3/4', 'No optic cut'], attrs: { family: 'Gen3/4', cut: 'none' },
        offers: [['GS', 169.99 + d]], pick: pick('budget', 'Plain factory slide, no optic cut.') },
      { id: `g${n}-slide-brn`, brand: 'Brownells', name: t('{M} Slide, RMR Cut, Iron Sight Window'), specs: ['Gen3/4', 'RMR footprint', 'Front serrations'], attrs: { family: 'Gen3/4', cut: 'rmr' },
        offers: [['BRN', 179.99 + d]], pick: pick('value', 'Optic-ready slide for close to the price of a stock one.') },
      { id: `g${n}-slide-zev`, brand: 'ZEV', name: t('Z{m} Octane Slide, RMR Cut'), specs: ['Gen3/4', 'RMR footprint', 'Lightening cuts'], attrs: { family: 'Gen3/4', cut: 'rmr' },
        offers: [['BRN', 389.99 + d], ['GS', 379.99 + d]] },
      { id: `g${n}-slide-mos`, brand: 'Glock', name: t('{M} Gen5 MOS Slide (OEM, stripped)'), specs: ['Gen5', 'MOS plate system'], attrs: { family: 'Gen5', cut: 'mos' },
        offers: [['GS', 249.99 + d], ['BRN', 259.99 + d]], pick: pick('premium', 'Factory optic plates fit most pistol dots.') },
    ]),
    ...parts('barrel', [
      { id: `g${n}-bbl-oem34`, brand: 'Glock', name: t('{M} Barrel, Gen3/4 (OEM)'), specs: ['Gen3/4', 'Polygonal rifling'], attrs: { family: 'Gen3/4', threaded: false },
        offers: [['GS', 119.99]], pick: pick('budget', 'Factory barrel. Fits a Gen3/4 slide with no fitting.') },
      { id: `g${n}-bbl-lw`, brand: 'Lone Wolf', name: t('AlphaWolf {M} Barrel, Threaded 1/2x28'), specs: ['Gen3/4', 'Threaded 1/2x28', 'Conventional rifling'], attrs: { family: 'Gen3/4', threaded: true },
        offers: [['BRN', 124.99 + d], ['MID', 129.99 + d]] },
      { id: `g${n}-bbl-faxon`, brand: 'Faxon', name: t('{M} Duty Series Barrel'), specs: ['Gen3/4', 'Match grade', 'Nitride'], attrs: { family: 'Gen3/4', threaded: false },
        offers: [['BRN', 169.99 + d], ['OP', 164.99 + d]], pick: pick('value', 'Match-grade accuracy for less than most aftermarket barrels.') },
      { id: `g${n}-bbl-oem5`, brand: 'Glock', name: t('{M} Gen5 Marksman Barrel (OEM)'), specs: ['Gen5', 'Marksman rifling'], attrs: { family: 'Gen5', threaded: false },
        offers: [['GS', 149.99], ['BRN', 154.99]], pick: pick('premium', 'Better accuracy than older factory barrels.') },
    ]),
    ...parts('rsa', [
      { id: `g${n}-rsa-g3`, brand: 'Glock', name: t('{M} Gen3 Recoil Spring Assembly (OEM)'), specs: ['Single spring', 'Gen3 frames'], attrs: { spring: 'single' },
        offers: [['GS', 12.99], ['BRN', 14.99]], pick: pick('budget', 'Factory captured single spring.') },
      { id: `g${n}-rsa-ismi`, brand: 'ISMI', name: t('{M} Gen3 Stainless Guide Rod & Spring'), specs: ['Single spring', 'Stainless rod'], attrs: { spring: 'single' },
        offers: [['BRN', 39.99], ['GS', 37.99]], pick: pick('value', 'Stainless rod with a spring you can swap by weight.') },
      { id: `g${n}-rsa-g45`, brand: 'Glock', name: t('{M} Gen4/5 Recoil Spring Assembly (OEM)'), specs: ['Dual spring', 'Gen4/5 frames'], attrs: { spring: 'dual' },
        offers: [['GS', 14.99], ['BRN', 16.99]], pick: pick('premium', 'The right spring for Gen4 and Gen5 frames.') },
    ]),
  ];
  return list;
}

const shared: Part[] = [
  ...parts('fcg', [
    { id: 'g-fcg-oem34', brand: 'Glock', name: 'OEM Lower Parts Kit, Gen3/4', specs: ['Gen3/4', 'Stock trigger', '~5.5 lb'], attrs: { family: 'Gen3/4' },
      offers: [['GS', 89.99], ['BRN', 94.99]], pick: pick('budget', 'Factory parts, factory reliability.') },
    { id: 'g-fcg-zev', brand: 'ZEV', name: 'PRO Curved Trigger Kit + LPK, Gen3/4', specs: ['Gen3/4', 'Curved face', '~4.5 lb'], attrs: { family: 'Gen3/4' },
      offers: [['BRN', 179.99], ['GS', 174.99]], pick: pick('value', 'Shorter reset and crisper break than stock, drop-in.') },
    { id: 'g-fcg-oem5', brand: 'Glock', name: 'OEM Lower Parts Kit, Gen5', specs: ['Gen5', 'Stock trigger'], attrs: { family: 'Gen5' },
      offers: [['GS', 94.99], ['BRN', 99.99]] },
    { id: 'g-fcg-apex5', brand: 'Apex', name: 'Action Enhancement Trigger + LPK, Gen5', specs: ['Gen5', 'Flat face', '~4.5 lb'], attrs: { family: 'Gen5' },
      offers: [['BRN', 214.99], ['OP', 219.0]], pick: pick('premium', 'The most-recommended Gen5 trigger upgrade.') },
  ]),
  ...parts('spk', [
    { id: 'g-spk-lw', brand: 'Lone Wolf', name: 'Upper Parts Kit, Gen3/4', specs: ['Gen3/4'], attrs: { family: 'Gen3/4' },
      offers: [['BRN', 54.99], ['MID', 57.99]], pick: pick('budget', 'Full kit with channel liner installed.') },
    { id: 'g-spk-oem34', brand: 'Glock', name: 'OEM Slide Parts Kit, Gen3/4', specs: ['Gen3/4'], attrs: { family: 'Gen3/4' },
      offers: [['GS', 69.99], ['BRN', 74.99]], pick: pick('value', 'Factory parts in the slide, where reliability matters most.') },
    { id: 'g-spk-oem5', brand: 'Glock', name: 'OEM Slide Parts Kit, Gen5', specs: ['Gen5'], attrs: { family: 'Gen5' },
      offers: [['GS', 74.99], ['BRN', 79.99]], pick: pick('premium', 'The only slide kit to use in a Gen5 slide.') },
  ]),
  ...parts('sights', [
    { id: 'g-sight-oem', brand: 'Glock', name: 'OEM Polymer Sights', specs: ['Standard height', 'U-notch rear'], attrs: { height: 'standard' },
      offers: [['GS', 9.99]], pick: pick('budget', 'Factory sights. Fine to start, easy to replace.') },
    { id: 'g-sight-ameriglo', brand: 'AmeriGlo', name: 'Suppressor Height Tritium Sights', specs: ['Suppressor height', 'Tritium'], attrs: { height: 'suppressor' },
      offers: [['BRN', 99.99], ['OP', 94.99]], pick: pick('value', 'Co-witnesses with most dots and glows at night.') },
    { id: 'g-sight-trijicon', brand: 'Trijicon', name: 'HD XR Night Sights', specs: ['Standard height', 'Tritium', 'Bright front'], attrs: { height: 'standard' },
      offers: [['BRN', 139.99], ['OP', 134.99], ['MID', 144.99]] },
    { id: 'g-sight-dawson', brand: 'Dawson Precision', name: 'Charger Suppressor Height Sights', specs: ['Suppressor height', 'Fiber front'], attrs: { height: 'suppressor' },
      offers: [['BRN', 104.99]], pick: pick('premium', 'Crisp blacked-out rear with a fiber front for fast pickup.') },
  ]),
  ...parts('optic', [
    { id: 'g-opt-507c', brand: 'Holosun', name: 'HS507C X2', specs: ['RMR footprint', 'Multi-reticle', 'Solar'], attrs: { footprint: 'rmr' },
      offers: [['PA', 299.99], ['OP', 309.99]], pick: pick('value', 'Feature-rich and reliable at half the price of an RMR.') },
    { id: 'g-opt-rmr', brand: 'Trijicon', name: 'RMR Type 2, 3.25 MOA', specs: ['RMR footprint', 'Duty-grade'], attrs: { footprint: 'rmr' },
      offers: [['BRN', 449.99], ['OP', 439.99], ['MID', 459.99]], pick: pick('premium', 'The standard for duty pistol optics.') },
    { id: 'g-opt-507k', brand: 'Holosun', name: 'HS507K X2', specs: ['RMSc footprint', 'Compact'], attrs: { footprint: 'rmsc' },
      offers: [['PA', 269.99], ['OP', 274.99]] },
    { id: 'g-opt-acro', brand: 'Aimpoint', name: 'Acro P-2', specs: ['Acro footprint', 'Enclosed emitter'], attrs: { footprint: 'acro' },
      offers: [['BRN', 519.0], ['OP', 509.99]] },
  ]),
  ...parts('mag', [
    { id: 'g-mag-oem17', brand: 'Glock', name: 'G17 17-Round Magazine (OEM)', specs: ['17 rd', 'G17 length'], attrs: { size: 3 },
      offers: [['GS', 28.99], ['PA', 27.99], ['BRN', 29.99]] },
    { id: 'g-mag-pmag17', brand: 'Magpul', name: 'PMAG 17 GL9', specs: ['17 rd', 'G17 length'], attrs: { size: 3 },
      offers: [['PA', 15.95], ['MID', 16.99], ['BRN', 17.99]] },
    { id: 'g-mag-oem15', brand: 'Glock', name: 'G19 15-Round Magazine (OEM)', specs: ['15 rd', 'G19 length'], attrs: { size: 2 },
      offers: [['GS', 27.99], ['BRN', 29.99], ['PA', 26.99]] },
    { id: 'g-mag-pmag15', brand: 'Magpul', name: 'PMAG 15 GL9', specs: ['15 rd', 'G19 length'], attrs: { size: 2 },
      offers: [['PA', 14.95], ['MID', 15.99], ['BRN', 16.99]] },
    { id: 'g-mag-oem10', brand: 'Glock', name: 'G26 10-Round Magazine (OEM)', specs: ['10 rd', 'G26 length'], attrs: { size: 1 },
      offers: [['GS', 27.99], ['BRN', 29.99]] },
    { id: 'g-mag-pmag12', brand: 'Magpul', name: 'PMAG 12 GL9', specs: ['12 rd', 'G26 length + extension'], attrs: { size: 1 },
      offers: [['PA', 15.95], ['MID', 16.99]] },
  ]),
];

function rulesFor(M: Model) {
  return (b: Build): Issue[] => {
    const out: Issue[] = [];
    const { frame, fcg, slide, spk, barrel, rsa, sights, optic, mag } = b;
    const frameFam = frame ? family(frame.attrs.gen) : undefined;
    if (frame && fcg && fcg.attrs.family !== frameFam)
      out.push({ severity: 'error', slots: ['frame', 'fcg'], message: `A ${frameFam} frame needs ${frameFam} trigger and frame parts.` });
    if (frame && slide && slide.attrs.family !== frameFam)
      out.push({ severity: 'error', slots: ['frame', 'slide'], message: `${slide.attrs.family} slides don't fit a ${frameFam} frame.` });
    if (slide && spk && spk.attrs.family !== slide.attrs.family)
      out.push({ severity: 'error', slots: ['slide', 'spk'], message: `A ${slide.attrs.family} slide needs a ${slide.attrs.family} slide parts kit.` });
    if (slide && barrel && barrel.attrs.family !== slide.attrs.family)
      out.push({ severity: 'error', slots: ['slide', 'barrel'], message: `${barrel.attrs.family} barrels don't fit a ${slide.attrs.family} slide.` });
    if (frame && rsa && rsa.attrs.spring !== springFor(frame.attrs.gen))
      out.push({ severity: 'error', slots: ['frame', 'rsa'], message: `A ${frame.attrs.gen === 'gen3' ? 'Gen3' : 'Gen4/5'} frame needs a ${springFor(frame.attrs.gen)}-spring recoil assembly.` });
    if (slide && optic) {
      const cut = slide.attrs.cut;
      const fp = optic.attrs.footprint;
      if (cut === 'none')
        out.push({ severity: 'error', slots: ['slide', 'optic'], message: 'This slide has no optic cut. Choose an optic-ready slide or skip the optic.' });
      else if (cut === 'mos' && fp === 'acro')
        out.push({ severity: 'warn', slots: ['slide', 'optic'], message: 'The Acro needs Aimpoint\'s Glock MOS adapter plate (about $60, sold separately).' });
      else if (cut !== 'mos' && cut !== fp)
        out.push({ severity: 'error', slots: ['slide', 'optic'], message: `The slide is cut for the ${String(cut).toUpperCase()} footprint, but this optic uses ${String(fp).toUpperCase()}.` });
    }
    if (optic && sights && sights.attrs.height === 'standard')
      out.push({ severity: 'info', slots: ['optic', 'sights'], message: 'Standard-height sights sit below the dot and won\'t co-witness. Suppressor-height sights let you aim through the optic window if it fails.' });
    if (barrel?.attrs.threaded && sights && sights.attrs.height === 'standard')
      out.push({ severity: 'info', slots: ['barrel', 'sights'], message: 'With a threaded barrel, a suppressor will block standard-height sights. Use suppressor-height sights if you plan to run one.' });
    if (mag) {
      const ms = mag.attrs.size as number;
      if (ms < SIZE[M])
        out.push({ severity: 'warn', slots: ['mag'], message: `This magazine is shorter than the ${M} grip. It locks in, but sits up inside the magwell and is hard to strip out.` });
      else if (ms > SIZE[M])
        out.push({ severity: 'info', slots: ['mag'], message: `This magazine sticks out below the ${M} grip. It works and adds capacity; a sleeve can fill the gap.` });
    }
    return out;
  };
}

function makeGlock(M: Model, presets: Record<Tier, string[]>): Platform {
  const n = M.slice(1);
  return {
    id: `glock${n}`,
    name: `Glock ${n}`,
    family: 'Pistol',
    blurb: MODEL_DESC[M],
    slots,
    parts: [...modelParts(M), ...shared],
    rules: rulesFor(M),
    presets,
  };
}

const P = (n: string, ids: string[]) => ids.map((id) => id.replace('#', n));

export const glock17 = makeGlock('G17', {
  budget: P('17', ['g#-frame-g3', 'g-fcg-oem34', 'g#-slide-g3', 'g-spk-lw', 'g#-bbl-oem34', 'g#-rsa-g3', 'g-sight-oem', 'g-mag-pmag17']),
  value: P('17', ['g#-frame-lw', 'g-fcg-zev', 'g#-slide-brn', 'g-spk-oem34', 'g#-bbl-faxon', 'g#-rsa-ismi', 'g-sight-ameriglo', 'g-opt-507c', 'g-mag-oem17']),
  premium: P('17', ['g#-frame-g5', 'g-fcg-apex5', 'g#-slide-mos', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-mag-oem17']),
});

export const glock19 = makeGlock('G19', {
  budget: P('19', ['g#-frame-g3', 'g-fcg-oem34', 'g#-slide-g3', 'g-spk-lw', 'g#-bbl-oem34', 'g#-rsa-g3', 'g-sight-oem', 'g-mag-pmag15']),
  value: P('19', ['g#-frame-lw', 'g-fcg-zev', 'g#-slide-brn', 'g-spk-oem34', 'g#-bbl-faxon', 'g#-rsa-ismi', 'g-sight-ameriglo', 'g-opt-507c', 'g-mag-oem15']),
  premium: P('19', ['g#-frame-g5', 'g-fcg-apex5', 'g#-slide-mos', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-mag-oem15']),
});

export const glock26 = makeGlock('G26', {
  budget: P('26', ['g#-frame-g3', 'g-fcg-oem34', 'g#-slide-g3', 'g-spk-lw', 'g#-bbl-oem34', 'g#-rsa-g3', 'g-sight-oem', 'g-mag-oem10']),
  value: P('26', ['g#-frame-g4', 'g-fcg-zev', 'g#-slide-brn', 'g-spk-oem34', 'g#-bbl-faxon', 'g#-rsa-g45', 'g-sight-ameriglo', 'g-opt-507c', 'g-mag-pmag12']),
  premium: P('26', ['g#-frame-g5', 'g-fcg-apex5', 'g#-slide-mos', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-mag-oem10']),
});
