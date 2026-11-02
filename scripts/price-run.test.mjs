// Runs the real scripts/update-prices.mjs, start to finish, against fake stores (scripts/price-run-stub.mjs). Its cwd is
// a throwaway folder of small fixed files, so nothing here reads the repo's data/, which the nightly rewrites between
// its two npm test runs. Stores PAU (paused) and LNK (links only) have links in the fixture, so "never contacted" counts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('update-prices.mjs', import.meta.url));
const STUB = new URL('price-run-stub.mjs', import.meta.url).href;

const LAST_NIGHT = '2026-11-02T08:17:00.000Z';
const NIGHT_1 = '2026-11-03T08:17:00.000Z';
const NIGHT_2 = '2026-11-04T08:17:00.000Z';
const DAY_1 = NIGHT_1.slice(0, 10);
const DAY_2 = NIGHT_2.slice(0, 10);

const SHOP_A = 'https://shop-a.example';
const SHOP_B = 'https://shop-b.example';
const STEADY_A = `${SHOP_A}/p/steady`;
const STEADY_B = `${SHOP_B}/p/steady`;
const NEW_B = `${SHOP_B}/p/new`;
const UP_A = `${SHOP_A}/p/up`;
const DOWN_B = `${SHOP_B}/p/down`;
const NEVER_CONTACTED = ['paused-store.example', 'links-only.example'];

const RETAILERS_TS = `export const RETAILERS = {
  SHA: { id: 'SHA', name: 'Shop A', search: '${SHOP_A}/search?q=' },
  SHB: { id: 'SHB', name: 'Shop B', search: '${SHOP_B}/search?q=' },
  PAU: { id: 'PAU', name: 'Paused Store', search: 'https://paused-store.example/search?q=' },
  LNK: { id: 'LNK', name: 'Links Only', search: 'https://links-only.example/search?q=' },
};
`;

const offer = (url, price, checkedAt, inStock = true) => ({ price, inStock, url, checkedAt });
/** SHB's price is 50% over the part's history: a live price is never held, however far it sits from a baseline. */
const steady = (night) => ({ SHA: offer(STEADY_A, 100, night), SHB: offer(STEADY_B, 150, night, false) });

/** Each first read has its own baseline: part-new an estimate (the paused store's lower one must not count), part-up history, part-down a list price. */
const FIXTURE = {
  'sources.json': {
    paused: { PAU: { since: '2026-10-01', reason: 'fixture' } },
    linksOnly: { LNK: { since: '2026-10-01', reason: 'fixture' } },
    parts: {
      'part-steady': { SHA: STEADY_A, SHB: STEADY_B, PAU: 'https://paused-store.example/p/steady', LNK: 'https://links-only.example/p/steady' },
      'part-new': { SHB: NEW_B },
      'part-up': { SHA: UP_A },
      'part-down': { SHB: DOWN_B },
    },
  },
  'prices.json': { updatedAt: LAST_NIGHT, offers: { 'part-steady': steady(LAST_NIGHT) } },
  'price-history.json': { parts: { 'part-steady': [['2026-11-02', 100]], 'part-up': [['2026-10-30', 100]] } },
  'price-holds.json': { holds: [] },
  'price-approvals.json': {},
  'list-prices.json': { parts: { 'part-down': { price: 200 } } },
  'estimates.json': { parts: { 'part-new': { SHB: { price: 200, inStock: true }, PAU: { price: 1, inStock: true } } } },
};

/** What the fake stores show on a normal night. */
const READS = {
  [STEADY_A]: { price: 100, inStock: true },
  [STEADY_B]: { price: 150, inStock: false },
  [NEW_B]: { price: 220, inStock: true },
  [UP_A]: { price: 120, inStock: true },
  [DOWN_B]: { price: 180, inStock: true },
};
/** The same night with both first reads past 40%: 50% over and 50% under their baselines. */
const FAR_READS = { ...READS, [UP_A]: { price: 150, inStock: true }, [DOWN_B]: { price: 100, inStock: true } };

const DOWN_HOLD = { part: 'part-down', store: 'SHB', price: 100, baseline: 200, baselineType: 'list', firstHeld: DAY_1 };
const UP_HOLD = { part: 'part-up', store: 'SHA', price: 150, baseline: 100, baselineType: 'history', firstHeld: DAY_1 };

