// The check-data guard for look-alike catalog parts (scripts/same-name-guard.mjs): parts with one brand and name, or
// one product link, that are not grouped as one product must be on the owner's list. The parts here are made up;
// `npm run check-data` runs the same guard over the real catalog, links and list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkKey, nameKey, sameNameCounts, sameNameProblems } from './same-name-guard.mjs';

const FILE = 'data/same-name-parts.json';
/**
 * x-dot and y-dot are grouped (one product). z-dot has their name and is not. x-brake and y-brake share a product
 * link under different names. r-light is one id on two platforms. x-grip is alone.
 */
const catalog = () => [
  { id: 'x-dot', brand: 'Acme', name: 'Dot 2 MOA' },
  { id: 'y-dot', sameAs: 'x-dot', brand: 'Acme', name: 'Dot 2 MOA' },
  { id: 'z-dot', brand: 'Acme', name: 'Dot 2 MOA' },
  { id: 'x-brake', brand: 'Acme', name: 'Brake 5.56' },
  { id: 'y-brake', brand: 'Acme', name: 'Brake 5.56 (1/2x28)' },
  { id: 'r-light', brand: 'Acme', name: 'Light' },
  { id: 'r-light', brand: 'Acme', name: 'Light' },
  { id: 'x-grip', brand: 'Acme', name: 'Grip' },
];
const sources = () => ({
  parts: {
    'x-dot': { BRN: 'https://example.com/dot', OP: 'https://example.org/dot' },
    'z-dot': { KYG: 'https://example.net/dot-z' },
    'x-brake': { BRN: 'https://example.com/brake' },
    'y-brake': { BRN: 'https://example.com/brake', OP: 'https://example.org/brake-y' },
    'x-grip': { BRN: 'https://example.com/grip' },
  },
});
const list = () => ({
  _comment: 'made up',
  entries: [
    { ids: ['x-dot', 'y-dot', 'z-dot'], status: 'unchecked', reason: 'z-dot shares no product link with the group' },
    { ids: ['x-brake', 'y-brake'], status: 'different', reason: 'one store page lists several models' },
  ],
});
const problems = (over = {}) => sameNameProblems(over.catalog ?? catalog(), over.sources ?? sources(), over.list ?? list());

test('a sound list has no problems: every look-alike set is grouped or listed', () => {
  assert.deepEqual(problems(), []);
  assert.deepEqual(sameNameCounts(list()), { unchecked: 1, different: 1 });
});

test('grouped copies, and one id listed on several platforms, are one product and need no entry', () => {
  const two = [{ id: 'x-dot', brand: 'Acme', name: 'Dot 2 MOA' }, { id: 'y-dot', sameAs: 'x-dot', brand: 'Acme', name: 'Dot 2 MOA' }, { id: 'r-light', brand: 'Acme', name: 'Light' }, { id: 'r-light', brand: 'Acme', name: 'Light' }];
  assert.deepEqual(sameNameProblems(two, { parts: { 'x-dot': { BRN: 'https://example.com/dot' }, 'r-light': { BRN: 'https://example.com/light' } } }, { entries: [] }), []);
});

test('rule 1: same-name parts that are not one product must be in one entry with exactly their ids', () => {
  // No entry at all.
  let l = list(); l.entries.shift();
  assert.deepEqual(problems({ list: l }), [`catalog (src/data): x-dot, y-dot and z-dot share the name "Acme Dot 2 MOA" but are not one product; group them (sameAs) or list exactly these ids in one entry of ${FILE}`]);
  // An entry that leaves one of them out, copies included, does not count, and is named.
  l = list(); l.entries[0].ids = ['x-dot', 'z-dot'];
  assert.deepEqual(problems({ list: l }), [`catalog (src/data): x-dot, y-dot and z-dot share the name "Acme Dot 2 MOA" but are not one product; group them (sameAs) or list exactly these ids in one entry of ${FILE} (entry 1 (x-dot, z-dot) does not match)`]);
  // Nor does one that holds a part with another name.
  l = list(); l.entries[0].ids.push('x-grip');
  assert.equal(problems({ list: l }).length, 1);
  assert.match(problems({ list: l })[0], /^catalog \(src\/data\): x-dot, y-dot and z-dot share the name .* \(entry 1 \(x-dot, y-dot, z-dot, x-grip\) does not match\)$/);
  // A new part under the same name breaks an entry that was sound.
  const c = [...catalog(), { id: 'w-dot', brand: 'Acme', name: 'Dot 2 MOA' }];
  assert.match(problems({ catalog: c })[0], /^catalog \(src\/data\): x-dot, y-dot, z-dot and w-dot share the name "Acme Dot 2 MOA"/);
  // Case and spacing don't make a different name.
  const spaced = catalog(); spaced[2] = { id: 'z-dot', brand: 'ACME', name: ' dot  2 moa' };
  assert.deepEqual(problems({ catalog: spaced }), []);
  assert.equal(nameKey({ brand: 'ACME', name: ' dot  2 moa' }), 'acme dot 2 moa');
});

