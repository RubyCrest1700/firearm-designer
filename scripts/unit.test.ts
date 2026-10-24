// Unit tests for the fit engine, build status and saved builds / share links, run against the real catalog.
// Bundled with esbuild by `npm test` (like check-data), then run with node (node --test skips files under node_modules).
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { awarenessFor } from '../src/awareness';
import { PLATFORMS } from '../src/data/index';
import { PAUSED, SBR_MESSAGE, shortBarrelStockIssue } from '../src/data/helpers';
import { biggestDrops, daysAgo, hasHistory, partSeries, priceOn, recentChange, seriesOf } from '../src/data/history';
import { baseSelection, bestOffer, candidateIssues, issuesFor, listedParts, noPriceNote, ownedOf, placementOf, presetSelection, priceRange, selectionTokens, singleRetailerCarts, toBuild, toBuyIds, unpricedCount, type Selection } from '../src/engine';
import { findParts } from '../src/find';
import { Candidate } from '../src/Picker';
import { buildStatus, statesFor } from '../src/status';
import { loadSavedBuilds, priceChanges, priceSnapshot, readSharedBuild, selectionFromParts, storeSavedBuilds, totalOf, unpricedOf, type SavedBuild } from '../src/store';
import { Summary } from '../src/BuilderPage';
import { HomePage } from '../src/HomePage';
import { BuildCard, ChangeChip } from '../src/ui';
import { PAGE_VIEWS, guidePage, platformPage } from '../src/guides/render';
import { GUIDES } from '../src/guides/content';
import { RETAILERS } from '../src/data/retailers';
import { priceIndex } from './og-index';
import history from '../data/price-history.json';
import type { Part, Platform } from '../src/types';

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
  // The total stays the same, and says the handguard isn't in it.
  assert.equal(unpricedOf(ar15, build), 1);
  assert.equal(unpricedOf(ar15, rest), 0);
  assert.equal(unpricedOf(ar15, build, new Set(['handguard'])), 0);
  assert.equal(noPriceNote(unpricedOf(ar15, build)), '1 part has no price');
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

/* ------------------------------------------------------------------ paused retailers' price history */

const RAW_HISTORY = (history as unknown as { parts: Record<string, [string, number][]> }).parts;
const everyPart = () => PLATFORMS.flatMap((p) => p.parts);
const PAUSE_DAY = '2026-10-24';
/** Midnight UTC, `days` after the pause date. */
const afterPause = (days: number) => new Date(Date.parse(PAUSE_DAY) + days * 86_400_000).toISOString();

test('a part any paused retailer priced carries the pause date; one none of them priced does not', () => {
  // Primary Arms sample prices only (the hidden 10.3" barrel), a Primary Arms live price (the MI handguard), and a part no paused store sells.
  assert.equal(part(ar15, 'ar-bbl-ba10').pausedThrough, PAUSE_DAY);
  assert.equal(part(ar15, 'ar-hg-mi9').pausedThrough, PAUSE_DAY);
  assert.equal(part(ar15, 'ar-gt-pistol').pausedThrough, undefined);
  assert.ok(everyPart().filter((x) => x.pausedThrough).every((x) => x.pausedThrough === PAUSE_DAY));
});

