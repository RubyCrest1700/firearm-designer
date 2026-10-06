import type { Build, Issue, Part, Platform } from '../types';
import { parts, pick } from './helpers';
import { holsters, pistolAddonRules, pistolAddonSlots, pistolCases, pistolLights } from './addons';

/**
 * 1911 (single stack) and 2011 (double stack), each started from a complete factory pistol, the way nearly every
 * 1911 is upgraded. 1911 parts are made to a common pattern but are built slightly oversize on purpose, so most
 * of them (barrels, safeties, grip safeties, hammers) are hand-fitted. Rules here check what must match exactly:
 * slide length, caliber, sight dovetail, and the Kimber Series II firing pin block. The 2011s share the 1911's
 * lockwork but run double-stack magazines in a grip module, and the optic plate system is each maker's own.
 * Sources: https://www.springfield-armory.com/1911-series-handguns/, https://ruger.com/products/sr1911/,
 * https://www.colt.com/, https://www.kimberamerica.com/, https://staccato2011.com/, https://www.dawsonprecision.com/
 */

const SIZE: Record<string, string> = { gov: 'Government (5")', cmd: 'Commander (4.25")' };
const CUT: Record<string, string> = { gi: 'GI', novak: 'Novak', kimber: 'Kimber', adj: 'adjustable-sight', staccato: 'Staccato', prodigy: 'Prodigy', bul: 'Bul SAS II', girsan: 'Girsan' };

/* ===================================================================== 1911 */

const slots1911 = [
  { id: 'pistol', name: 'Base pistol', group: 'Core', required: true, hint: 'Serialized. Upgrades swap into a factory 1911.' },
  { id: 'barrel', name: 'Upgrade barrel', group: 'Upper', required: false, hint: 'Optional. Made for one slide length and caliber; most need fitting.' },
  { id: 'spring', name: 'Recoil spring', group: 'Upper', required: false, hint: 'Optional. Government and Commander springs differ in length.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: false, hint: 'Optional. Must match the slide\'s dovetail cut.' },
  { id: 'grips', name: 'Grip panels', group: 'Lower', required: false, hint: 'Optional. Full-size panels fit Government and Commander frames.' },
  { id: 'trigger', name: 'Trigger', group: 'Lower', required: false, hint: 'Optional. Sold in short, medium and long lengths.' },
  { id: 'hammer', name: 'Hammer and sear', group: 'Lower', required: false, hint: 'Optional. A matched set for a crisper pull.' },
  { id: 'safety', name: 'Thumb safety', group: 'Lower', required: false, hint: 'Optional. Extended or ambidextrous; fitted to the sear.' },
  { id: 'gripsafety', name: 'Grip safety', group: 'Lower', required: false, hint: 'Optional. A beavertail needs a frame cut to match.' },
  { id: 'magwell', name: 'Magwell', group: 'Lower', required: false, hint: 'Optional. Replaces the mainspring housing.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Single stack, by caliber.' },
  ...pistolAddonSlots.filter((s) => s.id !== 'light'),
];

/** Factory part weights inside a full-size steel 1911, so upgrades swap weight rather than add it. */
const W = { w_spring: 0.6, w_grips: 1.8, w_sights: 0.2, w_trigger: 0.4, w_hammer: 0.7, w_safety: 0.3, w_gripsafety: 0.7, w_magwell: 1.6 };

