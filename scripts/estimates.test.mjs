import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { STUBS, estimatesFrom, generateEstimates } from './estimates.mjs';
import { readEstimates } from './first-read-guard.mjs';
import { retailersFrom } from './sources.mjs';

// These run the generator on the real catalog and fail only if the generator itself breaks. data/estimates.json is
// never committed, so nothing here compares its output with a saved copy, and no catalog price is pinned.
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const generated = await generateEstimates();
const ids = Object.keys(generated.parts);

test('the generator makes something of the right shape, with real stores and positive prices', () => {
  assert.deepEqual(Object.keys(generated), ['parts']);
  const retailers = retailersFrom(read('src/data/retailers.ts'));
  for (const [id, byStore] of Object.entries(generated.parts)) {
    assert.ok(Object.keys(byStore).length, `${id} has no stores`);
    for (const [store, offer] of Object.entries(byStore)) {
      assert.ok(Object.hasOwn(retailers, store), `${id}: unknown store ${store}`);
      assert.deepEqual(Object.keys(offer), ['price', 'inStock'], `${id} @ ${store}`);
      assert.ok(typeof offer.price === 'number' && offer.price > 0, `${id} @ ${store}`);
      assert.equal(typeof offer.inStock, 'boolean', `${id} @ ${store}`);
    }
  }
});

test('nearly every catalog part comes out', () => {
  // Counted from the catalog's own text, so adding parts moves this along by itself.
  const dir = new URL('../src/data/', import.meta.url);
  const inCatalog = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts')))
    for (const [, id] of readFileSync(new URL(file, dir), 'utf8').matchAll(/\{ id: '([^']+)', brand:/g)) inCatalog.add(id);
  assert.ok(inCatalog.size > 100, `read ${inCatalog.size} parts from src/data`);
  const found = [...inCatalog].filter((id) => generated.parts[id]).length;
  assert.ok(found >= inCatalog.size * 0.9, `only ${found} of ${inCatalog.size} parts have estimates`);
});

test('the price guard can read what the generator makes', () => {
  const got = readEstimates(() => JSON.stringify(generated));
  assert.equal(got.problem, undefined);
  assert.equal(Object.keys(got.value).length, ids.length);
});

test('the data files that would shift the figures are stubbed, so paused stores stay in', () => {
  assert.deepEqual(Object.keys(STUBS).sort(), ['list-prices.json', 'prices.json', 'sources.json']);
  // The real data/sources.json would have dropped these from every part.
  const paused = Object.keys(JSON.parse(read('data/sources.json')).paused ?? {});
  if (paused.length) assert.ok(ids.some((id) => paused.some((store) => generated.parts[id][store])), 'a paused store\'s estimates are gone');
});

test('a part on several platforms is one part, and the output is sorted whatever the catalog order', () => {
  const offer = (retailer, price, inStock = true) => ({ retailer, price, inStock });
  const shared = { id: 'a', offers: [offer('Z', 2), offer('B', 1, false)] };
  const platforms = [{ parts: [{ id: 'b', offers: [offer('X', 3)] }, shared] }, { parts: [shared] }];
  assert.equal(JSON.stringify(estimatesFrom(platforms)), JSON.stringify({ parts: { a: { B: { price: 1, inStock: false }, Z: { price: 2, inStock: true } }, b: { X: { price: 3, inStock: true } } } }));
});

test('a catalog with no estimates is an error, so an empty file is never written', () => {
  assert.throws(() => estimatesFrom([]), /no estimates/);
  assert.throws(() => estimatesFrom([{ parts: [{ id: 'a', offers: [] }] }]), /no estimates/);
});