test('price history from on or before a paused retailer\'s pause date is never shown for the parts it priced', () => {
  const affected = everyPart().filter((x) => x.pausedThrough);
  assert.ok(affected.length > 100, `${affected.length} parts`);
  for (const x of affected) {
    assert.ok(seriesOf(x).every(([d]) => d > x.pausedThrough!), x.id);
    const best = bestOffer(x);
    if (!best) continue;
    const kept = seriesOf(x);
    // Before the first point we can still trust, the chart and the change chip use that point's price, or today's when there is none.
    const stand = kept.length ? priceOn(x, kept[0][0]) : best.price;
    for (const [d, price] of partSeries(x, daysAgo(90))) if (d <= x.pausedThrough!) assert.equal(price, stand, `${x.id} on ${d}`);
    if (!kept.length) {
      // No history point below today's low (from the paused store or anywhere), so no chart, no chip and no home page drop.
      assert.ok(partSeries(x, daysAgo(90)).every(([, price]) => price >= best.price), x.id);
      assert.equal(hasHistory(x), false, x.id);
      assert.equal(recentChange(x), undefined, x.id);
      assert.equal(renderToStaticMarkup(createElement(ChangeChip, { part: x, long: true })), '', x.id);
    }
  }
  const dropped = new Set(biggestDrops(everyPart(), 90, 1000).map((d) => d.part.id));
  for (const x of affected) if (!seriesOf(x).length) assert.ok(!dropped.has(x.id), x.id);
});

test('a part still sold elsewhere: its old paused-store low is dropped from the chart, and the chip shows no rise from it', () => {
  // Today's file holds only points from before the pause, so for every affected part they're the ones to drop.
  // Where one was below the part's current low, the chart used to dip and the chip to show a rise.
  const hits = everyPart().filter((x) => x.pausedThrough && bestOffer(x) && (RAW_HISTORY[x.id] ?? []).some(([d, price]) => d <= x.pausedThrough! && price < bestOffer(x)!.price));
  for (const x of hits) {
    const now = bestOffer(x)!.price;
    const before = partSeries(x, daysAgo(90)).filter(([d]) => d <= x.pausedThrough!);
    assert.ok(before.every(([, price]) => price >= now) || seriesOf(x).length > 0, x.id);
    const chip = recentChange(x);
    assert.ok(!chip || chip.by >= 0 || seriesOf(x).length > 0, `${x.id} shows a rise of ${chip && -chip.by}`);
  }
  // The same thing with a pause date set on a part with history, so it doesn't depend on today's prices.
  const real = everyPart().find((x) => bestOffer(x) && (RAW_HISTORY[x.id]?.length ?? 0) >= 2)!;
  const series = RAW_HISTORY[real.id];
  const last = series[series.length - 1][0];
  const allOld: Part = { ...real, pausedThrough: last };
  assert.deepEqual(seriesOf(allOld), []);
  assert.equal(hasHistory(allOld), false);
  assert.equal(recentChange(allOld), undefined);
  assert.equal(priceOn(allOld, series[0][0]), bestOffer(real)!.price);
  const keepLast: Part = { ...real, pausedThrough: series[series.length - 2][0] };
  assert.deepEqual(seriesOf(keepLast), [series[series.length - 1]]);
  // Earlier days now read the first kept price, not the older (possibly paused-store) one.
  assert.equal(priceOn(keepLast, series[0][0]), priceOn(real, last));
  assert.deepEqual(seriesOf({ ...real, pausedThrough: undefined }), series);
});

