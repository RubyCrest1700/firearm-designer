// The check-data guard for catalog parts marked sameAs (scripts/same-product-guard.mjs). The parts here are made up;
// scripts/unit.test.ts runs the same guard over the real catalog and data files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingWeightProblem, sameProductLeftovers, sameProductProblems } from './same-product-guard.mjs';

const MAIN = 'x-opt-dot';
const COPY = 'y-opt-dot';
/** A main copy, its copy on another platform, and a part that is neither. */
const catalog = () => [
  { id: MAIN, brand: 'Acme', name: 'Dot 2 MOA', mpn: 'AC-2', offers: [['BRN', 149.99], ['OP', 139.99, false]] },
  { id: COPY, sameAs: MAIN, brand: 'Acme', name: 'Dot 2 MOA', mpn: 'AC-2', offers: [['OP', 139.99, false], ['BRN', 149.99, true]] },
  { id: 'x-grip', brand: 'Acme', name: 'Grip', offers: [['BRN', 20]] },
];
/** Data in the shape of each file: everything is filed under the main copy, and the copy has no weight of its own. */
const data = () => ({
  sources: { parts: { [MAIN]: { BRN: 'https://example.com/dot' }, 'x-grip': { BRN: 'https://example.com/grip' } } },
  listPrices: { from: [MAIN], factory: ['x-grip'], parts: { [MAIN]: { basis: 'list', retailer: 'BRN', price: 150, asOf: '2026-10-09' } } },
  approvals: { [MAIN]: { BRN: 151 } },
  weights: { parts: { [MAIN]: { oz: 5.1, basis: 'published', src: 'https://example.com/dot' }, 'x-grip': { oz: 3, basis: 'estimate', src: null } } },
});

test('a sound copy has no problems: same product, offers in any order, nothing filed under its own id', () => {
  assert.deepEqual(sameProductProblems(catalog(), data()), []);
  // An equal weight entry is fine too, whatever order its keys are in.
  const d = data();
  d.weights.parts[COPY] = { src: 'https://example.com/dot', basis: 'published', oz: 5.1 };
  assert.deepEqual(sameProductProblems(catalog(), d), []);
  // The same FFL mark on both is fine, and a missing flag counts as false.
  const both = catalog();
  both[0].serialized = both[1].serialized = true;
  assert.deepEqual(sameProductProblems(both, d), []);
  const unset = catalog();
  unset[1].serialized = false;
  assert.deepEqual(sameProductProblems(unset, d), []);
  // A part listed on two platforms is checked once.
  assert.deepEqual(sameProductProblems([...catalog(), catalog()[1]], d), []);
  // A catalog with no copies, missing files and odd shapes never fail or throw here.
  assert.deepEqual(sameProductProblems(catalog().filter((p) => !p.sameAs), {}), []);
  assert.deepEqual(sameProductProblems(catalog(), undefined), []);
  assert.deepEqual(sameProductProblems(catalog(), { sources: { parts: null }, listPrices: { from: 3 }, approvals: [], weights: 'x' }), []);
  assert.deepEqual(sameProductProblems(undefined, data()), []);
  assert.deepEqual(sameProductProblems([null, 3, { id: 'a' }], data()), []);
});