test('rule 2: a product link filed under two products needs both in one entry', () => {
  let l = list(); l.entries.pop();
  assert.deepEqual(problems({ list: l }), [`data/sources.json parts: x-brake and y-brake track the same product link (https://example.com/brake) but are not one product; group them (sameAs) or list them together in one entry of ${FILE}`]);
  // Each in a different entry is not "together".
  const c = [...catalog(), { id: 'w-brake', brand: 'Acme', name: 'Brake 5.56' }, { id: 'v-brake', brand: 'Acme', name: 'Brake 5.56 (1/2x28)' }];
  l = list(); l.entries.pop();
  l.entries.push({ ids: ['x-brake', 'w-brake'], status: 'unchecked', reason: 'no shared product link' }, { ids: ['y-brake', 'v-brake'], status: 'unchecked', reason: 'no shared product link' });
  assert.deepEqual(problems({ catalog: c, list: l }), [`data/sources.json parts: x-brake and y-brake track the same product link (https://example.com/brake) but are not one product; group them (sameAs) or list them together in one entry of ${FILE}`]);
  // The same link at two stores of one product, or under a copy and its main copy, is one product.
  const s = sources(); s.parts['x-grip'].OP = 'https://example.com/grip'; s.parts['y-dot'] = { BRN: 'https://example.com/dot' };
  assert.deepEqual(problems({ sources: s }), []);
  // Several shared links between the same products are reported once.
  const twice = sources(); twice.parts['x-brake'].OP = 'https://example.org/brake-y';
  l = list(); l.entries.pop();
  assert.equal(problems({ sources: twice, list: l }).length, 1);
  // A link under an id the catalog doesn't have is left alone.
  const stray = sources(); stray.parts['gone-part'] = { BRN: 'https://example.com/grip' };
  assert.deepEqual(problems({ sources: stray }), []);
});

test('a set whose parts are tied to another name through a shared link fits in one entry that holds them all', () => {
  // a-pin and b-pin share a name; b-pin and c-pin (another name) share a product link; d-pin shares nothing.
  const c = [
    { id: 'a-pin', brand: 'Acme', name: 'Pin' },
    { id: 'b-pin', brand: 'Acme', name: 'Pin' },
    { id: 'c-pin', brand: 'Acme', name: 'Pin (long)' },
    { id: 'd-pin', brand: 'Acme', name: 'Pin (short)' },
  ];
  const s = { parts: { 'a-pin': { BRN: 'https://example.com/pin-a' }, 'b-pin': { BRN: 'https://example.com/pin' }, 'c-pin': { OP: 'https://example.com/pin' }, 'd-pin': { BRN: 'https://example.com/pin-d' } } };
  const entry = (...ids) => ({ ids, status: 'unchecked', reason: 'not yet compared' });
  const got = (...entries) => sameNameProblems(c, s, { entries });
  const NAME = `catalog (src/data): a-pin and b-pin share the name "Acme Pin" but are not one product; group them (sameAs) or list exactly these ids in one entry of ${FILE}`;
  const LINK = `data/sources.json parts: b-pin and c-pin track the same product link (https://example.com/pin) but are not one product; group them (sameAs) or list them together in one entry of ${FILE}`;
  // One entry with all three passes: c-pin is tied to the set through b-pin's link. The order of the ids is free.
  assert.deepEqual(got(entry('a-pin', 'b-pin', 'c-pin')), []);
  assert.deepEqual(got(entry('c-pin', 'a-pin', 'b-pin')), []);
  // The name set alone leaves the link out.
  assert.deepEqual(got(entry('a-pin', 'b-pin')), [LINK]);
  // The link pair alone leaves the name set out.
  assert.deepEqual(got(entry('b-pin', 'c-pin')), [`${NAME} (entry 1 (b-pin, c-pin) does not match)`]);
  // Two entries can't share b-pin.
  assert.deepEqual(got(entry('a-pin', 'b-pin'), entry('b-pin', 'c-pin')), [`${FILE} entry 2 (b-pin, c-pin): b-pin is already in another entry (a-pin, b-pin); a part belongs in one entry`]);
  // An id that shares neither a name nor a link with the rest still fails.
  assert.deepEqual(got(entry('a-pin', 'b-pin', 'c-pin', 'd-pin')), [`${NAME} (entry 1 (a-pin, b-pin, c-pin, d-pin) does not match)`]);
  // So does a second, unrelated look-alike pair put in the same entry: every part must be tied to the name set.
  const more = [...c, { id: 'e-pin', brand: 'Acme', name: 'Pin (short)' }];
  assert.deepEqual(sameNameProblems(more, s, { entries: [entry('a-pin', 'b-pin', 'c-pin'), entry('d-pin', 'e-pin')] }), []);
  const mixed = sameNameProblems(more, s, { entries: [entry('a-pin', 'b-pin', 'c-pin', 'd-pin', 'e-pin')] });
  assert.equal(mixed.length, 2);
  assert.match(mixed[0], /^catalog \(src\/data\): a-pin and b-pin share the name "Acme Pin" .* does not match\)$/);
  assert.match(mixed[1], /^catalog \(src\/data\): d-pin and e-pin share the name "Acme Pin \(short\)" .* does not match\)$/);
  // Once the link is gone, the extra id is no longer tied and must come out.
  const cut = { parts: { ...s.parts, 'c-pin': { OP: 'https://example.com/pin-c' } } };
  assert.deepEqual(sameNameProblems(c, cut, { entries: [entry('a-pin', 'b-pin', 'c-pin')] }), [`${NAME} (entry 1 (a-pin, b-pin, c-pin) does not match)`]);
});

