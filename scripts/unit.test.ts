// Unit tests for the fit engine, build status and saved builds / share links, run against the real catalog.
// Bundled with esbuild by `npm test` (like check-data), then run with node (node --test skips files under node_modules).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { awarenessFor } from '../src/awareness';
import { PLATFORMS } from '../src/data/index';
import { PAUSED, SBR_MESSAGE } from '../src/data/helpers';
import { hasHistory, priceOn, recentChange } from '../src/data/history';
import { baseSelection, bestOffer, candidateIssues, issuesFor, listedParts, ownedOf, placementOf, presetSelection, priceRange, selectionTokens, singleRetailerCarts, toBuild, toBuyIds, type Selection } from '../src/engine';
import { findParts } from '../src/find';
import { Candidate } from '../src/Picker';
import { buildStatus, statesFor } from '../src/status';
import { loadSavedBuilds, priceChanges, priceSnapshot, readSharedBuild, selectionFromParts, storeSavedBuilds, totalOf, type SavedBuild } from '../src/store';

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

/* ------------------------------------------------------------------ short barrels with a stock (interim, pending legal advice) */

const ar9 = platform('ar9');
const ar10 = platform('ar10');
const sbr = (issues: { severity: string; slots: string[]; message: string }[]) => issues.filter((i) => i.message === SBR_MESSAGE);
const HIDDEN_AR15 = ['ar-bbl-ba10', 'ar-bbl-ba115', 'ar-bbl-ba300-9', 'ar-bbl-ba75'];

test('an AR-15 barrel under 16" with any stock is a conflict on both, and the build is not complete', () => {
  const short = ar15.parts.filter((p) => p.slot === 'barrel' && (p.attrs.length as number) < 16);
  assert.deepEqual(short.map((p) => p.id).sort(), HIDDEN_AR15);
  const stocks = ar15.parts.filter((p) => p.slot === 'stock');
  assert.ok(stocks.length >= 5);
  for (const b of short)
    for (const s of stocks) {
      const build = toBuild(ar15, { ...baseSelection(ar15), barrel: b.id, stock: s.id });
      const issues = issuesFor(ar15, build);
      assert.deepEqual(sbr(issues).map((i) => [i.severity, [...i.slots].sort()]), [['error', ['barrel', 'stock']]], `${b.id} + ${s.id}`);
      assert.equal(buildStatus(ar15, build, issues).complete, false, `${b.id} + ${s.id}`);
      assert.equal(statesFor(ar15, build).states.barrel, 'error');
      assert.equal(statesFor(ar15, build).states.stock, 'error');
    }
});

test('an AR-15 barrel of 16" or more with any stock raises no short-barrel issue', () => {
  const long = ar15.parts.filter((p) => p.slot === 'barrel' && (p.attrs.length as number) >= 16);
  assert.ok(long.length >= 10);
  for (const b of long)
    for (const s of ar15.parts.filter((p) => p.slot === 'stock'))
      assert.deepEqual(sbr(issuesFor(ar15, toBuild(ar15, { ...baseSelection(ar15), barrel: b.id, stock: s.id }))), [], `${b.id} + ${s.id}`);
});

test('the short AR-15 barrels are hidden from the picker and search but still open from links and saved builds', () => {
  const listed = listedParts(ar15, 'barrel').map((p) => p.id);
  for (const id of HIDDEN_AR15) {
    assert.equal(part(ar15, id).hidden, true, id);
    assert.ok(!listed.includes(id), id);
    assert.ok(listedParts(ar15, 'barrel', id).some((p) => p.id === id), `${id} shows when it's already in the build`);
    assert.ok(!findParts(part(ar15, id).name, ar15).here.some((f) => f.part.id === id), `${id} found by name`);
  }
  assert.deepEqual(ar15.parts.filter((p) => p.hidden).map((p) => p.id).sort(), HIDDEN_AR15);
  assert.ok(listed.includes('ar-bbl-ba16') && listed.length === ar15.parts.filter((p) => p.slot === 'barrel').length - 4);
  // A share token and a ?b= link resolve the hidden barrel, and the build shows the conflict.
  const sel = { ...baseSelection(ar15), barrel: 'ar-bbl-ba10' };
  const back = selectionFromParts('ar15', selectionTokens(sel));
  assert.deepEqual(back, sel);
  Object.defineProperty(globalThis, 'location', { value: { search: `?b=${encodeURIComponent(`ar15~${selectionTokens(sel).join('.')}`)}`, origin: 'https://example.test', pathname: '/' }, configurable: true });
  assert.deepEqual(readSharedBuild(), { platform: 'ar15', selection: sel });
  const build = toBuild(ar15, back);
  assert.equal(build.barrel?.id, 'ar-bbl-ba10');
  const issues = issuesFor(ar15, build);
  assert.equal(sbr(issues).length, 1);
  assert.deepEqual(buildStatus(ar15, build, issues), { cls: 'error', text: '1 conflict to fix', complete: false });
});

