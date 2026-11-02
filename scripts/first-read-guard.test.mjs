import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { implausiblePrice } from './extract-price.mjs';
import { approvalProblems, baselineFor, firstReadHold, formatHolds, holdKey, holdsSummary, mergeHolds, movedTooFar, readEstimates, readHolds, readJsonObject } from './first-read-guard.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const PART = 'ar-hg-x';
const STORE = 'RTB';
const check = (price, data, hadOffer = false) => firstReadHold({ part: PART, store: STORE, price, hadOffer }, data);
const history = (price) => ({ parts: { [PART]: [['2026-10-01', 999], ['2026-10-21', price]] } });

/* ------------------------------------------------------------------ the 40% line */

test('exactly 40.00% passes and 40.01% is held, both ways', () => {
  assert.equal(movedTooFar(140, 100), false);
  assert.equal(movedTooFar(140.01, 100), true);
  assert.equal(movedTooFar(60, 100), false);
  assert.equal(movedTooFar(59.99, 100), true);
});

test('the line is drawn in whole cents, on a baseline that doesn\'t divide evenly', () => {
  // 40% of $189.99 is $75.996, so the last cent inside is $265.98 up and $114.00 down.
  assert.equal(movedTooFar(265.98, 189.99), false);
  assert.equal(movedTooFar(265.99, 189.99), true);
  assert.equal(movedTooFar(114, 189.99), false);
  assert.equal(movedTooFar(113.99, 189.99), true);
  // Prices that float badly: 0.1 + 0.2 style error must not tip an exact 40%.
  assert.equal(movedTooFar(4.06, 2.9), false);
  assert.equal(movedTooFar(4.07, 2.9), true);
  assert.equal(movedTooFar(1.4, 1), false);
});

test('there is no dollar floor: a small part is held by the same rule', () => {
  assert.equal(movedTooFar(8.01, 5), true);
  assert.equal(movedTooFar(7, 5), false);
});

/* ------------------------------------------------------------------ baselines */

test('baselines come in order: approved, history, list, estimate', () => {
  const data = {
    approvals: { [PART]: { [STORE]: 616.99 } },
    history: history(189.99),
    listPrices: { parts: { [PART]: { price: 150 } } },
    estimates: { [PART]: { BRN: { price: 120, inStock: true } } },
    paused: new Set(),
  };
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: 616.99, baselineType: 'approved' });
  delete data.approvals;
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: 189.99, baselineType: 'history' });
  delete data.history;
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: 150, baselineType: 'list' });
  delete data.listPrices;
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: 120, baselineType: 'estimate' });
  delete data.estimates;
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: null, baselineType: 'none' });
});

test('an approval counts only for its own store', () => {
  const data = { approvals: { [PART]: { BRN: 616.99 } }, history: history(189.99) };
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: 189.99, baselineType: 'history' });
});

test('the last history point is the one used', () => {
  assert.equal(baselineFor(PART, STORE, { history: { parts: { [PART]: [['2026-10-06', 209.95], ['2026-10-21', 189.99]] } } }).baseline, 189.99);
});

test('a figure that isn\'t a positive price is passed over', () => {
  const data = { approvals: { [PART]: { [STORE]: 0 } }, history: { parts: { [PART]: [] } }, listPrices: { parts: { [PART]: { price: '150' } } }, estimates: { [PART]: { BRN: { price: 120, inStock: true } } } };
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: 120, baselineType: 'estimate' });
});

test('the estimate is the lowest in stock at stores that aren\'t paused', () => {
  const estimates = { [PART]: { PA: { price: 90, inStock: true }, BRN: { price: 100, inStock: false }, OP: { price: 120, inStock: true }, KM: { price: 130, inStock: true } } };
  assert.deepEqual(baselineFor(PART, STORE, { estimates, paused: new Set(['PA']) }), { baseline: 120, baselineType: 'estimate' });
});

test('pauses are read at run time, not from the estimates file', () => {
  const estimates = { [PART]: { PA: { price: 90, inStock: true }, OP: { price: 120, inStock: true } } };
  assert.equal(baselineFor(PART, STORE, { estimates, paused: new Set() }).baseline, 90);
  assert.equal(baselineFor(PART, STORE, { estimates, paused: new Set(['PA']) }).baseline, 120);
});