const pistols1911 = parts('pistol', [
  { id: 'm11-tisas-a1', brand: 'Tisas', name: '1911 A1 US Army', specs: ['.45 ACP', '5" barrel', 'GI parts', '7+1'],
    attrs: { size: 'gov', cal: '45', sight: 'gi', tang: 'gi', hammer: 'spur', safety: 'gi', series: '70', ...W, w_barrel: 4.6 }, serialized: true,
    offers: [['BRN', 399.99], ['PSA', 389.99]], pick: pick('budget', 'A faithful GI 1911 at the lowest price; the classic starting point for upgrades.') },
  { id: 'm11-ria-gifs', brand: 'Rock Island Armory', name: 'GI Standard FS', specs: ['.45 ACP', '5" barrel', 'GI parts', '8+1'],
    attrs: { size: 'gov', cal: '45', sight: 'gi', tang: 'gi', hammer: 'spur', safety: 'gi', series: '70', ...W, w_barrel: 4.6 }, serialized: true,
    offers: [['BRN', 449.99], ['PSA', 429.99]] },
  { id: 'm11-ria-gims', brand: 'Rock Island Armory', name: 'GI Standard MS', specs: ['.45 ACP', '4.25" barrel', 'Commander size', '8+1'],
    attrs: { size: 'cmd', cal: '45', sight: 'gi', tang: 'gi', hammer: 'spur', safety: 'gi', series: '70', ...W, w_barrel: 4.0 }, serialized: true,
    offers: [['BRN', 449.99]] },
  { id: 'm11-colt-s70', brand: 'Colt', name: 'Government Series 70', specs: ['.45 ACP', '5" barrel', 'Walnut grips', '7+1'],
    attrs: { size: 'gov', cal: '45', sight: 'gi', tang: 'gi', hammer: 'spur', safety: 'gi', series: '70', sightUnconfirmed: true, ...W, w_barrel: 4.6 }, serialized: true,
    offers: [['BRN', 999.99]] },
  { id: 'm11-sa-garrison', brand: 'Springfield Armory', name: 'Garrison 1911 5"', specs: ['.45 ACP', '5" barrel', 'Beavertail', '7+1'],
    attrs: { size: 'gov', cal: '45', sight: 'novak', tang: 'beaver', hammer: 'ring', safety: 'ext', series: '70', sightUnconfirmed: true, ...W, w_barrel: 4.6 }, serialized: true,
    offers: [['BRN', 799.99]] },
  { id: 'm11-sa-garrison9', brand: 'Springfield Armory', name: 'Garrison 1911 5", 9mm', specs: ['9mm', '5" barrel', 'Beavertail', '9+1'],
    attrs: { size: 'gov', cal: '9', sight: 'novak', tang: 'beaver', hammer: 'ring', safety: 'ext', series: '70', sightUnconfirmed: true, ...W, w_barrel: 5.0 }, serialized: true,
    offers: [['BRN', 799.99]] },
  { id: 'm11-ruger-gov', brand: 'Ruger', name: 'SR1911 Government', specs: ['.45 ACP', '5" barrel', 'Novak 3-dot sights', '8+1'],
    attrs: { size: 'gov', cal: '45', sight: 'novak', tang: 'beaver', hammer: 'ring', safety: 'ext', series: '70', ...W, w_barrel: 4.6 }, serialized: true,
    offers: [['BRN', 899.99]], pick: pick('value', 'Beavertail, extended safety and Novak sights from the factory, so the money goes to real upgrades.') },
  { id: 'm11-ruger-cmd', brand: 'Ruger', name: 'SR1911 Commander', specs: ['.45 ACP', '4.25" barrel', 'Novak 3-dot sights', '7+1'],
    attrs: { size: 'cmd', cal: '45', sight: 'novak', tang: 'beaver', hammer: 'ring', safety: 'ext', series: '70', ...W, w_barrel: 4.0 }, serialized: true,
    offers: [['BRN', 899.99]] },
  { id: 'm11-kimber-c2', brand: 'Kimber', name: 'Custom II', specs: ['.45 ACP', '5" barrel', 'Series II firing pin block', '7+1'],
    attrs: { size: 'gov', cal: '45', sight: 'kimber', tang: 'beaver', hammer: 'ring', safety: 'ext', series: 'kimber2', ...W, w_barrel: 4.6 }, serialized: true,
    offers: [['BRN', 849.99]] },
  { id: 'm11-dw-heritage', brand: 'Dan Wesson', name: 'Heritage', specs: ['.45 ACP', '5" barrel', 'Adjustable rear sight', '8+1'],
    attrs: { size: 'gov', cal: '45', sight: 'adj', tang: 'beaver', hammer: 'ring', safety: 'ext', series: '70', ...W, w_barrel: 4.6 }, serialized: true,
    offers: [['BRN', 1399.99]], pick: pick('premium', 'A hand-fitted forged 1911 that is already match grade out of the box.') },
]);

