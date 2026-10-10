import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordHistory, formatHistory } from './price-history.mjs';

const offer = (price, inStock = true) => ({ price, inStock, url: 'x', checkedAt: 'x' });
const at = (d) => new Date(`${d}T08:30:00Z`);

test('records the lowest in-stock price, ignoring cheaper out-of-stock offers', () => {
  const h = recordHistory(null, { a: { AERO: offer(120), PA: offer(99, false), BCM: offer(110) } }, at('2026-10-04'));
  assert.deepEqual(h.parts.a, [['2026-10-04', 110]]);
});

test('adds a point only when the price changes, and replaces a same-day rerun', () => {
  let h = recordHistory(null, { a: { AERO: offer(120) } }, at('2026-10-04'));
  h = recordHistory(h, { a: { AERO: offer(120) } }, at('2026-10-05'));
  assert.deepEqual(h.parts.a, [['2026-10-04', 120]]);
  h = recordHistory(h, { a: { AERO: offer(100) } }, at('2026-10-06'));
  h = recordHistory(h, { a: { AERO: offer(95) } }, at('2026-10-06'));
  assert.deepEqual(h.parts.a, [['2026-10-04', 120], ['2026-10-06', 95]]);
});

test('counts a price kept from an earlier night, so a failed read of the cheapest store is not a rise', () => {
  const kept = { price: 559.99, inStock: true, url: 'x', checkedAt: '2026-10-04T08:30:00.000Z' };
  let h = recordHistory(null, { a: { AERO: { ...kept }, BCM: offer(589.99) } }, at('2026-10-04'));
  h = recordHistory(h, { a: { AERO: kept, BCM: offer(589.99) } }, at('2026-10-05'));
  h = recordHistory(h, { a: { AERO: offer(559.99), BCM: offer(589.99) } }, at('2026-10-06'));
  assert.deepEqual(h.parts.a, [['2026-10-04', 559.99]]);
});

test('keeps parts missing from tonight and trims old points but keeps the one in effect', () => {
  let h = { parts: { a: [['2026-01-01', 150], ['2026-02-01', 140], ['2026-09-01', 130]], b: [['2026-09-01', 10]] } };
  h = recordHistory(h, { a: { AERO: offer(125) } }, at('2026-10-04'));
  assert.deepEqual(h.parts.a, [['2026-02-01', 140], ['2026-09-01', 130], ['2026-10-04', 125]]);
  assert.deepEqual(h.parts.b, [['2026-09-01', 10]]);
});

test('formats one part per line as valid JSON', () => {
  const h = { parts: { b: [['2026-10-04', 10]], a: [['2026-10-04', 5]] } };
  const text = formatHistory(h);
  assert.deepEqual(JSON.parse(text), h);
  assert.match(text, /"a": \[\["2026-10-04",5\]\],\n {4}"b"/);
});
