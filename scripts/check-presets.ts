// Verifies every preset build is complete and free of compatibility errors.
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
process.exit(bad ? 1 : 0);