const parts1911: Part[] = [
  ...pistols1911,
  ...parts('barrel', [
    { id: 'm11-bbl-kart45', brand: 'Kart', name: 'National Match Easy Fit Barrel, .45 Government', specs: ['.45 ACP', '5"', 'Match grade', 'Minimal fitting'],
      attrs: { size: 'gov', cal: '45', fit: 'easy', threaded: false }, offers: [['BRN', 239.99]], pick: pick('premium', 'Match accuracy with fitting most owners can do at home.') },
    { id: 'm11-bbl-wc45', brand: 'Wilson Combat', name: 'Bullet Proof Match Barrel, .45 Government', specs: ['.45 ACP', '5"', 'Match grade', 'Gunsmith fit'],
      attrs: { size: 'gov', cal: '45', fit: 'smith', threaded: false }, offers: [['BRN', 299.95]] },
    { id: 'm11-bbl-sl45t', brand: 'Storm Lake', name: '1911 Threaded Barrel, .45 Government', specs: ['.45 ACP', '5.6"', 'Threaded .578x28', 'Drop-in'],
      attrs: { size: 'gov', cal: '45', fit: 'drop', threaded: true, thread: '.578x28' }, offers: [['BRN', 249.99]] },
    { id: 'm11-bbl-wc45c', brand: 'Wilson Combat', name: 'Bullet Proof Match Barrel, .45 Commander', specs: ['.45 ACP', '4.25"', 'Match grade', 'Gunsmith fit'],
      attrs: { size: 'cmd', cal: '45', fit: 'smith', threaded: false }, offers: [['BRN', 299.95]] },
    { id: 'm11-bbl-kart9', brand: 'Kart', name: 'National Match Easy Fit Barrel, 9mm Government', specs: ['9mm', '5"', 'Match grade', 'Minimal fitting'],
      attrs: { size: 'gov', cal: '9', fit: 'easy', threaded: false }, offers: [['BRN', 239.99]] },
    { id: 'm11-bbl-sl9t', brand: 'Storm Lake', name: '1911 Threaded Barrel, 9mm Government', specs: ['9mm', '5.6"', 'Threaded 1/2x28', 'Drop-in'],
      attrs: { size: 'gov', cal: '9', fit: 'drop', threaded: true, thread: '1/2x28' }, offers: [['BRN', 249.99]] },
  ]),
  ...parts('spring', [
    { id: 'm11-spr-wolffg', brand: 'Wolff', name: 'Recoil Spring, 1911 Government', specs: ['Government length', 'Choice of weights'], attrs: { size: 'gov', rod: false },
      offers: [['BRN', 9.99]] },
    { id: 'm11-spr-wolffc', brand: 'Wolff', name: 'Recoil Spring, 1911 Commander', specs: ['Commander length', 'Choice of weights'], attrs: { size: 'cmd', rod: false },
      offers: [['BRN', 9.99]] },
    { id: 'm11-spr-wcrod', brand: 'Wilson Combat', name: 'Full-Length Guide Rod and Spring, Government', specs: ['Government length', 'Full-length rod', 'Two-piece'], attrs: { size: 'gov', rod: true },
      offers: [['BRN', 54.95]] },
  ]),
  ...parts('sights', [
    { id: 'm11-sgt-tribt', brand: 'Trijicon', name: 'Bright & Tough Night Sights, 1911 Novak Cut', specs: ['Novak dovetail', 'Tritium 3-dot'], attrs: { cut: 'novak', height: 'standard', kind: 'novak' },
      offers: [['BRN', 119.0], ['OP', 124.99]], pick: pick('value', 'Glowing night sights that drop into the Novak cut.') },
    { id: 'm11-sgt-novak', brand: 'Novak', name: 'LoMount 3-Dot Sights, 1911', specs: ['Novak dovetail', 'White 3-dot'], attrs: { cut: 'novak', height: 'standard', kind: 'novak' },
      offers: [['BRN', 89.99]] },
    { id: 'm11-sgt-dawson', brand: 'Dawson Precision', name: 'Fiber Optic Front and Black Rear, 1911 Novak Cut', specs: ['Novak dovetail', 'Fiber optic front'], attrs: { cut: 'novak', height: 'standard', kind: 'novak' },
      offers: [['BRN', 109.95]] },
    { id: 'm11-sgt-nf', brand: 'Night Fision', name: 'Tall Night Sights, 1911 Novak Cut', specs: ['Novak dovetail', 'Suppressor height', 'Tritium'], attrs: { cut: 'novak', height: 'suppressor', kind: 'novak' },
      offers: [['OP', 149.99]] },
  ]),
  ...parts('grips', [
    { id: 'm11-grp-vzrecon', brand: 'VZ Grips', name: 'Recon G10, 1911 Full Size', specs: ['G10', 'Ambi safety cut'], attrs: { ambi: true, kind: 'g10' },
      offers: [['BRN', 89.99]], pick: pick('premium', 'Grippy G10 that won\'t shift in the hand.') },
    { id: 'm11-grp-vzop', brand: 'VZ Grips', name: 'Operator II G10, 1911 Full Size', specs: ['G10', 'Solid, no ambi cut'], attrs: { ambi: false, kind: 'g10' },
      offers: [['BRN', 89.99]] },
    { id: 'm11-grp-magpul', brand: 'Magpul', name: 'MOE 1911 Grip Panels', specs: ['Polymer', 'Ambi safety cut', 'Textured'], attrs: { ambi: true, kind: 'moe' },
      offers: [['BRN', 21.95], ['MAGPUL', 21.95]], pick: pick('value', 'Inexpensive, textured and cut for an ambi safety.') },
    { id: 'm11-grp-hogue', brand: 'Hogue', name: 'Wraparound Rubber Grip, 1911 Government', specs: ['Rubber', 'Finger grooves', 'Covers the front strap'], attrs: { ambi: true, kind: 'wrap' },
      offers: [['BRN', 24.95]] },
    { id: 'm11-grp-altamont', brand: 'Altamont', name: 'Checkered Walnut Grips, 1911 Full Size', specs: ['Walnut', 'Double diamond', 'Ambi safety cut'], attrs: { ambi: true, kind: 'wood' },
      offers: [['BRN', 44.99]] },
    { id: 'm11-grp-lok', brand: 'LOK Grips', name: 'Bootleg G10, 1911 Full Size', specs: ['G10', 'Ambi safety cut'], attrs: { ambi: true, kind: 'g10' },
      offers: [['BRN', 74.95]] },
  ]),
  ...parts('trigger', [
    { id: 'm11-trg-wcul', brand: 'Wilson Combat', name: 'Ultralight Trigger, Medium', specs: ['Medium length', 'Aluminum shoe', 'Adjustable overtravel'], attrs: { len: 'medium' },
      offers: [['BRN', 54.95]], pick: pick('value', 'Light, crisp and adjustable for overtravel.') },
    { id: 'm11-trg-eb', brand: 'Ed Brown', name: 'Trigger, Long, 3-Hole', specs: ['Long length', 'Aluminum shoe', 'Adjustable overtravel'], attrs: { len: 'long' },
      offers: [['BRN', 49.95]] },
  ]),
  ...parts('hammer', [
    { id: 'm11-ham-wcbp', brand: 'Wilson Combat', name: 'Bullet Proof Hammer, Sear and Disconnector', specs: ['Commander-style hammer', 'Tool steel', 'For Series 70 lockwork'], attrs: { series: '70' },
      offers: [['BRN', 164.95]], pick: pick('premium', 'The matched set behind a crisp 3.5 lb match pull.') },
    { id: 'm11-ham-eb', brand: 'Ed Brown', name: 'Hardcore Hammer and Sear Set', specs: ['Commander-style hammer', 'Tool steel', 'For Series 70 lockwork'], attrs: { series: '70' },
      offers: [['BRN', 109.95]] },
  ]),
  ...parts('safety', [
    { id: 'm11-saf-wcext', brand: 'Wilson Combat', name: 'Bullet Proof Thumb Safety, Extended', specs: ['Extended pad', 'Single side'], attrs: { ambi: false },
      offers: [['BRN', 59.95]] },
    { id: 'm11-saf-ebambi', brand: 'Ed Brown', name: 'Ambidextrous Thumb Safety', specs: ['Extended pad', 'Ambidextrous'], attrs: { ambi: true },
      offers: [['BRN', 99.95]] },
    { id: 'm11-saf-wcambi', brand: 'Wilson Combat', name: 'Bullet Proof Ambidextrous Thumb Safety', specs: ['Extended pad', 'Ambidextrous'], attrs: { ambi: true },
      offers: [['BRN', 119.95]], pick: pick('premium', 'Works from either hand; pairs with ambi-cut grips.') },
  ]),
  ...parts('gripsafety', [
    { id: 'm11-gs-ebmg', brand: 'Ed Brown', name: 'Memory Groove Beavertail Grip Safety', specs: ['Beavertail', 'Memory bump', '.250" radius'], attrs: { kind: 'beaver' },
      offers: [['BRN', 74.95]], pick: pick('premium', 'Lets the hand ride high without hammer bite.') },
    { id: 'm11-gs-wchr', brand: 'Wilson Combat', name: 'High-Ride Beavertail Grip Safety', specs: ['Beavertail', 'Memory bump', '.220" radius'], attrs: { kind: 'beaver' },
      offers: [['BRN', 64.95]] },
  ]),
  ...parts('magwell', [
    { id: 'm11-mw-wcsc', brand: 'Wilson Combat', name: 'Speed-Chute Magwell and Mainspring Housing', specs: ['Flat, checkered', 'Flared magwell', 'Government and Commander frames'], attrs: { kind: 'well' },
      offers: [['BRN', 109.95]], pick: pick('premium', 'Funnels the magazine in on fast reloads.') },
    { id: 'm11-mw-sa', brand: 'Smith & Alexander', name: 'Flat Mainspring Housing Magwell', specs: ['Flat', 'Flared magwell', 'Government and Commander frames'], attrs: { kind: 'well' },
      offers: [['BRN', 89.99]] },
    { id: 'm11-mw-wcmsh', brand: 'Wilson Combat', name: 'Flat Mainspring Housing, Checkered', specs: ['Flat', 'No magwell', 'Government and Commander frames'], attrs: { kind: 'flat' },
      offers: [['BRN', 49.95]] },
  ]),
  ...parts('mag', [
    { id: 'm11-mag-wc47d', brand: 'Wilson Combat', name: '47D Magazine, .45 ACP 8-Round', specs: ['.45 ACP', '8 rd', 'Base pad'], attrs: { cal: '45', pad: true },
      offers: [['BRN', 39.95]], pick: pick('value', 'The standard for reliable 1911 feeding.') },
    { id: 'm11-mag-cmc', brand: 'Chip McCormick', name: 'Power Mag, .45 ACP 8-Round', specs: ['.45 ACP', '8 rd'], attrs: { cal: '45', pad: false },
      offers: [['BRN', 34.99]] },
    { id: 'm11-mag-mg45', brand: 'Mec-Gar', name: '1911 Magazine, .45 ACP 8-Round', specs: ['.45 ACP', '8 rd', 'Flush'], attrs: { cal: '45', pad: false },
      offers: [['BRN', 29.99]], pick: pick('budget', 'Reliable and inexpensive spare magazine.') },
    { id: 'm11-mag-mg9', brand: 'Mec-Gar', name: '1911 Magazine, 9mm 9-Round', specs: ['9mm', '9 rd', 'Flush'], attrs: { cal: '9', pad: false },
      offers: [['BRN', 34.99]] },
    { id: 'm11-mag-wc9', brand: 'Wilson Combat', name: 'Elite Tactical Magazine, 9mm 10-Round', specs: ['9mm', '10 rd', 'Base pad'], attrs: { cal: '9', pad: true },
      offers: [['BRN', 44.95]] },
  ]),
];

