// Unit tests for the fit engine, build status and saved builds / share links, run against the real catalog.
// Bundled with esbuild by `npm test` (like check-data), then run with node (node --test skips files under node_modules).
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { awarenessFor } from '../src/awareness';
import { PLATFORMS } from '../src/data/index';
import { NFA_SHORT_NOTICE, PAUSED, SBR_MESSAGE, VERTICAL_GRIP_MESSAGE, parts as buildParts, shortBarrelStockIssue } from '../src/data/helpers';
import { biggestDrops, daysAgo, hasHistory, partSeries, priceOn, recentChange, seriesOf } from '../src/data/history';
import { baseSelection, bestOffer, candidateIssues, issuesFor, listedParts, noPriceNote, ownedOf, placementOf, presetSelection, priceRange, selectionTokens, singleRetailerCarts, toBuild, toBuyIds, unpricedCount, worst, type Selection } from '../src/engine';
import { findParts } from '../src/find';
import { Candidate } from '../src/Picker';
import { buildStatus, statesFor } from '../src/status';
import { loadSavedBuilds, priceChanges, priceSnapshot, readSharedBuild, selectionFromParts, storeSavedBuilds, totalOf, unpricedOf, type SavedBuild } from '../src/store';
import { Dock, PartsList, Summary, toLegalNotice } from '../src/BuilderPage';
import { ComparePage } from '../src/Compare';
import { HomePage } from '../src/HomePage';
import { BuildCard, ChangeChip, legalOnly } from '../src/ui';
import { PAGE_VIEWS, feedbackPage, guidePage, indexPage, notFoundPage, platformPage, privacyPage, sitemap, termsPage } from '../src/guides/render';
import { PRIVACY_MD, TERMS_MD, legalHtml } from '../src/guides/legal';
import { AlertsPanel } from '../src/SavedPage';
import { GUIDES, type FitChart } from '../src/guides/content';
import { RETAILERS } from '../src/data/retailers';
import { priceIndex } from './og-index';
import { retailersFrom } from './sources.mjs';
import { cardNotice } from './og-notice';
import history from '../data/price-history.json';
import sources from '../data/sources.json';
import type { Issue, Part, Platform } from '../src/types';

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

/* ------------------------------------------------------------------ short barrels with a stock: a legal notice, not a conflict */

const ar9 = platform('ar9');
const ar10 = platform('ar10');
/** The owner-approved wording, byte for byte. */
const SBR_TEXT = 'A barrel under 16" with a stock may be regulated under the National Firearms Act and can require ATF approval before assembly. Some states ban it. Not legal advice: check federal, state and local law before you build.';
const GRIP_TEXT = 'A vertical foregrip on a pistol with a barrel under 16" may be regulated under the National Firearms Act and can require ATF approval. Not legal advice: check federal, state and local law before you build.';
const sbr = (issues: Issue[]) => issues.filter((i) => i.message === SBR_MESSAGE);
const SHORT_AR15 = ['ar-bbl-ba10', 'ar-bbl-ba115', 'ar-bbl-ba300-9', 'ar-bbl-ba75'];
/** One clean full build per short AR-15 barrel: the factory build with a gas tube, rail and muzzle device that suit it. */
const CLEAN_SHORT_AR15: Record<string, Selection> = {
  'ar-bbl-ba75': { barrel: 'ar-bbl-ba75', gastube: 'ar-gt-pistol', handguard: 'ar-hg-mi7' },
  'ar-bbl-ba300-9': { barrel: 'ar-bbl-ba300-9', gastube: 'ar-gt-pistol', handguard: 'ar-hg-mi7', muzzle: 'ar-mz-sf3p30' },
  'ar-bbl-ba10': { barrel: 'ar-bbl-ba10', handguard: 'ar-hg-bcm10' },
  'ar-bbl-ba115': { barrel: 'ar-bbl-ba115', handguard: 'ar-hg-bcm10' },
};
const SBR_WARN = { severity: 'warn', slots: ['barrel', 'stock'], message: SBR_TEXT, legal: true };
const GRIP_WARN = { severity: 'warn', slots: ['foregrip', 'barrel'], message: GRIP_TEXT, legal: true };

test('the short-barrel and vertical-foregrip messages are the approved wording', () => {
  assert.equal(SBR_MESSAGE, SBR_TEXT);
  assert.equal(VERTICAL_GRIP_MESSAGE, GRIP_TEXT);
});

test('an AR-15 barrel under 16" with any stock is a legal warning on both, and the build can still be complete', () => {
  const short = ar15.parts.filter((p) => p.slot === 'barrel' && (p.attrs.length as number) < 16);
  assert.deepEqual(short.map((p) => p.id).sort(), SHORT_AR15);
  const stocks = ar15.parts.filter((p) => p.slot === 'stock');
  assert.ok(stocks.length >= 5);
  for (const b of short)
    for (const s of stocks) {
      // Each barrel's clean build, with a rifle buffer for a rifle-tube stock, so the short-barrel warning is all that's left.
      const rifleTube = !(s.attrs.fits as string[]).includes('carbine');
      const build = toBuild(ar15, { ...baseSelection(ar15), ...CLEAN_SHORT_AR15[b.id], stock: s.id, ...(rifleTube ? { buffer: 'ar-buf-rifle' } : {}) });
      const issues = issuesFor(ar15, build);
      assert.deepEqual(sbr(issues).map((i) => [i.severity, [...i.slots].sort()]), [['warn', ['barrel', 'stock']]], `${b.id} + ${s.id}`);
      assert.deepEqual(sbr(issues).map((i) => i.legal), [true], `${b.id} + ${s.id}`);
      assert.deepEqual(issues.filter((i) => i.severity === 'error'), [], `${b.id} + ${s.id}`);
      assert.equal(statesFor(ar15, build).states.barrel, 'warn', `${b.id} + ${s.id}`);
      assert.equal(statesFor(ar15, build).states.stock, 'warn', `${b.id} + ${s.id}`);
      assert.equal(buildStatus(ar15, build, issues).complete, true, `${b.id} + ${s.id}`);
    }
  // A clean full build with each short barrel is complete, with the legal warning as its one check.
  for (const id of SHORT_AR15) {
    const build = toBuild(ar15, { ...baseSelection(ar15), ...CLEAN_SHORT_AR15[id] });
    assert.equal(build.barrel?.id, id);
    const issues = issuesFor(ar15, build);
    assert.deepEqual(issues.filter((i) => i.severity !== 'info'), [SBR_WARN], id);
    assert.deepEqual(buildStatus(ar15, build, issues), { cls: 'warn', text: 'Complete · 1 check to review', complete: true }, id);
  }
});

test('an AR-15 barrel of 16" or more with any stock raises no short-barrel issue', () => {
  const long = ar15.parts.filter((p) => p.slot === 'barrel' && (p.attrs.length as number) >= 16);
  assert.ok(long.length >= 10);
  for (const b of long)
    for (const s of ar15.parts.filter((p) => p.slot === 'stock'))
      assert.deepEqual(sbr(issuesFor(ar15, toBuild(ar15, { ...baseSelection(ar15), barrel: b.id, stock: s.id }))), [], `${b.id} + ${s.id}`);
});