test('when every store with an estimate is paused, the paused estimates are used', () => {
  const estimates = { [PART]: { PA: { price: 90, inStock: true }, MID: { price: 80, inStock: false }, RA: { price: 95, inStock: true } } };
  assert.deepEqual(baselineFor(PART, STORE, { estimates, paused: new Set(['PA', 'MID', 'RA']) }), { baseline: 90, baselineType: 'estimate-paused' });
});

test('open stores all out of stock leave no estimate, and the read is held', () => {
  // Not "all paused", so the paused stores aren't a fallback, and an out-of-stock estimate is no baseline.
  const estimates = { [PART]: { PA: { price: 90, inStock: true }, BRN: { price: 100, inStock: false } } };
  const data = { estimates, paused: new Set(['PA']) };
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: null, baselineType: 'none' });
  assert.equal(check(100, data).baselineType, 'none');
});

/* ------------------------------------------------------------------ holding a read */

test('a read within 40% of its baseline passes, and one outside is held with what the log needs', () => {
  assert.equal(check(140, { history: history(100) }), null);
  assert.deepEqual(check(141, { history: history(100) }), { part: PART, store: STORE, price: 141, baseline: 100, baselineType: 'history' });
  assert.equal(check(59, { history: history(100) }).baselineType, 'history');
});

test('no baseline at all is a hold', () => {
  assert.deepEqual(check(50, {}), { part: PART, store: STORE, price: 50, baseline: null, baselineType: 'none' });
});

test('a pair with a prior offer is never checked', () => {
  assert.equal(check(9999, { history: history(100) }, true), null);
  assert.equal(check(9999, {}, true), null);
});

test('a pair with no prior offer is checked even when the part has other live offers', () => {
  // firstReadHold is told only about this pair: the part's other offers don't let it through.
  const hold = firstReadHold({ part: PART, store: 'NEW', price: 300, hadOffer: false }, { history: history(100) });
  assert.equal(hold.store, 'NEW');
});

test('an approved figure becomes the baseline and is still held to 40%', () => {
  const data = { approvals: { [PART]: { [STORE]: 616.99 } }, history: history(189.99) };
  assert.equal(check(616.99, data), null);
  assert.equal(check(863.78, data), null); // 40% up is $863.786
  assert.deepEqual(check(863.79, data), { part: PART, store: STORE, price: 863.79, baseline: 616.99, baselineType: 'approved' });
  assert.equal(check(370.2, data), null); // 40% down is $370.194
  assert.equal(check(370.19, data).baselineType, 'approved');
});

test('ar-hg-mi at $279.99 from Right To Bear is held against its last history point of $189.99', () => {
  const data = {
    history: { parts: { 'ar-hg-mi': [['2026-10-06', 209.95], ['2026-10-21', 189.99]] } },
    estimates: { 'ar-hg-mi': { PA: { price: 149.99, inStock: true }, BRN: { price: 159.99, inStock: true }, OP: { price: 154.95, inStock: true } } },
    paused: new Set(['PA']),
  };
  assert.equal(implausiblePrice(279.99, { others: [] }), null, 'the 2.5x check has nothing to compare it with');
  assert.deepEqual(firstReadHold({ part: 'ar-hg-mi', store: 'RTB', price: 279.99, hadOffer: false }, data), { part: 'ar-hg-mi', store: 'RTB', price: 279.99, baseline: 189.99, baselineType: 'history' });
});

test('a real big move after the 7-day lapse becomes a first read: held, then released by approval', () => {
  const data = { history: history(100) };
  // While the old price is on file, the read is a likely misread.
  assert.match(implausiblePrice(300, { last: 100 }), /too far/);
  // Once it's aged out there's no prior offer, so the implausible check has nothing and this guard takes over.
  assert.equal(implausiblePrice(300, {}), null);
  assert.equal(firstReadHold({ part: PART, store: STORE, price: 300, hadOffer: false }, data).baselineType, 'history');
  assert.equal(firstReadHold({ part: PART, store: STORE, price: 300, hadOffer: false }, { ...data, approvals: { [PART]: { [STORE]: 299 } } }), null);
  // The next night it has a prior offer, and the guard is out of the way.
  assert.equal(firstReadHold({ part: PART, store: STORE, price: 300, hadOffer: true }, data), null);
});

