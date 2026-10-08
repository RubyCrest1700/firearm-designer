import type { Build, Issue, Platform } from '../types';
import { parts, pick, threadIssue, sightHeightIssues } from './helpers';
import { holsters, pistolAddonRules, pistolAddonSlots, pistolCases, pistolLights } from './addons';

/**
 * Large-frame Glocks: the G20 (10mm Auto) and G21 (.45 ACP). They share the frame, trigger parts and slide
 * parts kit; the slide's breech face, the barrel and the magazines are made for one caliber. Gen3 and Gen4 only: Gen3 has a standard frame and a Short Frame (SF) with a smaller
 * back strap; Gen4 has interchangeable backstraps and a dual recoil spring.
 * Sources: https://en.wikipedia.org/wiki/Glock,
 * https://3crtactical.com/blog/are-glock-gen-3-and-gen-4-slides-compatible/
 */
const CAL: Record<string, string> = { '10mm': '10mm Auto', '45': '.45 ACP', '40': '.40 S&W' };
const GEN: Record<string, string> = { gen3: 'Gen3', gen4: 'Gen4' };
const RSA_LABEL: Record<string, string> = { gen3: 'Gen3 single-spring', gen4: 'Gen4 dual-spring' };
/** Model name for a caliber, for messages and holster sizes. */
const MODEL: Record<string, string> = { '10mm': 'G20', '45': 'G21' };