const own = (b: Build, slot: string): Part | undefined => b[slot] ?? b.pistol;

function rules1911(b: Build): Issue[] {
  const out: Issue[] = [];
  const { pistol, barrel, spring, sights, grips, safety, gripsafety, hammer, mag } = b;
  const size = pistol?.attrs.size as string | undefined;
  const cal = pistol?.attrs.cal as string | undefined;
  const calName = (c: unknown) => (c === '9' ? '9mm' : '.45 ACP');
  if (barrel && size && barrel.attrs.size !== size)
    out.push({ severity: 'error', slots: ['barrel', 'pistol'], message: `This barrel is made for the ${SIZE[barrel.attrs.size as string]} slide; this pistol has the ${SIZE[size]} slide.` });
  if (barrel && cal && barrel.attrs.cal !== cal)
    out.push({ severity: 'error', slots: ['barrel', 'pistol'], message: `This barrel is chambered in ${calName(barrel.attrs.cal)}; this pistol is ${calName(cal)}. Changing caliber also takes a new magazine, extractor and ejector.` });
  if (barrel?.attrs.fit === 'smith')
    out.push({ severity: 'info', slots: ['barrel'], message: 'This barrel is made oversize to be fitted to the slide and bushing. Plan on a gunsmith.' });
  else if (barrel?.attrs.fit === 'easy')
    out.push({ severity: 'info', slots: ['barrel'], message: 'Easy Fit barrels need light fitting of the lower lugs, which most owners can do with a file.' });
  if (barrel?.attrs.threaded && sights?.attrs.height !== 'suppressor')
    out.push({ severity: 'info', slots: ['barrel', 'sights'], message: 'A suppressor will block standard-height sights. Suppressor-height sights see over it.' });
  if (spring && size && spring.attrs.size !== size)
    out.push({ severity: 'error', slots: ['spring', 'pistol'], message: `This recoil spring is made for the ${SIZE[spring.attrs.size as string]} slide; this pistol has the ${SIZE[size]} slide.` });
  if (sights && pistol) {
    const cut = pistol.attrs.sight as string;
    if (sights.attrs.cut !== cut)
      out.push({ severity: 'error', slots: ['sights', 'pistol'], message: `These sights are made for the ${CUT[sights.attrs.cut as string]} dovetail; this slide is cut for ${CUT[cut]} sights.${cut === 'gi' ? ' A gunsmith can recut a GI slide for Novak sights.' : ''}` });
    else if (pistol.attrs.sightUnconfirmed)
      out.push({ severity: 'warn', slots: ['sights', 'pistol'], message: `We couldn't confirm the rear sight dovetail on the ${pistol.brand} ${pistol.name}. Check it with the maker before ordering sights.` });
  }
  const ambi = !!own(b, 'safety')?.attrs.ambi && !!safety;
  if (ambi && grips && !grips.attrs.ambi)
    out.push({ severity: 'warn', slots: ['grips', 'safety'], message: 'These grips aren\'t relieved for an ambidextrous safety; the right-side lever will sit on top of the panel. Choose an ambi-cut version.' });
  if (ambi && !grips)
    out.push({ severity: 'info', slots: ['safety', 'pistol'], message: 'Factory grips may not be relieved for the ambi safety\'s right-side lever. Check yours or add ambi-cut grips.' });
  if (gripsafety && pistol?.attrs.tang === 'gi')
    out.push({ severity: 'warn', slots: ['gripsafety', 'pistol'], message: 'This frame has the short GI tang. A beavertail needs the frame cut to its radius, which is gunsmith work.' });
  else if (gripsafety && pistol)
    out.push({ severity: 'info', slots: ['gripsafety'], message: 'Beavertails come in .220" and .250" radius cuts. Match the frame\'s cut or plan on fitting.' });
  if (gripsafety && pistol?.attrs.hammer === 'spur' && !hammer)
    out.push({ severity: 'warn', slots: ['gripsafety', 'hammer'], message: 'The factory spur hammer can strike a beavertail when the gun cycles. Pair it with a Commander-style hammer.' });
  if (pistol?.attrs.series === 'kimber2') {
    if (gripsafety)
      out.push({ severity: 'error', slots: ['gripsafety', 'pistol'], message: 'Kimber Series II pistols release their firing pin block through the grip safety. A standard grip safety leaves the block engaged and the pistol won\'t fire; use Kimber\'s own.' });
    if (hammer)
      out.push({ severity: 'warn', slots: ['hammer', 'pistol'], message: 'This set is made for Series 70 lockwork. Kimber Series II parts differ; check with the maker before fitting it.' });
  }
  if (mag && cal && mag.attrs.cal !== cal)
    out.push({ severity: 'error', slots: ['mag', 'pistol'], message: `This magazine is ${calName(mag.attrs.cal)}; this pistol is ${calName(cal)}.` });
  if ([b.trigger, hammer, safety, gripsafety].filter(Boolean).length)
    out.push({ severity: 'info', slots: ['trigger', 'hammer', 'safety', 'gripsafety'].filter((s) => b[s]), message: '1911 lockwork parts are made to be hand-fitted. Have a gunsmith check the sear, safety and grip safety engagement after installing them.' });
  out.push(...pistolAddonRules(b, undefined, 'pistol', size, size ? `1911 ${SIZE[size]}` : '1911'));
  return out;
}