/* ------------------------------------------------------------------ the holds file */

const hold = (part, store, price, firstHeld) => ({ part, store, price, baseline: 100, baselineType: 'history', firstHeld });
const tracked = (...pairs) => new Set(pairs.map(([p, s]) => holdKey(p, s)));

test('a new hold is dated tonight', () => {
  const held = [{ part: 'a', store: 'X', price: 200, baseline: 100, baselineType: 'history' }];
  assert.deepEqual(mergeHolds([], { held, tracked: tracked(['a', 'X']), day: '2026-11-02' }), [hold('a', 'X', 200, '2026-11-02')]);
});

test('a pair held again keeps its firstHeld and takes tonight\'s price', () => {
  const held = [{ part: 'a', store: 'X', price: 210, baseline: 100, baselineType: 'history' }];
  assert.deepEqual(mergeHolds([hold('a', 'X', 200, '2026-11-01')], { held, tracked: tracked(['a', 'X']), day: '2026-11-05' }), [hold('a', 'X', 210, '2026-11-01')]);
});

test('a hold survives a night its read failed, unchanged', () => {
  const before = [hold('a', 'X', 200, '2026-11-01')];
  assert.deepEqual(mergeHolds(before, { tracked: tracked(['a', 'X']), day: '2026-11-05' }), before);
});

test('a hold drops when its pair passes', () => {
  assert.deepEqual(mergeHolds([hold('a', 'X', 200, '2026-11-01')], { passed: new Set([holdKey('a', 'X')]), tracked: tracked(['a', 'X']), day: '2026-11-05' }), []);
});

test('a hold drops when its link is gone, paused or links only: all three leave the tracked list', () => {
  assert.deepEqual(mergeHolds([hold('a', 'X', 200, '2026-11-01')], { tracked: tracked(['a', 'Y']), day: '2026-11-05' }), []);
});

test('holds come out sorted by part, then store, however they went in', () => {
  const pairs = [['b', 'A'], ['a', 'Z'], ['a', 'B']];
  const held = pairs.map(([part, store]) => ({ part, store, price: 200, baseline: 100, baselineType: 'history' }));
  const out = mergeHolds([], { held, tracked: tracked(...pairs), day: '2026-11-02' });
  assert.deepEqual(out.map((h) => `${h.part}/${h.store}`), ['a/B', 'a/Z', 'b/A']);
});

test('unchanged holds write the same bytes, with no timestamp, and the file reads back', () => {
  const before = mergeHolds([], { held: [{ part: 'a', store: 'X', price: 200, baseline: 100, baselineType: 'history' }], tracked: tracked(['a', 'X']), day: '2026-11-02' });
  const first = formatHolds(before);
  const again = formatHolds(mergeHolds(readHolds(() => first).value, { held: [{ part: 'a', store: 'X', price: 200, baseline: 100, baselineType: 'history' }], tracked: tracked(['a', 'X']), day: '2026-11-09' }));
  assert.equal(again, first);
  assert.deepEqual(Object.keys(JSON.parse(first)), ['holds']);
  assert.deepEqual(Object.keys(JSON.parse(first).holds[0]), ['part', 'store', 'price', 'baseline', 'baselineType', 'firstHeld']);
});

test('the committed files read back cleanly, and the holds file is as the code writes it', () => {
  // Not "empty": npm test runs again after the nightly commits real holds, and the owner fills in approvals.
  const text = read('data/price-holds.json').replace(/\r\n/g, '\n');
  const holds = readHolds(() => text);
  assert.equal(holds.problem, undefined);
  assert.equal(formatHolds(holds.value), text);
  assert.equal(readJsonObject(() => read('data/price-approvals.json')).problem, undefined);
});

test('an empty holds list is written the way the file starts out', () => {
  assert.equal(formatHolds([]), '{\n  "holds": []\n}\n');
});

