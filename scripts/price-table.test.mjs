import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { packPrices, unpackPrices, unpackSources } from './price-table.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));

test('the packed table unpacks to the same prices and links as the data files', () => {
  const prices = read('prices.json');
  const sources = read('sources.json');
  const table = JSON.parse(JSON.stringify(packPrices(prices, sources)));
  assert.deepEqual(unpackPrices(table), prices);
  assert.deepEqual(unpackSources(table), { parts: sources.parts });
});

test('keeps live prices without a tracked link, and links without a live price', () => {
  const at = '2026-10-09T15:15:53.953Z';
  const prices = { updatedAt: at, offers: { a: { PA: { price: 10, inStock: false, url: 'https://x/a', checkedAt: at } }, b: { BRN: { price: 5, inStock: true, checkedAt: at } } } };
  const sources = { parts: { a: { PA: 'https://x/a', AERO: 'https://y/a' } } };
  const t = packPrices(prices, sources);
  assert.deepEqual(t.parts.a, { PA: ['https://x/a', 10, 0, 0], AERO: 'https://y/a' });
  assert.deepEqual(unpackPrices(t), prices);
  assert.deepEqual(unpackSources(t), sources);
});

test('keeps both links when a link changed after the last price run', () => {
  const at = '2026-10-09T15:15:53.953Z';
  const prices = { updatedAt: at, offers: { a: { PA: { price: 1, inStock: true, url: 'https://x/old', checkedAt: at } } } };
  const sources = { parts: { a: { PA: 'https://x/new' } } };
  const t = packPrices(prices, sources);
  assert.deepEqual(unpackPrices(t), prices);
  assert.deepEqual(unpackSources(t), sources);
});