const slots = [
  { id: 'frame', name: 'Frame', group: 'Lower', required: true, hint: 'Serialized. G20 and G21 frames are the same, so the slide sets the caliber.' },
  { id: 'fcg', name: 'Trigger & frame parts', group: 'Lower', required: true, hint: 'Large-frame trigger parts fit both the G20 and G21.' },
  { id: 'slide', name: 'Slide', group: 'Upper', required: true, hint: 'Its breech face is cut for one caliber. Match it to the frame.' },
  { id: 'spk', name: 'Slide parts kit', group: 'Upper', required: true, hint: 'Firing pin, extractor, safety plunger, backplate.' },
  { id: 'barrel', name: 'Barrel', group: 'Upper', required: true, hint: 'Must match the slide\'s caliber. A 10mm slide can also take a .40 conversion barrel.' },
  { id: 'rsa', name: 'Recoil spring assembly', group: 'Upper', required: true, hint: 'Goes with the slide: Gen3 single spring or Gen4 dual spring.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: true, hint: 'Large-frame Glock sights. Suppressor height co-witnesses with a dot.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Footprint must match the slide cut.' },
  { id: 'muzzle', name: 'Muzzle device', group: 'Accessories', required: false, hint: 'Threaded barrels: 9/16x24 on 10mm, .578x28 on .45 ACP.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Match the slide\'s caliber: G20 mags for 10mm (and .40 conversions), G21 mags for .45 ACP.' },
  ...pistolAddonSlots,
];

const allParts = [
  ...parts('frame', [
    { id: 'gl-frame-g3', brand: 'Glock', name: 'G20/G21 Gen3 Frame (OEM, stripped)', specs: ['Gen3', 'Finger grooves', 'Fits 10mm and .45 slides'], attrs: { gen: 'gen3' }, serialized: true,
      offers: [['GS', 179.99]] },
    { id: 'gl-frame-sf', brand: 'Glock', name: 'G20SF/G21SF Gen3 Short Frame (OEM, stripped)', specs: ['Gen3', 'Short frame', 'Smaller back strap'], attrs: { gen: 'gen3', sf: true }, serialized: true,
      offers: [['GS', 184.99]], pick: pick('value', 'The short frame suits average hands on a big 10mm or .45.') },
    { id: 'gl-frame-g4', brand: 'Glock', name: 'G20/G21 Gen4 Frame (OEM, stripped)', specs: ['Gen4', 'Backstraps', 'Dual-spring channel'], attrs: { gen: 'gen4' }, serialized: true,
      offers: [['GS', 189.99]], pick: pick('premium', 'Swap backstraps to fit your hand; takes Gen3 and Gen4 slides.') },
    { id: 'gl-frame-lw', brand: 'Lone Wolf', name: 'TWF Large Frame, Textured (stripped)', specs: ['Gen3/4 compatible', 'No finger grooves', 'G20/G21'], attrs: { gen: 'gen3' }, serialized: true,
      offers: [['BRN', 74.95, false]], mpn: 'LWD-TWL1-BARE', pick: pick('budget', 'The cheapest way into a large-frame Glock build.') },
  ]),
  ...parts('fcg', [
    { id: 'gl-fcg-oem', brand: 'Glock', name: 'OEM Lower Parts Kit, G20/G21', specs: ['Large frame', 'Stock trigger', '~5.5 lb'], attrs: {},
      offers: [['GS', 94.99], ['BRN', 99.99]], pick: pick('budget', 'Factory parts, factory reliability.') },
    { id: 'gl-fcg-ow', brand: 'Overwatch Precision', name: 'TAC Trigger, Glock Large Frame', specs: ['Large frame', 'Flat face', 'Uses OEM trigger bar'], attrs: {},
      offers: [['BRN', 135.0]], pick: pick('value', 'Flat-faced shoe that drops into Gen3 and Gen4 large frames.') },
    { id: 'gl-fcg-cmc', brand: 'CMC Triggers', name: 'Drop-In Trigger, Glock Gen3 10mm/.45', specs: ['Gen3 large frame', 'Flat face', 'Self-contained housing', '~3.5 lb'], attrs: { gens: ['gen3'] },
      offers: [['PA', 144.99]], pick: pick('premium', 'The lightest, crispest pull here, in one drop-in unit.') },
  ]),
  ...parts('slide', [
    { id: 'gl-slide-20g3', brand: 'Glock', name: 'G20 Gen3 Slide (OEM, stripped)', specs: ['10mm', 'Gen3', 'No optic cut'], attrs: { cal: '10mm', gen: 'gen3', rsa: 'gen3', cut: 'none' },
      offers: [['GS', 199.99]], pick: pick('budget', 'Plain factory slide.') },
    { id: 'gl-slide-20brn', brand: 'Brownells', name: 'RMR Cut Slide for Glock 20 Gen3', specs: ['10mm', 'Gen3 and 20SF', 'RMR footprint', '17-4 stainless'], attrs: { cal: '10mm', gen: 'gen3', rsa: 'gen3', cut: 'rmr' },
      offers: [['BRN', 219.99]], pick: pick('value', 'Direct-mount RMR cut for about the price of a factory slide.') },
    { id: 'gl-slide-20zp', brand: 'Zaffiri Precision', name: 'ZPS.2 RMR Cut Slide, Glock 20 Gen3', specs: ['10mm', 'Gen3', 'RMR footprint'], attrs: { cal: '10mm', gen: 'gen3', rsa: 'gen3', cut: 'rmr' },
      offers: [['OP', 449.99]] },
    { id: 'gl-slide-20g4', brand: 'Glock', name: 'G20 Gen4 Slide (OEM, stripped)', specs: ['10mm', 'Gen4', 'No optic cut', 'Dual-spring recoil'], attrs: { cal: '10mm', gen: 'gen4', rsa: 'gen4', cut: 'none' },
      offers: [['GS', 209.99]] },
    { id: 'gl-slide-20mos', brand: 'Glock', name: 'G20 Gen4 MOS Slide (OEM, stripped)', specs: ['10mm', 'Gen4', 'MOS plate system'], attrs: { cal: '10mm', gen: 'gen4', rsa: 'gen4', cut: 'mos' },
      offers: [['GS', 279.99]], pick: pick('premium', 'Factory optic plates fit most pistol dots.') },
    { id: 'gl-slide-21g3', brand: 'Glock', name: 'G21 Gen3 Slide (OEM, stripped)', specs: ['.45 ACP', 'Gen3', 'No optic cut'], attrs: { cal: '45', gen: 'gen3', rsa: 'gen3', cut: 'none' },
      offers: [['GS', 199.99]] },
    { id: 'gl-slide-21g4', brand: 'Glock', name: 'G21 Gen4 Slide (OEM, stripped)', specs: ['.45 ACP', 'Gen4', 'No optic cut', 'Dual-spring recoil'], attrs: { cal: '45', gen: 'gen4', rsa: 'gen4', cut: 'none' },
      offers: [['GS', 209.99]] },
    { id: 'gl-slide-21mos', brand: 'Glock', name: 'G21 Gen4 MOS Slide (OEM, stripped)', specs: ['.45 ACP', 'Gen4', 'MOS plate system'], attrs: { cal: '45', gen: 'gen4', rsa: 'gen4', cut: 'mos' },
      offers: [['GS', 279.99]] },
  ]),
  ...parts('spk', [
    { id: 'gl-spk-oem', brand: 'Glock', name: 'OEM Slide Parts Kit, G20/G21', specs: ['Large frame', 'Gen3/4'], attrs: {},
      offers: [['GS', 74.99], ['BRN', 79.99]], pick: pick('value', 'Factory parts in the slide, where reliability matters most.') },
    { id: 'gl-spk-lw', brand: 'Lone Wolf', name: 'Upper Parts Kit, G20/G21', specs: ['Large frame', 'Gen3/4'], attrs: {},
      offers: [['BRN', 59.99]], pick: pick('budget', 'Full kit with the channel liner installed.') },
  ]),
  // Lone Wolf prices and thread pitches: https://lonewolfdist.com/barrels/glock-compatible-barrels/g20-21-40-41-full-size/
  ...parts('barrel', [
    { id: 'gl-bbl-20oem', brand: 'Glock', name: 'G20 Barrel (OEM)', specs: ['10mm', '4.61"', 'Polygonal rifling'], attrs: { cal: '10mm', fires: '10mm', threaded: false },
      offers: [['GS', 184.95, false]] },
    { id: 'gl-bbl-20lwd', brand: 'Lone Wolf', name: 'LWD G20 Barrel, 10mm', specs: ['10mm', '4.61"', 'Conventional rifling'], attrs: { cal: '10mm', fires: '10mm', threaded: false },
      offers: [['BRN', 109.95]], pick: pick('budget', 'Conventional rifling for lead and hard-cast loads, for less than a factory barrel.') },
    { id: 'gl-bbl-20lw', brand: 'Lone Wolf', name: 'AlphaWolf G20 Barrel, 10mm', specs: ['10mm', '4.61"', 'Conventional rifling'], attrs: { cal: '10mm', fires: '10mm', threaded: false },
      offers: [['BRN', 134.95]], pick: pick('value', 'Drop-in, and safe for cast hunting loads.') },
    { id: 'gl-bbl-20lwt', brand: 'Lone Wolf', name: 'AlphaWolf G20 Barrel, Threaded 9/16x24', specs: ['10mm', 'Threaded 9/16x24'], attrs: { cal: '10mm', fires: '10mm', threaded: true, thread: '9/16x24' },
      offers: [['BRN', 149.95]] },
    { id: 'gl-bbl-20to40', brand: 'Lone Wolf', name: 'AlphaWolf G20 10mm to .40 S&W Conversion Barrel', specs: ['Fires .40 S&W', 'Fits a 10mm slide', '4.61"'], attrs: { cal: '10mm', fires: '40', threaded: false },
      offers: [['BRN', 134.95]] },
    { id: 'gl-bbl-21oem', brand: 'Glock', name: 'G21 Barrel (OEM)', specs: ['.45 ACP', '4.61"', 'Polygonal rifling'], attrs: { cal: '45', fires: '45', threaded: false },
      offers: [['GS', 184.95, false]] },
    { id: 'gl-bbl-21lw', brand: 'Lone Wolf', name: 'AlphaWolf G21 Barrel, .45 ACP', specs: ['.45 ACP', '4.61"', 'Conventional rifling'], attrs: { cal: '45', fires: '45', threaded: false },
      offers: [['BRN', 134.95]] },
    { id: 'gl-bbl-21lwdt', brand: 'Lone Wolf', name: 'LWD G21 Barrel, Threaded .578x28', specs: ['.45 ACP', 'Threaded .578x28'], attrs: { cal: '45', fires: '45', threaded: true, thread: '.578x28' },
      offers: [['BRN', 124.95]] },
    { id: 'gl-bbl-21lwt', brand: 'Lone Wolf', name: 'AlphaWolf G21 Barrel, Threaded .578x28', specs: ['.45 ACP', 'Threaded .578x28'], attrs: { cal: '45', fires: '45', threaded: true, thread: '.578x28' },
      offers: [['BRN', 149.95]], pick: pick('premium', 'Suppressor-ready .45 with conventional rifling.') },
  ]),
  // Glock 05586 (Gen1-3, single spring) and 30077 (Gen4 dual, shared with the G40/41): https://ghostinc.com/glock-30077-recoil-spring-assm-gen-4-20-21-40-41/
  ...parts('rsa', [
    { id: 'gl-rsa-g3', brand: 'Glock', name: 'G20/G21 Gen3 Recoil Spring Assembly (OEM)', specs: ['Single spring', 'Gen3 slides'], attrs: { rsa: 'gen3' }, mpn: '05586',
      offers: [['GS', 10.95]], pick: pick('budget', 'Factory captured single spring.') },
    { id: 'gl-rsa-ismi', brand: 'ISMI', name: 'G20/G21 Gen3 Stainless Guide Rod & Spring', specs: ['Single spring', 'Gen3 slides', 'Stainless rod'], attrs: { rsa: 'gen3' },
      offers: [['BRN', 39.99]], pick: pick('value', 'Pick the spring weight for your 10mm loads.') },
    { id: 'gl-rsa-g4', brand: 'Glock', name: 'G20/G21 Gen4 Recoil Spring Assembly (OEM)', specs: ['Dual spring', 'Gen4 slides'], attrs: { rsa: 'gen4' }, mpn: '30077',
      offers: [['GS', 22.95]], pick: pick('premium', 'The factory dual spring for Gen4 slides.') },
  ]),
  // Large-frame slides take their own sight models (Trijicon GL604, not the 9mm GL01).
  ...parts('sights', [
    { id: 'gl-sight-oem', brand: 'Glock', name: 'OEM Polymer Sights', specs: ['Standard height', 'U-notch rear'], attrs: { height: 'standard' },
      offers: [['GS', 9.99]], pick: pick('budget', 'Factory sights. Fine to start, easy to replace.') },
    { id: 'gl-sight-hdxr', brand: 'Trijicon', name: 'HD XR Night Sights, Glock Large Frame', specs: ['Standard height', 'Tritium', 'Bright front'], attrs: { height: 'standard' }, mpn: 'GL604-C-600841',
      offers: [['OP', 192.0]] },
    { id: 'gl-sight-bt', brand: 'Trijicon', name: 'Bright & Tough Suppressor Night Sights, Glock Large Frame', specs: ['Suppressor height', 'Tritium'], attrs: { height: 'suppressor' }, mpn: 'GL204-C-600689',
      offers: [['OP', 121.52]], pick: pick('value', 'Tall enough to co-witness with a dot and clear a suppressor.') },
  ]),
  ...parts('optic', [
    { id: 'gl-opt-507c', brand: 'Holosun', name: 'HS507C X2', specs: ['RMR footprint', 'Multi-reticle', 'Solar'], attrs: { footprint: 'rmr' },
      offers: [['PA', 299.99], ['OP', 309.99]], pick: pick('value', 'Feature-rich and reliable at half the price of an RMR.') },
    { id: 'gl-opt-rmr', brand: 'Trijicon', name: 'RMR Type 2, 3.25 MOA', specs: ['RMR footprint', 'Duty-grade'], attrs: { footprint: 'rmr' },
      offers: [['BRN', 449.99], ['OP', 439.99]], pick: pick('premium', 'Holds up to full-power 10mm recoil.') },
    { id: 'gl-opt-sro', brand: 'Trijicon', name: 'SRO 2.5 MOA', specs: ['RMR footprint', 'Large window'], attrs: { footprint: 'rmr' },
      offers: [['BRN', 549.99], ['OP', 539.99]] },
    { id: 'gl-opt-acro', brand: 'Aimpoint', name: 'Acro P-2', specs: ['Acro footprint', 'Enclosed emitter'], attrs: { footprint: 'acro' },
      offers: [['BRN', 519.0], ['OP', 509.99]] },
    { id: 'gl-opt-407c', brand: 'Holosun', name: 'HS407C X2', specs: ['RMR footprint', '2 MOA dot', 'Solar'], attrs: { footprint: 'rmr' },
      offers: [['PA', 249.99], ['OP', 254.99]] },
  ]),
  ...parts('muzzle', [
    { id: 'gl-mz-tp916', brand: 'Lone Wolf', name: 'Thread Protector, 9/16x24', specs: ['9/16x24', 'Thread protector'], attrs: { thread: '9/16x24', kind: 'protector' },
      offers: [['BRN', 14.99]] },
    { id: 'gl-mz-tp578', brand: 'Lone Wolf', name: 'Thread Protector, .578x28', specs: ['.578x28', 'Thread protector'], attrs: { thread: '.578x28', kind: 'protector' },
      offers: [['BRN', 14.99]] },
  ]),
  // Magazine prices: https://gunmagwarehouse.com/magfinder/glock-20 and /glock-21
  ...parts('mag', [
    { id: 'gl-mag-20', brand: 'Glock', name: 'G20 15-Round Magazine (OEM)', specs: ['10mm', '15 rd', 'Flush'], attrs: { cal: '10mm', ext: false },
      offers: [['PA', 24.99]], pick: pick('value', 'Factory 10mm mag, flush with the grip.') },
    { id: 'gl-mag-20-10', brand: 'Glock', name: 'G20 10-Round Magazine (OEM)', specs: ['10mm', '10 rd', 'Flush'], attrs: { cal: '10mm', ext: false },
      offers: [['PA', 21.99]] },
    { id: 'gl-mag-20ets', brand: 'ETS', name: 'G20 15-Round Magazine', specs: ['10mm', '15 rd', 'Flush', 'Translucent'], attrs: { cal: '10mm', ext: false },
      offers: [['PA', 10.49]], pick: pick('budget', 'See-through body shows your round count.') },
    { id: 'gl-mag-20ets20', brand: 'ETS', name: 'G20 20-Round Magazine', specs: ['10mm', '20 rd', 'Extended'], attrs: { cal: '10mm', ext: true },
      offers: [['PA', 12.99]] },
    { id: 'gl-mag-21', brand: 'Glock', name: 'G21 13-Round Magazine (OEM)', specs: ['.45 ACP', '13 rd', 'Flush'], attrs: { cal: '45', ext: false },
      offers: [['PA', 25.99]], pick: pick('premium', 'Factory .45 mag, flush with the grip.') },
    { id: 'gl-mag-21-10', brand: 'Glock', name: 'G21 10-Round Magazine (OEM)', specs: ['.45 ACP', '10 rd', 'Flush'], attrs: { cal: '45', ext: false },
      offers: [['PA', 22.99]] },
    { id: 'gl-mag-21ets', brand: 'ETS', name: 'G21 13-Round Magazine', specs: ['.45 ACP', '13 rd', 'Flush', 'Translucent'], attrs: { cal: '45', ext: false },
      offers: [['PA', 10.99]] },
    { id: 'gl-mag-21ets18', brand: 'ETS', name: 'G21 18-Round Magazine', specs: ['.45 ACP', '18 rd', 'Extended'], attrs: { cal: '45', ext: true },
      offers: [['PA', 12.49]] },
  ]),
];

function rules(b: Build): Issue[] {
  const out: Issue[] = [];
  const { frame, slide, barrel, rsa, sights, optic, muzzle, mag } = b;
  const thread = threadIssue(barrel, muzzle);
  if (thread) out.push(thread);
  if (frame && slide && frame.attrs.gen === 'gen3' && slide.attrs.gen === 'gen4')
    out.push({ severity: 'error', slots: ['frame', 'slide'], message: 'A Gen4 slide doesn\'t fit a Gen3 frame without cutting the frame for the dual recoil spring.' });
  else if (frame && slide && frame.attrs.gen === 'gen4' && slide.attrs.gen === 'gen3')
    out.push({ severity: 'info', slots: ['frame', 'slide'], message: 'A Gen3 slide fits a Gen4 frame and uses the Gen3 single-spring recoil assembly.' });
  if (slide && barrel && barrel.attrs.cal !== slide.attrs.cal)
    out.push({ severity: 'error', slots: ['slide', 'barrel'], message: `This barrel is made for a ${MODEL[barrel.attrs.cal as string]} slide, not a ${CAL[slide.attrs.cal as string]} slide.` });
  if (barrel?.attrs.fires === '40')
    out.push({ severity: 'info', slots: ['barrel', 'mag'], message: 'The conversion barrel fires .40 S&W from your G20 magazines. Feeding is usually fine; recoil springs tuned for full-power 10mm can be stiff for .40.' });
  if (slide && rsa && rsa.attrs.rsa !== slide.attrs.rsa)
    out.push({ severity: 'error', slots: ['slide', 'rsa'], message: `This slide takes the ${RSA_LABEL[slide.attrs.rsa as string]} recoil assembly; this one is ${RSA_LABEL[rsa.attrs.rsa as string]}.` });
  if (slide && mag && mag.attrs.cal !== slide.attrs.cal)
    out.push({ severity: 'error', slots: ['slide', 'mag'], message: `A ${CAL[slide.attrs.cal as string]} slide needs ${MODEL[slide.attrs.cal as string]} magazines; this is a ${CAL[mag.attrs.cal as string]} magazine. They fit the same frame but feed different cartridges.` });
  else if (mag?.attrs.ext)
    out.push({ severity: 'info', slots: ['mag'], message: 'This magazine sticks out below the grip. It works and adds capacity.' });
  if (slide && optic) {
    const cut = slide.attrs.cut, fp = optic.attrs.footprint;
    if (cut === 'none')
      out.push({ severity: 'error', slots: ['slide', 'optic'], message: 'This slide has no optic cut. Choose a MOS or optic-cut slide, or skip the optic.' });
    else if (cut === 'mos')
      out.push({ severity: 'warn', slots: ['slide', 'optic'], message: `10mm and .45 MOS slides take Glock's large-frame MOS plates, not the 9mm set. Get the large-frame plate for the ${String(fp).toUpperCase()} footprint${fp === 'acro' ? ' (Aimpoint sells its own MOS plate for the Acro)' : ''}.` });
    else if (cut !== 'mos' && cut !== fp)
      out.push({ severity: 'warn', slots: ['slide', 'optic'], message: `The slide is cut for the ${String(cut).toUpperCase()} footprint and this optic uses ${String(fp).toUpperCase()}. You need an adapter plate.` });
  }
  out.push(...sightHeightIssues(sights, optic, !!barrel?.attrs.threaded && { slot: 'barrel' }));
  if (barrel?.attrs.threaded && !muzzle)
    out.push({ severity: 'info', slots: ['barrel', 'muzzle'], message: `The ${barrel.attrs.thread} threads stick out past the slide with nothing on them. Add a thread protector to keep them from getting dinged.` });
  if (b.fcg && frame && (b.fcg.attrs.gens as string[] | undefined) && !(b.fcg.attrs.gens as string[]).includes(frame.attrs.gen as string))
    out.push({ severity: 'warn', slots: ['fcg', 'frame'], message: `${b.fcg.brand} lists this trigger for ${(b.fcg.attrs.gens as string[]).map((g) => GEN[g]).join(' and ')} frames. Check with them before using it in a ${GEN[frame.attrs.gen as string]} frame.` });
  // Every Gen3 and Gen4 G20/G21 frame has the Glock accessory rail.
  const cal = slide?.attrs.cal as string | undefined;
  out.push(...pistolAddonRules(b, 'glock', 'frame', cal && MODEL[cal].toLowerCase(), cal ? `Glock ${MODEL[cal].slice(1)}` : 'Glock 20 / 21'));
  return out;
}

export const glockLarge: Platform = {
  id: 'glock20',
  name: 'Glock 20 / 21',
  family: 'Pistol',
  maker: 'Glock',
  blurb: 'Large-frame Glock in 10mm (G20) or .45 ACP (G21). Same size, caliber-specific frame, slide, barrel and mags.',
  slots,
  parts: [...allParts, ...pistolLights.filter((l) => (l.attrs.rails as string[]).includes('glock')),
    ...holsters('gl', [['g20', 'Glock 20'], ['g21', 'Glock 21']], ['tlr7a', 'x300']), ...pistolCases],
  rules,
  // A factory Glock 20 Gen4.
  base: ['gl-frame-g4', 'gl-fcg-oem', 'gl-slide-20g4', 'gl-spk-oem', 'gl-bbl-20oem', 'gl-rsa-g4', 'gl-sight-oem', 'gl-mag-20'],
  presets: {
    budget: ['gl-frame-lw', 'gl-fcg-oem', 'gl-slide-20g3', 'gl-spk-lw', 'gl-bbl-20lwd', 'gl-rsa-g3', 'gl-sight-oem', 'gl-mag-20ets'],
    value: ['gl-frame-sf', 'gl-fcg-ow', 'gl-slide-20brn', 'gl-spk-oem', 'gl-bbl-20lw', 'gl-rsa-ismi', 'gl-sight-bt', 'gl-opt-507c', 'gl-mag-20'],
    premium: ['gl-frame-g4', 'gl-fcg-ow', 'gl-slide-20mos', 'gl-spk-oem', 'gl-bbl-20lwt', 'gl-rsa-g4', 'gl-sight-bt', 'gl-opt-rmr', 'gl-mz-tp916', 'gl-mag-20'],
  },
};
