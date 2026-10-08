// Verifies every preset build is complete and free of compatibility errors.
import { awarenessFor } from '../src/awareness';
import { PLATFORMS, canonicalPlatform } from '../src/data/index';
import { baseSelection, issuesFor, ownedOf, placementOf, presetSelection, selectionTokens, toBuild, toBuyIds } from '../src/engine';
import { selectionFromParts } from '../src/store';
import { buildWeight, formatWeight } from '../src/weight';

let bad = 0;
for (const p of PLATFORMS) {
  const ids = new Set<string>();
  for (const part of p.parts) {
    if (ids.has(part.id)) { console.log(`${p.id}: duplicate id ${part.id}`); bad++; }
    ids.add(part.id);
    if (!p.slots.some((s) => s.id === part.slot)) { console.log(`${p.id}: ${part.id} has unknown slot`); bad++; }
  }
  // A builder with models (the double-stack 9mm Glocks) has starter builds for each model as well as its own.
  for (const m of [{ name: p.name, presets: p.presets, base: p.base }, ...(p.models ?? [])]) {
    // The plain build each builder opens on: complete, conflict-free, and with no optic or other add-on.
    for (const id of m.base ?? []) if (!ids.has(id)) { console.log(`${p.id}/${m.name}/base: unknown part ${id}`); bad++; }
    const base = baseSelection({ ...p, presets: m.presets, base: m.base });
    const addons = ['optic', 'light', 'laser', 'foregrip', 'magnifier', 'rail', 'qdmount', 'sling', 'case', 'holster'].filter((s) => base[s]);
    const baseMissing = p.slots.filter((s) => s.required && !base[s.id]).map((s) => s.id);
    const baseErr = issuesFor(p, toBuild(p, base)).filter((i) => i.severity === 'error');
    if (addons.length || baseMissing.length || baseErr.length) { console.log(`${p.id}/${m.name}/base: add-ons=[${addons}] missing=[${baseMissing}] ${baseErr.map((i) => i.message).join(' | ')}`); bad++; }
    for (const tier of ['budget', 'value', 'premium'] as const) {
      for (const id of m.presets[tier]) if (!ids.has(id)) { console.log(`${p.id}/${m.name}/${tier}: unknown part ${id}`); bad++; }
      const sel = presetSelection({ ...p, presets: m.presets }, tier);
      const missing = p.slots.filter((s) => s.required && !sel[s.id]).map((s) => s.id);
      const issues = issuesFor(p, toBuild(p, sel));
      if (m.name !== p.name || !p.models) console.log(`${m.name} ${tier}: missing=[${missing}] ${issues.map((i) => `${i.severity}: ${i.message}`).join(' | ') || 'clean'}`);
      if (missing.length || issues.some((i) => i.severity === 'error')) bad++;
    }
  }
}

