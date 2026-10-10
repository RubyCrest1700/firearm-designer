// Unit tests for the fit engine, build status and saved builds / share links, run against the real catalog.
// Bundled with esbuild by `npm test` (like check-data), then run with node (node --test skips files under node_modules).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORMS } from '../src/data/index';
import { baseSelection, candidateIssues, issuesFor, ownedOf, placementOf, selectionTokens, toBuild, toBuyIds, type Selection } from '../src/engine';
import { buildStatus, statesFor } from '../src/status';
import { loadSavedBuilds, priceChanges, priceSnapshot, readSharedBuild, selectionFromParts, storeSavedBuilds, type SavedBuild } from '../src/store';

const platform = (id: string) => PLATFORMS.find((p) => p.id === id)!;
const ar15 = platform('ar15');
const glock = platform('glock9');
const part = (p: typeof ar15, id: string) => p.parts.find((x) => x.id === id)!;
const errors = (p: typeof ar15, sel: Selection) => issuesFor(p, toBuild(p, sel)).filter((i) => i.severity === 'error');

/* ------------------------------------------------------------------ fit engine and status */

test('the factory AR-15 is complete and compatible', () => {
  const sel = baseSelection(ar15);
  const build = toBuild(ar15, sel);
  assert.deepEqual(errors(ar15, sel), []);
  assert.deepEqual(buildStatus(ar15, build, issuesFor(ar15, build)), { cls: 'ok', text: 'Complete and compatible', complete: true });
});

test('a 5/8x24 brake on a 1/2x28 AR-15 barrel is a conflict on both parts', () => {
  const sel = { ...baseSelection(ar15), muzzle: 'ar-mz-pa' };
  const { issues, states } = statesFor(ar15, toBuild(ar15, sel));
  const conflict = issues.filter((i) => i.severity === 'error');
  assert.equal(conflict.length, 1);
  assert.deepEqual([...conflict[0].slots].sort(), ['barrel', 'muzzle']);
  assert.equal(states.muzzle, 'error');
  assert.equal(states.barrel, 'error');
  assert.equal(states.lower, 'ok');
  assert.equal(states.optic, 'empty');
  assert.deepEqual(buildStatus(ar15, toBuild(ar15, sel), issues), { cls: 'error', text: '1 conflict to fix', complete: false });
  // The picker flags the brake before it's added, and not a matching device.
  const build = toBuild(ar15, baseSelection(ar15));
  assert.ok(candidateIssues(ar15, build, part(ar15, 'ar-mz-pa')).some((i) => i.severity === 'error'));
  assert.deepEqual(candidateIssues(ar15, build, part(ar15, 'ar-mz-vg6')).filter((i) => i.severity === 'error'), []);
});

test('a Glock 17 barrel in a Glock 19 slide is a conflict', () => {
  const sel = { ...baseSelection(glock), barrel: 'g17-bbl-oem5' };
  assert.deepEqual(errors(glock, baseSelection(glock)), []);
  const conflict = errors(glock, sel);
  assert.ok(conflict.some((i) => i.slots.includes('slide') && i.slots.includes('barrel')));
  assert.equal(buildStatus(glock, toBuild(glock, sel), conflict).cls, 'error');
});

test('a missing required part counts unless the builder has their own', () => {
  const { barrel, ...sel } = baseSelection(ar15);
  assert.ok(barrel);
  const build = toBuild(ar15, sel);
  const issues = issuesFor(ar15, build);
  assert.deepEqual(buildStatus(ar15, build, issues), { cls: 'warn', text: '1 required part missing', complete: false });
  const { other } = ownedOf({ ...sel, '+barrel': 'other' });
  assert.deepEqual(buildStatus(ar15, build, issues, other), { cls: 'ok', text: 'Complete and compatible', complete: true });
  assert.equal(buildStatus(ar15, {}, []).text, `${ar15.slots.filter((s) => s.required).length} required parts missing`);
});

test('placements and owned marks ride along without becoming parts', () => {
  const sel: Selection = { ...baseSelection(ar15), light: 'r-light-hlx', '@light': 'r45', '+lower': 'own' };
  const build = toBuild(ar15, sel);
  assert.deepEqual(Object.keys(build).sort(), Object.keys(sel).filter((k) => !'@+'.includes(k[0])).sort());
  assert.equal(build.light?.id, 'r-light-hlx');
  assert.deepEqual(placementOf(sel), { light: { side: 'right', at: 4.5 } });
  assert.ok(ownedOf(sel).owned.has('lower'));
  assert.ok(!toBuyIds(sel).includes(sel.lower));
  assert.ok(toBuyIds(sel).includes('r-light-hlx'));
});

