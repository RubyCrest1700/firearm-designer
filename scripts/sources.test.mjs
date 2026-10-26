import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { activeSources, pausedHosts, pausedIds, readActiveSources, readPausedHosts, retailersFrom } from './sources.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const sources = JSON.parse(read('data/sources.json'));
const retailers = retailersFrom(read('src/data/retailers.ts'));

test('reads every retailer in src/data/retailers.ts', () => {
  const lines = read('src/data/retailers.ts').match(/^ {2}\w+: \{ id: /gm);
  assert.equal(Object.keys(retailers).length, lines.length);
  assert.equal(retailers.BUDS.search, 'https://www.budsgunshop.com/search.php?q=');
});

test('AR15Discounts, Primary Arms and Vedder Holsters are paused, with a pause date and a reason', () => {
  assert.deepEqual([...pausedIds(sources, retailers)].sort(), ['ARD', 'PA', 'VED']);
  for (const entry of Object.values(sources.paused)) {
    assert.deepEqual(Object.keys(entry).sort(), ['reason', 'since']);
    assert.equal(entry.since, '2026-10-24');
    assert.match(entry.reason, /^paused pending review of the retailer's terms on automated price collection$/);
  }
});

test('paused retailers are left out of the links the scripts read, and everyone else is kept', () => {
  const active = activeSources(sources, retailers);
  let kept = 0;
  for (const [partId, byRetailer] of Object.entries(sources.parts))
    for (const [r, url] of Object.entries(byRetailer)) {
      if (['ARD', 'PA', 'VED'].includes(r)) assert.equal(active[partId]?.[r], undefined, `${partId} @ ${r}`);
      else { assert.equal(active[partId][r], url); kept++; }
    }
  assert.equal(Object.values(active).reduce((n, b) => n + Object.keys(b).length, 0), kept);
  assert.ok(Object.values(active).every((b) => Object.keys(b).length > 0), 'no part is left with an empty list');
  // The links themselves stay in the file, so resuming is one line.
  assert.ok(Object.values(sources.parts).some((b) => b.PA) && Object.values(sources.parts).some((b) => b.ARD));
});

test('a small example: only the paused retailer drops out', () => {
  const s = { paused: { PA: { since: '2026-10-22', reason: 'why' } }, parts: { a: { PA: 'https://pa.example/a', BRN: 'https://brn.example/a' }, b: { PA: 'https://pa.example/b' } } };
  assert.deepEqual(activeSources(s, retailers), { a: { BRN: 'https://brn.example/a' } });
  assert.deepEqual(activeSources({ parts: s.parts }, retailers), s.parts);
});

test('an unknown retailer id in "paused" fails instead of pausing nothing', () => {
  assert.throws(() => pausedIds({ paused: { PAA: 'typo' }, parts: {} }, retailers), /unknown retailer PAA/);
  assert.throws(() => activeSources({ paused: { PA: { since: '2026-10-22', reason: 'ok' }, NOPE: 'x' }, parts: {} }, retailers), /NOPE/);
});

test('a paused entry without a real pause date or a reason fails, so the site always knows which history to drop', () => {
  const ok = { since: '2026-10-22', reason: 'why' };
  assert.equal(pausedIds({ paused: { PA: ok }, parts: {} }, retailers).has('PA'), true);
  for (const bad of ['2026-10-22: why', { reason: 'why' }, { since: '2026-10-22' }, { since: '2026-10-22', reason: ' ' }, { since: '10/22/2026', reason: 'why' }, { since: '2026-02-30', reason: 'why' }, null])
    assert.throws(() => pausedIds({ paused: { PA: bad }, parts: {} }, retailers), /PA needs \{ "since"/, JSON.stringify(bad));
});

test('the link check skips the paused retailers\' sites, search links included, and no one else', () => {
  const hosts = pausedHosts(sources, retailers);
  for (const h of ['ar15discounts.com', 'www.primaryarms.com', 'www.vedderholsters.com']) assert.ok(hosts.has(h), h);
  for (const id of Object.keys(retailers).filter((id) => !['ARD', 'PA', 'VED'].includes(id))) assert.ok(!hosts.has(new URL(retailers[id].search).host), id);
});

// The scripts that fetch retailer pages run network code on import, so they're checked as text: each reads its
// links only through readActiveSources / readPausedHosts, and none reads data/sources.json itself.
test('the price job, weight reader and link check read links only through the paused-retailer filter', () => {
  const uses = { 'scripts/update-prices.mjs': 'readActiveSources', 'scripts/read-weights.mjs': 'readActiveSources', 'scripts/check-links.mjs': 'readPausedHosts' };
  for (const [file, fn] of Object.entries(uses)) {
    const text = read(file);
    assert.match(text, new RegExp(`^import \{ ${fn} \} from './sources\.mjs';$`, 'm'), file);
    assert.match(text, fn === 'readActiveSources' ? /^const sources = readActiveSources\(\);$/m : /^const PAUSED_HOSTS = readPausedHosts\(\);$/m, file);
    assert.doesNotMatch(text, /sources\.json'/, `${file} must not read data/sources.json directly`);
    assert.doesNotMatch(text, /\b(activeSources|pausedHosts|pausedIds)\(/, `${file} must not filter by hand`);
  }
  // update-prices builds its fetch jobs, and read-weights its page list, from that filtered `sources` alone.
  assert.match(read('scripts/update-prices.mjs'), /^const jobs = Object\.entries\(sources\)\.flatMap\(/m);
  assert.match(read('scripts/read-weights.mjs'), /^for \(const \[partId, byRetailer\] of Object\.entries\(sources\)\) \{$/m);
  // The link check skips a link when its host is paused.
  assert.match(read('scripts/check-links.mjs'), /if \(PAUSED_HOSTS\.has\(new URL\(url\)\.host\)\) return;/);
});

test('readActiveSources and readPausedHosts read the real files and apply the filter', () => {
  const cwd = process.cwd();
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  try {
    assert.deepEqual(readActiveSources(), activeSources(sources, retailers));
    assert.deepEqual([...readPausedHosts()].sort(), [...pausedHosts(sources, retailers)].sort());
    assert.ok(!Object.values(readActiveSources()).some((b) => b.PA || b.ARD || b.VED));
  } finally {
    process.chdir(cwd);
  }
});

test('no weight\'s source points at a paused retailer, and every published weight names its source', () => {
  const hosts = pausedHosts(sources, retailers);
  const weights = JSON.parse(read('data/weights.json')).parts;
  assert.ok(Object.keys(weights).length > 100);
  const paused = Object.entries(weights).filter(([, w]) => w.src && hosts.has(new URL(w.src).host)).map(([id, w]) => `${id}: ${w.src}`);
  assert.deepEqual(paused, []);
  for (const [id, w] of Object.entries(weights)) {
    if (w.basis === 'published') assert.match(w.src ?? '', /^https:\/\//, id);
    else assert.equal(w.src, null, id);
  }
});