test('a saved build\'s price from before a pause isn\'t compared with today\'s; one saved after it is', () => {
  storage.clear();
  const x = ar15.parts.find((p) => p.pausedThrough && !p.hidden && bestOffer(p) && p.slot === 'handguard')!;
  assert.ok(x, 'an AR-15 handguard a paused retailer priced');
  const sel = { ...baseSelection(ar15), handguard: x.id };
  const now = priceSnapshot('ar15', sel);
  const cheaper = { ...now, [x.id]: now[x.id] - 30 };
  const before: SavedBuild = { id: 'p', name: 'Before', platform: 'ar15', selection: sel, savedAt: '2026-10-01T00:00:00Z', prices: cheaper };
  assert.deepEqual(priceChanges(before), { changes: [], drop: 0 });
  const after: SavedBuild = { ...before, id: 'q', savedAt: afterPause(1) };
  assert.deepEqual(priceChanges(after).changes.map((c) => [c.part.id, c.was, c.now]), [[x.id, now[x.id] - 30, now[x.id]]]);
  // Loading resets that one price to today's and notes when, so later changes show again; other parts keep theirs.
  // "Today" is fixed at two days after the pause, so the test doesn't depend on the date it runs.
  mock.timers.enable({ apis: ['Date'], now: Date.parse(afterPause(2)) });
  try {
    storeSavedBuilds([before]);
    const [loaded] = loadSavedBuilds();
    assert.equal(loaded.prices![x.id], now[x.id]);
    assert.ok(loaded.pricesAt && loaded.pricesAt.slice(0, 10) > PAUSE_DAY);
    assert.deepEqual(Object.keys(loaded.prices!).sort(), Object.keys(cheaper).sort());
    assert.deepEqual(priceChanges({ ...loaded, prices: { ...loaded.prices!, [x.id]: now[x.id] + 5 } }).changes.map((c) => c.part.id), [x.id]);
    storeSavedBuilds([loaded]);
    const [again] = loadSavedBuilds();
    assert.equal(again.pricesAt, loaded.pricesAt);
    // A build saved after the pause loads with its prices as they are.
    storage.clear();
    storeSavedBuilds([after]);
    assert.equal(loadSavedBuilds()[0].prices![x.id], now[x.id] - 30);
    assert.equal(loadSavedBuilds()[0].pricesAt, undefined);
  } finally {
    mock.timers.reset();
  }
});

/* ------------------------------------------------------------------ totals with parts that have no price */

test('the note beside a total says how many parts have no price', () => {
  assert.equal(noPriceNote(0), '');
  assert.equal(noPriceNote(1), '1 part has no price');
  assert.equal(noPriceNote(2), '2 parts have no price');
  assert.equal(noPriceNote(7), '7 parts have no price');
  assert.equal(unpricedCount([part(ar15, 'ar-hg-mi9'), undefined, part(ar15, 'ar-mz-vg6')]), 1);
});

const summaryHtml = (p: Platform, sel: Selection) => {
  const build = toBuild(p, sel);
  const owned = ownedOf(sel);
  const { issues, states } = statesFor(p, build);
  const noop = () => {};
  return renderToStaticMarkup(createElement(Summary, {
    platform: p, build, issues, aware: [], states, status: buildStatus(p, build, issues, owned.other), total: totalOf(p, build, owned.owned), owned, openSaved: null,
    onSave: noop, onShare: async () => {}, onCopyLink: noop, onOpen: noop, onCompare: noop, onFindOwned: noop,
  }));
};

test('the builder summary notes parts with no price, and counts only retailers that price a part', () => {
  const priced = baseSelection(ar15);
  const one = { ...priced, handguard: 'ar-hg-mi9' };
  const two = { ...one, optic: 'ar-opt-slx16' };
  assert.equal(bestOffer(part(ar15, 'ar-opt-slx16')), undefined);
  const retailers = (sel: Selection) => new Set(Object.values(toBuild(ar15, sel)).filter((x): x is Part => !!x).map((x) => bestOffer(x)?.retailer).filter(Boolean)).size;
  const n = (k: number) => `${k} retailer${k === 1 ? '' : 's'}`;
  assert.doesNotMatch(summaryHtml(ar15, priced), /no price/);
  const h1 = summaryHtml(ar15, one);
  assert.match(h1, /1 part has no price/);
  assert.match(h1, new RegExp(`from <!-- -->${n(retailers(one))}|from ${n(retailers(one))}`));
  const h2 = summaryHtml(ar15, two);
  assert.match(h2, /2 parts have no price/);
  assert.match(h2, new RegExp(`from <!-- -->${n(retailers(two))}|from ${n(retailers(two))}`));
  // An owned part is out of the total either way, so it gets no note.
  assert.doesNotMatch(summaryHtml(ar15, { ...one, '+handguard': 'own' }), /no price/);
  // Saved and community build cards say it too.
  const card = (sel: Selection) => renderToStaticMarkup(createElement(BuildCard, { platformId: 'ar15', selection: sel, title: 'T', meta: 'M', actions: null }));
  assert.match(card(one), /1 part has no price/);
  assert.doesNotMatch(card(priced), /no price/);
});