test('AR-9: a stock on a short barrel is a conflict; a brace, or a 16" barrel, is not', () => {
  const at = (over: Selection) => issuesFor(ar9, toBuild(ar9, { ...baseSelection(ar9), ...over }));
  const shortBarrels = ar9.parts.filter((p) => p.slot === 'barrel' && (p.attrs.length as number) < 16);
  const stocks = ar9.parts.filter((p) => p.slot === 'stock' && !p.attrs.brace);
  const braces = ar9.parts.filter((p) => p.slot === 'stock' && p.attrs.brace);
  assert.ok(shortBarrels.length && stocks.length && braces.length);
  for (const b of shortBarrels) {
    for (const s of stocks) assert.deepEqual(sbr(at({ barrel: b.id, stock: s.id })).map((i) => [i.severity, [...i.slots].sort()]), [['error', ['barrel', 'stock']]], `${b.id} + ${s.id}`);
    for (const s of braces) assert.deepEqual(at({ barrel: b.id, stock: s.id }).filter((i) => i.severity === 'error' && i.slots.includes('stock')), [], `${b.id} + ${s.id}`);
  }
  for (const s of [...stocks, ...braces]) assert.deepEqual(sbr(at({ barrel: 'a9-bbl-aero16', stock: s.id })), [], s.id);
  const sel = { ...baseSelection(ar9), barrel: 'a9-bbl-faxon85' };
  assert.equal(buildStatus(ar9, toBuild(ar9, sel), issuesFor(ar9, toBuild(ar9, sel))).complete, false);
});

test('AR-9: a vertical foregrip on a short braced or stockless build is a conflict; an angled grip or hand stop is not', () => {
  const fgErrors = (over: Selection) => issuesFor(ar9, toBuild(ar9, { ...baseSelection(ar9), ...over })).filter((i) => i.severity === 'error' && i.slots.includes('foregrip'));
  const braced = { barrel: 'a9-bbl-faxon85', stock: 'a9-brace-sba3' };
  for (const fg of ['r-fg-mvg', 'r-fg-bcmvg']) {
    assert.deepEqual(fgErrors({ ...braced, foregrip: fg }).map((i) => [...i.slots].sort()), [['barrel', 'foregrip']], fg);
    const { stock, ...noStock } = { ...baseSelection(ar9), ...braced, foregrip: fg };
    assert.ok(stock);
    assert.equal(issuesFor(ar9, toBuild(ar9, noStock)).filter((i) => i.severity === 'error' && i.slots.includes('foregrip')).length, 1, `${fg} with no stock`);
    assert.deepEqual(fgErrors({ barrel: 'a9-bbl-aero16', stock: 'a9-brace-sba3', foregrip: fg }), [], `${fg} on 16"`);
  }
  for (const fg of ['r-fg-kag', 'r-fg-afg2', 'r-fg-stop']) assert.deepEqual(fgErrors({ ...braced, foregrip: fg }), [], fg);
  // The braced Best Value AR-9 starter build is unchanged and still conflict-free.
  assert.ok(ar9.presets.value.includes('a9-brace-sba3'));
  assert.deepEqual(errors(ar9, presetSelection(ar9, 'value')), []);
});