// Interface audit: for every pair of parts that meet at a measured interface, the rules must
// report a conflict exactly when the measurements differ. Every combination is tried.
type Iface = [platform: string, slotA: string, attrA: string, slotB: string, attrB: string];
const IFACES: Iface[] = [
  ['ar15', 'barrel', 'thread', 'muzzle', 'thread'],
  ['ar15', 'barrel', 'journal', 'gasblock', 'journal'],
  ['ar15', 'barrel', 'gas', 'gastube', 'length'],
  ['ar15', 'barrel', 'bolt', 'bcg', 'bolt'],
  ['ar10', 'barrel', 'thread', 'muzzle', 'thread'],
  ['ar9', 'lower', 'mag', 'mag', 'family'],
  ['ar10', 'barrel', 'journal', 'gasblock', 'journal'],
  ['ar10', 'barrel', 'gas', 'gastube', 'length'],
  ['glock9', 'barrel', 'thread', 'muzzle', 'thread'],
  ['glock9', 'slide', 'family', 'barrel', 'family'],
  ['glock9', 'slide', 'bbl', 'barrel', 'len'],
  ['glock9', 'slide', 'family', 'spk', 'family'],
  ['glock9', 'slide', 'rsa', 'rsa', 'rsa'],
  ['glock43x', 'slide', 'len', 'barrel', 'len'],
  ['glock43x', 'slide', 'len', 'rsa', 'len'],
  ['p320', 'slide', 'length', 'barrel', 'length'],
  ['p320', 'slide', 'caliber', 'barrel', 'caliber'],
  ['p320', 'slide', 'length', 'spring', 'length'],
  ['glock20', 'barrel', 'thread', 'muzzle', 'thread'],
  ['glock20', 'slide', 'cal', 'barrel', 'cal'],
  ['glock20', 'slide', 'rsa', 'rsa', 'rsa'],
  ['glock20', 'slide', 'cal', 'mag', 'cal'],
  ['p365', 'slide', 'barrelLen', 'barrel', 'len'],
  ['p365', 'slide', 'springLen', 'spring', 'len'],
  ['mp2', 'slide', 'size', 'barrel', 'size'],
  ['mp2', 'slide', 'size', 'rsa', 'size'],
  ['mp2', 'barrel', 'thread', 'muzzle', 'thread'],
  ['hellcat', 'slide', 'size', 'barrel', 'size'],
  ['hellcat', 'slide', 'size', 'rsa', 'size'],
  ['hellcat', 'barrel', 'thread', 'muzzle', 'thread'],
];
let combos = 0;
for (const [pid, sa, ka, sb, kb] of IFACES) {
  const p = PLATFORMS.find((x) => x.id === pid)!;
  const base = presetSelection(p, 'value');
  for (const a of p.parts.filter((x) => x.slot === sa))
    for (const b of p.parts.filter((x) => x.slot === sb)) {
      combos++;
      const issues = issuesFor(p, toBuild(p, { ...base, [sa]: a.id, [sb]: b.id }));
      const flagged = issues.some((i) => i.severity === 'error' && i.slots.includes(sa) && i.slots.includes(sb));
      // Several interfaces can join the same two slots (P320 slide and barrel: length and caliber).
      const differ = IFACES.some(([p2, s2a, k2a, s2b, k2b]) => p2 === pid && s2a === sa && s2b === sb && String(a.attrs[k2a]) !== String(b.attrs[k2b]))
        || (pid === 'p365' && !!a.attrs.comp && !!b.attrs.threaded) // a comp slide can't clear a threaded barrel
        || (sa === 'barrel' && sb === 'muzzle' && (b.attrs.bore as number) < (a.attrs.bullet as number)); // device bore smaller than the bullet
      if (flagged !== differ) { console.log(`${pid}: ${a.id} (${ka}=${a.attrs[ka]}) + ${b.id} (${kb}=${b.attrs[kb]}) ${flagged ? 'flagged but match' : 'NOT flagged'}`); bad++; }
    }
}
// Any thread size named in a part's name or specs must be the one its attrs carry, and vice versa.
const THREAD = /(1\/2x28|5\/8x24|5\/8x32|9\/16x24|\.578x28|M13\.5x1 LH|M14x1 LH|M24x1\.5)/;
for (const p of PLATFORMS)
  for (const part of p.parts) {
    const named = `${part.name} ${part.specs.join(' ')}`.match(THREAD)?.[1];
    if ((part.slot === 'barrel' || part.slot === 'muzzle') && named !== part.attrs.thread && !(named === undefined && part.slot === 'barrel' && !p.slots.some((s) => s.id === 'muzzle') && !part.attrs.threaded)) {
      console.log(`${p.id}: ${part.id} names thread ${named} but attrs say ${part.attrs.thread}`); bad++;
    }
  }