test('each rule fails on its own, naming the copy, its main copy and what is wrong', () => {
  const marked = `${COPY} is marked sameAs "${MAIN}"`;
  /** [what to spoil in the catalog (c) or the data (d), the one problem it gives] */
  const cases = [
    [(c) => { c[1].sameAs = 'x-nope'; }, `catalog (src/data): ${COPY} is marked sameAs "x-nope", but no part has that id`],
    [(c) => { c[1].sameAs = COPY; }, `catalog (src/data): ${COPY} is marked sameAs "${COPY}", which is itself; sameAs must name another part`],
    [(c) => { c[1].brand = 'Acme Inc'; }, `catalog (src/data): ${marked}, but its brand differs ("Acme Inc" against ${MAIN}'s "Acme")`],
    [(c) => { c[1].name = 'Dot 2 MOA for AR-9'; }, `catalog (src/data): ${marked}, but its name differs ("Dot 2 MOA for AR-9" against ${MAIN}'s "Dot 2 MOA")`],
    [(c) => { c[1].mpn = 'AC-3'; }, `catalog (src/data): ${marked}, but its mpn differs ("AC-3" against ${MAIN}'s "AC-2")`],
    [(c) => { delete c[1].mpn; }, `catalog (src/data): ${marked}, but its mpn differs (none against ${MAIN}'s "AC-2")`],
    // The FFL mark: on one and not the other, either way round. A missing flag is the same as false.
    [(c) => { c[1].serialized = true; }, `catalog (src/data): ${marked}, but its serialized mark (FFL) differs (true against ${MAIN}'s false)`],
    [(c) => { c[0].serialized = true; }, `catalog (src/data): ${marked}, but its serialized mark (FFL) differs (false against ${MAIN}'s true)`],
    [(c) => { c[0].serialized = true; c[1].serialized = false; }, `catalog (src/data): ${marked}, but its serialized mark (FFL) differs (false against ${MAIN}'s true)`],
    // Offers: another price, another stock flag, a store missing, a store added.
    [(c) => { c[1].offers = [['BRN', 144.99], ['OP', 139.99, false]]; }, `catalog (src/data): ${marked}, but its estimate offers differ (BRN $144.99, OP $139.99 (out of stock) against ${MAIN}'s BRN $149.99, OP $139.99 (out of stock))`],
    [(c) => { c[1].offers = [['BRN', 149.99], ['OP', 139.99]]; }, `catalog (src/data): ${marked}, but its estimate offers differ (BRN $149.99, OP $139.99 against ${MAIN}'s BRN $149.99, OP $139.99 (out of stock))`],
    [(c) => { c[1].offers = [['BRN', 149.99]]; }, `catalog (src/data): ${marked}, but its estimate offers differ (BRN $149.99 against ${MAIN}'s BRN $149.99, OP $139.99 (out of stock))`],
    [(c) => { c[1].offers = []; }, `catalog (src/data): ${marked}, but its estimate offers differ (none against ${MAIN}'s BRN $149.99, OP $139.99 (out of stock))`],
    [(c) => { c[1].offers.push(['GS', 1]); }, `catalog (src/data): ${marked}, but its estimate offers differ (BRN $149.99, GS $1, OP $139.99 (out of stock) against ${MAIN}'s BRN $149.99, OP $139.99 (out of stock))`],
    // Weight: a different figure, a different basis, or an entry where the main copy has none.
    [(c, d) => { d.weights.parts[COPY] = { oz: 5.2, basis: 'published', src: 'https://example.com/dot' }; }, `data/weights.json: ${marked}, but its weight differs from ${MAIN}'s; make the two entries equal or remove ${COPY}'s`],
    [(c, d) => { d.weights.parts[COPY] = { oz: 5.1, basis: 'estimate', src: null }; }, `data/weights.json: ${marked}, but its weight differs from ${MAIN}'s; make the two entries equal or remove ${COPY}'s`],
    [(c, d) => { d.weights.parts[COPY] = d.weights.parts[MAIN]; delete d.weights.parts[MAIN]; }, `data/weights.json: ${marked}, but its weight differs from ${MAIN}'s; make the two entries equal or remove ${COPY}'s`],
    // Nothing is filed under the copy's own id, an empty entry included.
    [(c, d) => { d.sources.parts[COPY] = { OP: 'https://example.com/dot-2' }; }, `data/sources.json parts: ${marked}, so it must have no links of its own; move them to ${MAIN}`],
    [(c, d) => { d.sources.parts[COPY] = {}; }, `data/sources.json parts: ${marked}, so it must have no links of its own; move them to ${MAIN}`],
    [(c, d) => { d.listPrices.parts[COPY] = { basis: 'list', retailer: 'BRN', price: 150, asOf: '2026-10-09' }; }, `data/list-prices.json parts: ${marked}, so it must have no list price of its own; ${MAIN}'s is used`],
    [(c, d) => { d.listPrices.from.push(COPY); }, `data/list-prices.json from: ${marked}, so it must not be listed here; ${MAIN}'s entry is used`],
    [(c, d) => { d.listPrices.factory.push(COPY); }, `data/list-prices.json factory: ${marked}, so it must not be listed here; ${MAIN}'s entry is used`],
    [(c, d) => { d.approvals[COPY] = { BRN: 151 }; }, `data/price-approvals.json: ${marked}, so it must have no approvals of its own; approve prices under ${MAIN}`],
  ];
  for (const [spoil, want] of cases) {
    const c = catalog();
    const d = data();
    spoil(c, d);
    assert.deepEqual(sameProductProblems(c, d), [want]);
  }
});

test('a copy of a copy fails: sameAs names the main copy, with no chains', () => {
  const c = [...catalog(), { id: 'z-opt-dot', sameAs: COPY, brand: 'Acme', name: 'Dot 2 MOA', mpn: 'AC-2', offers: [['BRN', 149.99], ['OP', 139.99, false]] }];
  assert.deepEqual(sameProductProblems(c, data()), [`catalog (src/data): z-opt-dot is marked sameAs "${COPY}", which is itself a copy (sameAs "${MAIN}"); name the main copy, no chains`]);
  // Two copies of one main copy are fine.
  c[3].sameAs = MAIN;
  assert.deepEqual(sameProductProblems(c, data()), []);
  // Two parts naming each other are both refused.
  const loop = catalog();
  loop[0].sameAs = COPY;
  assert.equal(sameProductProblems(loop, data()).length, 2);
});