test('AR-10: a barrel under 16" with a stock is flagged too, though none is listed today', () => {
  assert.ok(ar10.parts.filter((p) => p.slot === 'barrel').every((p) => (p.attrs.length as number) >= 16));
  const build = toBuild(ar10, presetSelection(ar10, 'value'));
  assert.ok(build.stock);
  assert.deepEqual(sbr(ar10.rules(build)), []);
  build.barrel = { ...build.barrel!, attrs: { ...build.barrel!.attrs, length: 14.5 } };
  assert.deepEqual(sbr(ar10.rules(build)).map((i) => [i.severity, [...i.slots].sort()]), [['error', ['barrel', 'stock']]]);
  assert.ok(awarenessFor(ar10, build).some((w) => w.level === 'caution' && w.title === 'Short-barreled rifle'));
});

test('no rule, awareness, pick or hint text says something "is legal" or tells people to approve ATF forms', () => {
  const dir = 'src/data';
  const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => `${dir}/${f}`), 'src/awareness.ts'];
  assert.ok(files.length > 10);
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /\bis legal\b|legal without|Approve an ATF/, f);
  // And at run time, across every platform's slot hints, pick notes and starter-build issues.
  const texts = PLATFORMS.flatMap((p) => [...p.slots.map((s) => s.hint), ...p.parts.map((x) => x.pick?.note ?? ''),
    ...(['budget', 'value', 'premium'] as const).flatMap((t) => issuesFor(p, toBuild(p, presetSelection(p, t))).map((i) => i.message))]);
  for (const t of texts) assert.doesNotMatch(t, /\bis legal\b|legal without|Approve an ATF/);
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

/* ------------------------------------------------------------------ paused retailers */

const PAUSED_IDS = ['ARD', 'PA', 'VED'];

test('no part offers a paused retailer, so no best price, total or cart counts one', () => {
  assert.deepEqual([...PAUSED].sort(), PAUSED_IDS);
  for (const p of PLATFORMS)
    for (const x of p.parts) {
      assert.deepEqual(x.offers.filter((o) => PAUSED.has(o.retailer)).map((o) => o.retailer), [], `${p.id}/${x.id}`);
      const best = bestOffer(x);
      if (best) assert.ok(!PAUSED.has(best.retailer), `${p.id}/${x.id}`);
    }
  for (const p of PLATFORMS) {
    const parts = Object.values(toBuild(p, baseSelection(p))).filter((x): x is NonNullable<typeof x> => !!x);
    assert.ok(singleRetailerCarts(parts).every((c) => !PAUSED.has(c.retailer)), p.id);
  }
});

test('a part sold only by a paused retailer has no price and renders without one', () => {
  // The MI 9" handguard had only Primary Arms prices; it stays in the catalog with no offers.
  const hg = part(ar15, 'ar-hg-mi9');
  assert.deepEqual(hg.offers, []);
  assert.equal(bestOffer(hg), undefined);
  assert.deepEqual(priceRange(hg), [0, 0]);
  assert.equal(hasHistory(hg), false);
  assert.equal(recentChange(hg), undefined);
  assert.equal(priceOn(hg, '2026-10-01'), 0);
  const sel = { ...baseSelection(ar15), handguard: 'ar-hg-mi9' };
  assert.equal(priceSnapshot('ar15', sel)['ar-hg-mi9'], undefined);
  const build = toBuild(ar15, sel);
  const { handguard, ...rest } = build;
  assert.equal(handguard?.id, 'ar-hg-mi9');
  assert.ok(Number.isFinite(totalOf(ar15, build)) && totalOf(ar15, build) > 0);
  assert.equal(totalOf(ar15, build), totalOf(ar15, rest));
  const html = renderToStaticMarkup(createElement(Candidate, { part: hg, open: true, issues: [], sev: 'ok', selected: false, owned: false, onChoose: () => {}, onBuyClick: () => {} }));
  assert.match(html, /<span class="amt dim">—<\/span>/);
  assert.doesNotMatch(html, /Compare|View Retailer|<table|NaN|Infinity|undefined/);
  // A part with prices still shows them.
  const priced = renderToStaticMarkup(createElement(Candidate, { part: part(ar15, 'ar-mz-vg6'), open: true, issues: [], sev: 'ok', selected: false, owned: false, onChoose: () => {}, onBuyClick: () => {} }));
  assert.match(priced, /<table class="offers">/);
  assert.doesNotMatch(priced, /Primary Arms|AR15Discounts|Vedder Holsters/);
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