test('links are compared without tracking parameters, and with the ones that pick a product', () => {
  assert.equal(linkKey('https://Example.com/dot/?utm_source=x&gclid=1#top'), linkKey('https://example.com/dot'));
  assert.notEqual(linkKey('https://example.com/dot/?sku=1'), linkKey('https://example.com/dot/?sku=2'));
  assert.notEqual(linkKey('https://example.com/dot/?sku=1'), linkKey('https://example.com/dot/'));
  assert.equal(linkKey('https://example.com/dot?b=2&a=1'), linkKey('https://example.com/dot?a=1&b=2'));
  assert.equal(linkKey(' not a url '), 'not a url');
  // So a tracked copy of a link still counts as shared, and a different ?sku= does not.
  const s = sources(); s.parts['x-grip'] = { BRN: 'https://example.com/brake/?utm_campaign=fall' };
  assert.match(problems({ sources: s })[0], /^data\/sources\.json parts: x-brake, y-brake and x-grip track the same product link/);
  const sku = sources(); sku.parts['x-brake'].BRN = 'https://example.com/brake?sku=1'; sku.parts['y-brake'].BRN = 'https://example.com/brake?sku=2';
  assert.deepEqual(problems({ sources: sku }), [`${FILE} entry 2 (x-brake, y-brake): no longer needed; its parts are now one product, or share neither a name nor a product link. Remove the entry`]);
});

test('an entry or an id that no rule asks for any more is a problem', () => {
  // The set was grouped: its entry must go.
  const grouped = catalog(); grouped[2] = { ...grouped[2], sameAs: 'x-dot' };
  const s = sources(); delete s.parts['z-dot'];
  assert.deepEqual(problems({ catalog: grouped, sources: s }), [`${FILE} entry 1 (x-dot, y-dot, z-dot): no longer needed; its parts are now one product, or share neither a name nor a product link. Remove the entry`]);
  // A part that shares nothing with the rest of its entry must come out. A copy of a listed part may stay.
  const c = [...catalog(), { id: 'w-brake', sameAs: 'y-brake', brand: 'Acme', name: 'Brake 5.56 (1/2x28)' }];
  let l = list(); l.entries[1].ids.push('w-brake');
  assert.deepEqual(problems({ catalog: c, list: l }), []);
  l = list(); l.entries[1].ids.push('x-grip');
  assert.deepEqual(problems({ list: l }), [`${FILE} entry 2 (x-brake, y-brake, x-grip): x-grip shares neither a name nor a product link with the rest; take it out`]);
  // Two unrelated parts.
  l = list(); l.entries.push({ ids: ['x-grip', 'r-light'], status: 'unchecked', reason: 'no shared product link' });
  assert.deepEqual(problems({ list: l }), [`${FILE} entry 3 (x-grip, r-light): no longer needed; its parts are now one product, or share neither a name nor a product link. Remove the entry`]);
});