test('every problem with one copy is reported together', () => {
  const c = catalog();
  const d = data();
  c[1].brand = 'Other';
  d.sources.parts[COPY] = { OP: 'https://example.com/dot-2' };
  d.approvals[COPY] = { OP: 1 };
  assert.equal(sameProductProblems(c, d).length, 3);
});

test("the weight rule: a part needs its own entry, and a copy without one needs its main copy's", () => {
  const [main, copy, grip] = catalog();
  // As filed in data(): the copy has no entry of its own and carries the main copy's.
  assert.equal(missingWeightProblem(main, data().weights), undefined);
  assert.equal(missingWeightProblem(copy, data().weights), undefined);
  assert.equal(missingWeightProblem(grip, data().weights), undefined);
  // A copy with an entry of its own passes on that, whatever its main copy has.
  const own = data().weights;
  own.parts[COPY] = { ...own.parts[MAIN] };
  assert.equal(missingWeightProblem(copy, own), undefined);
  delete own.parts[MAIN];
  assert.equal(missingWeightProblem(copy, own), undefined);
  assert.equal(missingWeightProblem(main, own), `${MAIN} has no weight in data/weights.json`);
  // A copy whose main copy has no weight either fails, naming both.
  const none = data().weights;
  delete none.parts[MAIN];
  assert.equal(missingWeightProblem(copy, none), `${COPY} has no weight in data/weights.json, and neither has ${MAIN}, the main copy it is marked sameAs; give ${MAIN} one`);
  // A part that is nobody's copy fails without an entry of its own, and never borrows one.
  const bare = data().weights;
  delete bare.parts['x-grip'];
  assert.equal(missingWeightProblem(grip, bare), 'x-grip has no weight in data/weights.json');
  assert.equal(missingWeightProblem({ id: 'x-new' }, data().weights), 'x-new has no weight in data/weights.json');
  // An entry that isn't an object is no weight, and a missing or odd file fails every part rather than throwing.
  const odd = data().weights;
  odd.parts[COPY] = null;
  assert.equal(missingWeightProblem(copy, odd), undefined, "the main copy's still stands");
  odd.parts[MAIN] = 5;
  assert.match(missingWeightProblem(copy, odd), /and neither has x-opt-dot/);
  for (const w of [undefined, null, 'x', {}, { parts: null }, { parts: [] }]) {
    assert.equal(missingWeightProblem(grip, w), 'x-grip has no weight in data/weights.json');
    assert.match(missingWeightProblem(copy, w), /^y-opt-dot has no weight in data\/weights\.json, and neither has x-opt-dot/);
  }
  // A part marked as its own copy is judged as an ordinary part (the guard refuses the mark itself).
  assert.equal(missingWeightProblem({ id: 'x-new', sameAs: 'x-new' }, data().weights), 'x-new has no weight in data/weights.json');
});

test("rows the price bot left under a copy's id are listed for a note, never as a problem", () => {
  const files = {
    'data/prices.json': { [COPY]: { BRN: { price: 140, inStock: true } }, [MAIN]: { BRN: { price: 141, inStock: true } } },
    'data/price-history.json': { [MAIN]: [['2026-10-09', 141]], 'x-grip': [['2026-10-09', 19]] },
  };
  assert.deepEqual(sameProductLeftovers(catalog(), files), [{ file: 'data/prices.json', parts: [COPY] }]);
  files['data/price-history.json'][COPY] = [['2026-10-09', 140]];
  assert.deepEqual(sameProductLeftovers(catalog(), files), [{ file: 'data/prices.json', parts: [COPY] }, { file: 'data/price-history.json', parts: [COPY] }]);
  // The problems list takes no notice of those files.
  assert.deepEqual(sameProductProblems(catalog(), { ...data(), prices: { offers: files['data/prices.json'] }, history: { parts: files['data/price-history.json'] } }), []);
  // No copies, or no rows: nothing to note.
  assert.deepEqual(sameProductLeftovers(catalog().filter((p) => !p.sameAs), files), []);
  assert.deepEqual(sameProductLeftovers(catalog(), { 'data/prices.json': undefined, 'data/price-history.json': {} }), []);
  assert.deepEqual(sameProductLeftovers(catalog(), undefined), []);
});
