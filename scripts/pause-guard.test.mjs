// The check-data guard that a paused retailer's pause date isn't older than the last price read from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pausedPriceProblems } from './pause-guard.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const PAUSED = { AT3: { since: '2026-10-26', reason: 'r' }, PA: { since: '2026-10-24', reason: 'r' } };
const at = (d) => `${d}T08:30:00.000Z`;

test('a paused store read on or before its pause date is fine', () => {
  const prices = { offers: { a: { AT3: { price: 10, checkedAt: at('2026-10-26') }, BRN: { price: 12, checkedAt: at('2026-10-27') } }, b: { PA: { price: 5, checkedAt: at('2026-10-20') } } } };
  const history = { parts: { a: [['2026-10-26', 10], ['2026-10-27', 12]] } };
  assert.deepEqual(pausedPriceProblems(PAUSED, prices, history), []);
});

test('a paused store read after its pause date fails, in prices.json and in the matching history point', () => {
  const prices = { offers: { a: { AT3: { price: 10, checkedAt: at('2026-10-27') }, BRN: { price: 12, checkedAt: at('2026-10-27') } } } };
  const history = { parts: { a: [['2026-10-20', 11], ['2026-10-27', 10]] } };
  assert.deepEqual(pausedPriceProblems(PAUSED, prices, history), [
    "data/prices.json: a @ AT3 was read on 2026-10-27, after AT3's pause date 2026-10-26",
    "data/price-history.json: a on 2026-10-27 ($10) is AT3's price, after its pause date 2026-10-26",
  ]);
});

test('a history point an active store shares the price of is not blamed on the paused one', () => {
  const prices = { offers: { a: { AT3: { price: 10, checkedAt: at('2026-10-27') }, BRN: { price: 10, checkedAt: at('2026-10-27') } } } };
  const history = { parts: { a: [['2026-10-27', 10]] } };
  assert.deepEqual(pausedPriceProblems(PAUSED, prices, history), ["data/prices.json: a @ AT3 was read on 2026-10-27, after AT3's pause date 2026-10-26"]);
});

test('check-data runs the guard on the real files', () => {
  const text = read('scripts/check-presets.ts');
  assert.match(text, /^import \{ pausedPriceProblems \} from '\.\/pause-guard\.mjs';$/m);
  assert.match(text, /pausedPriceProblems\(SOURCES\.paused, PRICES, HISTORY\)/);
});