test('the list itself must be sound', () => {
  const one = (change, want) => { const l = list(); change(l); assert.deepEqual(problems({ list: l }), want); };
  one((l) => { l.entries[1].ids = ['x-brake', 'y-brake', 'no-such-part']; }, [`${FILE} entry 2 (x-brake, y-brake, no-such-part): no-such-part is not a part in the catalog`]);
  one((l) => { l.entries[1].status = 'same'; }, [`${FILE} entry 2 (x-brake, y-brake): "status" must be "unchecked" or "different"`]);
  one((l) => { delete l.entries[1].status; }, [`${FILE} entry 2 (x-brake, y-brake): "status" must be "unchecked" or "different"`]);
  one((l) => { l.entries[1].reason = '  '; }, [`${FILE} entry 2 (x-brake, y-brake): needs a "reason"`]);
  one((l) => { delete l.entries[0].reason; }, [`${FILE} entry 1 (x-dot, y-dot, z-dot): needs a "reason"`]);
  one((l) => { l.entries.push({ ids: ['x-grip'], status: 'unchecked', reason: 'alone' }); }, [`${FILE} entry 3 (x-grip): needs at least two ids`]);
  one((l) => { l.entries.push({ ids: [], status: 'unchecked', reason: 'empty' }); }, [`${FILE} entry 3: needs at least two ids`]);
  one((l) => { l.entries.push({ status: 'unchecked', reason: 'no ids' }); }, [`${FILE} entry 3: needs "ids", a list of part ids`]);
  one((l) => { l.entries.push({ ids: ['x-grip', 7], status: 'unchecked', reason: 'a number' }); }, [`${FILE} entry 3 (x-grip): needs "ids", a list of part ids`]);
  one((l) => { l.entries.push('x-grip'); }, [`${FILE} entry 3: needs "ids", a list of part ids`]);
  // An id in two entries: the second is refused, and the first still covers its set.
  one((l) => { l.entries.push({ ids: ['x-brake', 'x-grip'], status: 'unchecked', reason: 'again' }); }, [`${FILE} entry 3 (x-brake, x-grip): x-brake is already in another entry (x-brake, y-brake); a part belongs in one entry`]);
  one((l) => { l.entries[1].ids = ['x-brake', 'y-brake', 'y-brake']; }, [`${FILE} entry 2 (x-brake, y-brake, y-brake): lists an id twice`]);
  // A file that isn't the expected shape fails, and so does every set it should have covered.
  for (const broken of [undefined, null, [], {}, { entries: {} }]) {
    const got = sameNameProblems(catalog(), sources(), broken);
    assert.equal(got[0], `${FILE}: must be an object with an "entries" list`);
    assert.equal(got.length, 3);
  }
  assert.deepEqual(sameNameCounts(undefined), { unchecked: 0, different: 0 });
});

test('unreadable input gives no crash', () => {
  assert.deepEqual(sameNameProblems(undefined, undefined, { entries: [] }), []);
  assert.deepEqual(sameNameProblems([null, 'x', { id: 7 }], { parts: { a: 'x', b: null } }, { entries: [] }), []);
});

test('check-data runs the guard on the real catalog, links and list, and the nightly job never writes the list', () => {
  const check = readFileSync('scripts/check-presets.ts', 'utf8');
  assert.ok(check.includes("import SAME_NAME from '../data/same-name-parts.json';"));
  assert.match(check, /for \(const problem of sameNameProblems\(catalog, SOURCES, SAME_NAME\)\) \{ console\.log\(problem\); bad\+\+; \}/);
  // The real list is the expected shape, with a reason on every entry.
  const real = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(typeof real._comment, 'string');
  assert.ok(real.entries.length > 0);
  for (const e of real.entries) assert.ok(e.ids.length >= 2 && ['unchecked', 'different'].includes(e.status) && e.reason.trim(), JSON.stringify(e.ids));
  // The scripts the nightly job runs don't name the file.
  for (const script of ['scripts/update-prices.mjs', 'scripts/retailer-list.mjs', 'scripts/estimates.mjs', 'scripts/price-history.mjs'])
    assert.ok(!readFileSync(script, 'utf8').includes('same-name-parts'), script);
  assert.ok(!readFileSync('.github/workflows/deploy.yml', 'utf8').includes('same-name-parts'));
});
