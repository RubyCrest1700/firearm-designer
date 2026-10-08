import type { Build, Issue, Part, Platform, PlatformModel, Tier } from '../types';
import { parts, pick, threadIssue } from './helpers';
import { holsters, pistolAddonRules, pistolAddonSlots, pistolCases, pistolLights } from './addons';

/**
 * Double-stack 9mm Glocks: one builder, because a Glock is a frame plus a slide and people mix them. Four
 * frames (G17, G19, G26 and the Gen5 G45, which has the full grip with a G19-length dust cover and G19 locking
 * block) and five slides (G34, G17, G47, G19, G26). The G34 is a G17 frame with a long slide; the G45 and G19X
 * put a G19 slide on the G45 frame and the G47 a G17-length slide that takes the G19 recoil spring. Trigger
 * parts, slide parts, sights and optics are shared. The barrel and recoil spring go with the slide.
 * Sources: https://www.americanrifleman.org/content/review-glock-47-mos, us.glock.com technical data.
 */
type Model = 'G17' | 'G19' | 'G26';
/** Frames: the three classic sizes plus the G45 frame (also the G19X's and G47's). */
type Frame = Model | 'G45';
/** Slide lengths. The G47's is G17 length but takes the G19 recoil spring; the G45 and G19X use G19 slides. */
type Slide = Model | 'G34' | 'G47';
/** The models people search for, each a frame and a slide. */
type Named = Model | 'G34' | 'G45' | 'G19X' | 'G47';

/** Grip size, which magazines fill flush. */
const SIZE: Record<Frame, number> = { G17: 3, G19: 2, G26: 1, G45: 3 };
/** Dust cover length rank of a frame, and the matching slide length rank. */
const COVER: Record<Frame, number> = { G17: 3, G19: 2, G26: 1, G45: 2 };
const LENGTH: Record<Slide, number> = { G34: 4, G17: 3, G47: 3, G19: 2, G26: 1 };
const MODELS_9: Model[] = ['G17', 'G19', 'G26'];
const NAMED: Named[] = ['G17', 'G19', 'G19X', 'G26', 'G34', 'G45', 'G47'];
const MODEL_DESC: Record<Named, string> = {
  G17: 'Full-size 9mm, 4.49" barrel. The duty and competition standard.',
  G19: 'Compact 9mm, 4.02" barrel. The most popular carry Glock.',
  G19X: 'G19-length slide on the full-size G45 frame, in coyote with a lanyard loop. Gen5 only.',
  G26: 'Subcompact 9mm, 3.43" barrel. Takes G19 and G17 mags too.',
  G34: 'Long-slide 9mm, 5.31" barrel, on the G17 frame. The competition Glock.',
  G45: 'G19-length slide on a full-size grip. Gen5 only.',
  G47: 'G17-length slide on the G45 frame. Takes the G19 recoil spring. Gen5 only.',
};

/** Gen3 and Gen4 barrels, trigger parts and slide parts interchange; Gen5 is its own family. */
const family = (gen: unknown) => (gen === 'gen5' ? 'Gen5' : 'Gen3/4');
const GEN: Record<string, string> = { gen3: 'Gen3', gen4: 'Gen4', gen5: 'Gen5' };

/**
 * Which slide generations fit a frame. A Gen3 slide fits a Gen4 frame, but a Gen4 slide doesn't fit a
 * Gen3 G17/G19 frame without cutting it; the G26 is the exception. Gen5 only goes with Gen5.
 * Source: https://3crtactical.com/blog/are-glock-gen-3-and-gen-4-slides-compatible/
 */
function slideFits(slideModel: Slide, frameGen: unknown, slideGen: unknown): boolean {
  if (frameGen === 'gen5' || slideGen === 'gen5') return frameGen === slideGen;
  if (frameGen === 'gen4') return true;
  return slideGen === 'gen3' || slideModel === 'G26';
}

/**
 * The recoil spring assembly goes with the slide, not the frame. G17/G19: Gen3 single, Gen4 and Gen5
 * each their own dual. G26: one dual spring for Gen3 through Gen5 (Glock 65029).
 * Sources: https://store.glock.us/recoil-spring-assembly-dual-g26-g27-g33-g39,
 * https://3crtactical.com/blog/glock-9mm-part-compatibility-between-generations-what-you-need-to-know/
 */
const rsaFor = (M: Model, slideGen: unknown) => (M === 'G26' ? 'G26' : `${M} ${String(slideGen)}`);
const SPRING: Record<string, string> = { gen3: 'Gen3 single-spring', gen4: 'Gen4 dual-spring', gen5: 'Gen5 dual-spring' };
const rsaLabel = (r: unknown) => {
  const [M, gen] = String(r).split(' ');
  return gen ? `${M} ${SPRING[gen]}` : `${M} dual-spring`;
};