test('the short AR-15 barrels are listed in the picker and search, and open from links and saved builds', () => {
  const listed = listedParts(ar15, 'barrel').map((p) => p.id);
  for (const id of SHORT_AR15) {
    assert.ok(!('hidden' in part(ar15, id)), `${id} has no hidden flag`);
    assert.ok(listed.includes(id), id);
    // The name without its inch marks: search reads `9"` as "9 in", and the 9" barrel's text has no "in" (a search quirk).
    assert.ok(findParts(part(ar15, id).name.replace(/"/g, ''), ar15).here.some((f) => f.part.id === id), `${id} found by name`);
    const url = part(ar15, id).offers.find((o) => o.url)?.url;
    assert.ok(url, `${id} has a product link`);
    assert.ok(findParts(url, ar15).here.some((f) => f.part.id === id), `${id} found by link`);
  }
  assert.ok(ar15.parts.every((p) => !('hidden' in p)));
  assert.deepEqual(listed, ar15.parts.filter((p) => p.slot === 'barrel').map((p) => p.id));
  // A share token and a ?b= link resolve the short barrel, and the build shows the short-barrel warning.
  const sel = { ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba10'] };
  const back = selectionFromParts('ar15', selectionTokens(sel));
  assert.deepEqual(back, sel);
  Object.defineProperty(globalThis, 'location', { value: { search: `?b=${encodeURIComponent(`ar15~${selectionTokens(sel).join('.')}`)}`, origin: 'https://example.test', pathname: '/' }, configurable: true });
  assert.deepEqual(readSharedBuild(), { platform: 'ar15', selection: sel });
  const build = toBuild(ar15, back);
  assert.equal(build.barrel?.id, 'ar-bbl-ba10');
  const issues = issuesFor(ar15, build);
  assert.deepEqual(sbr(issues), [SBR_WARN]);
  assert.deepEqual(buildStatus(ar15, build, issues), { cls: 'warn', text: 'Complete · 1 check to review', complete: true });
});

test('AR-9: a stock on a short barrel is a legal warning; a brace, or a 16" barrel, is not', () => {
  const at = (over: Selection) => issuesFor(ar9, toBuild(ar9, { ...baseSelection(ar9), ...over }));
  const shortBarrels = ar9.parts.filter((p) => p.slot === 'barrel' && (p.attrs.length as number) < 16);
  const stocks = ar9.parts.filter((p) => p.slot === 'stock' && !p.attrs.brace);
  const braces = ar9.parts.filter((p) => p.slot === 'stock' && p.attrs.brace);
  assert.ok(shortBarrels.length && stocks.length && braces.length);
  for (const b of shortBarrels) {
    for (const s of stocks) assert.deepEqual(sbr(at({ barrel: b.id, stock: s.id })), [SBR_WARN], `${b.id} + ${s.id}`);
    for (const s of braces) {
      assert.deepEqual(sbr(at({ barrel: b.id, stock: s.id })), [], `${b.id} + ${s.id}`);
      assert.deepEqual(at({ barrel: b.id, stock: s.id }).filter((i) => i.severity === 'error' && i.slots.includes('stock')), [], `${b.id} + ${s.id}`);
    }
  }
  for (const s of [...stocks, ...braces]) assert.deepEqual(sbr(at({ barrel: 'a9-bbl-aero16', stock: s.id })), [], s.id);
  const sel = { ...baseSelection(ar9), barrel: 'a9-bbl-faxon85' };
  const issues = issuesFor(ar9, toBuild(ar9, sel));
  assert.deepEqual(issues.filter((i) => i.severity === 'error'), []);
  assert.equal(buildStatus(ar9, toBuild(ar9, sel), issues).complete, true);
});

test('AR-9: a vertical foregrip on a short braced or stockless build is a legal warning; an angled grip or hand stop is not', () => {
  const fgIssues = (sel: Selection) => issuesFor(ar9, toBuild(ar9, sel)).filter((i) => i.severity !== 'info' && i.slots.includes('foregrip'));
  const braced = { ...baseSelection(ar9), barrel: 'a9-bbl-faxon85', stock: 'a9-brace-sba3' };
  const legalPoints = (sel: Selection) => issuesFor(ar9, toBuild(ar9, sel)).filter((i) => i.legal || i.message === GRIP_TEXT);
  for (const fg of ['r-fg-mvg', 'r-fg-bcmvg']) {
    assert.deepEqual(fgIssues({ ...braced, foregrip: fg }), [GRIP_WARN], fg);
    assert.deepEqual(errors(ar9, { ...braced, foregrip: fg }), [], `${fg} braced: no conflicts`);
    const { stock, ...noStock } = { ...braced, foregrip: fg };
    assert.ok(stock);
    assert.deepEqual(fgIssues(noStock), [GRIP_WARN], `${fg} with no stock`);
    assert.deepEqual(errors(ar9, noStock), [], `${fg} with no stock: no conflicts`);
    assert.deepEqual(fgIssues({ ...braced, barrel: 'a9-bbl-aero16', foregrip: fg }), [], `${fg} on 16"`);
    assert.deepEqual(legalPoints({ ...braced, barrel: 'a9-bbl-aero16', foregrip: fg }), [], `${fg} on 16"`);
  }
  // Angled grips and hand stops raise no legal point (the AFG-2 still gets its Picatinny-on-M-LOK check).
  for (const fg of ['r-fg-kag', 'r-fg-afg2', 'r-fg-stop']) {
    assert.deepEqual(legalPoints({ ...braced, foregrip: fg }), [], fg);
    assert.deepEqual(errors(ar9, { ...braced, foregrip: fg }), [], fg);
  }
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
  assert.deepEqual(sbr(ar10.rules(build)), [SBR_WARN]);
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

const PAUSED_IDS = ['ARD', 'AT3', 'MID', 'PA', 'RA', 'VED'];

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

/* ------------------------------------------------------------------ links-only retailers */

// Links only stops the scripts' requests and nothing else: to the site these stores are ordinary retailers.
const LINKS_ONLY_IDS = ['BRN', 'CTD', 'PSA', 'SIG'];
const RAW_LINKS = (sources as unknown as { parts: Record<string, Record<string, string>> }).parts;

test('the links-only retailers are not paused, and one of them alone gives a part no pausedThrough', () => {
  assert.deepEqual(Object.keys((sources as unknown as { linksOnly: object }).linksOnly).sort(), LINKS_ONLY_IDS);
  for (const id of LINKS_ONLY_IDS) assert.ok(!PAUSED.has(id), id);
  const clean = Object.entries(RAW_LINKS).filter(([, b]) => LINKS_ONLY_IDS.some((r) => b[r]) && !Object.keys(b).some((r) => PAUSED.has(r)));
  assert.ok(clean.length > 50, `${clean.length} parts`);
  for (const [id, byRetailer] of clean) {
    const retailer = LINKS_ONLY_IDS.find((r) => byRetailer[r])!;
    const [built] = buildParts('slot', [{ id, offers: [[retailer, 100]] } as never]);
    assert.equal(built.pausedThrough, undefined, id);
  }
});

test('the links-only retailers\' sample offers are still shown, each with its tracked link', () => {
  const [built] = buildParts('slot', [{ id: 'no-such-part', offers: LINKS_ONLY_IDS.map((r) => [r, 100]) } as never]);
  assert.deepEqual(built.offers.map((o) => o.retailer), LINKS_ONLY_IDS);
  assert.equal(built.pausedThrough, undefined);
  const shown = PLATFORMS.flatMap((p) => p.parts).flatMap((x) => x.offers.filter((o) => LINKS_ONLY_IDS.includes(o.retailer) && o.url === RAW_LINKS[x.id]?.[o.retailer]));
  assert.ok(shown.length > 0);
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
/**
 * AT3 Tactical, Rainier Arms and MidwayUSA, paused later (robots.txt refuses the price bot). If it moves at merge, change
 * it here, in ROBOTS_PAUSE_DAY (scripts/sources.test.mjs) and in data/sources.json.
 */
const PAUSE_DAY_2 = '2026-10-26';
/** Midnight UTC, `days` after the pause date. */
const afterPause = (days: number) => new Date(Date.parse(PAUSE_DAY) + days * 86_400_000).toISOString();

test('a part any paused retailer priced carries the pause date; one none of them priced does not', () => {
  // Primary Arms prices only (the SLx scope), a Primary Arms live price (the MI handguard), and a part no paused store sells.
  assert.equal(part(ar15, 'ar-opt-slx16').pausedThrough, PAUSE_DAY);
  // The 10.3" barrel: a Primary Arms sample price and an AT3 link, so the later of the two dates.
  assert.equal(part(ar15, 'ar-bbl-ba10').pausedThrough, PAUSE_DAY_2);
  assert.equal(part(ar15, 'ar-hg-mi9').pausedThrough, PAUSE_DAY);
  assert.equal(part(ar15, 'ar-gt-pistol').pausedThrough, undefined);
  // A part an AT3, Rainier or Midway store priced carries the later date: the latest pause among the stores that priced it.
  assert.equal(part(ar15, 'ar-bcg-grendel').pausedThrough, PAUSE_DAY_2);
  const dates = everyPart().filter((x) => x.pausedThrough).map((x) => x.pausedThrough);
  assert.ok(dates.every((d) => d === PAUSE_DAY || d === PAUSE_DAY_2));
  assert.ok(dates.includes(PAUSE_DAY) && dates.includes(PAUSE_DAY_2), 'both pause dates are in use');
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

test('the home page drops leave out no part: a short barrel with a big enough drop is listed', () => {
  // A short AR-15 barrel given a price history (borrowed from any part that has one) and a live price well under it.
  const donor = everyPart().find((x) => hasHistory(x) && bestOffer(x)?.checkedAt);
  assert.ok(donor, 'some part has price history');
  for (const id of SHORT_AR15) {
    const real = part(ar15, id);
    const live = (price: number): Part => ({ ...real, id: donor.id, pausedThrough: donor.pausedThrough, offers: [{ retailer: donor.offers[0].retailer, price, inStock: true, checkedAt: '2026-10-23T00:00:00Z' }] });
    const was = priceOn(live(1), daysAgo(7));
    const now = Math.round(was * 50) / 100;
    assert.ok(now > 0 && was - now >= Math.max(5, was * 0.05), `${id}: a drop big enough to list`);
    const synthetic = live(now);
    assert.ok((synthetic.attrs.length as number) < 16 && synthetic.slot === 'barrel');
    assert.deepEqual(biggestDrops([synthetic], 7, 10).map((d) => [d.part.name, d.was, d.now]), [[real.name, was, now]], id);
  }
  // And the real catalog: any short barrel whose drop qualifies is in the list.
  const drops = new Set(biggestDrops(everyPart(), 7, 10_000).map((d) => d.part.id));
  for (const id of SHORT_AR15) {
    const x = part(ar15, id);
    const p = priceOn(x, daysAgo(7));
    const n = bestOffer(x)?.price;
    if (hasHistory(x) && bestOffer(x)?.checkedAt && n !== undefined && p - n >= Math.max(5, p * 0.05)) assert.ok(drops.has(id), id);
  }
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
  const x = ar15.parts.find((p) => p.pausedThrough === PAUSE_DAY && bestOffer(p) && p.slot === 'handguard')!;
  assert.ok(x, 'an AR-15 handguard a retailer paused on PAUSE_DAY priced');
  const sel = { ...baseSelection(ar15), handguard: x.id };
  const now = priceSnapshot('ar15', sel);
  const cheaper = { ...now, [x.id]: now[x.id] - 30 };
  const before: SavedBuild = { id: 'p', name: 'Before', platform: 'ar15', selection: sel, savedAt: '2026-10-01T00:00:00Z', prices: cheaper };
  assert.deepEqual(priceChanges(before), { changes: [], drop: 0 });
  // Saved after both pauses (2026-10-24 and PAUSE_DAY_2), so no price in it predates a pause of a store that priced it.
  const after: SavedBuild = { ...before, id: 'q', savedAt: afterPause(3) };
  assert.ok(after.savedAt.slice(0, 10) > PAUSE_DAY_2);
  assert.deepEqual(priceChanges(after).changes.map((c) => [c.part.id, c.was, c.now]), [[x.id, now[x.id] - 30, now[x.id]]]);
  // Loading resets that one price to today's and notes when, so later changes show again; other parts keep theirs.
  // "Today" is fixed at four days after the first pause (two after the second), so the test doesn't depend on the date it runs.
  mock.timers.enable({ apis: ['Date'], now: Date.parse(afterPause(4)) });
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

test('the home page counts every part (once) but not paused retailers, and notes a starter build with no-price parts', () => {
  const html = renderToStaticMarkup(createElement(HomePage, { onPick: () => {}, onStart: () => {}, onBrowse: () => {} })).replace(/<!-- -->/g, '');
  const parts = new Set(PLATFORMS.flatMap((p) => p.parts.map((x) => x.id))).size;
  const stores = Object.keys(RETAILERS).length - PAUSED.size;
  assert.equal(html.match(/(\d+) parts · /)?.[1], String(parts));
  assert.ok(html.includes(`${PLATFORMS.length} platforms · ${parts} parts · ${stores} retailers compared`), 'hero facts');
  for (const p of PLATFORMS) {
    const k = unpricedOf(p, toBuild(p, presetSelection(p, 'budget')));
    if (k) assert.ok(html.includes(noPriceNote(k)), p.id);
  }
});

/* ------------------------------------------------------------------ short barrels on the static pages */

const HANDGUARD_DESCRIPTION = 'Which handguard fits a 10.3", 11.5", 16", 18" or 20" AR-15 barrel? Every rail we list, charted by barrel length and gas system.';

test('the static pages list the whole catalog, short barrels included: tables, fit charts and counts', () => {
  const short = SHORT_AR15.map((id) => part(ar15, id));
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const view = PAGE_VIEWS.find((v) => v.pageId === 'ar15')!;
  assert.deepEqual(view.parts.map((x) => x.id), ar15.parts.map((x) => x.id));
  const page = platformPage(view);
  for (const x of short) assert.ok(page.includes(esc(x.name)), x.id);
  const all = ar15.parts;
  assert.ok(page.includes(`${all.length} parts from ${new Set(all.map((x) => x.brand)).size} brands`));
  assert.ok(page.includes(`${all.length} parts checked for fit`));
  const barrels = all.filter((x) => x.slot === 'barrel').length;
  assert.ok(page.includes(`${barrels} options`), 'barrel count');
  // The handguard chart has a column for every barrel length and gas system we list, the short ones included.
  const guide = GUIDES.find((g) => g.slug === 'ar-15-handguard-length-chart')!;
  assert.equal(guide.description, HANDGUARD_DESCRIPTION);
  const hg = guidePage(guide, '2026-10-23T00:00:00Z');
  assert.ok(hg.includes(`<meta name="description" content="${esc(HANDGUARD_DESCRIPTION)}" />`), 'description meta');
  const cols = ['7.5&quot; pistol', '9&quot; pistol', '10.3&quot; carbine', '11.5&quot; carbine', '16&quot; carbine', '16&quot; mid', '16&quot; pistol', '18&quot; rifle', '20&quot; rifle'];
  for (const col of cols) assert.ok(hg.includes(`<th scope="col">${col}</th>`), col);
  assert.equal(hg.match(/<th scope="col">[^<]+<\/th>/g)?.length, cols.length, 'column count');
  // Every AR-15 guide that charts barrels shows each short one: by name in a fit list, or as its column in a grid
  // (the handguard chart groups barrels by length and gas). The barrel FAQ and the handguard chart are among them.
  const chartsBarrels = (c: FitChart) => ('a' in c ? c.a === 'barrel' || c.b === 'barrel' : c.slot === 'barrel');
  const charting = GUIDES.filter((g) => g.platform === 'ar15' && g.charts.some(chartsBarrels));
  assert.deepEqual(['ar-15-barrel-compatibility', 'ar-15-handguard-length-chart'].filter((s) => !charting.some((g) => g.slug === s)), []);
  for (const g of charting) {
    const html = guidePage(g, '2026-10-23T00:00:00Z');
    for (const c of g.charts.filter(chartsBarrels))
      for (const x of short)
        if ('columns' in c && c.b === 'barrel' && c.columns) assert.ok(html.includes(`<th scope="col">${esc(c.columns(x))}</th>`), `${g.slug} ${c.heading}: ${x.id} column`);
        else assert.ok(html.includes(esc(x.name)), `${g.slug} ${c.heading}: ${x.id}`);
  }
});

/* ------------------------------------------------------------------ short-barrel rule, price index */

test('a barrel with no listed length raises no short-barrel issue; a short one raises the legal warning', () => {
  const stock = ar15.parts.find((x) => x.slot === 'stock' && !x.attrs.brace)!;
  const short = part(ar15, 'ar-bbl-ba10');
  const { length, ...rest } = short.attrs;
  assert.equal(length, 10.3);
  assert.equal(shortBarrelStockIssue({ ...short, attrs: rest }, stock), undefined);
  assert.equal(shortBarrelStockIssue({ ...short, attrs: { ...rest, length: '10.3' } }, stock), undefined);
  assert.deepEqual(shortBarrelStockIssue(short, stock), SBR_WARN);
  assert.equal(shortBarrelStockIssue(short, { ...stock, attrs: { ...stock.attrs, brace: true } }), undefined);
  assert.equal(shortBarrelStockIssue(part(ar15, 'ar-bbl-ba16'), stock), undefined);
});

/* ------------------------------------------------------------------ the Legal notice in the builder, cards and Compare */

/** Text as React writes it into HTML. */
const reactEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
/** The title ids in a page's Legal notices, in order. */
const noticeTitleIds = (html: string) => [...html.matchAll(/<p class="legal-notice-title" id="([^"]+)">Legal notice<\/p>/g)].map((m) => m[1]);
/**
 * The exact Legal notice markup in `html` with this class, these messages and (for the summary's) this element id,
 * or '' when there's none. Its title's id is React's useId value, so it's read from the page, and the note must be
 * labelled by that same title.
 */
const LEGAL_NOTICE = (html: string, cls: string, messages: string[], id?: string) => {
  for (const t of noticeTitleIds(html)) {
    const notice = `<div class="${cls}" role="note" aria-labelledby="${t}"${id ? ` id="${id}" tabindex="-1"` : ''}><p class="legal-notice-title" id="${t}">Legal notice</p>${messages.map((m) => `<p>${reactEsc(m)}</p>`).join('')}</div>`;
    if (html.includes(notice)) return notice;
  }
  return '';
};

test('the builder summary shows a Legal notice for a short-barrel build, and it can still be shared', () => {
  const short = { ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba10'] };
  const html = summaryHtml(ar15, short);
  // The summary's notice is the Dock badge's focus target: id summary-legal, tabindex -1, named by its title.
  assert.ok(LEGAL_NOTICE(html, 'legal-notice', [SBR_TEXT], 'summary-legal'), 'notice');
  assert.equal(html.split('class="legal-notice"').length - 1, 1, 'one notice');
  assert.equal(html.split('id="summary-legal"').length - 1, 1, 'one summary-legal id');
  assert.match(html, /<button class="btn wide-row" title="Post this build to the Community page">Share to Community<\/button>/);
  // The notice sits under the status line and above Save / Share.
  assert.ok(html.indexOf('class="status warn"') < html.indexOf('class="legal-notice"') && html.indexOf('class="legal-notice"') < html.indexOf('class="total-actions"'));
  // In the Compatibility list it's tagged Legal, not Check.
  assert.ok(html.includes(`<li class="issue warn legal"><span class="issue-tag">Legal</span><span>${reactEsc(SBR_TEXT)}</span></li>`), 'compatibility row');
  const long = summaryHtml(ar15, baseSelection(ar15));
  assert.doesNotMatch(long, /legal-notice|Legal notice|issue warn legal/);
  assert.match(long, /<button class="btn wide-row" title="Post this build to the Community page">Share to Community<\/button>/);
});

test('the parts list and the mobile dock flag legal issues', () => {
  const noop = () => {};
  const rows = (sel: Selection) => {
    const build = toBuild(ar15, sel);
    const { issues, states } = statesFor(ar15, build);
    return renderToStaticMarkup(createElement(PartsList, { platform: ar15, build, issues, states, hover: null, onHover: noop, onOpen: noop, onRemove: noop, mounts: {}, onMount: noop, owned: ownedOf(sel), onToggleOwn: noop }));
  };
  // The barrel and the stock rows each carry it once.
  const short = rows({ ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba10'] });
  assert.equal(short.split(`<span class="row-issue warn legal">${reactEsc(SBR_TEXT)}</span>`).length - 1, 2);
  // Their fit tag reads Legal, not Check; no other row is tagged Legal.
  assert.equal(short.split('<span class="fit-tag warn legal">Legal</span>').length - 1, 2);
  assert.equal(short.split('>Legal</span>').length - 1, 2);
  assert.doesNotMatch(rows(baseSelection(ar15)), /legal/);
  const dock = (legal: boolean) => renderToStaticMarkup(createElement(Dock, { total: 100, status: { cls: 'warn', text: 'x' }, toBuy: false, noPrice: '', legal }));
  assert.ok(dock(true).includes('<button class="dock-legal" aria-label="Legal notice: see the summary" aria-controls="summary-legal">Legal</button>'), 'dock badge');
  assert.doesNotMatch(dock(false), /dock-legal/);
});

test('the dock\'s Legal badge scrolls to the summary\'s Legal notice and focuses it', () => {
  const calls: string[] = [];
  const el = { scrollIntoView: (o: unknown) => calls.push(`scroll ${JSON.stringify(o)}`), focus: (o: unknown) => calls.push(`focus ${JSON.stringify(o)}`) };
  const asked: string[] = [];
  toLegalNotice({ getElementById: (id: string) => (asked.push(id), el as unknown as HTMLElement) });
  assert.deepEqual(asked, ['summary-legal']);
  assert.deepEqual(calls, ['scroll {"behavior":"smooth","block":"center"}', 'focus {"preventScroll":true}']);
  // No notice on the page (it went away): nothing happens, nothing throws.
  toLegalNotice({ getElementById: () => null });
  // The id it looks for is the one the summary's notice carries.
  const html = summaryHtml(ar15, { ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba10'] });
  assert.match(html, /<div class="legal-notice" role="note" aria-labelledby="[^"]+" id="summary-legal" tabindex="-1">/);
});

test('the picker tags a candidate Legal when its only checks are legal points', () => {
  const noop = () => {};
  const cand = (p: Platform, sel: Selection, id: string) => {
    const candidate = part(p, id);
    const issues = candidateIssues(p, toBuild(p, sel), candidate);
    return { issues, html: renderToStaticMarkup(createElement(Candidate, { part: candidate, issues, sev: worst(issues) ?? 'ok', selected: false, owned: false, onChoose: noop, onBuyClick: noop })) };
  };
  // A short AR-15 barrel against a build with a stock: Legal tag and the approved message as a legal line.
  const shortSel = { ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba10'] };
  assert.ok(shortSel.stock);
  const short = cand(ar15, shortSel, 'ar-bbl-ba10');
  assert.deepEqual(short.issues.filter((i) => i.severity !== 'info'), [SBR_WARN]);
  assert.ok(short.html.includes('<span class="fit-tag warn legal">Legal</span>'), 'legal tag');
  assert.ok(short.html.includes(`<p class="row-issue warn legal">${reactEsc(SBR_TEXT)}</p>`), 'legal line');
  assert.doesNotMatch(short.html, /fit-tag warn">Check/);
  // A 16" barrel on the same build: neither.
  const long = cand(ar15, baseSelection(ar15), 'ar-bbl-ba16');
  assert.doesNotMatch(long.html, /legal|Legal/);
  // An AR-9 vertical foregrip on a short braced build: Legal tag and the vertical-grip message.
  const braced = { ...baseSelection(ar9), barrel: 'a9-bbl-faxon85', stock: 'a9-brace-sba3' };
  const grip = cand(ar9, braced, 'r-fg-mvg');
  assert.deepEqual(grip.issues.filter((i) => i.severity !== 'info'), [GRIP_WARN]);
  assert.ok(grip.html.includes('<span class="fit-tag warn legal">Legal</span>'), 'grip legal tag');
  assert.ok(grip.html.includes(`<p class="row-issue warn legal">${reactEsc(GRIP_TEXT)}</p>`), 'grip legal line');
});

test('a part is tagged Legal only when every check it has (notes aside) is a legal point', () => {
  const legal: Issue = { severity: 'warn', slots: ['barrel'], message: 'L', legal: true };
  const check: Issue = { severity: 'warn', slots: ['barrel'], message: 'C' };
  const note: Issue = { severity: 'info', slots: ['barrel'], message: 'N' };
  const conflict: Issue = { severity: 'error', slots: ['barrel'], message: 'E' };
  assert.equal(legalOnly([legal]), true);
  assert.equal(legalOnly([legal, note]), true);
  assert.equal(legalOnly([legal, check]), false);
  assert.equal(legalOnly([legal, conflict]), false);
  assert.equal(legalOnly([note]), false);
  assert.equal(legalOnly([]), false);
  // A legal point next to an ordinary check reads Check in the picker, with the legal line still marked legal.
  const html = renderToStaticMarkup(createElement(Candidate, { part: part(ar15, 'ar-bbl-ba10'), issues: [legal, check], sev: 'warn', selected: false, owned: false, onChoose: () => {}, onBuyClick: () => {} }));
  assert.ok(html.includes('<span class="fit-tag warn">Check</span>'));
  assert.ok(html.includes('<p class="row-issue warn legal">L</p>') && html.includes('<p class="row-issue warn">C</p>'));
});

test('build cards show the Legal notice for short-barrel builds and the AR-9 vertical grip', () => {
  const card = (platformId: string, sel: Selection) => renderToStaticMarkup(createElement(BuildCard, { platformId, selection: sel, title: 'T', meta: 'M', actions: null }));
  const short = card('ar15', { ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba75'] });
  assert.ok(LEGAL_NOTICE(short, 'legal-notice compact', [SBR_TEXT]), 'short AR-15 card');
  assert.ok(short.indexOf('legal-notice') < short.indexOf('build-card-foot'), 'above the price and status');
  assert.doesNotMatch(card('ar15', baseSelection(ar15)), /legal-notice/);
  const grip = card('ar9', { ...baseSelection(ar9), barrel: 'a9-bbl-faxon85', stock: 'a9-brace-sba3', foregrip: 'r-fg-mvg' });
  assert.ok(LEGAL_NOTICE(grip, 'legal-notice compact', [GRIP_TEXT]), 'AR-9 vertical grip card');
});

test('Compare shows the Legal notice under the side that needs it', () => {
  const page = (a: Selection, b: Selection) => renderToStaticMarkup(createElement(ComparePage, {
    items: [{ kind: 'Saved', name: 'A', platform: 'ar15', selection: a }, { kind: 'Saved', name: 'B', platform: 'ar15', selection: b }],
    onSet: () => {}, saved: [], current: null, lastPlatform: 'ar15', onOpen: () => {},
  }));
  const html = page({ ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba115'] }, baseSelection(ar15));
  const notice = LEGAL_NOTICE(html, 'legal-notice compact', [SBR_TEXT]);
  assert.ok(notice);
  assert.equal(html.split(notice).length - 1, 1);
  assert.equal(noticeTitleIds(html).length, 1);
  // It's on side A, after its header and before side B's.
  assert.ok(html.indexOf('<h2>A</h2>') < html.indexOf(notice) && html.indexOf(notice) < html.indexOf('<h2>B</h2>'));
  assert.ok(html.includes(`<li class="row-issue warn legal">${reactEsc(SBR_TEXT)}</li>`), 'fit notes');
  assert.doesNotMatch(page(baseSelection(ar15), baseSelection(ar15)), /legal/);
  // Both sides short: two notices, each labelled by its own title, and no id used twice on the page.
  const both = page({ ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba115'] }, { ...baseSelection(ar15), ...CLEAN_SHORT_AR15['ar-bbl-ba10'] });
  const titles = noticeTitleIds(both);
  assert.equal(titles.length, 2);
  assert.notEqual(titles[0], titles[1]);
  for (const t of titles) assert.ok(both.includes(`role="note" aria-labelledby="${t}">`), t);
  const ids = [...both.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
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

/* ------------------------------------------------------------------ compliance round 1: notices and wording */

/** The owner-approved short notice (2026-10-26), byte for byte. */
const SHORT_NOTICE_TEXT = 'May be regulated under the NFA. Not legal advice: check federal, state and local law.';
const BUILT = '2026-10-26T00:00:00Z';
const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The static pages' Legal notice, with the builder's own label, carrying these messages. */
const PAGE_LEGAL_NOTICE = (messages: string[]) =>
  `<div class="legal-notice" role="note" aria-labelledby="page-legal-title"><p class="legal-notice-title" id="page-legal-title">Legal notice</p>${messages.map((m) => `<p>${htmlEsc(m)}</p>`).join('')}</div>`;
const hasPageNotice = (html: string) => /class="legal-notice"|Legal notice/.test(html);

test('the short NFA notice is the approved wording, marked as owner-approved', () => {
  assert.equal(NFA_SHORT_NOTICE, SHORT_NOTICE_TEXT);
  assert.match(readFileSync('src/data/helpers.ts', 'utf8'), /\/\*\* Owner-approved wording \(2026-10-26\)\. \*\/\r?\nexport const NFA_SHORT_NOTICE = /);
});

const M6_DESCRIPTION = 'Barrel length and a stock or brace can change how an AR-9 is regulated. See which barrels, stocks and braces we list, and check your federal, state and local laws.';
const M6_LEDE = 'Many AR-9s use short barrels, and the stock or brace you pick can change how the build may be regulated. This is a general summary, not legal advice; check federal, state and local law before you build.';
const M6_ANSWERS = [
  'A barrel <b>16" or longer</b> with a stock is generally treated as a rifle under federal law.',
  'A barrel <b>under 16" with a stock</b> may be regulated as a short-barreled rifle (SBR) under the National Firearms Act, which can require ATF approval before assembly (you file ATF Form 1). Some states ban them.',
  'A barrel under 16" with <b>no stock</b> is generally built as a pistol. Pistol brace rules have changed several times, so check current federal law before using one.',
  'Some states ban SBRs or braces, or restrict pistol builds further. Check your state and local laws.',
];
const FFL_FOOTER = 'Parts marked FFL are serialized and treated as the firearm under federal law, so they ship to a licensed dealer. Laws vary by state.';

test('guide, FAQ and footer text state no flat legal conclusions', () => {
  const FLAT = [/is a short-barreled rifle\b/, /decides? what the gun is/, /is built as a pistol/, /with a stock<\/b> is a rifle/, /with a stock is a rifle/, /legally the firearm/i, /are the serialized firearm/];
  for (const f of ['src/guides/content.ts', 'src/guides/render.ts', 'src/App.tsx', 'src/types.ts']) {
    const text = readFileSync(f, 'utf8');
    for (const re of FLAT) assert.doesNotMatch(text, re, `${f}: ${re}`);
  }
  const pages = [indexPage(BUILT), ...GUIDES.map((g) => guidePage(g, BUILT)), ...PAGE_VIEWS.map((v) => platformPage(v))];
  for (const html of pages) for (const re of FLAT) assert.doesNotMatch(html, re);
  // The approved replacement wording.
  const g = GUIDES.find((x) => x.slug === 'ar-9-pistol-vs-sbr')!;
  assert.equal(g.description, M6_DESCRIPTION);
  assert.equal(g.lede, M6_LEDE);
  assert.deepEqual(g.answers, M6_ANSWERS);
  assert.ok(readFileSync('src/App.tsx', 'utf8').includes(`<p>${FFL_FOOTER}</p>`), 'app footer');
  assert.ok(pages[0].includes(htmlEsc('FFL marks the part that is serialized and treated as the firearm under federal law (a pistol frame or fire control unit, or an AR lower receiver), so it ships to a licensed dealer near you, who handles the transfer and background check.')), 'FAQ answer');
  assert.ok(pages[0].includes('Parts that are serialized and treated as the firearm under federal law ship to a licensed dealer, and laws vary by state.'), 'static footer');
});

test('our own spec chips, pick notes and guide text say M16 profile and linear comp, not full auto or flash can; no source cites 80% Arms', () => {
  const ours = PLATFORMS.flatMap((p) => p.parts.flatMap((x) => [...x.specs, x.pick?.note ?? '']));
  const guideText = GUIDES.flatMap((g) => [g.title, g.h1, g.description, g.lede, ...g.answers, ...g.charts.flatMap((c) => [c.heading, c.intro])]);
  for (const t of [...ours, ...guideText]) assert.doesNotMatch(t, /full[- ]?auto|flash can/i, t);
  for (const f of ['src/guides/content.ts', 'src/data/ar9.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), /80percentarms|80% Arms/i, f);
  assert.ok(GUIDES.every((g) => g.sources.every((s) => !/80percentarms/.test(s.url))));
  // The new wording.
  for (const id of ['ar-bcg-psa', 'ar-bcg-toolcraft', 'ar-bcg-aero']) assert.ok(part(ar15, id).specs.includes('M16 profile'), id);
  assert.match(part(ar15, 'ar-bcg-psa').pick!.note, /^M16-profile carrier, /);
  assert.ok(part(ar9, 'a9-mz-kak').specs.includes('Linear comp'));
  assert.ok(GUIDES.find((g) => g.slug === 'ar-9-buffer-and-muzzle-device')!.answers.some((a) => a.includes('9mm linear compensator')));
  // The LRBHO guide keeps its Aero source.
  assert.deepEqual(GUIDES.find((g) => g.slug === 'ar-9-last-round-bolt-hold-open')!.sources.map((s) => s.url), ['https://support.aeroprecisionusa.com/hc/en-us/articles/14130603136535-What-do-I-need-to-build-my-EPC-9']);
  // The makers' own product titles stay as they are.
  assert.equal(part(ar9, 'a9-mag-g33').name, 'G18 9mm Magazine, 33 Round');
  assert.equal(part(ar9, 'a9-mz-kak').name, 'Slimline Flash Can 1/2x28');
  assert.equal(part(ar15, 'ar-bcg-psa').name, 'M16 Nitride BCG');
});

/** The old L15 claim and its parts: "Some retailer links may earn us a small commission at no extra cost to you." */
const OLD_COMMISSION_CLAIM = /may earn us|small commission|earn us a\b|at no extra cost to you|never changes which parts we show/i;

test('no page or footer claims retailer commissions', () => {
  for (const f of ['src/App.tsx', 'src/guides/render.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), OLD_COMMISSION_CLAIM, f);
  const pages = [indexPage(BUILT), guidePage(GUIDES[0], BUILT), platformPage(PAGE_VIEWS[0])];
  for (const html of pages) assert.doesNotMatch(html, OLD_COMMISSION_CLAIM);
});

test('the AR-15 platform page shows the short-barrel Legal notice', () => {
  const page = platformPage(PAGE_VIEWS.find((v) => v.pageId === 'ar15')!);
  assert.ok(page.includes(PAGE_LEGAL_NOTICE([SBR_TEXT])), 'notice');
  assert.equal(page.match(/class="legal-notice"/g)?.length, 1, 'once');
  // Under the lede, before the button that opens the builder.
  assert.ok(page.indexOf('class="lede"') < page.indexOf('class="legal-notice"') && page.indexOf('class="legal-notice"') < page.indexOf('class="cta"'), 'placement');
});

test('the AR-9 platform page shows it too', () => {
  const page = platformPage(PAGE_VIEWS.find((v) => v.pageId === 'ar9')!);
  assert.ok(page.includes(PAGE_LEGAL_NOTICE([SBR_TEXT])));
});

test('a Glock page shows none, and only the AR-15 and AR-9 pages list a short barrel with a stock today', () => {
  for (const id of ['glock9', 'glock19', 'glock26', 'glock43x', 'glock20']) {
    const view = PAGE_VIEWS.find((v) => v.pageId === id);
    assert.ok(view, id);
    assert.ok(!hasPageNotice(platformPage(view)), id);
  }
  assert.deepEqual(PAGE_VIEWS.filter((v) => hasPageNotice(platformPage(v))).map((v) => v.pageId).sort(), ['ar15', 'ar9']);
});

test('the AR FAQ guides that list short barrels show the Legal notice; no other guide does', () => {
  const withNotice = ['ar-15-barrel-compatibility', 'ar-15-handguard-length-chart', 'ar-9-buffer-and-muzzle-device', 'ar-9-handguard-length-chart', 'ar-9-pistol-vs-sbr'];
  for (const slug of withNotice) {
    const html = guidePage(GUIDES.find((g) => g.slug === slug)!, BUILT);
    assert.ok(html.includes(PAGE_LEGAL_NOTICE([SBR_TEXT])), slug);
    assert.ok(html.indexOf('class="lede"') < html.indexOf('class="legal-notice"') && html.indexOf('class="legal-notice"') < html.indexOf('class="answers"'), `${slug} placement`);
  }
  assert.deepEqual(GUIDES.filter((g) => hasPageNotice(guidePage(g, BUILT))).map((g) => g.slug).sort(), withNotice);
  // Glock guides chart barrels too, but a pistol has no stock, so they carry none.
  assert.ok(!hasPageNotice(guidePage(GUIDES.find((g) => g.slug === 'glock-19-threaded-barrels')!, BUILT)));
});
/* ------------------------------------------------------------------ Privacy Policy and Terms of Use */

/** The page without its style and scripts (the CSS has attribute selectors like [hidden], the JSON-LD has arrays). */
const pageText = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
/** The published document itself, between the article tags. */
const docOf = (html: string) => html.slice(html.indexOf('<article class="legal-doc">'), html.indexOf('</article>'));

test('the Privacy Policy and Terms of Use pages render with their h1, at /privacy/ and /terms/', () => {
  const privacy = privacyPage();
  const terms = termsPage();
  assert.equal(privacy.match(/<h1>[^<]*<\/h1>/g)?.join(), '<h1>Drop-In Builds Privacy Policy</h1>');
  assert.equal(terms.match(/<h1>[^<]*<\/h1>/g)?.join(), '<h1>Drop-In Builds Terms of Use</h1>');
  assert.ok(privacy.includes('<link rel="canonical" href="https://dropinbuilds.com/privacy/" />'));
  assert.ok(terms.includes('<link rel="canonical" href="https://dropinbuilds.com/terms/" />'));
  assert.ok(!/noindex/.test(privacy) && !/noindex/.test(terms), 'both are indexable');
  // Every section heading of the approved text is on the page.
  for (const [md, html] of [[PRIVACY_MD, privacy], [TERMS_MD, terms]]) {
    const heads = [...md.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]);
    assert.ok(heads.length >= 10);
    for (const h of heads) assert.ok(html.includes(`>${htmlEsc(h)}</h`), h);
  }
});

/** Each legal page's own effective date, pinned word for word. */
const EFFECTIVE = { privacy: 'October 30, 2026', terms: 'October 26, 2026' } as const;

test('neither page carries draft notes, counsel flags or any placeholder, and each says its own effective date once', () => {
  for (const [name, md, html] of [['privacy', PRIVACY_MD, privacyPage()], ['terms', TERMS_MD, termsPage()]] as const) {
    const effective = `Effective: ${EFFECTIVE[name]}`;
    for (const text of [md, pageText(html)]) {
      assert.doesNotMatch(text, /DRAFT|Notes for the owner|\[Lawyer\]|counsel|not published/i, name);
      assert.equal(text.split(effective).length, 2, `${name}: "${effective}" exactly once`);
      assert.equal(text.match(/Effective:/g)?.length, 1, `${name}: one effective date`);
      assert.deepEqual(text.match(/\[[^\]]*\]/g), null, `${name}: no bracket placeholder`);
    }
    assert.ok(docOf(html).includes(`<p>${effective}</p>`), name);
  }
});

/** Owner-approved wording (2026-10-29): the privacy page's "Updated" line, its own paragraph under the effective date. */
const PRIVACY_UPDATED = 'Updated October 30, 2026: automatic deletion is now running (see section 5).';

test('the privacy page says once, under its effective date, that automatic deletion is running; the Terms have no Updated line', () => {
  const policy = docOf(privacyPage());
  const line = `<p>${htmlEsc(PRIVACY_UPDATED)}</p>`;
  assert.equal(policy.split(line).length, 2, 'Updated line exactly once, as its own paragraph');
  assert.ok(policy.includes(`<p>Effective: ${EFFECTIVE.privacy}</p>\n${line}`), 'directly under the effective date');
  assert.ok(PRIVACY_MD.includes(`\n\nEffective: ${EFFECTIVE.privacy}\n\n${PRIVACY_UPDATED}\n\n`), 'its own Markdown paragraph');
  for (const text of [TERMS_MD, pageText(termsPage())]) assert.doesNotMatch(text, /Updated/, 'terms');
});

/** Owner-approved wording (2026-10-29, with the owner's 2026-10-29 wording fixes to the intro and the hashed-identifier row): section 5 of the Privacy Policy once retention is live, typed out word for word. */
const RETENTION_INTRO = 'We delete the records below automatically, or remove the personal details from them, once they reach the period shown in the table; rows without a period follow the rule in that row. This runs once a day, so a record can be kept a little longer than shown. You can also ask us to delete your data sooner (section 6).';
/** Owner-approved wording (2026-10-29, with the owner's 2026-10-29 wording fix to the hashed-identifier row): every row of the section 5 "Data | Kept for" table, in order. */
const RETENTION_ROWS: [string, string][] = [
  ['Unconfirmed price alert signups', 'Deleted automatically after 7 days'],
  ['Confirmed price alerts (email address, watched builds)', 'Deleted from our database when you unsubscribe or turn off alerts'],
  ['Record that an address unsubscribed or used "Not you?" (hashed, no readable address)', 'Deleted after 90 days'],
  ['Signup limit records (hashed)', 'Deleted after 30 days'],
  ['Feedback email address', 'Removed 30 days after the feedback is emailed to us; if it is never emailed, deleted with the message'],
  ['Feedback message', 'Deleted 90 days after it is emailed to us, or 180 days after you sent it if it was never emailed'],
  ['Hashed network identifiers on alert signups, feedback and posted community builds (not those on votes and reports, which are kept as their rows say)', 'Removed after 30 days'],
  ['Retailer clicks on community builds', 'Deleted after 30 days (each build\'s click total stays, with no visitor data)'],
  ['Votes on community builds', 'Kept until you remove your vote; votes are not removed automatically'],
  ['Reports on community builds', 'Kept; reports are not removed automatically'],
  ['Community builds, including hidden ones', 'Kept until we remove them'],
];

test('the policy promises automatic deletion only to match RETENTION_LIVE in the Worker', () => {
  const live = readFileSync('worker/src/retention.js', 'utf8').match(/^export const RETENTION_LIVE = (true|false);\r?$/m);
  assert.ok(live, 'RETENTION_LIVE is declared in worker/src/retention.js');
  const policy = docOf(privacyPage());
  if (live[1] === 'false') {
    assert.ok(policy.includes('We are setting up automatic deletion for the records below. Until it is switched on, we keep these records, and we delete them when you ask (section 6).'), 'interim paragraph');
    // Every mention of automatic deletion is one the site keeps today: the 7-day unconfirmed-signup purge (runAlerts,
    // live whatever RETENTION_LIVE says), auto-hiding reported builds, or the interim and "not removed" wording.
    const allowed = ['Deleted automatically after 7 days', 'is hidden automatically', 'We are setting up automatic deletion', 'once automatic deletion is running', 'votes are not removed automatically', 'reports are not removed automatically'];
    const mentions = policy.replace(/<[^>]+>/g, ' ').split(/(?<=[.:;])\s+/).filter((s) => /automatic/i.test(s));
    assert.ok(mentions.length >= 4);
    for (const s of mentions) assert.ok(allowed.some((a) => s.includes(a)), s);
  } else {
    const s5 = policy.slice(policy.indexOf('<h2>5. How long we keep it</h2>'), policy.indexOf('<h2>6.'));
    assert.ok(s5.includes(`<p>${htmlEsc(RETENTION_INTRO)}</p>`), 'live intro');
    assert.ok(s5.includes('<thead><tr><th scope="col">Data</th><th scope="col">Kept for</th></tr></thead>'), '2-column header');
    for (const [data, kept] of RETENTION_ROWS) assert.ok(s5.includes(`<tr><th scope="row">${htmlEsc(data)}</th><td>${htmlEsc(kept)}</td></tr>`), data);
    assert.equal(s5.match(/<tr>/g)?.length, RETENTION_ROWS.length + 1, 'header plus exactly these rows');
    for (const text of [PRIVACY_MD, pageText(privacyPage())]) assert.doesNotMatch(text, /setting up|\bPlanned\b|switched on|once automatic deletion is running|update this policy when it starts|\|\s*Now\s*\||>Now</i);
    // Every mention of automatic deletion is one the code does: the live intro, the 7-day unconfirmed-signup purge,
    // auto-hiding reported builds, or the "not removed" wording.
    const allowed = ['Deleted automatically after 7 days', 'is hidden automatically', 'We delete the records below automatically, or remove the personal details from them, once they reach the period shown in the table', 'automatic deletion is now running', 'votes are not removed automatically', 'reports are not removed automatically'];
    const mentions = policy.replace(/<[^>]+>/g, ' ').split(/(?<=[.:;])\s+/).filter((s) => /automatic/i.test(s));
    assert.ok(mentions.length >= 4);
    for (const s of mentions) assert.ok(allowed.some((a) => s.includes(a)), s);
  }
});

test('the Terms name the Report button and the feedback form as the way to have content removed', () => {
  const terms = docOf(termsPage());
  const s9 = terms.slice(terms.indexOf('<h2>9. Reporting and removal</h2>'), terms.indexOf('<h2>10.'));
  assert.ok(s9.includes('<li><b>Report button:</b> if a community build breaks these terms, press Report on it.'), 'Report button');
  assert.ok(s9.includes('<li><b>Feedback form:</b> to ask us to remove a build, including your own,'), 'feedback form');
  assert.ok(s9.includes('<a href="/feedback/">dropinbuilds.com/feedback/</a>'), 'linked');
});

test('the legal pages link our own pages relatively, keep share-link examples as text, and render the retention table', () => {
  const policy = docOf(privacyPage());
  const terms = docOf(termsPage());
  assert.ok(policy.includes('see our Terms of Use at <a href="/terms/">dropinbuilds.com/terms/</a>'));
  assert.ok(terms.includes('Our Privacy Policy at <a href="/privacy/">dropinbuilds.com/privacy/</a>'));
  assert.ok(policy.includes('(dropinbuilds.com/?b=… and share.dropinbuilds.com/b/…)'), 'share-link examples stay text');
  assert.doesNotMatch(policy + terms, /href="https?:/, 'no absolute links');
  const rows = policy.match(/<tr>/g)?.length;
  assert.equal(rows, PRIVACY_MD.split('\n').filter((l) => l.startsWith('|')).length - 1, 'header and every row, no separator');
  assert.ok(policy.includes('<th scope="row">Unconfirmed price alert signups</th><td>Deleted automatically after 7 days</td></tr>'));
});

test('the sitemap lists the Privacy Policy and the Terms of Use', () => {
  const xml = sitemap(BUILT);
  for (const p of ['/privacy/', '/terms/']) assert.ok(xml.includes(`<loc>https://dropinbuilds.com${p}</loc>`), p);
});

test('the only commission wording anywhere is "we earn no commission"', () => {
  const pages = [privacyPage(), termsPage(), indexPage(BUILT), feedbackPage(), notFoundPage(), ...GUIDES.map((g) => guidePage(g, BUILT)), ...PAGE_VIEWS.map((v) => platformPage(v))];
  for (const html of pages) for (const m of html.matchAll(/commission/gi)) assert.equal(html.slice(m.index! - 11, m.index), 'we earn no ', html.slice(m.index! - 40, m.index! + 20));
  assert.doesNotMatch(readFileSync('src/App.tsx', 'utf8'), /commission/i);
});
const FOOT_LINKS = ['<a class="foot-link" href="/privacy/">Privacy Policy</a>', '<a class="foot-link" href="/terms/">Terms of Use</a>'];

test('every static page footer and the app footer link the Privacy Policy and the Terms of Use', () => {
  const pages = [privacyPage(), termsPage(), indexPage(BUILT), feedbackPage(), notFoundPage(), ...GUIDES.map((g) => guidePage(g, BUILT)), ...PAGE_VIEWS.map((v) => platformPage(v))];
  for (const html of pages) {
    const footer = html.slice(html.indexOf('<footer class="site-footer">'), html.indexOf('</footer>'));
    for (const link of FOOT_LINKS) assert.ok(footer.includes(link), link);
  }
  // The app's footer (also prerendered into the home page).
  const app = readFileSync('src/App.tsx', 'utf8');
  const footer = app.slice(app.indexOf('<footer className="site-footer">'), app.indexOf('</footer>'));
  for (const link of FOOT_LINKS) assert.ok(footer.includes(link.replace('class=', 'className=')), link);
});

test('the alerts signup panel, the feedback form and the FAQ email answer link the Privacy Policy', () => {
  const panel = renderToStaticMarkup(createElement(AlertsPanel, { signup: null, hasBuilds: true, onSignUp: async () => {}, onRefresh: () => {}, onStop: async () => {} }));
  assert.ok(panel.includes('We only use your address for these alerts. See our <a href="/privacy/">Privacy Policy</a>.'), 'alerts panel');
  const fb = feedbackPage();
  const form = fb.slice(fb.indexOf('<form id="feedback"'), fb.indexOf('</form>'));
  assert.ok(form.includes('Please don&#39;t include personal details you wouldn&#39;t want stored. See our <a href="/privacy/">Privacy Policy</a>.') || form.includes("Please don't include personal details you wouldn't want stored. See our <a href=\"/privacy/\">Privacy Policy</a>."), 'feedback form');
  const faq = indexPage(BUILT);
  const answer = "We only use it to send the price alerts you asked for. We don't sell it. Our email provider (Resend) and host (Cloudflare) process it to deliver the emails. Unsubscribing deletes it from our database; the providers may keep delivery logs for a limited time. See our Privacy Policy.";
  assert.ok(faq.includes(`<p>${htmlEsc(answer).replace('Privacy Policy.', '<a href="/privacy/">Privacy Policy</a>.')}</p>`), 'FAQ answer links the policy');
  // The FAQPage structured data carries the same answer as plain text.
  const ld = [...faq.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const qa = ld.find((j) => j['@type'] === 'FAQPage').mainEntity.find((e: { name: string }) => e.name === 'What do you do with my email address?');
  assert.equal(qa.acceptedAnswer.text, answer);
});
/** Owner-approved wording (2026-10-26), byte for byte. */
const MONEY_ANSWER = 'No. There are no affiliate links, and we earn no commission from retailers. Retailer links carry a tag so the store can see the visit came from Drop-In Builds.';

test('the FAQ answers "Do you make money from the links?" with the approved wording, on the page and in its structured data', () => {
  const faq = indexPage(BUILT);
  assert.ok(faq.includes(`<details><summary>Do you make money from the links?</summary><p>${htmlEsc(MONEY_ANSWER)}</p></details>`), 'on the page');
  const ld = [...faq.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const qa = ld.find((j) => j['@type'] === 'FAQPage').mainEntity.filter((e: { name: string }) => e.name === 'Do you make money from the links?');
  assert.equal(qa.length, 1);
  assert.equal(qa[0].acceptedAnswer.text, MONEY_ANSWER);
  // Marked as approved wording in the source.
  assert.match(readFileSync('src/guides/render.ts', 'utf8'), /\/\*\* Owner-approved wording \(2026-10-26\)\. \*\/\r?\n {4}\{ q: 'Do you make money from the links\?', a: 'No\. There are no affiliate links/);
});

test('the FAQ states the owner-approved drawings wording and credits the CC BY photo with its licence and changes', () => {
  const faq = indexPage(BUILT);
  assert.ok(faq.includes(htmlEsc("Drawings are simplified illustrations for planning. They aren't exact or to scale.")));
  for (const s of ['Tony Webster and LeoPavouk', 'CC BY 2.0', 'creativecommons.org/licenses/by/2.0', 'Changes: redrawn as a simplified line drawing', 'https://commons.wikimedia.org/wiki/File:Glock_17_Gen_5_Gun_white_bg_crop.png']) assert.ok(faq.includes(s), s);
});

/* ------------------------------------------------------------------ community build preview cards */

test('AR-15, AR-9 and AR-10 community build and platform cards carry the short NFA notice; pistol cards do not', () => {
  for (const id of ['ar15', 'ar9', 'ar10']) assert.equal(cardNotice(id), NFA_SHORT_NOTICE, id);
  const pistols = PLATFORMS.map((p) => p.id).filter((id) => !['ar15', 'ar9', 'ar10'].includes(id));
  assert.ok(pistols.length >= 7 && pistols.includes('glock9'));
  for (const id of pistols) assert.equal(cardNotice(id), '', id);
  assert.equal(cardNotice('glock19'), '', 'an old Glock id too');
  // The card drawing uses the helper for each community build, and neither file retypes the wording.
  const og = readFileSync('scripts/og-cards.tsx', 'utf8');
  assert.match(og, /^import \{ cardNotice \} from '\.\/og-notice';$/m);
  assert.match(og, /function buildCard\([^)]*\) \{[\s\S]*?cardNotice\(platform\.id\)[\s\S]*?\n\}/);
  // The platform cards too (og/ar15.png and the rest: the preview for shared builds without their own picture).
  assert.match(og, /function platformCard\([^)]*\) \{[\s\S]*?cardNotice\(platform\.id\)\);\r?\n\}/);
  assert.equal(og.match(/cardNotice\(/g)?.length, 2, 'used by the build and platform cards only (the site card has none)');
  for (const f of ['scripts/og-cards.tsx', 'scripts/og-notice.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), /May be regulated/, f);
  assert.match(readFileSync('scripts/og-notice.ts', 'utf8'), /^import \{ NFA_SHORT_NOTICE \} from '\.\.\/src\/data\/helpers';$/m);
});

/* ------------------------------------------------------------------ the alert price index after the 2026-10-26 pause */

test('the price index the alert emails read carries no AT3 Tactical, Rainier Arms or MidwayUSA price', () => {
  const later = ['AT3', 'RA', 'MID'];
  const index = priceIndex(PLATFORMS);
  for (const p of PLATFORMS)
    for (const x of p.parts) {
      const entry = index.platforms[p.id].parts[x.id];
      const best = bestOffer(x);
      assert.ok(!x.offers.some((o) => later.includes(o.retailer)), `${p.id}/${x.id} offers`);
      if (best) assert.equal(entry[1], best.price, `${p.id}/${x.id}`);
      else assert.equal(entry, undefined, `${p.id}/${x.id}`);
    }
  // The Faxon Grendel BCG was cheapest at AT3 ($139.84). Its best price is now Faxon's own (FAX), the same figure the
  // published og/index.json carries. Faxon's live price moves nightly, so its value is read from the catalog, not fixed.
  const grendel = part(ar15, 'ar-bcg-grendel');
  assert.equal(bestOffer(grendel)!.retailer, 'FAX');
  assert.notEqual(bestOffer(grendel)!.price, 139.84);
  assert.deepEqual(index.platforms.ar15.parts['ar-bcg-grendel'], [`${grendel.brand} ${grendel.name}`, bestOffer(grendel)!.price]);
});

/* ------------------------------------------------------------------ the legal-text converter */

test('the legal-text converter refuses Markdown it does not support, wherever it appears', () => {
  const bad: [string, RegExp][] = [
    ['  An indented line.', /leading whitespace/],
    ['Text.\n\tTabbed on.', /leading whitespace/],
    ['A paragraph\n* a star list item', /unsupported Markdown/],
    ['A paragraph\n> a quote', /unsupported Markdown/],
    ['A paragraph\n1. a numbered item', /unsupported Markdown/],
    ['A paragraph\n#### a deep heading', /unsupported Markdown/],
    ['#### A deep heading', /unsupported Markdown/],
    ['---', /unsupported Markdown/],
    ['```\ncode\n```', /unsupported Markdown/],
    ['See [our policy](/privacy/).', /Markdown link/],
    ['- a list item with [a link](https://example.com)', /Markdown link/],
    ['Read https://dropinbuilds.com/privacy/ now.', /full dropinbuilds\.com address/],
    ['- See http://www.dropinbuilds.com/terms/', /full dropinbuilds\.com address/],
    ['Some *single star* emphasis.', /stray \* or `/],
    ['Some `code`.', /stray \* or `/],
    ['An **unclosed bold.', /stray \* or `/],
    ['| A | B |\n|---|---|\n| 1 |', /2 cells/],
    ['| A | B |\n|---|---|\n| 1 | 2 | 3 |', /2 cells/],
    ['| A | B |\n| 1 | 2 |', /bad table/],
  ];
  for (const [md, why] of bad) assert.throws(() => legalHtml(md), why, JSON.stringify(md));
  // What it does support still renders.
  assert.equal(legalHtml('# T\n\nA **b** c.\n\n- x\n- y\n\n| A | B |\n|---|---|\n| 1 | 2 |'),
    '<h1>T</h1>\n<p>A <b>b</b> c.</p>\n<ul><li>x</li><li>y</li></ul>\n<div class="grid-wrap"><table class="legal-table"><thead><tr><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><th scope="row">1</th><td>2</td></tr></tbody></table></div>');
});

test('the legal-text converter escapes HTML and links only our own page addresses', () => {
  assert.equal(legalHtml('A <script>alert("x")</script> & \'q\' > z.'), '<p>A &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; \'q\' &gt; z.</p>');
  assert.equal(legalHtml('See dropinbuilds.com/privacy/, dropinbuilds.com/faq/ and share.dropinbuilds.com/b/x.'),
    '<p>See <a href="/privacy/">dropinbuilds.com/privacy/</a>, dropinbuilds.com/faq/ and share.dropinbuilds.com/b/x.</p>');
  assert.equal(legalHtml('**<i>**'), '<p><b>&lt;i&gt;</b></p>');
});

test('each legal page says exactly the approved text: its words, tags stripped and entities decoded, match the Markdown', () => {
  const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const pageWords = (html: string) => decode(docOf(html).replace(/<\/?(?:a|b)\b[^>]*>/g, '').replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean);
  const mdWords = (md: string) => md.split('\n')
    .filter((l) => !/^\|[-| ]+\|$/.test(l.trim()))
    .map((l) => l.replace(/^#{1,3} /, '').replace(/^- /, '').replace(/\*\*/g, '').replace(/^\|(.*)\|$/, (_, cells: string) => cells.split('|').join(' ')))
    .join(' ').split(/\s+/).filter(Boolean);
  for (const [md, html] of [[PRIVACY_MD, privacyPage()], [TERMS_MD, termsPage()]]) {
    const want = mdWords(md);
    assert.ok(want.length > 900);
    assert.deepEqual(pageWords(html), want);
  }
});

/* ------------------------------------------------------------------ a build saved between the two pause dates */

test('a build saved between the two pauses: the part paused later resets, the part paused earlier is compared', () => {
  storage.clear();
  const early = ar15.parts.find((p) => p.pausedThrough === PAUSE_DAY && bestOffer(p) && p.slot === 'handguard')!;
  const late = ar15.parts.find((p) => p.pausedThrough === PAUSE_DAY_2 && bestOffer(p) && p.slot === 'bcg')!;
  assert.ok(early && late, 'a handguard paused on PAUSE_DAY and a BCG paused on PAUSE_DAY_2');
  const sel = { ...baseSelection(ar15), handguard: early.id, bcg: late.id };
  const now = priceSnapshot('ar15', sel);
  const saved: SavedBuild = { id: 'm', name: 'Between', platform: 'ar15', selection: sel, savedAt: '2026-10-25T12:00:00Z', prices: { ...now, [early.id]: now[early.id] - 30, [late.id]: now[late.id] - 30 } };
  assert.ok(saved.savedAt.slice(0, 10) > PAUSE_DAY && saved.savedAt.slice(0, 10) < PAUSE_DAY_2);
  // Only the part paused before the save is compared; the later pause makes the other's saved price untrustworthy.
  assert.deepEqual(priceChanges(saved).changes.map((c) => c.part.id), [early.id]);
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-28T00:00:00Z') });
  try {
    storeSavedBuilds([saved]);
    const [loaded] = loadSavedBuilds();
    assert.equal(loaded.prices![late.id], now[late.id], 'reset to today');
    assert.equal(loaded.prices![early.id], now[early.id] - 30, 'kept');
    assert.ok(loaded.pricesAt && loaded.pricesAt.slice(0, 10) > PAUSE_DAY_2);
  } finally {
    mock.timers.reset();
  }
});

/* ------------------------------------------------------------------ retailers the scripts read */

test('the scripts read every retailer in src/data/retailers.ts, so a new entry their regex misses fails here', () => {
  const read = retailersFrom(readFileSync('src/data/retailers.ts', 'utf8'));
  assert.deepEqual(Object.keys(read).sort(), Object.keys(RETAILERS).sort());
  for (const r of Object.values(RETAILERS)) assert.equal(read[r.id].name, r.name, r.id);
});