test('the step summary lists each hold, and says nothing when there is nothing to say', () => {
  assert.equal(holdsSummary([], []), '');
  const text = holdsSummary([hold('a', 'X', 200, '2026-11-01'), { ...hold('b', 'Y', 50, '2026-11-02'), baseline: null, baselineType: 'none' }], []);
  assert.match(text, /^## First-read price holds$/m);
  assert.ok(text.includes('| a | X | $200 | $100 | history | 2026-11-01 |'));
  assert.ok(text.includes('| b | Y | $50 | none | none | 2026-11-02 |'));
  assert.match(holdsSummary([], ['data/estimates.json is missing']), /Warning:\*\* data\/estimates\.json is missing/);
});

/* ------------------------------------------------------------------ files that are missing or broken */

const missing = () => { throw Object.assign(new Error('no such file'), { code: 'ENOENT' }); };

test('a missing estimates file warns, nothing throws, and pairs with no other baseline are held', () => {
  const { value: estimates, problem } = readEstimates(missing);
  assert.deepEqual(estimates, {});
  assert.equal(problem, 'is missing');
  const data = { estimates, paused: new Set() };
  assert.equal(check(100, data).baselineType, 'none');
  // A pair with another baseline carries on as normal.
  assert.equal(check(100, { ...data, history: history(100) }), null);
});

test('an unreadable or wrong-shaped estimates file is the same as a missing one', () => {
  for (const text of ['{ not json', '[]', 'null', '{}', '{"parts":[]}', '{"parts":{}}']) {
    const got = readEstimates(() => text);
    assert.deepEqual(got.value, {}, text);
    assert.ok(got.problem, text);
  }
  assert.match(readEstimates(() => { throw new Error('EACCES'); }).problem, /can't be read \(EACCES\)/);
});

test('a good estimates file gives its parts with no problem', () => {
  const parts = { a: { X: { price: 1, inStock: true } } };
  assert.deepEqual(readEstimates(() => JSON.stringify({ parts })), { value: parts });
});

test('a broken entry inside the estimates is skipped, not fatal', () => {
  const data = { estimates: { [PART]: { X: null, Y: { price: 'n' }, Z: 3 } }, paused: new Set() };
  assert.deepEqual(baselineFor(PART, STORE, data), { baseline: null, baselineType: 'none' });
  assert.deepEqual(baselineFor(PART, STORE, { estimates: { [PART]: 'nope' } }), { baseline: null, baselineType: 'none' });
});

test('a missing or broken approvals, list or holds file reads as empty with a problem', () => {
  assert.deepEqual(readJsonObject(missing), { value: {}, problem: 'is missing' });
  assert.deepEqual(readJsonObject(() => '[]'), { value: {}, problem: 'is not a JSON object' });
  assert.deepEqual(readHolds(missing), { value: [], problem: 'is missing' });
  assert.deepEqual(readHolds(() => '{"holds":3}'), { value: [], problem: 'has no list of holds' });
  assert.deepEqual(readHolds(() => '{"holds":[null,{"part":"a"},{"part":"a","store":"X"}]}').value, [{ part: 'a', store: 'X' }]);
});

/* ------------------------------------------------------------------ check-data */

test('an approval needs a real part, a link for that store and a positive price', () => {
  const known = { partIds: new Set(['a', 'b']), links: { a: { X: 'https://x.example/a' } } };
  assert.deepEqual(approvalProblems({}, known), []);
  assert.deepEqual(approvalProblems({ a: { X: 616.99 } }, known), []);
  assert.match(approvalProblems({ nope: { X: 1 } }, known).join(), /nope is not a part/);
  assert.match(approvalProblems({ a: { Y: 1 } }, known).join(), /a has no Y link/);
  assert.match(approvalProblems({ b: { X: 1 } }, known).join(), /b has no X link/);
  for (const bad of [0, -1, '616.99', null, Number.NaN]) assert.match(approvalProblems({ a: { X: bad } }, known).join(), /needs a positive price/, String(bad));
  assert.match(approvalProblems({ a: 616.99 }, known).join(), /must be an object/);
  assert.match(approvalProblems([], known).join(), /must be an object/);
  assert.match(approvalProblems(null, known).join(), /must be an object/);
});

test('nothing outside the guard and the price job reads the bot\'s holds file', () => {
  assert.doesNotMatch(read('scripts/check-presets.ts'), /price-holds/);
});

test('the guard stays pure: it reads no file, no clock and no network', () => {
  const code = read('scripts/first-read-guard.mjs');
  assert.doesNotMatch(code, /^import /m);
  assert.doesNotMatch(code, /\b(readFileSync|writeFileSync|fetch\(|Date\.now|new Date|process\.)/);
});
