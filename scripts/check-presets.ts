// Verifies every preset build is complete and free of compatibility errors.
import { awarenessFor } from '../src/awareness';
import { PLATFORMS } from '../src/data/index';
import { issuesFor, presetSelection, toBuild } from '../src/engine';

let bad = 0;
for (const p of PLATFORMS) {
  const ids = new Set<string>();
  for (const part of p.parts) {
    if (ids.has(part.id)) { console.log(`${p.id}: duplicate id ${part.id}`); bad++; }
    ids.add(part.id);
    if (!p.slots.some((s) => s.id === part.slot)) { console.log(`${p.id}: ${part.id} has unknown slot`); bad++; }
  }
  for (const tier of ['budget', 'value', 'premium'] as const) {
    for (const id of p.presets[tier]) if (!ids.has(id)) { console.log(`${p.id}/${tier}: unknown part ${id}`); bad++; }
    const sel = presetSelection(p, tier);
    const missing = p.slots.filter((s) => s.required && !sel[s.id]).map((s) => s.id);
    const issues = issuesFor(p, toBuild(p, sel));
    console.log(`${p.name} ${tier}: missing=[${missing}] ${issues.map((i) => `${i.severity}: ${i.message}`).join(' | ') || 'clean'}`);
    if (missing.length || issues.some((i) => i.severity === 'error')) bad++;
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
  ['ar10', 'barrel', 'journal', 'gasblock', 'journal'],
  ['ar10', 'barrel', 'gas', 'gastube', 'length'],
  ['glock17', 'barrel', 'thread', 'muzzle', 'thread'],
  ['glock19', 'barrel', 'thread', 'muzzle', 'thread'],
  ['glock26', 'barrel', 'thread', 'muzzle', 'thread'],
  ['glock19', 'slide', 'family', 'barrel', 'family'],
  ['glock19', 'slide', 'family', 'spk', 'family'],
  ['glock17', 'slide', 'rsa', 'rsa', 'rsa'],
  ['glock19', 'slide', 'rsa', 'rsa', 'rsa'],
  ['glock26', 'slide', 'rsa', 'rsa', 'rsa'],
  ['glock43x', 'slide', 'len', 'barrel', 'len'],
  ['glock43x', 'slide', 'len', 'rsa', 'len'],
  ['p320', 'slide', 'length', 'barrel', 'length'],
  ['p320', 'slide', 'caliber', 'barrel', 'caliber'],
  ['p320', 'slide', 'length', 'spring', 'length'],
  ['p365', 'slide', 'barrelLen', 'barrel', 'len'],
  ['p365', 'slide', 'springLen', 'spring', 'len'],
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
const THREAD = /(1\/2x28|5\/8x24|5\/8x32|M13\.5x1 LH|M14x1 LH)/;
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
}
console.log(`Interface audit: ${combos} part combinations checked across ${IFACES.length} measured interfaces.`);
process.exit(bad ? 1 : 0);