/* ------------------------------------------------------------------ share links */

test('share link tokens round-trip, placements and owned marks included', () => {
  const sel: Selection = { ...baseSelection(ar15), light: 'r-light-hlx', '@light': 'r45', '+lower': 'own', '+optic': 'other' };
  assert.deepEqual(selectionFromParts('ar15', selectionTokens(sel)), sel);
});

test('a share link skips part ids the catalog no longer has, and marks with nothing to mark', () => {
  const sel = selectionFromParts('glock9', ['g19-slide-g5', 'g19-slide-gone', 'g19-bbl-oem5', 'own-optic', 'has-slide', 'at-nope-r45']);
  assert.deepEqual(sel, { slide: 'g19-slide-g5', barrel: 'g19-bbl-oem5' });
});

test('an old Glock 19 link opens in the Glock builder; an unknown platform opens nothing', () => {
  const at = (search: string) => Object.defineProperty(globalThis, 'location', { value: { search, origin: 'https://example.test', pathname: '/' }, configurable: true });
  at(`?b=${encodeURIComponent('glock19~g19-slide-g5.made-up-part.g19-bbl-oem5')}`);
  assert.deepEqual(readSharedBuild(), { platform: 'glock9', selection: { slide: 'g19-slide-g5', barrel: 'g19-bbl-oem5' } });
  at('?b=unicorn~g19-slide-g5');
  assert.equal(readSharedBuild(), null);
  at('');
  assert.equal(readSharedBuild(), null);
});

/* ------------------------------------------------------------------ saved builds */

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) },
  configurable: true,
});
const KEY = 'firearm-designer:saved:v1';

test('saved builds store and load, with old platform ids and a price snapshot for older saves', () => {
  storage.clear();
  const sel = baseSelection(glock);
  const builds: SavedBuild[] = [
    { id: 'a', name: 'My AR', platform: 'ar15', selection: baseSelection(ar15), savedAt: '2026-10-01T00:00:00Z', prices: priceSnapshot('ar15', baseSelection(ar15)) },
    { id: 'b', name: 'Old G19', platform: 'glock19', selection: sel, savedAt: '2026-09-01T00:00:00Z' },
  ];
  storeSavedBuilds(builds);
  const loaded = loadSavedBuilds();
  assert.deepEqual(loaded.map((s) => [s.id, s.platform]), [['a', 'ar15'], ['b', 'glock9']]);
  assert.deepEqual(loaded[0].prices, builds[0].prices);
  assert.deepEqual(Object.keys(loaded[1].prices!).sort(), Object.values(sel).sort());
  assert.deepEqual(priceChanges(loaded[1]), { changes: [], drop: 0 });
});

test('a build for a shelved platform stays stored but is not shown', () => {
  storage.clear();
  const shelved = { id: 'z', name: 'Shelved', platform: 'retired-platform', selection: {}, savedAt: '2026-01-01T00:00:00Z' };
  storage.set(KEY, JSON.stringify([shelved]));
  assert.deepEqual(loadSavedBuilds(), []);
  storeSavedBuilds([{ id: 'a', name: 'My AR', platform: 'ar15', selection: baseSelection(ar15), savedAt: '2026-10-01T00:00:00Z' }]);
  assert.deepEqual(JSON.parse(storage.get(KEY)!).map((s: SavedBuild) => s.id), ['a', 'z']);
});

test('a part that got cheaper since saving shows as a drop, owned parts left out', () => {
  const sel = baseSelection(ar15);
  const now = priceSnapshot('ar15', sel);
  const saved: SavedBuild = { id: 'a', name: 'AR', platform: 'ar15', selection: { ...sel, '+lower': 'own' }, savedAt: '', prices: { ...now, [sel.barrel]: now[sel.barrel] + 20, [sel.lower]: now[sel.lower] + 50 } };
  const { changes, drop } = priceChanges(saved);
  assert.deepEqual(changes.map((c) => c.part.id), [sel.barrel]);
  assert.equal(Math.round(drop * 100) / 100, 20);
  assert.equal(priceSnapshot('ar15', saved.selection)[sel.lower], undefined);
});
