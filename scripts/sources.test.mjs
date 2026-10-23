import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeSources, pausedHosts, pausedIds, retailersFrom } from './sources.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const sources = JSON.parse(read('data/sources.json'));
const retailers = retailersFrom(read('src/data/retailers.ts'));

test('reads every retailer in src/data/retailers.ts', () => {
  const lines = read('src/data/retailers.ts').match(/^ {2}\w+: \{ id: /gm);
  assert.equal(Object.keys(retailers).length, lines.length);
  assert.equal(retailers.BUDS.search, 'https://www.budsgunshop.com/search.php?q=');
});

test('AR15Discounts, Primary Arms and Vedder Holsters are paused, with a dated reason', () => {
  assert.deepEqual([...pausedIds(sources, retailers)].sort(), ['ARD', 'PA', 'VED']);
  for (const why of Object.values(sources.paused)) assert.match(why, /^2026-10-22: paused pending review of the retailer's terms on automated price collection$/);
});

test('paused retailers are left out of the links the scripts read, and everyone else is kept', () => {
  const active = activeSources(sources, retailers);
  let kept = 0;
  for (const [partId, byRetailer] of Object.entries(sources.parts))
    for (const [r, url] of Object.entries(byRetailer)) {
      if (['ARD', 'PA', 'VED'].includes(r)) assert.equal(active[partId]?.[r], undefined, `${partId} @ ${r}`);
      else { assert.equal(active[partId][r], url); kept++; }
    }
  assert.equal(Object.values(active).reduce((n, b) => n + Object.keys(b).length, 0), kept);
  assert.ok(Object.values(active).every((b) => Object.keys(b).length > 0), 'no part is left with an empty list');
  // The links themselves stay in the file, so resuming is one line.
  assert.ok(Object.values(sources.parts).some((b) => b.PA) && Object.values(sources.parts).some((b) => b.ARD));
});

test('a small example: only the paused retailer drops out', () => {
  const s = { paused: { PA: 'why' }, parts: { a: { PA: 'https://pa.example/a', BRN: 'https://brn.example/a' }, b: { PA: 'https://pa.example/b' } } };
  assert.deepEqual(activeSources(s, retailers), { a: { BRN: 'https://brn.example/a' } });
  assert.deepEqual(activeSources({ parts: s.parts }, retailers), s.parts);
});

test('an unknown retailer id in "paused" fails instead of pausing nothing', () => {
  assert.throws(() => pausedIds({ paused: { PAA: 'typo' }, parts: {} }, retailers), /unknown retailer PAA/);
  assert.throws(() => activeSources({ paused: { PA: 'ok', NOPE: 'x' }, parts: {} }, retailers), /NOPE/);
});

test('the link check skips the paused retailers\' sites, search links included, and no one else', () => {
  const hosts = pausedHosts(sources, retailers);
  for (const h of ['ar15discounts.com', 'www.primaryarms.com', 'www.vedderholsters.com']) assert.ok(hosts.has(h), h);
  for (const id of Object.keys(retailers).filter((id) => !['ARD', 'PA', 'VED'].includes(id))) assert.ok(!hosts.has(new URL(retailers[id].search).host), id);
});