test('starter build cards and the platform page note parts with no price; totals are unchanged', () => {
  const view = PAGE_VIEWS.find((v) => v.pageId === 'ar15')!;
  const budget = Object.values(presetSelection(view, 'budget'));
  const totalOfBudget = (v: typeof view) => budget.reduce((sum, id) => sum + (bestOffer(v.parts.find((x) => x.id === id)!)?.price ?? 0), 0);
  const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  // Today the AR-15 budget build has the MI handguard, which only Primary Arms priced.
  assert.ok(budget.includes('ar-hg-mi9'));
  const card = (v: typeof view, note: string) => `${budget.length} parts, ${usd(totalOfBudget(v))} at the lowest prices we list${note ? ` · ${note}` : ''}</span>`;
  const lede = (v: typeof view, note: string) => `every part already fits, from ${usd(totalOfBudget(v))}${note ? ` (${note})` : ''}.`;
  assert.ok(platformPage(view).includes(card(view, '1 part has no price')), 'starter card');
  assert.ok(platformPage(view).includes(lede(view, '1 part has no price')), 'page lede');
  // With its price back, no note; with another part's price gone too, the note counts two.
  const withMi = { ...view, parts: view.parts.map((x) => (x.id === 'ar-hg-mi9' ? { ...x, offers: [{ retailer: 'BRN', price: 200, inStock: true }] } : x)) };
  assert.ok(platformPage(withMi).includes(card(withMi, '')) && platformPage(withMi).includes(lede(withMi, '')));
  const other = budget.find((id) => id !== 'ar-hg-mi9')!;
  const two = { ...view, parts: view.parts.map((x) => (x.id === other ? { ...x, offers: [] } : x)) };
  assert.ok(platformPage(two).includes(card(two, '2 parts have no price')), 'starter card, two');
  assert.ok(platformPage(two).includes(lede(two, '2 parts have no price')), 'page lede, two');
  // The total itself still adds up only the priced parts.
  assert.equal(Math.round(totalOfBudget(view) * 100), Math.round((totalOfBudget(withMi) - 200) * 100));
  // Every real page shows the note exactly when a starter build has a part with no price.
  for (const v of PAGE_VIEWS)
    for (const tier of ['budget', 'value', 'premium'] as const) {
      const k = unpricedCount(Object.values(presetSelection(v, tier)).map((id) => v.parts.find((x) => x.id === id)));
      if (k) assert.ok(platformPage(v).includes(noPriceNote(k)), `${v.pageId}/${tier}`);
    }
});

test('the home page counts neither hidden parts nor paused retailers, and notes a starter build with no-price parts', () => {
  const html = renderToStaticMarkup(createElement(HomePage, { onPick: () => {}, onStart: () => {}, onBrowse: () => {} })).replace(/<!-- -->/g, '');
  const parts = new Set(PLATFORMS.flatMap((p) => p.parts.filter((x) => !x.hidden).map((x) => x.id))).size;
  const all = new Set(PLATFORMS.flatMap((p) => p.parts.map((x) => x.id))).size;
  const stores = Object.keys(RETAILERS).length - PAUSED.size;
  assert.ok(all > parts);
  assert.ok(html.includes(`${PLATFORMS.length} platforms · ${parts} parts · ${stores} retailers compared`), 'hero facts');
  for (const p of PLATFORMS) {
    const k = unpricedOf(p, toBuild(p, presetSelection(p, 'budget')));
    if (k) assert.ok(html.includes(noPriceNote(k)), p.id);
  }
});

/* ------------------------------------------------------------------ hidden parts on the static pages */