export const m1911: Platform = {
  id: 'm1911',
  name: '1911',
  family: 'Pistol',
  maker: '1911 Platform',
  blurb: 'The classic single-stack .45 or 9mm. Start from a factory 1911 and fit match parts to it.',
  slots: slots1911,
  parts: [...parts1911, ...holsters('m11', [['gov', '1911 Government 5"'], ['cmd', '1911 Commander 4.25"']], []), ...pistolCases],
  rules: rules1911,
  presets: {
    budget: ['m11-tisas-a1', 'm11-mag-mg45'],
    value: ['m11-ruger-gov', 'm11-grp-magpul', 'm11-trg-wcul', 'm11-sgt-tribt', 'm11-mag-wc47d'],
    premium: ['m11-dw-heritage', 'm11-bbl-kart45', 'm11-grp-vzrecon', 'm11-ham-wcbp', 'm11-saf-wcambi', 'm11-mw-wcsc', 'm11-mag-wc47d'],
  },
};

/* ===================================================================== 2011 */

const slots2011 = [
  { id: 'pistol', name: 'Base pistol', group: 'Core', required: true, hint: 'Serialized. 2011s are sold complete; the rest are upgrades.' },
  { id: 'sights', name: 'Sights', group: 'Upper', required: false, hint: 'Optional. Each maker cuts its own dovetail.' },
  { id: 'optic', name: 'Optic', group: 'Accessories', required: false, hint: 'Mounts with the maker\'s plate for that footprint.' },
  { id: 'magwell', name: 'Magwell', group: 'Lower', required: false, hint: 'Optional. Made for one grip module.' },
  { id: 'mag', name: 'Magazine', group: 'Accessories', required: false, hint: 'Double stack, 2011 pattern.' },
  ...pistolAddonSlots,
];