// Every rifle barrel names its bullet diameter and every rifle muzzle device its bore, so the bore check can run.
for (const p of PLATFORMS.filter((x) => x.family === 'Rifle'))
  for (const part of p.parts)
    if ((part.slot === 'barrel' && part.attrs.bullet === undefined) || (part.slot === 'muzzle' && part.attrs.bore === undefined)) {
      console.log(`${p.id}: ${part.id} is missing its ${part.slot === 'barrel' ? 'bullet diameter' : 'bore'}`); bad++;
    }
{
  // A 5.56 device on a .308 barrel with matching threads must be a conflict.
  const ar = PLATFORMS.find((x) => x.id === 'ar10')!;
  const sel = { ...presetSelection(ar, 'value'), muzzle: 'a10-mz-a2' };
  const fake = toBuild(ar, sel);
  fake.muzzle = { ...fake.muzzle!, attrs: { ...fake.muzzle!.attrs, bore: 0.224 } };
  if (!ar.rules(fake).some((i) => i.severity === 'error' && /strike the device/.test(i.message))) { console.log('bore check: 5.56 device on .308 barrel not flagged'); bad++; }
}
// Full builds made from catalog parts beyond the presets come out free of conflicts.
{
  const ar = PLATFORMS.find((x) => x.id === 'ar15')!;
  const builds: Record<string, string>[] = [
    { barrel: 'ar-bbl-grendel18', bcg: 'ar-bcg-grendel', gastube: 'ar-gt-rifle', muzzle: 'ar-mz-a2-30' },
    { barrel: 'ar-bbl-arc18', bcg: 'ar-bcg-grendel', gastube: 'ar-gt-rifle', muzzle: 'ar-mz-sf3p30' },
    { barrel: 'ar-bbl-ba20', gastube: 'ar-gt-rifle', gasblock: 'ar-gb-fsb', handguard: 'ar-hg-moerifle', buffer: 'ar-buf-rifle', stock: 'ar-stock-moerifle' },
    { barrel: 'ar-bbl-ba300-9', gastube: 'ar-gt-pistol', handguard: 'ar-hg-mi7', muzzle: 'ar-mz-sf3p30' },
  ];
  for (const over of builds) {
    const errs = issuesFor(ar, toBuild(ar, { ...presetSelection(ar, 'value'), ...over })).filter((i) => i.severity === 'error');
    if (errs.length) { console.log(`catalog build ${JSON.stringify(over)}: ${errs.map((i) => i.message).join(' | ')}`); bad++; }
  }
}
// Awareness warnings fire on the thresholds agreed in the Build Warnings Proposal.
{
  const ar = PLATFORMS.find((x) => x.id === 'ar15')!;
  const titles = (over: Record<string, string>) =>
    awarenessFor(ar, toBuild(ar, { ...presetSelection(ar, 'budget'), ...over })).map((w) => `${w.level}:${w.title}`);
  const expect = (over: Record<string, string>, want: string, present = true) => {
    if (titles(over).includes(want) !== present) { console.log(`awareness: expected ${present ? '' : 'no '}"${want}" for ${JSON.stringify(over)}`); bad++; }
  };
  expect({ barrel: 'ar-bbl-ba10' }, 'caution:Heavy flash and blast');
  expect({ barrel: 'ar-bbl-ba10' }, 'caution:Common ammo loses effectiveness');
  expect({ barrel: 'ar-bbl-psa16' }, 'caution:Heavy flash and blast', false);
  expect({ barrel: 'ar-bbl-psa16' }, 'note:Runs overgassed');
  expect({ muzzle: 'ar-mz-lantac' }, 'caution:Much louder beside you');
  expect({ barrel: 'ar-bbl-300', gastube: 'ar-gt-pistol', muzzle: 'ar-mz-pa' }, 'caution:Keep .300 BLK ammo separate');
  expect({}, 'note:Heavier than typical', false);
  // Heavier stock: +n oz on the stock moves a 6.1 lb budget rifle past the 7.5 and 9 lb lines.
  const heavy = (n: number) => {
    const b = toBuild(ar, presetSelection(ar, 'budget'));
    b.stock = { ...b.stock!, weight: { oz: b.stock!.weight!.oz + n, published: false } };
    return awarenessFor(ar, b).map((w) => `${w.level}:${w.title}`);
  };
  if (!heavy(30).includes('note:Heavier than typical')) { console.log('weight: 8 lb AR-15 should get a Note'); bad++; }
  if (!heavy(60).includes('caution:Heavier than typical')) { console.log('weight: 9.9 lb AR-15 should get a Caution'); bad++; }
}
// Add-on fit checks.
{
  const sev = (pid: string, tier: 'budget' | 'value' | 'premium', over: Record<string, string>, slot: string) => {
    const p = PLATFORMS.find((x) => x.id === pid)!;
    const sel = { ...presetSelection(p, tier), ...over };
    const issues = issuesFor(p, toBuild(p, sel), placementOf(sel)).filter((i) => i.slots.includes(slot));
    return issues.some((i) => i.severity === 'error') ? 'error' : issues.some((i) => i.severity === 'warn') ? 'warn' : issues.length ? 'info' : 'ok';
  };
  const cases: [string, 'budget' | 'value' | 'premium', Record<string, string>, string, string][] = [
    ['ar15', 'budget', { light: 'r-light-m600' }, 'light', 'warn'],
    ['ar15', 'budget', { light: 'r-light-m600', rail: 'r-rail-5' }, 'light', 'ok'],
    ['ar15', 'budget', { light: 'r-light-hlx' }, 'light', 'ok'],
    ['ar15', 'value', { magnifier: 'r-mag-hm3x' }, 'magnifier', 'error'],
    ['ar15', 'premium', { magnifier: 'r-mag-hm3x' }, 'magnifier', 'info'],
    ['ar15', 'budget', { sling: 'r-sling-ms4', qdmount: 'r-qd-magpul' }, 'sling', 'warn'],
    ['ar15', 'value', { sling: 'r-sling-ms4', qdmount: 'r-qd-magpul' }, 'sling', 'ok'],
    ['ar15', 'budget', { case: 'r-case-sav36' }, 'case', 'ok'],
    ['ar10', 'value', { case: 'r-case-sav36' }, 'case', 'warn'],
    ['ar10', 'value', { case: 'r-case-v730' }, 'case', 'ok'],
    ['glock9', 'value', { holster: 'g19-hol-g19-tlr7a' }, 'holster', 'error'],
    ['glock9', 'value', { holster: 'g19-hol-g19-tlr7a', light: 'p-light-tlr7a' }, 'holster', 'info'],
    ['glock9', 'value', { holster: 'g19-hol-g19', light: 'p-light-tlr7a' }, 'holster', 'error'],
    ['glock9', 'value', { holster: 'g17-hol-g17' }, 'holster', 'warn'],
    ['glock43x', 'budget', { light: 'p-light-tlr7sub-g' }, 'light', 'error'],
    ['glock43x', 'premium', { light: 'p-light-tlr7sub-g' }, 'light', 'ok'],
    ['p365', 'budget', { holster: 'p365-hol-xl' }, 'holster', 'warn'],
    ['p320', 'value', { light: 'p-light-tlr7a', holster: 'p320-hol-compact-tlr7a' }, 'holster', 'info'],
    // Foregrips and placement on the rail
    ['ar15', 'budget', { foregrip: 'r-fg-mvg' }, 'foregrip', 'ok'],
    ['ar15', 'budget', { foregrip: 'r-fg-afg2' }, 'foregrip', 'warn'],
    ['ar15', 'budget', { foregrip: 'r-fg-mvg', light: 'r-light-hlx', laser: 'r-laser-ls117', rail: 'r-rail-5' }, 'foregrip', 'ok'],
    ['ar15', 'budget', { foregrip: 'r-fg-mvg', light: 'r-light-hlx', '@light': 'b40', '@foregrip': 'b40' }, 'foregrip', 'error'],
    ['ar15', 'budget', { foregrip: 'r-fg-mvg', light: 'r-light-hlx', '@light': 'b90', '@foregrip': 'b20' }, 'foregrip', 'ok'],
    ['ar15', 'budget', { light: 'r-light-hlx', laser: 'r-laser-cmr301', '@light': 'l80', '@laser': 'l80' }, 'laser', 'error'],
    ['ar15', 'budget', { light: 'r-light-hlx', laser: 'r-laser-cmr301', '@light': 'l80', '@laser': 'r80' }, 'laser', 'ok'],
    ['ar15', 'budget', { light: 'r-light-m600', laser: 'r-laser-ls117', rail: 'r-rail-9', '@light': 'l80', '@laser': 'r80' }, 'rail', 'warn'],
    ['ar15', 'budget', { light: 'r-light-m600', laser: 'r-laser-ls117', rail: 'r-rail-9', '@light': 'r20', '@laser': 'r80' }, 'rail', 'ok'],
    ['ar10', 'value', { foregrip: 'r-fg-stop', light: 'r-light-rein', '@light': 'b130' }, 'foregrip', 'error'],
  ];
  for (const [pid, tier, over, slot, want] of cases) {
    const got = sev(pid, tier, over, slot);
    if (got !== want) { console.log(`add-ons: ${pid}/${tier} ${JSON.stringify(over)} on ${slot}: expected ${want}, got ${got}`); bad++; }
  }
}
// Every part has a weight, and preset builds land near factory rifle and pistol weights.
for (const p of PLATFORMS) {
  for (const part of p.parts) if (!part.weight) { console.log(`${p.id}: ${part.id} has no weight in data/weights.json`); bad++; }
  const rifle = p.family === 'Rifle';
  console.log(`${p.name} weights: ${(['budget', 'value', 'premium'] as const).map((t) => {
    const b = toBuild(p, presetSelection(p, t));
    return `${t} ${formatWeight(buildWeight(p, b, true).oz, rifle)} bare / ${formatWeight(buildWeight(p, b).oz, rifle)} as built`;
  }).join(', ')}`);
}
// Placements survive a share link or community post.
{
  const sel = { ...presetSelection(PLATFORMS[0], 'value'), light: 'r-light-hlx', '@light': 'l85', foregrip: 'r-fg-kag', '@foregrip': 'b24' };
  const back = selectionFromParts(PLATFORMS[0].id, selectionTokens(sel));
  if (JSON.stringify(Object.entries(back).sort()) !== JSON.stringify(Object.entries(sel).sort())) { console.log('placement tokens did not round-trip', back); bad++; }
}
// Owned marks survive a share link, leave the total, and never name a part id.
{
  const p = PLATFORMS.find((x) => x.id === 'glock9')!;
  const base = presetSelection(p, 'value');
  const sel: Record<string, string> = { ...base, '+frame': 'own', '+sights': 'other' };
  delete sel.sights;
  const back = selectionFromParts(p.id, selectionTokens(sel));
  if (JSON.stringify(Object.entries(back).sort()) !== JSON.stringify(Object.entries(sel).sort())) { console.log('owned tokens did not round-trip', back); bad++; }
  const o = ownedOf(back);
  if (!o.owned.has('frame') || !o.other.has('sights') || toBuyIds(back).includes(base.frame) || !toBuild(p, back).frame) { console.log('owned marks read wrong', o); bad++; }
  // A stray mark that doesn't match its slot is dropped.
  const stray = selectionFromParts(p.id, ['own-optic', `has-frame`, base.frame]);
  if (stray['+optic'] || stray['+frame']) { console.log('stray owned marks kept', stray); bad++; }
}
// The double-stack 9mm Glock builder: frame size against slide length, and old Glock 17, 19 and 26 links.
{
  const p = PLATFORMS.find((x) => x.id === 'glock9')!;
  const base = presetSelection(p, 'premium'); // G19 Gen5
  const sev = (over: Record<string, string>, a: string, b: string) => {
    const hits = issuesFor(p, toBuild(p, { ...base, ...over })).filter((i) => i.slots.includes(a) && i.slots.includes(b));
    return hits.some((i) => i.severity === 'error') ? 'error' : hits.some((i) => i.severity === 'warn') ? 'warn' : hits.length ? 'info' : 'ok';
  };
  const g17 = { slide: 'g17-slide-mos', barrel: 'g17-bbl-oem5', rsa: 'g17-rsa-g45' };
  const g19 = { slide: 'g19-slide-mos', barrel: 'g19-bbl-oem5', rsa: 'g19-rsa-g45' };
  const g26 = { slide: 'g26-slide-mos', barrel: 'g26-bbl-oem5', rsa: 'g26-rsa-g45' };
  const g34 = { slide: 'g34-slide-mos', barrel: 'g34-bbl-oem5', rsa: 'g17-rsa-g45' };
  const g47 = { slide: 'g47-slide-mos', barrel: 'g17-bbl-oem5', rsa: 'g19-rsa-g45' };
  const cases: [Record<string, string>, string, string, string][] = [
    [{ frame: 'g19-frame-g5', ...g17 }, 'frame', 'slide', 'info'],
    [{ frame: 'g17-frame-g5', ...g19 }, 'frame', 'slide', 'warn'],
    [{ frame: 'g26-frame-g5', ...g19 }, 'frame', 'slide', 'warn'],
    [{ frame: 'g19-frame-g5', ...g26 }, 'frame', 'slide', 'error'],
    [{ frame: 'g17-frame-g5', ...g17 }, 'frame', 'slide', 'ok'],
    [{ frame: 'g19-frame-g5', ...g17, barrel: 'g19-bbl-oem5' }, 'slide', 'barrel', 'error'],
    [{ frame: 'g19-frame-g5', ...g17, rsa: 'g19-rsa-g45' }, 'slide', 'rsa', 'error'],
    [{ frame: 'g26-frame-g4', slide: 'g26-slide-g4', barrel: 'g26-bbl-oem34', rsa: 'g26-rsa-g45', fcg: 'g-fcg-oem34', spk: 'g-spk-oem34' }, 'frame', 'slide', 'ok'],
    [{ frame: 'g17-frame-g3', slide: 'g17-slide-g4', barrel: 'g17-bbl-oem34', rsa: 'g17-rsa-g4', fcg: 'g-fcg-oem34', spk: 'g-spk-oem34' }, 'frame', 'slide', 'error'],
    // The G34, G45, G19X and G47, and the crossovers between them.
    [{ frame: 'g17-frame-g5', ...g34 }, 'frame', 'slide', 'ok'],
    [{ frame: 'g19-frame-g5', ...g34 }, 'frame', 'slide', 'info'],
    [{ frame: 'g17-frame-g5', ...g34, rsa: 'g19-rsa-g45' }, 'slide', 'rsa', 'error'],
    [{ frame: 'g17-frame-g5', ...g34, barrel: 'g17-bbl-oem5' }, 'slide', 'barrel', 'error'],
    [{ frame: 'g45-frame-g5', ...g19 }, 'frame', 'slide', 'ok'],
    [{ frame: 'g19x-frame-g5', ...g19 }, 'frame', 'slide', 'ok'],
    [{ frame: 'g45-frame-g5', ...g47 }, 'frame', 'slide', 'ok'],
    [{ frame: 'g19-frame-g5', ...g47 }, 'frame', 'slide', 'info'],
    [{ frame: 'g17-frame-g5', ...g47 }, 'frame', 'slide', 'ok'],
    [{ frame: 'g45-frame-g5', ...g17 }, 'frame', 'slide', 'info'],
    [{ frame: 'g45-frame-g5', ...g26 }, 'frame', 'slide', 'error'],
    [{ frame: 'g45-frame-g5', ...g47, barrel: 'g19-bbl-oem5' }, 'slide', 'barrel', 'error'],
    [{ frame: 'g45-frame-g5', ...g47, rsa: 'g17-rsa-g45' }, 'slide', 'rsa', 'error'],
    [{ frame: 'g45-frame-g5', slide: 'g19-slide-g4', barrel: 'g19-bbl-oem34', rsa: 'g19-rsa-g4', fcg: 'g-fcg-oem34', spk: 'g-spk-oem34' }, 'frame', 'slide', 'error'],
  ];
  for (const [over, a, b, want] of cases) {
    const got = sev(over, a, b);
    if (got !== want) { console.log(`glock9: ${JSON.stringify(over)} ${a}/${b}: expected ${want}, got ${got}`); bad++; }
  }
  for (const old of ['glock17', 'glock19', 'glock26']) {
    const n = old.slice(5);
    const sel = selectionFromParts(old, [`g${n}-frame-g5`, `g${n}-slide-mos`, 'g-mag-oem17']);
    if (canonicalPlatform(old) !== 'glock9' || sel.frame !== `g${n}-frame-g5` || sel.slide !== `g${n}-slide-mos` || sel.mag !== 'g-mag-oem17') { console.log(`old ${old} link did not open in the double-stack 9mm Glock builder`, sel); bad++; }
  }
}
console.log(`Interface audit: ${combos} part combinations checked across ${IFACES.length} measured interfaces.`);
process.exit(bad ? 1 : 0);