const slots = [
  { id: 'frame', name: 'Frame', group: 'Lower', required: true, hint: 'The serialized part. Its generation decides the rest of the build.' },
  { id: 'fcg', name: 'Trigger & frame parts', group: 'Lower', required: true, hint: 'Trigger, housing, connector, locking block, pins.' },
  { id: 'slide', name: 'Slide', group: 'Upper', required: true, hint: 'A Gen3 slide fits Gen3 and Gen4 frames. Gen5 only fits Gen5. A longer slide can go on a shorter frame.' },
  { id: 'spk', name: 'Slide parts kit', group: 'Upper', required: true, hint: 'Firing pin, extractor, safety plunger, backplate.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Goes with the slide: match its length and generation. Gen5 Marksman barrels only fit Gen5 slides.' },
  { id: 'rsa', name: 'Recoil spring assembly', group: 'Upper', required: true, hint: 'Goes with the slide: match it to the slide length and generation.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: true, hint: 'Suppressor height co-witnesses with most optics.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Footprint must match the slide cut.' },
  { id: 'plate', name: 'Optic plate', group: 'Accessories', required: false, hint: 'MOS slides take an optic through a plate made for its footprint.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Accessories', required: false, hint: 'Screws onto a threaded barrel. The thread size and direction must match exactly.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Longer Glock 9mm mags fit shorter grips and stick out below.' },
  ...pistolAddonSlots,
];

/** Model-specific parts. `{M}` is replaced with the model name, `{m}` with its number. */
function modelParts(M: Model): Part[] {
  const n = M.slice(1);
  const t = (s: string) => s.replace(/\{M\}/g, M).replace(/\{m\}/g, n);
  const d = M === 'G17' ? 5 : M === 'G26' ? -5 : 0; // small per-model price spread
  const list: Part[] = [
    ...parts('frame', [
      { id: `g${n}-frame-g3`, brand: 'Glock', name: t('{M} Gen3 Frame (OEM, stripped)'), specs: ['Gen3', 'Rails', 'Finger grooves'], attrs: { gen: 'gen3', model: M }, serialized: true,
        offers: [['GS', 159.99 + d], ['BRN', 169.99 + d, false]], pick: pick('budget', 'Gen3 has the widest selection of cheap aftermarket parts.') },
      ...(M !== 'G26' ? [{ id: `g${n}-frame-lw`, brand: 'Lone Wolf', name: t('Timberwolf {M} Frame'), specs: ['Gen3 compatible', 'Interchangeable backstraps', 'No finger grooves'], attrs: { gen: 'gen3', model: M }, serialized: true,
        offers: [['BRN', 164.99 + d], ['MID', 169.99 + d]] as [string, number][], pick: pick('value', 'Better ergonomics than OEM Gen3, and still takes cheap Gen3 parts.') }] : []),
      { id: `g${n}-frame-g4`, brand: 'Glock', name: t('{M} Gen4 Frame (OEM, stripped)'), specs: ['Gen4', 'Backstraps', 'Dual-spring channel'], attrs: { gen: 'gen4', model: M }, serialized: true,
        offers: [['GS', 164.99 + d]], ...(M === 'G26' ? { pick: pick('value', 'Backstraps let you fit the short grip to your hand.') } : {}) },
      { id: `g${n}-frame-g5`, brand: 'Glock', name: t('{M} Gen5 Frame (OEM, stripped)'), specs: ['Gen5', 'Ambi slide stop', 'No finger grooves'], attrs: { gen: 'gen5', model: M }, serialized: true,
        offers: [['GS', 179.99 + d], ['BRN', 184.99 + d]], pick: pick('premium', 'Newest design, ambidextrous slide stop, flared magwell.') },
    ]),
    ...parts('slide', [
      { id: `g${n}-slide-g3`, brand: 'Glock', name: t('{M} Gen3 Slide (OEM, stripped)'), specs: ['Gen3', 'No optic cut'], attrs: { len: M, bbl: M, family: 'Gen3/4', gen: 'gen3', rsa: rsaFor(M, 'gen3'), cut: 'none' },
        offers: [['GS', 169.99 + d]], pick: pick('budget', 'Plain factory slide, no optic cut.') },
      { id: `g${n}-slide-brn`, brand: 'Brownells', name: t('{M} Slide, RMR Cut, Iron Sight Window'), specs: ['Gen3 pattern', 'RMR footprint', 'Front serrations'], attrs: { len: M, bbl: M, family: 'Gen3/4', gen: 'gen3', rsa: rsaFor(M, 'gen3'), cut: 'rmr' },
        offers: [['BRN', 179.99 + d]], pick: pick('value', 'Optic-ready slide for close to the price of a stock one.') },
      { id: `g${n}-slide-zev`, brand: 'ZEV', name: t('Z{m} Octane Slide, RMR Cut'), specs: ['Gen3 pattern', 'RMR footprint', 'Lightening cuts'], attrs: { len: M, bbl: M, family: 'Gen3/4', gen: 'gen3', rsa: rsaFor(M, 'gen3'), cut: 'rmr' },
        offers: [['BRN', 389.99 + d], ['GS', 379.99 + d]] },
      { id: `g${n}-slide-mos`, brand: 'Glock', name: t('{M} Gen5 MOS Slide (OEM, stripped)'), specs: ['Gen5', 'MOS plate system'], attrs: { len: M, bbl: M, family: 'Gen5', gen: 'gen5', rsa: rsaFor(M, 'gen5'), cut: 'mos' },
        offers: [['GS', 249.99 + d], ['BRN', 259.99 + d]], pick: pick('premium', 'Takes most pistol dots with the matching plate.') },
      { id: `g${n}-slide-g4`, brand: 'Glock', name: t('{M} Gen4 Slide (OEM, stripped)'), specs: ['Gen4', 'No optic cut', 'Dual-spring recoil'], attrs: { len: M, bbl: M, family: 'Gen3/4', gen: 'gen4', rsa: rsaFor(M, 'gen4'), cut: 'none' },
        offers: [['GS', 174.99 + d]] },
      { id: `g${n}-slide-g5`, brand: 'Glock', name: t('{M} Gen5 Slide (OEM, stripped)'), specs: ['Gen5', 'No optic cut', 'Front serrations'], attrs: { len: M, bbl: M, family: 'Gen5', gen: 'gen5', rsa: rsaFor(M, 'gen5'), cut: 'none' },
        offers: [['GS', 219.99 + d]] },
      ...(M !== 'G26' ? [{ id: `g${n}-slide-ggp`, brand: 'Grey Ghost Precision', name: t('{M} Combat Slide, RMR Cut'), specs: ['Gen3 pattern', 'RMR footprint', 'Front and rear serrations'], attrs: { len: M, bbl: M, family: 'Gen3/4', gen: 'gen3', rsa: rsaFor(M, 'gen3'), cut: 'rmr' },
        offers: [['BRN', 329.99 + d], ['GS', 324.99 + d]] as [string, number][] }] : []),
    ]),
    ...parts('barrel', [
      { id: `g${n}-bbl-oem34`, brand: 'Glock', name: t('{M} Barrel, Gen3/4 (OEM)'), specs: ['Gen3/4', 'Polygonal rifling'], attrs: { len: M, bbl: M, family: 'Gen3/4', threaded: false },
        offers: [['GS', 119.99]], pick: pick('budget', 'Factory barrel. Fits a Gen3/4 slide with no fitting.') },
      { id: `g${n}-bbl-lw`, brand: 'Lone Wolf', name: t('AlphaWolf {M} Barrel, Threaded 1/2x28'), specs: ['Gen3/4', 'Threaded 1/2x28', 'Conventional rifling'], attrs: { len: M, bbl: M, family: 'Gen3/4', threaded: true, thread: '1/2x28' },
        offers: [['BRN', 124.99 + d], ['MID', 129.99 + d]] },
      { id: `g${n}-bbl-lwm`, brand: 'Lone Wolf', name: t('AlphaWolf {M} Barrel, Threaded M13.5x1 LH'), specs: ['Gen3/4', 'Threaded M13.5x1 LH', 'Metric, left-hand'], attrs: { len: M, bbl: M, family: 'Gen3/4', threaded: true, thread: 'M13.5x1 LH' },
        offers: [['BRN', 129.99 + d]] },
      { id: `g${n}-bbl-faxon`, brand: 'Faxon', name: t('{M} Duty Series Barrel'), specs: ['Gen3/4', 'Match grade', 'Nitride'], attrs: { len: M, bbl: M, family: 'Gen3/4', threaded: false },
        offers: [['BRN', 169.99 + d], ['OP', 164.99 + d]], pick: pick('value', 'Match-grade accuracy for less than most aftermarket barrels.') },
      ...(M !== 'G26' ? [
        { id: `g${n}-bbl-faxont`, brand: 'Faxon', name: t('{M} Duty Series Barrel, Threaded 1/2x28'), specs: ['Gen3/4', 'Threaded 1/2x28', 'Match grade'], attrs: { len: M, bbl: M, family: 'Gen3/4', threaded: true, thread: '1/2x28' },
          offers: [['BRN', 189.99 + d], ['OP', 184.99 + d]] as [string, number][] },
        { id: `g${n}-bbl-ba`, brand: 'Ballistic Advantage', name: t('Premium Series {M} Barrel, Threaded 1/2x28'), specs: ['Gen3/4', 'Threaded 1/2x28', 'Stainless'], attrs: { len: M, bbl: M, family: 'Gen3/4', threaded: true, thread: '1/2x28' },
          offers: [['PA', 179.99 + d], ['BRN', 184.99 + d]] as [string, number][] },
      ] : []),
      { id: `g${n}-bbl-oem5`, brand: 'Glock', name: t('{M} Gen5 Marksman Barrel (OEM)'), specs: ['Gen5', 'Marksman rifling'], attrs: { len: M, bbl: M, family: 'Gen5', threaded: false },
        offers: [['GS', 149.99], ['BRN', 154.99]], pick: pick('premium', 'Better accuracy than older factory barrels.') },
    ]),
    ...parts('rsa', M === 'G26' ? [
      // The G26 uses one dual spring from Gen3 through Gen5 (Glock 65029).
      { id: `g${n}-rsa-g45`, brand: 'Glock', name: t('{M} Dual Recoil Spring Assembly (OEM)'), specs: ['Dual spring', 'Gen3, Gen4 and Gen5 G26'], attrs: { rsa: rsaFor(M, 'gen5') },
        offers: [['GS', 14.99], ['BRN', 16.99]], pick: pick('budget', 'The factory spring for every G26 generation.') },
    ] : [
      { id: `g${n}-rsa-g3`, brand: 'Glock', name: t('{M} Gen3 Recoil Spring Assembly (OEM)'), specs: ['Single spring', 'Gen3 slides'], attrs: { rsa: rsaFor(M, 'gen3') },
        offers: [['GS', 12.99], ['BRN', 14.99]], pick: pick('budget', 'Factory captured single spring.') },
      { id: `g${n}-rsa-ismi`, brand: 'ISMI', name: t('{M} Gen3 Stainless Guide Rod & Spring'), specs: ['Single spring', 'Gen3 slides', 'Stainless rod'], attrs: { rsa: rsaFor(M, 'gen3') },
        offers: [['BRN', 39.99], ['GS', 37.99]], pick: pick('value', 'Stainless rod with a spring you can swap by weight.') },
      { id: `g${n}-rsa-g4`, brand: 'Glock', name: t('{M} Gen4 Recoil Spring Assembly (OEM)'), specs: ['Dual spring', 'Gen4 slides'], attrs: { rsa: rsaFor(M, 'gen4') },
        offers: [['GS', 14.99], ['BRN', 16.99]] },
      { id: `g${n}-rsa-g45`, brand: 'Glock', name: t('{M} Gen5 Recoil Spring Assembly (OEM)'), specs: ['Dual spring', 'Gen5 slides'], attrs: { rsa: rsaFor(M, 'gen5') },
        offers: [['GS', 14.99], ['BRN', 16.99]], pick: pick('premium', 'The factory spring for Gen5 slides.') },
    ]),
  ];
  return list;
}

/**
 * The G34 slide and barrel. The G34 is a G17 frame with a long slide, and takes the G17's recoil spring in
 * every generation (Glock lists one spring for the G17 and G34: Gen3 "G17/22/31/34/35", Gen4 marked 0-2-5,
 * Gen5 marked 1-3).
 */
const g34Parts: Part[] = [
  ...parts('slide', [
    { id: 'g34-slide-g3', brand: 'Glock', name: 'G34 Gen3 Slide (OEM, stripped)', specs: ['Gen3', 'No optic cut', 'Lightening cut'], attrs: { len: 'G34', bbl: 'G34', family: 'Gen3/4', gen: 'gen3', rsa: rsaFor('G17', 'gen3'), cut: 'none' },
      offers: [['GS', 199.99]], pick: pick('budget', 'The long factory slide, no optic cut.') },
    { id: 'g34-slide-brn', brand: 'Brownells', name: 'G34 Slide, RMR Cut, Iron Sight Window', specs: ['Gen3 pattern', 'RMR footprint', 'Front serrations'], attrs: { len: 'G34', bbl: 'G34', family: 'Gen3/4', gen: 'gen3', rsa: rsaFor('G17', 'gen3'), cut: 'rmr' },
      offers: [['BRN', 199.99]], pick: pick('value', 'Optic-ready long slide for close to the price of a stock one.') },
    { id: 'g34-slide-mos4', brand: 'Glock', name: 'G34 Gen4 MOS Slide (OEM, stripped)', specs: ['Gen4', 'MOS plate system', 'Dual-spring recoil'], attrs: { len: 'G34', bbl: 'G34', family: 'Gen3/4', gen: 'gen4', rsa: rsaFor('G17', 'gen4'), cut: 'mos' },
      offers: [['GS', 259.99]] },
    { id: 'g34-slide-mos', brand: 'Glock', name: 'G34 Gen5 MOS Slide (OEM, stripped)', specs: ['Gen5', 'MOS plate system'], attrs: { len: 'G34', bbl: 'G34', family: 'Gen5', gen: 'gen5', rsa: rsaFor('G17', 'gen5'), cut: 'mos' },
      offers: [['GS', 279.99], ['BRN', 289.99]], pick: pick('premium', 'Optic-ready long slide. Add the plate for your dot.') },
  ]),
  ...parts('barrel', [
    { id: 'g34-bbl-oem34', brand: 'Glock', name: 'G34 Barrel, Gen3/4 (OEM)', specs: ['Gen3/4', '5.31"', 'Polygonal rifling'], attrs: { len: 'G34', family: 'Gen3/4', threaded: false },
      offers: [['GS', 129.99]], pick: pick('budget', 'Factory long barrel.') },
    { id: 'g34-bbl-lw', brand: 'Lone Wolf', name: 'AlphaWolf G34 Barrel, Threaded 1/2x28', specs: ['Gen3/4', 'Threaded 1/2x28', 'Conventional rifling'], attrs: { len: 'G34', family: 'Gen3/4', threaded: true, thread: '1/2x28' },
      offers: [['BRN', 139.99], ['MID', 144.99]] },
    { id: 'g34-bbl-faxon', brand: 'Faxon', name: 'G34 Duty Series Barrel', specs: ['Gen3/4', 'Match grade', 'Nitride'], attrs: { len: 'G34', family: 'Gen3/4', threaded: false },
      offers: [['BRN', 179.99], ['OP', 174.99]], pick: pick('value', 'Match-grade accuracy in the long length.') },
    { id: 'g34-bbl-oem5', brand: 'Glock', name: 'G34 Gen5 Marksman Barrel (OEM)', specs: ['Gen5', '5.31"', 'Marksman rifling'], attrs: { len: 'G34', family: 'Gen5', threaded: false },
      offers: [['GS', 159.99]], pick: pick('premium', 'The factory Gen5 long barrel.') },
  ]),
];

/**
 * The Gen5 G45 frame (the G45's, G19X's and G47's): full-size grip, G19-length dust cover, G19 locking block.
 * It takes G19 slides and the G47 slide. The G47 slide is G17 length, takes a G17 barrel and the G19 recoil
 * spring (Glock lists one spring for the G19 Gen5, G19X and G45).
 */
const g45Parts: Part[] = [
  ...parts('frame', [
    { id: 'g45-frame-g5', brand: 'Glock', name: 'G45 / G47 Gen5 Frame (OEM, stripped)', specs: ['Gen5', 'Full-size grip', 'G19-length dust cover'], attrs: { gen: 'gen5', model: 'G45' }, serialized: true,
      offers: [['GS', 184.99]], pick: pick('premium', 'The full-size grip with the shorter G19 dust cover.') },
    { id: 'g19x-frame-g5', brand: 'Glock', name: 'G19X Frame (OEM, stripped, coyote)', specs: ['Gen5', 'Full-size grip', 'Lanyard loop', 'Coyote'], attrs: { gen: 'gen5', model: 'G45', label: 'G19X' }, serialized: true,
      offers: [['GS', 189.99]] },
  ]),
  ...parts('slide', [
    { id: 'g47-slide-mos', brand: 'Glock', name: 'G47 Gen5 MOS Slide (OEM, stripped)', specs: ['Gen5', 'MOS plate system', 'G17 length, G19 recoil spring'], attrs: { len: 'G47', bbl: 'G17', family: 'Gen5', gen: 'gen5', rsa: rsaFor('G19', 'gen5'), cut: 'mos' },
      offers: [['GS', 259.99]], pick: pick('premium', 'The G47 slide: G17 length on the G45 frame.') },
  ]),
];

const shared: Part[] = [
  ...parts('fcg', [
    { id: 'g-fcg-oem34', brand: 'Glock', name: 'OEM Lower Parts Kit, Gen3/4', specs: ['Gen3/4', 'Stock trigger', '~5.5 lb'], attrs: { family: 'Gen3/4' },
      offers: [['GS', 89.99], ['BRN', 94.99]], pick: pick('budget', 'Factory parts, factory reliability.') },
    { id: 'g-fcg-zev', brand: 'ZEV', name: 'PRO Curved Trigger Kit + LPK, Gen3/4', specs: ['Gen3/4', 'Curved face', '~4.5 lb'], attrs: { family: 'Gen3/4' },
      offers: [['BRN', 179.99], ['GS', 174.99]], pick: pick('value', 'Shorter reset and crisper break than stock, drop-in.') },
    { id: 'g-fcg-apex34', brand: 'Apex', name: 'Action Enhancement Trigger + LPK, Gen3/4', specs: ['Gen3/4', 'Flat face', '~4.5 lb'], attrs: { family: 'Gen3/4' },
      offers: [['BRN', 199.99], ['OP', 204.0]] },
    { id: 'g-fcg-timney', brand: 'Timney', name: 'Alpha Competition Trigger + LPK, Gen3/4', specs: ['Gen3/4', 'Flat face', '~3.5 lb'], attrs: { family: 'Gen3/4' },
      offers: [['BRN', 254.99], ['MID', 259.99]] },
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
    { id: 'g-sight-nf', brand: 'Night Fision', name: 'Perfect Dot Suppressor Height Night Sights', specs: ['Suppressor height', 'Tritium'], attrs: { height: 'suppressor' },
      offers: [['BRN', 129.99], ['OP', 124.99]] },
    { id: 'g-sight-truglo', brand: 'TruGlo', name: 'TFX Pro Day/Night Sights', specs: ['Standard height', 'Tritium + fiber'], attrs: { height: 'standard' },
      offers: [['PA', 89.99], ['MID', 94.99], ['OP', 92.99]] },
  ]),
  ...parts('optic', [
    { id: 'g-opt-507c', brand: 'Holosun', name: 'HS507C X2', specs: ['RMR footprint', 'Multi-reticle', 'Solar'], attrs: { footprint: 'rmr' },
      offers: [['PA', 299.99], ['OP', 309.99]], pick: pick('value', 'Feature-rich and reliable at half the price of an RMR.') },
    { id: 'g-opt-rmr', brand: 'Trijicon', name: 'RMR Type 2, 3.25 MOA', specs: ['RMR footprint', 'Duty-grade'], attrs: { footprint: 'rmr' },
      offers: [['BRN', 449.99], ['OP', 439.99], ['MID', 459.99]], pick: pick('premium', 'The standard for duty pistol optics.') },
    { id: 'g-opt-507k', brand: 'Holosun', name: 'HS507K X2', specs: ['Holosun K footprint', 'Compact'], attrs: { footprint: 'k' },
      offers: [['PA', 269.99], ['OP', 274.99]] },
    { id: 'g-opt-acro', brand: 'Aimpoint', name: 'Acro P-2', specs: ['Acro footprint', 'Enclosed emitter'], attrs: { footprint: 'acro' },
      offers: [['BRN', 519.0], ['OP', 509.99]] },
    { id: 'g-opt-407c', brand: 'Holosun', name: 'HS407C X2', specs: ['RMR footprint', '2 MOA dot', 'Solar'], attrs: { footprint: 'rmr' },
      offers: [['PA', 249.99], ['OP', 254.99]] },
    { id: 'g-opt-sro', brand: 'Trijicon', name: 'SRO 2.5 MOA', specs: ['RMR footprint', 'Large window'], attrs: { footprint: 'rmr' },
      offers: [['BRN', 549.99], ['OP', 539.99]] },
    { id: 'g-opt-epsc', brand: 'Holosun', name: 'EPS Carry', specs: ['Holosun K footprint', 'Enclosed emitter'], attrs: { footprint: 'k' },
      offers: [['PA', 349.99], ['OP', 354.99]] },
    { id: 'g-opt-mps', brand: 'Steiner', name: 'MPS Micro Pistol Sight', specs: ['Acro footprint', 'Enclosed emitter'], attrs: { footprint: 'acro' },
      offers: [['OP', 479.99], ['BRN', 489.99]] },
  ]),
  ...parts('plate', [
    { id: 'g-plate-rmr', brand: 'C&H Precision', name: 'MOS Adapter Plate, RMR / SRO / 407C / 507C', specs: ['RMR footprint', 'Steel'], attrs: { fits: ['rmr'] },
      offers: [['PA', 54.99]], pick: pick('premium', 'Mounts RMR-footprint dots low on a MOS slide.') },
    { id: 'g-plate-k', brand: 'C&H Precision', name: 'MOS Adapter Plate, Holosun 407K / 507K / EPS Carry', specs: ['Holosun K footprint', 'Steel'], attrs: { fits: ['k', 'rmsc'] },
      offers: [['PA', 54.99]] },
    { id: 'g-plate-acro', brand: 'Aimpoint', name: 'Acro Mount Plate for Glock MOS', specs: ['Acro footprint'], attrs: { fits: ['acro'] },
      offers: [['PA', 59.99]] },
  ]),
  ...parts('muzzle', [
    { id: 'g-mz-tp12', brand: 'Lone Wolf', name: 'Thread Protector, 1/2x28', specs: ['1/2x28', 'Thread protector'], attrs: { thread: '1/2x28', kind: 'protector' },
      offers: [['BRN', 14.99]] },
    { id: 'g-mz-tpm', brand: 'Lone Wolf', name: 'Thread Protector, M13.5x1 LH', specs: ['M13.5x1 LH', 'Thread protector'], attrs: { thread: 'M13.5x1 LH', kind: 'protector' },
      offers: [['BRN', 14.99]] },
    { id: 'g-mz-tcomp', brand: 'Tyrant Designs', name: 'T-Comp Compensator, 1/2x28', specs: ['1/2x28', 'Compensator'], attrs: { thread: '1/2x28', kind: 'comp' },
      offers: [['BRN', 119.99], ['OP', 114.99]] },
  ]),
  ...parts('mag', [
    { id: 'g-mag-oem17', brand: 'Glock', name: 'G17 17-Round Magazine (OEM)', specs: ['17 rd', 'G17 length'], attrs: { size: 3 },
      offers: [['GS', 28.99], ['PA', 27.99], ['BRN', 29.99]] },
    { id: 'g-mag-pmag17', brand: 'Magpul', name: 'PMAG 17 GL9', specs: ['17 rd', 'G17 length'], attrs: { size: 3 },
      offers: [['PA', 15.95], ['MID', 16.99], ['BRN', 17.99]] },
    { id: 'g-mag-oem24', brand: 'Glock', name: 'G17 24-Round Magazine (OEM)', specs: ['24 rd', 'Extended'], attrs: { size: 4 },
      offers: [['GS', 34.99], ['BRN', 36.99]] },
    { id: 'g-mag-pmag21', brand: 'Magpul', name: 'PMAG 21 GL9', specs: ['21 rd', 'Extended'], attrs: { size: 4 },
      offers: [['PA', 19.95], ['MID', 21.99], ['BRN', 21.99]] },
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

const NAME: Record<Named, string> = { G17: 'Glock 17', G19: 'Glock 19', G19X: 'Glock 19X', G26: 'Glock 26', G34: 'Glock 34', G45: 'Glock 45', G47: 'Glock 47' };
/** Holsters are molded for the slide: the G47's is G17 length, the G45 frame's slides are G19 length. */
const HOLSTER: Record<Frame | Slide, string> = { G17: 'g17', G19: 'g19', G26: 'g26', G34: 'g34', G47: 'g17', G45: 'g19' };

/**
 * Slide length against frame size, for slides that fit the frame's generation. A longer slide on a shorter
 * frame is a common build; a shorter slide leaves the frame's dust cover sticking out, and a G26 slide is too
 * short for the longer frames' rails. Sources: https://arms-eng.com/glock-frame-slide-compatibility/,
 * https://3crtactical.com/blog/glock-slide-compatibility-guide/
 */
function lengthIssue(FM: Frame, SM: Slide, frameName: string): Issue | null {
  const slots = ['frame', 'slide'];
  if (SM === 'G26' && FM !== 'G26')
    return { severity: 'error', slots, message: `A G26 slide is too short for a ${frameName} frame. The frame's longer rails block it.` };
  if (FM === 'G26' && SM !== 'G26')
    return { severity: 'warn', slots, message: `A ${SM} slide goes on a G26 frame, but it leaves the recoil spring showing in front of the short dust cover. It isn't a combination Glock makes.` };
  if (SM === 'G47' && FM === 'G19')
    return { severity: 'info', slots, message: 'A G47 slide on a Gen5 G19 frame is the setup Glock sold as the G49: the compact grip with a G17-length slide.' };
  // Factory pairings: the G34 is a G17 frame with the long slide, the G47 a G45 frame with the G47 slide.
  if ((SM === 'G34' && FM === 'G17') || (SM === 'G47' && FM === 'G45')) return null;
  if (LENGTH[SM] === COVER[FM]) return null;
  if (LENGTH[SM] > COVER[FM])
    return { severity: 'info', slots, message: `A ${SM} slide on a ${frameName} frame is a popular build: a longer sight radius on the shorter frame. Use a barrel and recoil spring made for the slide.` };
  return { severity: 'warn', slots, message: `A ${SM} slide goes on a ${frameName} frame, but the frame's dust cover sticks out past the slide. Many people run it; Glock doesn't make it.` };
}

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { frame, fcg, slide, spk, barrel, rsa, sights, optic, plate, muzzle, mag } = b;
  const FM = frame?.attrs.model as Frame | undefined;
  const SM = slide?.attrs.len as Slide | undefined;
  const frameName = String(frame?.attrs.label ?? FM);
  const thread = threadIssue(barrel, muzzle);
  if (thread) out.push(thread);
  const frameFam = frame ? family(frame.attrs.gen) : undefined;
  if (frame && fcg && fcg.attrs.family !== frameFam)
    out.push({ severity: 'error', slots: ['frame', 'fcg'], message: `A ${frameFam} frame needs ${frameFam} trigger and frame parts.` });
  if (frame && slide && FM && SM) {
    if (!slideFits(SM, frame.attrs.gen, slide.attrs.gen))
      out.push({ severity: 'error', slots: ['frame', 'slide'], message: `A ${GEN[slide.attrs.gen as string]} slide doesn't fit a ${GEN[frame.attrs.gen as string]} ${frameName} frame.` });
    else {
      const len = lengthIssue(FM, SM, frameName);
      if (len) out.push(len);
      if (len?.severity !== 'error' && SM !== 'G26' && frame.attrs.gen === 'gen4' && slide.attrs.gen === 'gen3')
        out.push({ severity: 'info', slots: ['frame', 'slide'], message: 'A Gen3 slide fits a Gen4 frame. It leaves a small gap at the front of the dust cover and uses the Gen3 single-spring recoil assembly.' });
    }
  }
  if (slide && spk && spk.attrs.family !== slide.attrs.family)
    out.push({ severity: 'error', slots: ['slide', 'spk'], message: `A ${slide.attrs.family} slide needs a ${slide.attrs.family} slide parts kit.` });
  if (slide && barrel && barrel.attrs.family !== slide.attrs.family)
    out.push({ severity: 'error', slots: ['slide', 'barrel'], message: `${barrel.attrs.family} barrels don't fit a ${slide.attrs.family} slide.` });
  else if (slide && barrel && barrel.attrs.len !== slide.attrs.bbl)
    out.push({ severity: 'error', slots: ['slide', 'barrel'], message: SM === slide.attrs.bbl
      ? `This is a ${barrel.attrs.len} barrel and the slide is a ${SM}. The barrel goes with the slide, so it has to be the slide's length.`
      : `This is a ${barrel.attrs.len} barrel. The ${SM} slide takes a ${slide.attrs.bbl} barrel.` });
  if (slide && rsa && rsa.attrs.rsa !== slide.attrs.rsa)
    out.push({ severity: 'error', slots: ['slide', 'rsa'], message: `This slide takes the ${rsaLabel(slide.attrs.rsa)} recoil assembly; this one is ${rsaLabel(rsa.attrs.rsa)}.` });
  if (slide && optic) {
    const cut = slide.attrs.cut;
    const fp = optic.attrs.footprint;
    if (cut === 'none')
      out.push({ severity: 'error', slots: ['slide', 'optic'], message: 'This slide has no optic cut. Choose an optic-ready slide or skip the optic.' });
    else if (cut === 'mos' && !plate)
      out.push({ severity: 'warn', slots: ['slide', 'optic', 'plate'], message: 'MOS slides need a plate for this optic. Pick one under Optic Plate.' });
    else if (cut === 'mos' && plate && !(plate.attrs.fits as string[]).includes(String(fp)))
      out.push({ severity: 'error', slots: ['optic', 'plate'], message: 'This plate is made for a different optic footprint.' });
    else if (cut !== 'mos' && cut !== fp) {
      const name = (f: unknown) => (f === 'k' ? 'Holosun K' : String(f).toUpperCase());
      out.push({ severity: 'warn', slots: ['slide', 'optic'], message: `The slide is cut for the ${name(cut)} footprint, but this optic uses ${name(fp)}. It won't mount directly; you need an adapter plate from ${name(cut)} to ${name(fp)}, which sits the dot a little higher.` });
    }
  }
  if (plate && slide && slide.attrs.cut !== 'mos')
    out.push({ severity: 'error', slots: ['slide', 'plate'], message: 'Optic plates fit MOS slides only. This slide is cut for the optic directly.' });
  if (optic && sights && sights.attrs.height === 'standard')
    out.push({ severity: 'info', slots: ['optic', 'sights'], message: 'Standard-height sights sit below the dot and won\'t co-witness. Suppressor-height sights let you aim through the optic window if it fails.' });
  if (barrel?.attrs.threaded && sights && sights.attrs.height === 'standard')
    out.push({ severity: 'info', slots: ['barrel', 'sights'], message: 'With a threaded barrel, a suppressor will block standard-height sights. Use suppressor-height sights if you plan to run one.' });
  if (barrel?.attrs.threaded && !muzzle)
    out.push({ severity: 'info', slots: ['barrel', 'muzzle'], message: `The ${barrel.attrs.thread} threads stick out past the slide with nothing on them. Add a thread protector to keep them from getting dinged.` });
  if (mag && FM) {
    const ms = mag.attrs.size as number;
    if (ms < SIZE[FM])
      out.push({ severity: 'warn', slots: ['mag'], message: `This magazine is shorter than the ${frameName} grip. It locks in, but sits up inside the magwell and is hard to strip out.` });
    else if (ms > SIZE[FM])
      out.push({ severity: 'info', slots: ['mag'], message: `This magazine sticks out below the ${frameName} grip. It works and adds capacity; a sleeve can fill the gap.` });
  }
  // Every frame here has the Glock accessory rail. A holster is molded for the slide's length.
  const fit = SM ?? FM;
  out.push(...pistolAddonRules(b, 'glock', 'frame', fit && HOLSTER[fit], fit ? NAME[(SM ?? frame?.attrs.label ?? FM) as Named] : ''));
  return out;
}

const P = (n: string, ids: string[]) => ids.map((id) => id.replace('#', n));

/** Each model as it leaves the factory today: Gen5, all Glock parts, Glock sights and magazine. */
const MODEL_BASE: Record<Named, string[]> = {
  G17: P('17', ['g#-frame-g5', 'g-fcg-oem5', 'g#-slide-g5', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-oem', 'g-mag-oem17']),
  G19: P('19', ['g#-frame-g5', 'g-fcg-oem5', 'g#-slide-g5', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-oem', 'g-mag-oem15']),
  G26: P('26', ['g#-frame-g5', 'g-fcg-oem5', 'g#-slide-g5', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-oem', 'g-mag-oem10']),
  // The Gen5 G34 only comes with the MOS slide; its cover plate stays on.
  G34: ['g17-frame-g5', 'g-fcg-oem5', 'g34-slide-mos', 'g-spk-oem5', 'g34-bbl-oem5', 'g17-rsa-g45', 'g-sight-oem', 'g-mag-oem17'],
  G45: ['g45-frame-g5', 'g-fcg-oem5', 'g19-slide-g5', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-oem', 'g-mag-oem17'],
  G19X: ['g19x-frame-g5', 'g-fcg-oem5', 'g19-slide-g5', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-oem', 'g-mag-oem17'],
  G47: ['g45-frame-g5', 'g-fcg-oem5', 'g47-slide-mos', 'g-spk-oem5', 'g17-bbl-oem5', 'g19-rsa-g45', 'g-sight-oem', 'g-mag-oem17'],
};

/**
 * The models are starting points: each has its own starter builds and search page, and old Glock 17, 19
 * and 26 links and saved builds open here.
 */
const MODEL_PRESETS: Record<Named, Record<Tier, string[]>> = {
  G17: {
    budget: P('17', ['g#-frame-g3', 'g-fcg-oem34', 'g#-slide-g3', 'g-spk-lw', 'g#-bbl-oem34', 'g#-rsa-g3', 'g-sight-oem', 'g-mag-pmag17']),
    value: P('17', ['g#-frame-lw', 'g-fcg-zev', 'g#-slide-brn', 'g-spk-oem34', 'g#-bbl-faxon', 'g#-rsa-ismi', 'g-sight-ameriglo', 'g-opt-507c', 'g-mag-oem17']),
    premium: P('17', ['g#-frame-g5', 'g-fcg-apex5', 'g#-slide-mos', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-plate-rmr', 'g-mag-oem17']),
  },
  G19: {
    budget: P('19', ['g#-frame-g3', 'g-fcg-oem34', 'g#-slide-g3', 'g-spk-lw', 'g#-bbl-oem34', 'g#-rsa-g3', 'g-sight-oem', 'g-mag-pmag15']),
    value: P('19', ['g#-frame-lw', 'g-fcg-zev', 'g#-slide-brn', 'g-spk-oem34', 'g#-bbl-faxon', 'g#-rsa-ismi', 'g-sight-ameriglo', 'g-opt-507c', 'g-mag-oem15']),
    premium: P('19', ['g#-frame-g5', 'g-fcg-apex5', 'g#-slide-mos', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-plate-rmr', 'g-mag-oem15']),
  },
  G26: {
    budget: P('26', ['g#-frame-g3', 'g-fcg-oem34', 'g#-slide-g3', 'g-spk-lw', 'g#-bbl-oem34', 'g#-rsa-g45', 'g-sight-oem', 'g-mag-oem10']),
    value: P('26', ['g#-frame-g4', 'g-fcg-zev', 'g#-slide-brn', 'g-spk-oem34', 'g#-bbl-faxon', 'g#-rsa-g45', 'g-sight-ameriglo', 'g-opt-507c', 'g-mag-pmag12']),
    premium: P('26', ['g#-frame-g5', 'g-fcg-apex5', 'g#-slide-mos', 'g-spk-oem5', 'g#-bbl-oem5', 'g#-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-plate-rmr', 'g-mag-oem10']),
  },
  // The G34 is a G17 frame with a long slide and the G17's recoil spring.
  G34: {
    budget: ['g17-frame-g3', 'g-fcg-oem34', 'g34-slide-g3', 'g-spk-lw', 'g34-bbl-oem34', 'g17-rsa-g3', 'g-sight-oem', 'g-mag-pmag17'],
    value: ['g17-frame-lw', 'g-fcg-zev', 'g34-slide-brn', 'g-spk-oem34', 'g34-bbl-faxon', 'g17-rsa-ismi', 'g-sight-ameriglo', 'g-opt-507c', 'g-mag-oem17'],
    premium: ['g17-frame-g5', 'g-fcg-apex5', 'g34-slide-mos', 'g-spk-oem5', 'g34-bbl-oem5', 'g17-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-plate-rmr', 'g-mag-oem17'],
  },
  // The G45 frame is Gen5 only, so its builds differ in trigger, sights, optic and magazine.
  G45: {
    budget: ['g45-frame-g5', 'g-fcg-oem5', 'g19-slide-g5', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-oem', 'g-mag-pmag17'],
    value: ['g45-frame-g5', 'g-fcg-oem5', 'g19-slide-mos', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-ameriglo', 'g-opt-507c', 'g-plate-rmr', 'g-mag-oem17'],
    premium: ['g45-frame-g5', 'g-fcg-apex5', 'g19-slide-mos', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-plate-rmr', 'g-mag-oem17'],
  },
  G19X: {
    budget: ['g19x-frame-g5', 'g-fcg-oem5', 'g19-slide-g5', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-oem', 'g-mag-pmag17'],
    value: ['g19x-frame-g5', 'g-fcg-oem5', 'g19-slide-mos', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-ameriglo', 'g-opt-507c', 'g-plate-rmr', 'g-mag-oem17'],
    premium: ['g19x-frame-g5', 'g-fcg-apex5', 'g19-slide-mos', 'g-spk-oem5', 'g19-bbl-oem5', 'g19-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-plate-rmr', 'g-mag-oem17'],
  },
  // The G47: G17-length slide and G17 barrel, G19 recoil spring.
  G47: {
    budget: ['g45-frame-g5', 'g-fcg-oem5', 'g47-slide-mos', 'g-spk-oem5', 'g17-bbl-oem5', 'g19-rsa-g45', 'g-sight-oem', 'g-mag-pmag17'],
    value: ['g45-frame-g5', 'g-fcg-oem5', 'g47-slide-mos', 'g-spk-oem5', 'g17-bbl-oem5', 'g19-rsa-g45', 'g-sight-ameriglo', 'g-opt-507c', 'g-plate-rmr', 'g-mag-oem17'],
    premium: ['g45-frame-g5', 'g-fcg-apex5', 'g47-slide-mos', 'g-spk-oem5', 'g17-bbl-oem5', 'g19-rsa-g45', 'g-sight-dawson', 'g-opt-rmr', 'g-plate-rmr', 'g-mag-oem17'],
  },
};

/** The parts a model's own page lists (the builder offers them all): its frame, slide, barrel, spring and holster. */
const PAGE_PARTS: Record<Named, string[]> = {
  G17: ['g17-'], G19: ['g19-'], G26: ['g26-'],
  G34: ['g17-frame', 'g34-', 'g17-rsa', 'g34-hol'],
  G45: ['g45-', 'g19-slide', 'g19-bbl', 'g19-rsa', 'g19-hol'],
  G19X: ['g19x-', 'g19-slide', 'g19-bbl', 'g19-rsa', 'g19-hol'],
  G47: ['g45-', 'g47-', 'g17-bbl', 'g19-rsa', 'g17-hol'],
};

const modelId = (M: Named) => `glock${M.slice(1).toLowerCase()}`;

const models: PlatformModel[] = NAMED.map((M) => ({
  id: modelId(M),
  name: NAME[M],
  short: M,
  blurb: MODEL_DESC[M],
  presets: MODEL_PRESETS[M],
  base: MODEL_BASE[M],
  // Its own frames, slides, barrels, springs and holsters, plus the parts every model shares.
  parts: (p: Part) => !/^g\d+x?-/.test(p.id) || PAGE_PARTS[M].some((pre) => p.id.startsWith(pre)),
}));

/** The model a frame and slide make: a Glock model, the G49 (G47 slide on a G19 frame), or a named crossover. */
function modelOf(b: Build): { id?: string; name: string } | undefined {
  const FM = b.frame?.attrs.model as Frame | undefined;
  const label = (b.frame?.attrs.label ?? FM) as string | undefined;
  const SM = b.slide?.attrs.len as Slide | undefined;
  if (!FM || !SM) return FM ? { name: `${label} frame` } : SM ? { name: `${SM} slide` } : undefined;
  const named: Named | undefined = FM === SM ? FM
    : FM === 'G17' && SM === 'G34' ? 'G34'
    : FM === 'G45' && SM === 'G19' ? (label === 'G19X' ? 'G19X' : 'G45')
    : FM === 'G45' && SM === 'G47' && label !== 'G19X' ? 'G47' : undefined;
  if (named) return { id: modelId(named), name: NAME[named] };
  if (FM === 'G19' && SM === 'G47') return { name: 'G47 slide on a G19 frame (the G49)' };
  return { name: `${SM} slide on a ${label} frame` };
}

export const glock9: Platform = {
  id: 'glock9',
  name: 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47',
  family: 'Pistol',
  maker: 'Glock',
  blurb: 'Every double-stack 9mm Glock. Mix any frame with any slide that fits.',
  slots,
  parts: [...MODELS_9.flatMap(modelParts), ...g34Parts, ...g45Parts, ...shared, ...pistolLights.filter((l) => (l.attrs.rails as string[]).includes('glock')),
    ...(['G17', 'G19', 'G26', 'G34'] as const).map((M) => holsters(`g${M.slice(1)}`, [[`g${M.slice(1)}`, NAME[M]]], ['tlr7a', 'x300'])).flat(), ...pistolCases],
  rules,
  presets: MODEL_PRESETS.G19,
  base: MODEL_BASE.G19,
  models,
  modelOf,
};