/** Factory weights inside the pistol. */
const W2 = { w_sights: 0.3, w_magwell: 1.2 };

const parts2011: Part[] = [
  ...parts('pistol', [
    { id: 'm21-prodigy5', brand: 'Springfield Armory', name: 'Prodigy 5" AOS', specs: ['9mm', '5" bull barrel', 'AOS optic plates', '17+1 and 20+1'],
      attrs: { size: '5', grip: 'full', sight: 'prodigy', well: 'prodigy', mags: 'sti', plates: ['rmr', 'dpp', 'rms'], rail: true, comp: false, ...W2 }, serialized: true,
      offers: [['BRN', 1499.0], ['PSA', 1399.99]], pick: pick('budget', 'The least expensive way into a full-size 2011 from a major maker.') },
    { id: 'm21-prodigy425', brand: 'Springfield Armory', name: 'Prodigy 4.25" AOS', specs: ['9mm', '4.25" bull barrel', 'AOS optic plates', '17+1 and 20+1'],
      attrs: { size: '425', grip: 'full', sight: 'prodigy', well: 'prodigy', mags: 'sti', plates: ['rmr', 'dpp', 'rms'], rail: true, comp: false, ...W2 }, serialized: true,
      offers: [['BRN', 1499.0], ['PSA', 1399.99]], pick: pick('value', 'Carry-length slide on the full grip, ready for an optic.') },
    { id: 'm21-staccato-p', brand: 'Staccato', name: 'P', specs: ['9mm', '4.4" bull barrel', 'DPO optic plates', '17+1'],
      attrs: { size: '44', grip: 'full', sight: 'staccato', well: 'staccato', mags: 'sti', plates: ['rmr', 'dpp', 'acro'], rail: true, comp: false, ...W2 }, serialized: true,
      offers: [['BRN', 2499.0]], pick: pick('premium', 'The duty 2011 that police departments adopted, with optic plates for most dots.') },
    { id: 'm21-staccato-c2', brand: 'Staccato', name: 'C2', specs: ['9mm', '3.9" bull barrel', 'Short grip', '16+1'],
      attrs: { size: '39', grip: 'c2', sight: 'staccato', well: 'staccato', mags: 'sti', plates: ['rmr', 'dpp', 'acro'], rail: true, comp: false, ...W2 }, serialized: true,
      offers: [['BRN', 2299.0]] },
    { id: 'm21-staccato-xc', brand: 'Staccato', name: 'XC', specs: ['9mm', '5" barrel', 'Built-in compensator', '20+1'],
      attrs: { size: '5', grip: 'full', sight: 'staccato', well: 'staccato', mags: 'sti', plates: ['rmr', 'dpp', 'acro'], rail: true, comp: true, ...W2 }, serialized: true,
      offers: [['BRN', 3799.0]] },
    { id: 'm21-bul-sas', brand: 'Bul Armory', name: 'SAS II TAC 4.25"', specs: ['9mm', '4.25" barrel', 'Picatinny rail', '17+1'],
      attrs: { size: '425', grip: 'full', sight: 'bul', well: 'bul', mags: 'bul', plates: [], rail: true, comp: false, ...W2 }, serialized: true,
      offers: [['BRN', 1799.0]] },
    { id: 'm21-girsan', brand: 'Girsan', name: 'Witness2311', specs: ['9mm', '5" barrel', 'Picatinny rail', '17+1'],
      attrs: { size: '5', grip: 'full', sight: 'girsan', well: 'girsan', mags: 'girsan', plates: [], rail: true, comp: false, ...W2 }, serialized: true,
      offers: [['BRN', 899.99]] },
  ]),
  ...parts('sights', [
    { id: 'm21-sgt-dawsonst', brand: 'Dawson Precision', name: 'Fiber Optic Front and Charger Rear, Staccato', specs: ['Staccato dovetail', 'Fiber optic front'], attrs: { cut: 'staccato', height: 'standard', kind: 'novak' },
      offers: [['BRN', 119.95]] },
    { id: 'm21-sgt-dawsonsto', brand: 'Dawson Precision', name: 'Optic Height Sights, Staccato DPO', specs: ['Staccato dovetail', 'Co-witness height'], attrs: { cut: 'staccato', height: 'suppressor', kind: 'novak' },
      offers: [['BRN', 129.95]], pick: pick('premium', 'Tall enough to see through the dot\'s window.') },
    { id: 'm21-sgt-dawsonpr', brand: 'Dawson Precision', name: 'Fiber Optic Front and Black Rear, Springfield Prodigy', specs: ['Prodigy dovetail', 'Fiber optic front'], attrs: { cut: 'prodigy', height: 'standard', kind: 'novak' },
      offers: [['BRN', 119.95]] },
  ]),
  ...parts('optic', [
    { id: 'm21-opt-rmr', brand: 'Trijicon', name: 'RMR Type 2 3.25 MOA', specs: ['RMR footprint', 'Open emitter'], attrs: { footprint: 'rmr' },
      offers: [['OP', 449.0], ['PA', 449.0]] },
    { id: 'm21-opt-sro', brand: 'Trijicon', name: 'SRO 2.5 MOA', specs: ['RMR footprint', 'Large window'], attrs: { footprint: 'rmr' },
      offers: [['OP', 519.0], ['PA', 519.0]], pick: pick('premium', 'A big window that makes the dot fast to find.') },
    { id: 'm21-opt-507c', brand: 'Holosun', name: 'HS507C X2', specs: ['RMR footprint', 'Multi-reticle', 'Solar backup'], attrs: { footprint: 'rmr' },
      offers: [['PA', 299.99], ['OP', 309.99]], pick: pick('value', 'RMR-size dot with a circle reticle for much less money.') },
    { id: 'm21-opt-508t', brand: 'Holosun', name: 'HS508T X2', specs: ['RMR footprint', 'Titanium housing'], attrs: { footprint: 'rmr' },
      offers: [['PA', 379.99], ['OP', 389.99]] },
    { id: 'm21-opt-dpp', brand: 'Leupold', name: 'DeltaPoint Pro 2.5 MOA', specs: ['DeltaPoint Pro footprint', 'Large window'], attrs: { footprint: 'dpp' },
      offers: [['OP', 399.99]] },
    { id: 'm21-opt-acro', brand: 'Aimpoint', name: 'Acro P-2', specs: ['Acro footprint', 'Enclosed emitter'], attrs: { footprint: 'acro' },
      offers: [['OP', 599.0], ['PA', 599.0]] },
  ]),
  ...parts('magwell', [
    { id: 'm21-mw-dawsonst', brand: 'Dawson Precision', name: 'Ice Magwell, Staccato', specs: ['Aluminum', 'Wide flare', 'Staccato grip modules'], attrs: { fit: 'staccato' },
      offers: [['BRN', 149.95]], pick: pick('premium', 'A wider funnel for fast reloads.') },
    { id: 'm21-mw-dawsonpr', brand: 'Dawson Precision', name: 'Ice Magwell, Springfield Prodigy', specs: ['Aluminum', 'Wide flare', 'Prodigy grip module'], attrs: { fit: 'prodigy' },
      offers: [['BRN', 149.95]] },
  ]),
  ...parts('mag', [
    { id: 'm21-mag-st17', brand: 'Staccato', name: '2011 Magazine, 9mm 17-Round', specs: ['9mm', '17 rd', 'Flush, full grip'], attrs: { family: 'sti', rounds: 17 },
      offers: [['BRN', 59.99]], pick: pick('premium', 'Flush with a full-size 2011 grip.') },
    { id: 'm21-mag-st20', brand: 'Staccato', name: '2011 Magazine, 9mm 20-Round', specs: ['9mm', '20 rd', 'Extended'], attrs: { family: 'sti', rounds: 20 },
      offers: [['BRN', 64.99]] },
    { id: 'm21-mag-st16', brand: 'Staccato', name: '2011 Magazine, 9mm 16-Round', specs: ['9mm', '16 rd', 'Flush, C2 grip'], attrs: { family: 'sti', rounds: 16 },
      offers: [['BRN', 59.99]] },
    { id: 'm21-mag-pr17', brand: 'Springfield Armory', name: 'Prodigy Magazine, 9mm 17-Round', specs: ['9mm', '17 rd', 'Flush, full grip'], attrs: { family: 'sti', rounds: 17 },
      offers: [['BRN', 49.99]], pick: pick('value', 'Flush with the Prodigy grip.') },
    { id: 'm21-mag-pr20', brand: 'Springfield Armory', name: 'Prodigy Magazine, 9mm 20-Round', specs: ['9mm', '20 rd', 'Extended'], attrs: { family: 'sti', rounds: 20 },
      offers: [['BRN', 54.99]] },
    { id: 'm21-mag-bul', brand: 'Bul Armory', name: 'SAS II Magazine, 9mm 17-Round', specs: ['9mm', '17 rd', 'Flush'], attrs: { family: 'bul', rounds: 17 },
      offers: [['BRN', 54.99]] },
  ]),
];