test('the static pages leave out hidden parts: tables, fit charts, picks and counts', () => {
  const hidden = ar15.parts.filter((x) => x.hidden);
  assert.deepEqual(hidden.map((x) => x.id).sort(), HIDDEN_AR15);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const view = PAGE_VIEWS.find((v) => v.pageId === 'ar15')!;
  assert.ok(view.parts.every((x) => !x.hidden));
  const pages = [platformPage(view), ...GUIDES.filter((g) => g.platform === 'ar15').map((g) => guidePage(g, '2026-10-23T00:00:00Z'))];
  for (const html of pages) for (const x of hidden) assert.ok(!html.includes(esc(x.name)) && !html.includes(x.name), x.id);
  const shown = ar15.parts.filter((x) => !x.hidden);
  assert.ok(pages[0].includes(`${shown.length} parts from ${new Set(shown.map((x) => x.brand)).size} brands`));
  assert.ok(pages[0].includes(`${shown.length} parts checked for fit`));
  const barrels = shown.filter((x) => x.slot === 'barrel').length;
  assert.ok(pages[0].includes(`${barrels} options`), 'barrel count');
  // The handguard chart's columns for 7.5", 9", 10.3" and 11.5" barrels were only for the hidden ones.
  const hg = guidePage(GUIDES.find((g) => g.slug === 'ar-15-handguard-length-chart')!, '2026-10-23T00:00:00Z');
  for (const col of ['7.5&quot; pistol', '9&quot; pistol', '10.3&quot; carbine', '11.5&quot; carbine']) assert.ok(!hg.includes(`<th scope="col">${col}</th>`), col);
  for (const col of ['16&quot; carbine', '16&quot; mid', '16&quot; pistol', '18&quot; rifle', '20&quot; rifle']) assert.ok(hg.includes(`<th scope="col">${col}</th>`), col);
  assert.doesNotMatch(hg, /10\.3|11\.5/);
  // Shared links and saved builds still open them (the builder keeps the whole catalog).
  assert.equal(toBuild(ar15, { ...baseSelection(ar15), barrel: 'ar-bbl-ba75' }).barrel?.id, 'ar-bbl-ba75');
});

/* ------------------------------------------------------------------ short-barrel rule, price index */

test('a barrel with no listed length raises no short-barrel issue; a short one still does', () => {
  const stock = ar15.parts.find((x) => x.slot === 'stock' && !x.attrs.brace)!;
  const short = part(ar15, 'ar-bbl-ba10');
  const { length, ...rest } = short.attrs;
  assert.equal(length, 10.3);
  assert.equal(shortBarrelStockIssue({ ...short, attrs: rest }, stock), undefined);
  assert.equal(shortBarrelStockIssue({ ...short, attrs: { ...rest, length: '10.3' } }, stock), undefined);
  assert.equal(shortBarrelStockIssue(short, stock)?.severity, 'error');
  assert.equal(shortBarrelStockIssue(part(ar15, 'ar-bbl-ba16'), stock), undefined);
});

test('the price index leaves out parts with no price', () => {
  const index = priceIndex(PLATFORMS);
  assert.equal(index.platforms.ar15.parts['ar-hg-mi9'], undefined);
  const vg6 = part(ar15, 'ar-mz-vg6');
  assert.deepEqual(index.platforms.ar15.parts['ar-mz-vg6'], [`${vg6.brand} ${vg6.name}`, bestOffer(vg6)!.price]);
  for (const p of PLATFORMS) {
    assert.equal(index.platforms[p.id].name, p.name);
    assert.deepEqual(Object.keys(index.platforms[p.id].parts).sort(), [...new Set(p.parts.filter((x) => bestOffer(x)).map((x) => x.id))].sort(), p.id);
    for (const [, price] of Object.values(index.platforms[p.id].parts)) assert.ok(price > 0, p.id);
  }
  const tiny = { ...ar15, id: 'tiny', parts: [vg6, { ...vg6, id: 'no-price', offers: [] }] };
  assert.deepEqual(Object.keys(priceIndex([tiny]).platforms.tiny.parts), ['ar-mz-vg6']);
});
