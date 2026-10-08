import type { Build, Issue, Part } from '../types';
import { parts, pick } from './helpers';

/**
 * Iron sights for the AR family. A flat-top upper has no sights of its own, so a rifle with no optic needs a pair; an A2
 * front sight base gas block is already the front sight and only needs a rear. AR sights share one height (a 2.6" sight
 * line over the bore), so the optic's mount sets the co-witness, as the optic listings say. Sample prices until a price
 * source is added for them.
 */
export const ironsSlot = { id: 'irons', name: 'Iron Sights', group: 'Accessories', required: false, hint: 'Flip-up front and rear sights for the top rail. Needed when there is no optic.' } as const;

/** `fsb`: the platform has an A2 front sight base gas block, so a rear-only sight is offered. */
export function ironParts(prefix: string, fsb = true): Part[] {
  return parts('irons', [
    { id: `${prefix}-irons-mbus`, brand: 'Magpul', name: 'MBUS Gen 3 Front and Rear Sights', specs: ['Flip-up', 'Polymer', 'Front and rear'], attrs: { front: true, rear: true },
      offers: [['MAGPUL', 99.95], ['BRN', 99.99]], pick: pick('budget', 'Light polymer flip-up sights. The common pick.') },
    { id: `${prefix}-irons-mbusr`, brand: 'Magpul', name: 'MBUS Gen 3 Rear Sight', specs: ['Flip-up', 'Polymer', 'Rear only'], attrs: { front: false, rear: true },
      offers: [['MAGPUL', 49.95]], pick: pick('value', 'Pairs with an A2 front sight base.') },
  ]).filter((p) => fsb || p.attrs.front).concat(parts('irons', [
    { id: `${prefix}-irons-troy`, brand: 'Troy Industries', name: 'Folding BattleSight Front and Rear Set', specs: ['Flip-up', 'Aluminum', 'Front and rear'], attrs: { front: true, rear: true },
      offers: [['BRN', 209.0]] },
    { id: `${prefix}-irons-mbuspro`, brand: 'Magpul', name: 'MBUS Pro Front and Rear Sights', specs: ['Flip-up', 'Steel', 'Front and rear'], attrs: { front: true, rear: true },
      offers: [['MAGPUL', 219.95], ['BRN', 219.99]], pick: pick('premium', 'Low-profile steel sights that stay out of an optic\'s way.') },
  ]));
}

export function ironRules(b: Build, gasblock?: Part): Issue[] {
  const { irons, optic } = b;
  const fsb = gasblock?.attrs.profile === 'fsb';
  const out: Issue[] = [];
  if (!optic && !irons?.attrs.rear)
    out.push(fsb
      ? { severity: 'warn', slots: ['gasblock', 'irons'], message: 'The A2 front sight base has no rear sight to line up with. Add a rear iron sight or an optic.' }
      : { severity: 'warn', slots: ['irons', 'optic'], message: 'A flat-top upper has no sights of its own, so this build has nothing to aim with. Add iron sights or an optic.' });
  if (irons?.attrs.rear && !irons.attrs.front && !fsb && !optic)
    out.push({ severity: 'warn', slots: ['irons', 'gasblock'], message: 'This is a rear sight only. Add a front sight, or an A2 front sight base gas block.' });
  if (irons?.attrs.front && fsb)
    out.push({ severity: 'info', slots: ['irons', 'gasblock'], message: 'The A2 front sight base is already a front sight. A rear sight alone will do.' });
  if (irons?.attrs.rear && b.magnifier)
    out.push({ severity: 'info', slots: ['irons', 'magnifier'], message: 'The magnifier\'s mount and the rear sight both want the back of the receiver rail. Check there is room for both.' });
  return out;
}
