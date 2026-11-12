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

/**
 * One night of the real script. Checks what must hold on every night, then returns its output for the test's own checks.
 * `reads` are the pages the night must fetch, each once. `unfetched` are stub entries that must not be fetched as pages
 * (a robots.txt answer, or a page behind a refused redirect).
 */
function night(dir, { now, reads, updated, held, kept = 0, failed = 0, rejected = 0, blocked = 0, offsite = 0, moved = 0, unfetched = {}, unwritable }) {
  const start = json(dir, 'prices.json');
  const log = join(dir, 'requests.log');
  const summaryFile = join(dir, 'summary.md');
  writeFileSync(join(dir, 'pages.json'), JSON.stringify({ ...unfetched, ...reads }));
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
  assert.ok(out.includes(`Done: ${updated} updated, ${kept} kept from last run, ${held} held for review, ${failed} failed (${rejected} of them ignored as likely misreads), ${blocked} blocked by robots.txt, ${offsite} redirected off-site, ${moved} redirected to a different page\n`), out);

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

  assert.equal(out.split('\n').filter((l) => l.includes('redirected to a different page (')).length, moved, out);

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

// Redirects. A store sending a tracked link to a different page of its own site is logged and counted, nothing more:
// the read is priced, checked and stored exactly as a direct read is.

const WRITTEN = ['prices.json', 'price-history.json', 'price-holds.json'];
const MOVED_LINE = 'redirected to a different page (';
const movedLines = (out) => out.split('\n').filter((l) => l.includes(MOVED_LINE));
/** Hosts are read side by side, so a night's log lines can come in another order when one host takes more requests. */
const sortedLines = (out) => out.split('\n').sort();

/** The normal night with nothing redirected: what a redirected night's files and log are compared with. */
function directNight(t) {
  const dir = fixture(t);
  const { out } = night(dir, { now: NIGHT_1, reads: READS, updated: 5, held: 0 });
  return { dir, out };
}
const sameFiles = (dir, control) => {
  for (const file of WRITTEN) assert.equal(text(dir, file), text(control, file), file);
};

test('a redirect to the same page reads as usual: no log line, nothing counted, the same files', (t) => {
  const control = directNight(t);
  const dir = fixture(t);
  const wwwB = 'https://www.shop-b.example';
  const reads = {
    ...READS,
    // A trailing slash, absolute.
    [UP_A]: { redirect: `${UP_A}/` },
    [`${UP_A}/`]: READS[UP_A],
    // Two hops, the first relative: a trailing slash, then www, other letter case and a tracking parameter.
    [DOWN_B]: { redirect: '/p/down/' },
    [`${DOWN_B}/`]: { redirect: `${wwwB}/P/Down/?utm_source=feed&gclid=abc` },
    [`${wwwB}/P/Down/?utm_source=feed&gclid=abc`]: READS[DOWN_B],
    [`${wwwB}/robots.txt`]: null,
  };
  const { out, summary } = night(dir, { now: NIGHT_1, reads, updated: 5, held: 0, moved: 0 });
  assert.deepEqual(movedLines(out), []);
  assert.deepEqual(sortedLines(out), sortedLines(control.out));
  assert.equal(summary, '');
  sameFiles(dir, control.dir);
  assert.deepEqual(json(dir, 'prices.json').offers['part-up'], { SHA: offer(UP_A, 120, NIGHT_1) });
  assert.deepEqual(json(dir, 'prices.json').offers['part-down'], { SHB: offer(DOWN_B, 180, NIGHT_1) });
});

test('a redirect to a different product page is logged and counted, and still priced and stored as a direct read is', (t) => {
  const control = directNight(t);
  const dir = fixture(t);
  const replacement = `${SHOP_A}/p/up-mk2`;
  // Two hops, the first relative.
  const reads = { ...READS, [UP_A]: { redirect: '/p/moved' }, [`${SHOP_A}/p/moved`]: { redirect: replacement }, [replacement]: READS[UP_A] };
  const { out, summary } = night(dir, { now: NIGHT_1, reads, updated: 5, held: 0, moved: 1 });
  assert.deepEqual(movedLines(out), [`part-up @ SHA: redirected to a different page (${replacement})`]);
  // The read's own line follows it, as on any night (another host's lines may come between).
  assert.deepEqual(out.split('\n').filter((l) => l.startsWith('part-up @ SHA: ')), [`part-up @ SHA: redirected to a different page (${replacement})`, 'part-up @ SHA: $120']);
  sameFiles(dir, control.dir);
  // Stored under the tracked link, not the page it ended on.
  assert.deepEqual(json(dir, 'prices.json').offers['part-up'], { SHA: offer(UP_A, 120, NIGHT_1) });
  assert.equal(summary, [
    '## Redirected to a different page',
    '',
    '1 tracked link was redirected to a different page on the same site. Each was still read and priced as usual.',
    '',
    '| Part | Store | Redirected to |',
    '|---|---|---|',
    `| part-up | SHA | \`${replacement}\` |`,
    '',
    '',
  ].join('\n'));
});

test('a redirect to a category page with no price is logged as moved, then fails as "no price found"', (t) => {
  const dir = fixture(t);
  const category = `${SHOP_A}/c/uppers`;
  const reads = { ...READS, [UP_A]: { redirect: category }, [category]: { html: '<html><head><title>Uppers</title></head><body><h1>Uppers</h1></body></html>' } };
  const { out, summary } = night(dir, { now: NIGHT_1, reads, updated: 4, held: 0, failed: 1, moved: 1 });
  assert.deepEqual(out.split('\n').filter((l) => l.startsWith('part-up @ SHA: ')), [`part-up @ SHA: redirected to a different page (${category})`, 'part-up @ SHA: no price found on page']);
  assert.equal(json(dir, 'prices.json').offers['part-up'], undefined);
  assert.deepEqual(json(dir, 'price-history.json').parts['part-up'], [['2026-10-30', 100]]);
  assert.ok(summary.includes(`| part-up | SHA | \`${category}\` |`), summary);
});

test('a hostile Location gives one safe log line and one safe summary row, and the read is still stored as usual', (t) => {
  const control = directNight(t);
  const dir = fixture(t);
  // A line break, a workflow command, an encoded line break, a log marker, a table bar and a code tick, then 2,000 more characters.
  const location = `/p/up-mk2\n::error::x%0A##[error]y|\`z${'a'.repeat(2000)}`;
  const final = new URL(location, UP_A).href;
  assert.ok(final.includes('::error::') && final.includes('##[error]') && final.length > 2000, 'the address still carries the attack once parsed');
  const reads = { ...READS, [UP_A]: { redirect: location }, [final]: READS[UP_A] };
  const { out, summary } = night(dir, { now: NIGHT_1, reads, updated: 5, held: 0, moved: 1 });

  const [line, ...others] = movedLines(out);
  assert.deepEqual(others, []);
  assert.ok(line.startsWith('part-up @ SHA: redirected to a different page (https://shop-a.example/p/up-mk2%3A:error%3A:x%0A%23#[error]y'), line);
  assert.ok(line.endsWith('...)'), line);
  assert.ok(line.length < 400, `${line.length} characters`);
  // The whole log is the direct night's log plus that one line (and the count in the last line).
  assert.equal(out.split('\n').length, control.out.split('\n').length + 1);
  assert.deepEqual(sortedLines(out).filter((l) => l !== line && !l.startsWith('Done: ')), sortedLines(control.out).filter((l) => !l.startsWith('Done: ')));
  for (const l of out.split('\n')) {
    assert.doesNotMatch(l, /^\s*(::|##\[)/, l);
    assert.doesNotMatch(l, /[\u0000-\u0008\u000b-\u001f\u007f]/, l);
  }
  assert.ok(!line.includes('::') && !line.includes('##'), line);

  const rows = summary.split('\n').filter((l) => l.startsWith('| part-up |'));
  assert.equal(rows.length, 1, summary);
  assert.match(rows[0], /^\| part-up \| SHA \| `[^`|]*` \|$/);
  assert.ok(!rows[0].includes('::') && !rows[0].includes('##') && rows[0].length < 400, rows[0]);
  assert.equal(summary.split('\n').length, 9, summary);

  sameFiles(dir, control.dir);
  assert.deepEqual(json(dir, 'prices.json').offers['part-up'], { SHA: offer(UP_A, 120, NIGHT_1) });
});

test('an off-site redirect and a robots-blocked redirect hop are handled as before, with no "different page" line', (t) => {
  const elsewhere = 'https://elsewhere.example/p/up';
  const offsite = fixture(t);
  const first = night(offsite, {
    now: NIGHT_1, reads: { ...READS, [UP_A]: { redirect: elsewhere } }, unfetched: { [elsewhere]: { price: 1, inStock: true } }, updated: 4, held: 0, offsite: 1, moved: 0,
  });
  assert.ok(first.out.includes(`part-up @ SHA: redirected off-site to elsewhere.example (${elsewhere}), not read\n`), first.out);
  assert.deepEqual(movedLines(first.out), []);
  assert.equal(first.summary, '');
  assert.equal(json(offsite, 'prices.json').offers['part-up'], undefined);

  const refused = `${SHOP_A}/private/up`;
  const blocked = fixture(t);
  const second = night(blocked, {
    now: NIGHT_1,
    reads: { ...READS, [UP_A]: { redirect: refused } },
    unfetched: { [`${SHOP_A}/robots.txt`]: { robots: 'User-agent: *\nDisallow: /private/\n' }, [refused]: { price: 1, inStock: true } },
    updated: 4, held: 0, blocked: 1, moved: 0,
  });
  assert.ok(second.out.includes(`robots.txt disallows it: ${refused} (redirected from ${UP_A})\n`), second.out);
  assert.deepEqual(movedLines(second.out), []);
  assert.equal(second.summary, '');
  assert.equal(json(blocked, 'prices.json').offers['part-up'], undefined);
});

// The lines below print text a redirect supplied: the host named in the reason ("why") or in a refusal's message, as
// well as the address itself. Each must come out as one safe line, and ordinary messages must print as they always did.

const TICK = String.fromCharCode(96);
/** A path carrying a workflow command, a code tick and 2,000 more characters, then a fragment with a log marker. */
const HOSTILE_PATH = `/p/x::error::y${TICK}z${'a'.repeat(2000)}#b##[error]c`;
/** An address URL() accepts whose host name holds a code tick and 2,000 letters. */
const longHost = (suffix) => `https://a${TICK}b${'a'.repeat(2000)}.${suffix}`;
/** The longest a cleaned piece of text can be: LOG_TEXT_MAX and its "...". */
const CAPPED = 303;

/** The one log line that starts (or ends) as given, checked safe: no colon pair, no hash pair and no control character. */
function safeLine(out, { start, end }) {
  const found = out.split('\n').filter((l) => (start ? l.startsWith(start) : l.endsWith(end)));
  assert.equal(found.length, 1, out.slice(0, 3000));
  const [line] = found;
  assert.ok(!line.includes('::') && !line.includes('##'), line.slice(0, 1000));
  assert.ok(![...line].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), line.slice(0, 1000));
  return line;
}
/** No line of the night's log starts a workflow command or a log marker. */
const noCommands = (out) => {
  for (const l of out.split('\n')) assert.doesNotMatch(l, /^\s*(::|##\[)/, l.slice(0, 1000));
};

test('ordinary messages print exactly as before, character for character', (t) => {
  const dir = fixture(t);
  // Every read fails in its own ordinary way: a misread, an HTTP error, a robots.txt refusal, an off-site redirect and a page with no price.
  const reads = {
    [STEADY_A]: { price: 1000, inStock: true },
    [STEADY_B]: { status: 404 },
    [UP_A]: { redirect: `${SHOP_B}/p/up` },
    [DOWN_B]: { html: '<html><head><title>Gone</title></head><body><h1>Gone</h1></body></html>' },
  };
  const { out, summary } = night(dir, {
    now: NIGHT_1, reads, unfetched: { [`${SHOP_B}/robots.txt`]: { robots: 'User-agent: *\nDisallow: /p/new\n' } },
    updated: 0, held: 0, kept: 2, failed: 3, rejected: 1, blocked: 1, offsite: 1, moved: 0,
  });
  const lines = out.split('\n');
  for (const expected of [
    'part-steady @ SHA: ignored, looks like a misread: $1000 is too far from the usual $100',
    'part-steady @ SHB: HTTP 404',
    `robots.txt disallows it: ${NEW_B}`,
    `part-up @ SHA: redirected off-site to shop-b.example (${SHOP_B}/p/up), not read`,
    'part-down @ SHB: no price found on page',
  ]) assert.equal(lines.filter((l) => l === expected).length, 1, `${expected}\n${out}`);
  // Those five, a blank line and the count: nothing else is printed.
  assert.equal(lines.length, 8, out);
  assert.equal(summary, '');
  assert.deepEqual(json(dir, 'prices.json'), { updatedAt: LAST_NIGHT, offers: { 'part-steady': steady(LAST_NIGHT) } });
});

test('an off-site redirect to a hostile address gives one safe line: the host named and the address are both cleaned', (t) => {
  const dir = fixture(t);
  // An IPv6 address is the host form that holds a colon pair; the other host is a code tick and 2,000 letters.
  const v6 = new URL(`https://[2001:db8::1]${HOSTILE_PATH}`).href;
  const long = new URL(`${longHost('elsewhere.example')}${HOSTILE_PATH}`).href;
  assert.ok(v6.startsWith('https://[2001:db8::1]/p/x::error::y') && v6.includes('##[error]') && v6.length > 2000, 'the address still carries the attack once parsed');
  assert.ok(new URL(long).hostname.startsWith(`a${TICK}b`) && new URL(long).hostname.length > 2000, 'so does the host name');
  const { out, summary } = night(dir, { now: NIGHT_1, reads: { ...READS, [UP_A]: { redirect: v6 }, [DOWN_B]: { redirect: long } }, updated: 3, held: 0, offsite: 2, moved: 0 });

  const up = safeLine(out, { start: 'part-up @ SHA: ' });
  assert.ok(up.startsWith(`part-up @ SHA: redirected off-site to [2001:db8%3A:1] (https://[2001:db8%3A:1]/p/x%3A:error%3A:y%60z`), up);
  assert.ok(up.endsWith('...), not read'), up);
  assert.ok(up.length < 80 + CAPPED, `${up.length} characters`);

  const down = safeLine(out, { start: 'part-down @ SHB: ' });
  assert.ok(down.startsWith(`part-down @ SHB: redirected off-site to a${TICK}baaaa`), down.slice(0, 200));
  assert.match(down, /a\.\.\. \(https:\/\/a.baa+\.\.\.\), not read$/);
  assert.ok(down.length < 60 + 2 * CAPPED, `${down.length} characters`);

  noCommands(out);
  assert.equal(out.split('\n').length, 8, 'five reads, a blank line and the count');
  assert.equal(summary, '');
  assert.equal(json(dir, 'prices.json').offers['part-up'], undefined);
  assert.equal(json(dir, 'prices.json').offers['part-down'], undefined);
});

test('a robots-blocked hop to a hostile address gives one safe line: the reason and the address are both cleaned', (t) => {
  const dir = fixture(t);
  const cdnA = 'https://cdn.shop-a.example';
  const cdnB = 'https://cdn.shop-b.example';
  const hopA = new URL(`${cdnA}${HOSTILE_PATH}`).href;
  const hopB = new URL(`${cdnB}${HOSTILE_PATH}`).href;
  assert.ok(hopA.startsWith(`${cdnA}/p/x::error::y`) && hopA.includes('##[error]') && hopA.length > 2000, 'the address still carries the attack once parsed');
  // Each hop's host sends its robots.txt to an address that is never requested, so the host is blocked and the reason
  // names that address: an IPv6 one (a colon pair) and a local name with a code tick and 2,000 letters.
  const reads = {
    ...READS,
    [UP_A]: { redirect: hopA },
    [`${cdnA}/robots.txt`]: { redirect: 'https://[::1]/robots.txt' },
    [DOWN_B]: { redirect: hopB },
    [`${cdnB}/robots.txt`]: { redirect: `${longHost('localhost')}/robots.txt` },
  };
  const { out, summary } = night(dir, { now: NIGHT_1, reads, updated: 3, held: 0, blocked: 2, moved: 0 });

  const up = safeLine(out, { end: ` (redirected from ${UP_A})` });
  assert.ok(up.startsWith(`robots.txt redirect refused: local or private address ([%3A:1]): ${cdnA}/p/x%3A:error%3A:y%60zaaaa`), up);
  assert.ok(up.endsWith(`a... (redirected from ${UP_A})`), up);
  assert.ok(up.length < 120 + CAPPED, `${up.length} characters`);

  const down = safeLine(out, { end: ` (redirected from ${DOWN_B})` });
  assert.ok(down.startsWith(`robots.txt redirect refused: local or private address (a${TICK}baaaa`), down.slice(0, 200));
  assert.ok(down.includes(`a...: ${cdnB}/p/x%3A:error%3A:y%60zaaaa`), down);
  assert.ok(down.endsWith(`a... (redirected from ${DOWN_B})`), down);
  assert.ok(down.length < 60 + 2 * CAPPED, `${down.length} characters`);

  noCommands(out);
  assert.equal(out.split('\n').length, 8, 'five reads, a blank line and the count');
  assert.equal(summary, '');
  assert.equal(json(dir, 'prices.json').offers['part-up'], undefined);
  assert.equal(json(dir, 'prices.json').offers['part-down'], undefined);
});

test('a redirect refused for its address fails the read with one safe line', (t) => {
  const dir = fixture(t);
  const reads = { ...READS, [UP_A]: { redirect: `https://[::1]${HOSTILE_PATH}` }, [DOWN_B]: { redirect: `${longHost('localhost')}/p/down` } };
  const { out, summary } = night(dir, { now: NIGHT_1, reads, updated: 3, held: 0, failed: 2, moved: 0 });
  assert.equal(safeLine(out, { start: 'part-up @ SHA: ' }), 'part-up @ SHA: redirect refused: local or private address ([%3A:1])');
  const down = safeLine(out, { start: 'part-down @ SHB: ' });
  assert.ok(down.startsWith(`part-down @ SHB: redirect refused: local or private address (a${TICK}baaaa`), down.slice(0, 200));
  assert.ok(down.endsWith('a...'), down.slice(-200));
  assert.ok(down.length < 20 + CAPPED, `${down.length} characters`);
  noCommands(out);
  assert.equal(out.split('\n').length, 8, 'five reads, a blank line and the count');
  assert.equal(summary, '');
});

test('the step summary lists moved reads by part, then store, whatever order the stores were read in', (t) => {
  const control = directNight(t);
  const dir = fixture(t);
  const mk2 = (url) => `${url}-mk2`;
  // Four moved reads across both stores. Shop B's queue reads part-steady before part-down, so the log has them in that order.
  const reads = { [NEW_B]: READS[NEW_B] };
  for (const url of [STEADY_A, STEADY_B, UP_A, DOWN_B]) Object.assign(reads, { [url]: { redirect: mk2(url) }, [mk2(url)]: READS[url] });
  const { out, summary } = night(dir, { now: NIGHT_1, reads, updated: 5, held: 0, moved: 4 });

  const logged = movedLines(out);
  assert.deepEqual([...logged].sort(), [
    `part-down @ SHB: redirected to a different page (${mk2(DOWN_B)})`,
    `part-steady @ SHA: redirected to a different page (${mk2(STEADY_A)})`,
    `part-steady @ SHB: redirected to a different page (${mk2(STEADY_B)})`,
    `part-up @ SHA: redirected to a different page (${mk2(UP_A)})`,
  ]);
  assert.ok(logged.findIndex((l) => l.startsWith('part-steady @ SHB')) < logged.findIndex((l) => l.startsWith('part-down @ SHB')), 'the log is not in the summary order');
  assert.equal(summary, [
    '## Redirected to a different page',
    '',
    '4 tracked links were redirected to a different page on the same site. Each was still read and priced as usual.',
    '',
    '| Part | Store | Redirected to |',
    '|---|---|---|',
    `| part-down | SHB | ${TICK}${mk2(DOWN_B)}${TICK} |`,
    `| part-steady | SHA | ${TICK}${mk2(STEADY_A)}${TICK} |`,
    `| part-steady | SHB | ${TICK}${mk2(STEADY_B)}${TICK} |`,
    `| part-up | SHA | ${TICK}${mk2(UP_A)}${TICK} |`,
    '',
    '',
  ].join('\n'));
  sameFiles(dir, control.dir);
});
