// The check-data guard that every retailer id in the data is a store in RETAILERS (src/data/retailers.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unknownRetailerProblems } from './retailer-id-guard.mjs';
import { readRetailers } from './sources.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const json = (f) => JSON.parse(read(f));
const IDS = ['BRN', 'GS'];
/** Made-up data in the shape of each file, every id a known store. */
const good = () => ({
  sources: { parts: { a: { BRN: 'https://example.com/a' }, b: { GS: 'https://example.com/b' } }, paused: {}, linksOnly: { BRN: { since: '2026-10-31', reason: 'r' } } },
  prices: { updatedAt: 'x', offers: { a: { BRN: { price: 10, inStock: true } } } },
  listPrices: { from: [], factory: [], parts: { b: { basis: 'list', retailer: 'GS', price: 20, asOf: '2026-10-09' } } },
  approvals: { a: { BRN: 12 } },
  catalog: [],
});

test('data whose every retailer id is a known store has no problems', () => {
  assert.deepEqual(unknownRetailerProblems(IDS, good()), []);
  // Missing or empty files and odd shapes are other checks' business, and never throw here.
  assert.deepEqual(unknownRetailerProblems(IDS, {}), []);
  assert.deepEqual(unknownRetailerProblems(IDS, { sources: { parts: { a: null } }, prices: { offers: { a: 3 } }, approvals: [], catalog: undefined }), []);
});

test('an unknown retailer id fails in each place it can be written, naming the file, the part and the id', () => {
  const cases = [
    [(d) => { d.sources.parts.a.NOPE = 'https://example.com/x'; }, 'data/sources.json parts: a has a link for unknown retailer NOPE'],
    [(d) => { d.sources.linksOnly.NOPE = { since: '2026-10-31', reason: 'r' }; }, 'data/sources.json linksOnly: unknown retailer NOPE'],
    [(d) => { d.prices.offers.a.NOPE = { price: 9, inStock: true }; }, 'data/prices.json: a has a price from unknown retailer NOPE'],
    [(d) => { d.listPrices.parts.b.retailer = 'NOPE'; }, 'data/list-prices.json: b names unknown retailer NOPE'],
    [(d) => { delete d.listPrices.parts.b.retailer; }, 'data/list-prices.json: b names unknown retailer undefined'],
    [(d) => { d.approvals.a.NOPE = 12; }, 'data/price-approvals.json: a names unknown retailer NOPE'],
    [(d) => { d.catalog.push({ part: 'a', retailer: 'NOPE' }); }, 'catalog (src/data): a has an offer from unknown retailer NOPE'],
  ];
  for (const [spoil, want] of cases) {
    const data = good();
    spoil(data);
    assert.deepEqual(unknownRetailerProblems(IDS, data), [want]);
  }
});

test('an id is matched exactly: another case, or a name every object has, is unknown', () => {
  const data = good();
  data.sources.parts.a = { brn: 'https://example.com/a', constructor: 'https://example.com/c' };
  assert.deepEqual(unknownRetailerProblems(IDS, data), [
    'data/sources.json parts: a has a link for unknown retailer brn',
    'data/sources.json parts: a has a link for unknown retailer constructor',
  ]);
});

test('the real data files name only known stores, and one made-up id in a copy of each fails', () => {
  const ids = Object.keys(readRetailers());
  const real = () => ({ sources: json('data/sources.json'), prices: json('data/prices.json'), listPrices: json('data/list-prices.json'), approvals: json('data/price-approvals.json'), catalog: [] });
  assert.deepEqual(unknownRetailerProblems(ids, real()), []);
  // Copies in memory only: the files themselves are never written.
  const part = Object.keys(real().sources.parts)[0];
  const spoils = [
    (d) => { d.sources.parts[part].NOPE = 'https://example.com/x'; },
    (d) => { d.sources.linksOnly.NOPE = { since: '2026-10-31', reason: 'r' }; },
    (d) => { d.prices.offers[part] = { ...d.prices.offers[part], NOPE: { price: 9, inStock: true } }; },
    (d) => { d.listPrices.parts[part] = { basis: 'list', retailer: 'NOPE', price: 9, asOf: '2026-10-09' }; },
    (d) => { d.approvals[part] = { NOPE: 9 }; },
  ];
  for (const spoil of spoils) {
    const data = real();
    spoil(data);
    const problems = unknownRetailerProblems(ids, data);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], new RegExp(`^data/[a-z.-]+json.*${part}.*NOPE$|^data/sources\\.json linksOnly: unknown retailer NOPE$`));
  }
});

test('check-data runs the guard over every source, the catalog as written included', () => {
  const check = read('scripts/check-presets.ts');
  assert.match(check, /for \(const problem of unknownRetailerProblems\(Object\.keys\(RETAILERS\), \{ sources: SOURCES, prices: PRICES, listPrices: LIST_PRICES, approvals: APPROVALS, catalog: UNKNOWN_RETAILER_OFFERS \}\)\) \{ console\.log\(problem\); bad\+\+; \}/);
  assert.match(check, /import LIST_PRICES from '\.\.\/data\/list-prices\.json';/);
  // The older check on "paused" stays.
  assert.ok(check.includes('for (const id of PAUSED) if (!RETAILERS[id]) { console.log(`data/sources.json paused: unknown retailer ${id}`); bad++; }'));
});