/** Holster size: the 5" slides, and the 4.25" to 4.4" slides together. */
const HOLSTER: Record<string, string> = { '5': '5', '425': '44', '44': '44', '39': '39' };
const HOLSTER_LABEL: Record<string, string> = { '5': '2011 5"', '44': '2011 4.25" to 4.4"', '39': '2011 3.9"' };

function rules2011(b: Build): Issue[] {
  const out: Issue[] = [];
  const { pistol, sights, optic, magwell, mag } = b;
  if (sights && pistol && sights.attrs.cut !== pistol.attrs.sight)
    out.push({ severity: 'error', slots: ['sights', 'pistol'], message: `These sights are made for the ${CUT[sights.attrs.cut as string]} dovetail; this slide is cut for ${CUT[pistol.attrs.sight as string]} sights.` });
  if (optic && pistol) {
    const plates = pistol.attrs.plates as string[];
    if (!plates.length)
      out.push({ severity: 'error', slots: ['optic', 'pistol'], message: 'This slide isn\'t cut for an optic.' });
    else if (!plates.includes(optic.attrs.footprint as string))
      out.push({ severity: 'warn', slots: ['optic', 'pistol'], message: `${pistol.brand} doesn't list a plate for this optic's footprint. Look for an aftermarket plate before buying.` });
    else
      out.push({ severity: 'info', slots: ['optic', 'pistol'], message: `Mounts with ${pistol.brand}'s plate for this footprint; check whether one comes with the pistol.` });
    if (sights?.attrs.height !== 'suppressor')
      out.push({ severity: 'info', slots: ['optic', 'sights'], message: 'Standard sights sit below the dot. Optic-height sights co-witness through it.' });
  }
  if (magwell && pistol && magwell.attrs.fit !== pistol.attrs.well)
    out.push({ severity: 'error', slots: ['magwell', 'pistol'], message: `This magwell is made for the ${CUT[magwell.attrs.fit as string]} grip module; this pistol has the ${CUT[pistol.attrs.well as string]} grip.` });
  if (mag && pistol) {
    const fam = pistol.attrs.mags as string;
    if (mag.attrs.family !== fam)
      out.push({ severity: 'warn', slots: ['mag', 'pistol'], message: `We couldn't confirm that this magazine fits the ${pistol.brand} ${pistol.name}. Use the maker's own magazines or check with them.` });
    else if (pistol.attrs.grip === 'c2' && (mag.attrs.rounds as number) > 16)
      out.push({ severity: 'info', slots: ['mag', 'pistol'], message: 'This magazine fits the C2 and sticks out below its short grip.' });
  }
  const size = pistol ? HOLSTER[pistol.attrs.size as string] : undefined;
  out.push(...pistolAddonRules(b, pistol?.attrs.rail ? 'pic' : undefined, 'pistol', size, size ? HOLSTER_LABEL[size] : '2011'));
  return out;
}

export const m2011: Platform = {
  id: 'm2011',
  name: '2011',
  family: 'Pistol',
  maker: '1911 Platform',
  blurb: 'Double-stack 1911 in 9mm. Start from a factory 2011 and add a dot, light and magwell.',
  slots: slots2011,
  parts: [...parts2011, ...pistolLights.filter((l) => ['p-light-tlr7a', 'p-light-x300'].includes(l.id)),
    ...holsters('m21', [['5', '2011 5"'], ['44', '2011 4.25" to 4.4"'], ['39', '2011 3.9"']], ['tlr7a', 'x300']), ...pistolCases],
  rules: rules2011,
  presets: {
    budget: ['m21-prodigy5', 'm21-mag-pr17'],
    value: ['m21-prodigy425', 'm21-opt-507c', 'm21-mw-dawsonpr', 'p-light-tlr7a', 'm21-mag-pr17'],
    premium: ['m21-staccato-p', 'm21-opt-sro', 'm21-sgt-dawsonsto', 'm21-mw-dawsonst', 'p-light-x300', 'm21-mag-st17'],
  },
};