const put = (dir, file, value) => writeFileSync(join(dir, 'data', file), `${JSON.stringify(value, null, 2)}\n`);
const text = (dir, file) => readFileSync(join(dir, 'data', file), 'utf8');
const json = (dir, file) => JSON.parse(text(dir, file));

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'price-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'data'));
  mkdirSync(join(dir, 'src', 'data'), { recursive: true });
  for (const [file, value] of Object.entries(FIXTURE)) put(dir, file, value);
  writeFileSync(join(dir, 'src', 'data', 'retailers.ts'), RETAILERS_TS);
  return dir;
}

/** One night of the real script. Checks what must hold on every night, then returns its output for the test's own checks. */
function night(dir, { now, reads, updated, held, failed = 0, unwritable }) {
  const start = json(dir, 'prices.json');
  const log = join(dir, 'requests.log');
  const summaryFile = join(dir, 'summary.md');
  writeFileSync(join(dir, 'pages.json'), JSON.stringify(reads));
  writeFileSync(log, '');
  writeFileSync(summaryFile, '');
  const env = {
    ...process.env,
    NODE_OPTIONS: undefined,
    NODE_TEST_CONTEXT: undefined,
    FAKE_NOW: now,
    STUB_PAGES: join(dir, 'pages.json'),
    STUB_LOG: log,
    STUB_UNWRITABLE: unwritable,
    GITHUB_STEP_SUMMARY: summaryFile,
  };
  const run = spawnSync(process.execPath, ['--import', STUB, SCRIPT], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  const out = `${run.stdout}${run.stderr}`;
  assert.equal(run.error, undefined, `${run.error}\n${out}`);
  assert.equal(run.status, 0, out);
  assert.ok(out.includes(`Done: ${updated} updated, 0 kept from last run, ${held} held for review, ${failed} failed (0 of them ignored as likely misreads), 0 blocked by robots.txt, 0 redirected off-site`), out);

  const lines = readFileSync(log, 'utf8').trim().split('\n');
  const logged = (kind) => lines.filter((l) => l.startsWith(`${kind} `)).map((l) => l.slice(kind.length + 1));
  assert.deepEqual(logged('SOCKET'), []);
  const requests = logged('FETCH').map((l) => l.split(' '));
  const fetched = requests.map(([, url]) => url);
  // One request per host every 5 seconds on the virtual clock, robots.txt included.
  const lastAt = new Map();
  for (const [at, url] of requests) {
    const { host } = new URL(url);
    if (lastAt.has(host)) assert.ok(at - lastAt.get(host) >= 5000, `${url} came ${at - lastAt.get(host)} ms after the last request to ${host}`);
    lastAt.set(host, at);
  }
  assert.deepEqual(fetched.filter((url) => NEVER_CONTACTED.includes(new URL(url).host)), []);
  assert.deepEqual([...fetched].sort(), [...Object.keys(reads), `${SHOP_A}/robots.txt`, `${SHOP_B}/robots.txt`].sort());
  // Relative paths under the cwd, so nothing lands in the repo; in this order, so holds can't cost the night its prices.
  assert.deepEqual(logged('WRITE'), ['data/prices.json', 'data/price-history.json', 'data/price-holds.json']);

  const after = json(dir, 'prices.json');
  for (const [part, stores] of Object.entries(start.offers))
    for (const [store, { price, inStock }] of Object.entries(stores))
      assert.deepEqual({ price: after.offers[part]?.[store]?.price, inStock: after.offers[part]?.[store]?.inStock }, { price, inStock }, `${part} @ ${store}`);

  return { out, summary: readFileSync(summaryFile, 'utf8') };
}

test('a normal night: first reads within 40% go live, nothing is held, known prices stay', (t) => {
  const dir = fixture(t);
  const { summary } = night(dir, { now: NIGHT_1, reads: READS, updated: 5, held: 0 });
  assert.deepEqual(json(dir, 'prices.json'), {
    updatedAt: NIGHT_1,
    offers: {
      'part-steady': steady(NIGHT_1),
      'part-new': { SHB: offer(NEW_B, 220, NIGHT_1) },
      'part-up': { SHA: offer(UP_A, 120, NIGHT_1) },
      'part-down': { SHB: offer(DOWN_B, 180, NIGHT_1) },
    },
  });
  assert.deepEqual(json(dir, 'price-history.json'), {
    parts: {
      'part-down': [[DAY_1, 180]],
      'part-new': [[DAY_1, 220]],
      'part-steady': [['2026-11-02', 100]],
      'part-up': [['2026-10-30', 100], [DAY_1, 120]],
    },
  });
  assert.deepEqual(json(dir, 'price-holds.json'), { holds: [] });
  assert.equal(summary, '');
});

test('a first read far off its baseline is held both ways and stays out of prices and history', (t) => {
  const dir = fixture(t);
  const { summary } = night(dir, { now: NIGHT_1, reads: FAR_READS, updated: 3, held: 2 });
  assert.deepEqual(json(dir, 'prices.json'), {
    updatedAt: NIGHT_1,
    offers: { 'part-steady': steady(NIGHT_1), 'part-new': { SHB: offer(NEW_B, 220, NIGHT_1) } },
  });
  assert.deepEqual(json(dir, 'price-history.json'), {
    parts: { 'part-new': [[DAY_1, 220]], 'part-steady': [['2026-11-02', 100]], 'part-up': [['2026-10-30', 100]] },
  });
  assert.deepEqual(json(dir, 'price-holds.json'), { holds: [DOWN_HOLD, UP_HOLD] });
  assert.ok(summary.includes('2 held for review'), summary);
  for (const part of ['part-down', 'part-up']) assert.ok(summary.includes(`| ${part} |`), summary);
});

test('an approved figure releases its hold; an unapproved read stays held with its first-held day', (t) => {
  const dir = fixture(t);
  night(dir, { now: NIGHT_1, reads: FAR_READS, updated: 3, held: 2 });
  put(dir, 'price-approvals.json', { 'part-up': { SHA: 150 } });
  night(dir, { now: NIGHT_2, reads: FAR_READS, updated: 4, held: 1 });
  assert.deepEqual(json(dir, 'prices.json'), {
    updatedAt: NIGHT_2,
    offers: {
      'part-steady': steady(NIGHT_2),
      'part-new': { SHB: offer(NEW_B, 220, NIGHT_2) },
      'part-up': { SHA: offer(UP_A, 150, NIGHT_2) },
    },
  });
  assert.deepEqual(json(dir, 'price-history.json'), {
    parts: {
      'part-new': [[DAY_1, 220]],
      'part-steady': [['2026-11-02', 100]],
      'part-up': [['2026-10-30', 100], [DAY_2, 150]],
    },
  });
  assert.deepEqual(json(dir, 'price-holds.json'), { holds: [DOWN_HOLD] });
});

test('a hold drops when its link is gone, and stays through a failed read while the link is tracked', (t) => {
  const dir = fixture(t);
  night(dir, { now: NIGHT_1, reads: FAR_READS, updated: 3, held: 2 });
  const sources = json(dir, 'sources.json');
  delete sources.parts['part-down'];
  put(dir, 'sources.json', sources);
  const { [DOWN_B]: gone, ...reads } = FAR_READS;
  night(dir, { now: NIGHT_2, reads: { ...reads, [UP_A]: null }, updated: 3, held: 0, failed: 1 });
  assert.deepEqual(json(dir, 'prices.json'), {
    updatedAt: NIGHT_2,
    offers: { 'part-steady': steady(NIGHT_2), 'part-new': { SHB: offer(NEW_B, 220, NIGHT_2) } },
  });
  assert.deepEqual(json(dir, 'price-history.json'), {
    parts: { 'part-new': [[DAY_1, 220]], 'part-steady': [['2026-11-02', 100]], 'part-up': [['2026-10-30', 100]] },
  });
  assert.deepEqual(json(dir, 'price-holds.json'), { holds: [UP_HOLD] });
});

test('a holds file that cannot be written warns, stays as it was, and costs the night nothing', (t) => {
  const control = fixture(t);
  night(control, { now: NIGHT_1, reads: FAR_READS, updated: 3, held: 2 });

  const dir = fixture(t);
  const before = text(dir, 'price-holds.json');
  const { out, summary } = night(dir, { now: NIGHT_1, reads: FAR_READS, updated: 3, held: 2, unwritable: 'data/price-holds.json' });
  assert.ok(out.includes('::warning::data/price-holds.json not written: stub refused'), out);
  assert.ok(summary.includes('**Warning:** data/price-holds.json not written: stub refused'), summary);
  assert.ok(summary.includes('2 held for review'), summary);
  assert.equal(text(dir, 'price-holds.json'), before);
  assert.notEqual(text(control, 'price-holds.json'), before);
  assert.equal(text(dir, 'prices.json'), text(control, 'prices.json'));
  assert.equal(text(dir, 'price-history.json'), text(control, 'price-history.json'));
});
