import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { robotsGate } from './robots.mjs';
import { activeSources, fetchableSources, linksOnlyIds, noFetchHosts, pausedHosts, pausedIds, readActiveSources, readFetchableSources, readNoFetchHosts, readPausedHosts, retailersFrom } from './sources.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const sources = JSON.parse(read('data/sources.json'));
const retailers = retailersFrom(read('src/data/retailers.ts'));

test('reads every retailer in src/data/retailers.ts', () => {
  const lines = read('src/data/retailers.ts').match(/^ {2}\w+: \{ id: /gm);
  assert.equal(Object.keys(retailers).length, lines.length);
  assert.equal(retailers.BUDS.search, 'https://www.budsgunshop.com/search.php?q=');
});

/** The robots.txt pauses' date. If it moves at merge, change it here, in PAUSE_DAY_2 (scripts/unit.test.ts) and in data/sources.json. */
const ROBOTS_PAUSE_DAY = '2026-10-26';
/** Every paused retailer, with its own pause date and reason, exactly as data/sources.json must have them. */
const PAUSES = {
  ARD: ['2026-10-24', "paused pending review of the retailer's terms on automated price collection"],
  PA: ['2026-10-24', "paused pending review of the retailer's terms on automated price collection"],
  VED: ['2026-10-24', "paused pending review of the retailer's terms on automated price collection"],
  AT3: [ROBOTS_PAUSE_DAY, 'robots.txt refuses the price bot'],
  MID: [ROBOTS_PAUSE_DAY, 'robots.txt refuses the price bot'],
  RA: [ROBOTS_PAUSE_DAY, 'robots.txt refuses the price bot'],
};
const PAUSED_NOW = Object.keys(PAUSES).sort();

test(`AR15Discounts, Primary Arms and Vedder Holsters are paused since 2026-10-24, and AT3 Tactical, MidwayUSA and Rainier Arms since ${ROBOTS_PAUSE_DAY}, each with its reason`, () => {
  assert.deepEqual(PAUSED_NOW, ['ARD', 'AT3', 'MID', 'PA', 'RA', 'VED']);
  assert.deepEqual([...pausedIds(sources, retailers)].sort(), PAUSED_NOW);
  assert.deepEqual(Object.keys(sources.paused).sort(), PAUSED_NOW);
  for (const [id, entry] of Object.entries(sources.paused)) {
    assert.deepEqual(Object.keys(entry).sort(), ['reason', 'since'], id);
    assert.equal(entry.since, PAUSES[id][0], id);
    assert.equal(entry.reason, PAUSES[id][1], id);
  }
});

test('paused retailers are left out of the links the scripts read, and everyone else is kept', () => {
  const active = activeSources(sources, retailers);
  let kept = 0;
  for (const [partId, byRetailer] of Object.entries(sources.parts))
    for (const [r, url] of Object.entries(byRetailer)) {
      if (PAUSED_NOW.includes(r)) assert.equal(active[partId]?.[r], undefined, `${partId} @ ${r}`);
      else { assert.equal(active[partId][r], url); kept++; }
    }
  assert.equal(Object.values(active).reduce((n, b) => n + Object.keys(b).length, 0), kept);
  assert.ok(Object.values(active).every((b) => Object.keys(b).length > 0), 'no part is left with an empty list');
  // The links themselves stay in the file, so resuming is one line.
  assert.ok(Object.values(sources.parts).some((b) => b.PA) && Object.values(sources.parts).some((b) => b.ARD));
  for (const id of ['AT3', 'RA', 'MID']) assert.ok(Object.values(sources.parts).some((b) => b[id]), `${id} links stay in the file`);
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
  for (const bad of ['2026-10-22: why', { reason: 'why' }, { since: '2026-10-22' }, { since: '2026-10-22', reason: ' ' }, { since: '10/22/2026', reason: 'why' }, { since: '2026-02-30', reason: 'why' }, { since: '2026-99-99', reason: 'why' }, null])
    assert.throws(() => pausedIds({ paused: { PA: bad }, parts: {} }, retailers), /PA needs \{ "since"/, JSON.stringify(bad));
});

test('the link check skips the paused retailers\' sites, search links included, and no one else', () => {
  const hosts = pausedHosts(sources, retailers);
  for (const h of ['ar15discounts.com', 'www.primaryarms.com', 'www.vedderholsters.com', 'www.at3tactical.com', 'www.rainierarms.com', 'rainierarms.com', 'www.midwayusa.com']) assert.ok(hosts.has(h), h);
  for (const id of Object.keys(retailers).filter((id) => !PAUSED_NOW.includes(id))) assert.ok(!hosts.has(new URL(retailers[id].search).host), id);
});

// The scripts that fetch retailer pages run network code on import, so they're checked as text: each reads its
// links only through readFetchableSources / readNoFetchHosts, and none reads data/sources.json itself.
test('the price job, weight reader and link check read links only through the paused and links-only filter', () => {
  const uses = { 'scripts/update-prices.mjs': 'readFetchableSources', 'scripts/read-weights.mjs': 'readFetchableSources', 'scripts/check-links.mjs': 'readNoFetchHosts' };
  for (const [file, fn] of Object.entries(uses)) {
    const text = read(file);
    assert.match(text, new RegExp(`^import \{ ${fn} \} from './sources\.mjs';$`, 'm'), file);
    assert.match(text, fn === 'readFetchableSources' ? /^const sources = readFetchableSources\(\);$/m : /^const NO_FETCH_HOSTS = readNoFetchHosts\(\);$/m, file);
    assert.doesNotMatch(text, /sources\.json'/, `${file} must not read data/sources.json directly`);
    assert.doesNotMatch(text, /\b(activeSources|pausedHosts|pausedIds|fetchableSources|noFetchHosts|linksOnlyIds|readActiveSources|readPausedHosts|readSources|readRetailers)\(/, `${file} must not filter by hand`);
  }
  // update-prices builds its fetch jobs, and read-weights its page list, from that filtered `sources` alone.
  assert.match(read('scripts/update-prices.mjs'), /^const jobs = Object\.entries\(sources\)\.flatMap\(/m);
  assert.match(read('scripts/read-weights.mjs'), /^for \(const \[partId, byRetailer\] of Object\.entries\(sources\)\) \{$/m);
  // The link check skips a link when its host is paused or links only, and its log line names those hosts.
  assert.match(read('scripts/check-links.mjs'), /if \(NO_FETCH_HOSTS\.has\(new URL\(url\)\.host\)\) return;/);
  assert.ok(read('scripts/check-links.mjs').includes("console.log(`Not checked, paused or links only in data/sources.json: ${[...NO_FETCH_HOSTS].join(', ') || 'none'}.`);"));
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

test('readFetchableSources and readNoFetchHosts read the real files and apply the filter', () => {
  const cwd = process.cwd();
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  try {
    assert.deepEqual(readFetchableSources(), fetchableSources(sources, retailers));
    assert.deepEqual([...readNoFetchHosts()].sort(), [...noFetchHosts(sources, retailers)].sort());
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

test('the link check skips every host on a paused retailer\'s site, such as blog.primaryarms.com', () => {
  const hosts = pausedHosts(sources, retailers);
  for (const h of ['blog.primaryarms.com', 'primaryarms.com', 'www.primaryarms.com', 'help.ar15discounts.com', 'at3tactical.com', 'cdn.rainierarms.com', 'www.midwayusa.com', 'VedderHolsters.com'])
    assert.ok(hosts.has(h), h);
  for (const h of ['www.brownells.com', 'primaryarms.com.example.net', 'notprimaryarms.com', 'magpul.com']) assert.ok(!hosts.has(h), h);
  // The list itself is still the hosts we hold links for.
  assert.ok([...hosts].includes('www.primaryarms.com') && ![...hosts].includes('blog.primaryarms.com'));
});

/* ------------------------------------------------------------------ links-only retailers */

const OK_ENTRY = { since: '2026-10-22', reason: 'why' };

test('a small example: fetching drops the links-only retailer too, and the paused results stay paused-only', () => {
  const s = {
    paused: { PA: OK_ENTRY },
    linksOnly: { CTD: OK_ENTRY },
    parts: { a: { PA: 'https://pa.example/a', CTD: 'https://www.ctd.example/a', BUDS: 'https://buds.example/a' }, b: { CTD: 'https://ctd2.example/b' }, c: { BUDS: 'https://buds.example/c' } },
  };
  assert.deepEqual(fetchableSources(s, retailers), { a: { BUDS: 'https://buds.example/a' }, c: { BUDS: 'https://buds.example/c' } });
  assert.deepEqual(activeSources(s, retailers), { a: { CTD: 'https://www.ctd.example/a', BUDS: 'https://buds.example/a' }, b: { CTD: 'https://ctd2.example/b' }, c: { BUDS: 'https://buds.example/c' } });
  assert.deepEqual([...pausedIds(s, retailers)], ['PA']);
  assert.ok(!pausedHosts(s, retailers).has('www.cheaperthandirt.com'));
  assert.deepEqual(fetchableSources({ parts: s.parts }, retailers), s.parts);
  assert.deepEqual([...linksOnlyIds({ parts: {} }, retailers)], []);
});

test('the no-fetch hosts are the paused hosts plus each links-only search host and product link host, as whole sites', () => {
  const s = { paused: { PA: OK_ENTRY }, linksOnly: { CTD: OK_ENTRY }, parts: { a: { PA: 'https://pa.example/a', CTD: 'https://shop.ctd-store.example/a', BUDS: 'https://buds.example/a' } } };
  const hosts = noFetchHosts(s, retailers);
  assert.deepEqual([...hosts].sort(), [...pausedHosts(s, retailers), 'shop.ctd-store.example', new URL(retailers.CTD.search).host].sort());
  for (const h of ['www.primaryarms.com', 'pa.example', 'shop.ctd-store.example', 'other.ctd-store.example', 'www.cheaperthandirt.com', 'cheaperthandirt.com', 'blog.cheaperthandirt.com']) assert.ok(hosts.has(h), h);
  for (const h of ['buds.example', 'notcheaperthandirt.com', 'cheaperthandirt.com.example.net']) assert.ok(!hosts.has(h), h);
});

test('an unknown retailer id in "linksOnly" fails instead of leaving a store running', () => {
  for (const fn of [linksOnlyIds, fetchableSources, noFetchHosts]) {
    assert.throws(() => fn({ linksOnly: { CTDD: OK_ENTRY }, parts: {} }, retailers), /"linksOnly" names unknown retailer CTDD/, fn.name);
  }
});

test('a links-only entry without a real date or a reason fails', () => {
  assert.equal(linksOnlyIds({ linksOnly: { CTD: OK_ENTRY }, parts: {} }, retailers).has('CTD'), true);
  for (const bad of ['2026-10-22: why', { reason: 'why' }, { since: '2026-10-22' }, { since: '2026-10-22', reason: ' ' }, { since: '10/22/2026', reason: 'why' }, { since: '2026-02-30', reason: 'why' }, { since: '2026-99-99', reason: 'why' }, null])
    assert.throws(() => linksOnlyIds({ linksOnly: { CTD: bad }, parts: {} }, retailers), /"linksOnly" entry for CTD needs \{ "since"/, JSON.stringify(bad));
});

test('a "paused" or "linksOnly" that is not a plain object fails instead of listing nobody', () => {
  for (const bad of [null, [], ['PA'], 0, 5, true, false, '', 'PA']) {
    const shown = JSON.stringify(bad);
    assert.throws(() => pausedIds({ paused: bad, parts: {} }, retailers), /"paused" must be an object/, shown);
    assert.throws(() => linksOnlyIds({ linksOnly: bad, parts: {} }, retailers), /"linksOnly" must be an object/, shown);
    assert.throws(() => linksOnlyIds({ paused: bad, linksOnly: { CTD: OK_ENTRY }, parts: {} }, retailers), /"paused" must be an object/, shown);
    for (const fn of [activeSources, pausedHosts, fetchableSources, noFetchHosts]) assert.throws(() => fn({ paused: bad, parts: {} }, retailers), /"paused" must be an object/, `${fn.name} ${shown}`);
    for (const fn of [fetchableSources, noFetchHosts]) assert.throws(() => fn({ linksOnly: bad, parts: {} }, retailers), /"linksOnly" must be an object/, `${fn.name} ${shown}`);
  }
});

test('"paused" and "linksOnly" may be left out or empty', () => {
  for (const s of [{ parts: {} }, { paused: {}, linksOnly: {}, parts: {} }]) {
    assert.deepEqual([...pausedIds(s, retailers)], []);
    assert.deepEqual([...linksOnlyIds(s, retailers)], []);
    assert.deepEqual([...noFetchHosts(s, retailers)], []);
  }
});

test('a name every object inherits is not a retailer', () => {
  for (const id of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    const list = JSON.parse(`{ ${JSON.stringify(id)}: ${JSON.stringify(OK_ENTRY)} }`);
    assert.deepEqual(Object.keys(list), [id]);
    assert.throws(() => pausedIds({ paused: list, parts: {} }, retailers), new RegExp(`"paused" names unknown retailer ${id}`), id);
    assert.throws(() => linksOnlyIds({ linksOnly: list, parts: {} }, retailers), new RegExp(`"linksOnly" names unknown retailer ${id}`), id);
  }
});

test('a retailer listed under both "paused" and "linksOnly" fails', () => {
  const s = { paused: { CTD: OK_ENTRY }, linksOnly: { CTD: OK_ENTRY }, parts: {} };
  for (const fn of [linksOnlyIds, fetchableSources, noFetchHosts]) assert.throws(() => fn(s, retailers), /CTD under both "paused" and "linksOnly"/, fn.name);
});

/**
 * The day we stopped requesting the links-only retailers. If it moves at merge, change it here and in data/sources.json,
 * then run `npm run retailers`.
 */
const LINKS_ONLY_DAY = '2026-10-31';
/** Every links-only retailer, with its date and reason, exactly as data/sources.json must have them. */
const LINKS_ONLY = {
  BRN: [LINKS_ONLY_DAY, 'its product pages answer the price bot with a 403'],
  CTD: [LINKS_ONLY_DAY, 'its robots.txt answers the price bot with a 403'],
  PSA: [LINKS_ONLY_DAY, 'its product pages answer the price bot with a 403'],
  SIG: [LINKS_ONLY_DAY, 'its product pages answer the price bot with a 403'],
};
const LINKS_ONLY_NOW = Object.keys(LINKS_ONLY).sort();

test(`Brownells, Cheaper Than Dirt, Palmetto State Armory and Sig Sauer are links only since ${LINKS_ONLY_DAY}, each with its reason, and none is paused`, () => {
  assert.deepEqual(LINKS_ONLY_NOW, ['BRN', 'CTD', 'PSA', 'SIG']);
  assert.deepEqual([...linksOnlyIds(sources, retailers)].sort(), LINKS_ONLY_NOW);
  assert.deepEqual(Object.keys(sources.linksOnly).sort(), LINKS_ONLY_NOW);
  for (const [id, entry] of Object.entries(sources.linksOnly)) {
    assert.deepEqual(Object.keys(entry).sort(), ['reason', 'since'], id);
    assert.equal(entry.since, LINKS_ONLY[id][0], id);
    assert.equal(entry.reason, LINKS_ONLY[id][1], id);
    assert.ok(!PAUSED_NOW.includes(id), id);
  }
});

test('the fetch list leaves out the links-only and paused retailers, and keeps everyone else', () => {
  const fetchable = fetchableSources(sources, retailers);
  let kept = 0;
  for (const [partId, byRetailer] of Object.entries(sources.parts))
    for (const [r, url] of Object.entries(byRetailer)) {
      if (LINKS_ONLY_NOW.includes(r) || PAUSED_NOW.includes(r)) assert.equal(fetchable[partId]?.[r], undefined, `${partId} @ ${r}`);
      else { assert.equal(fetchable[partId][r], url); kept++; }
    }
  assert.equal(Object.values(fetchable).reduce((n, b) => n + Object.keys(b).length, 0), kept);
  assert.ok(Object.values(fetchable).every((b) => Object.keys(b).length > 0), 'no part is left with an empty list');
  // The links stay in the file, for the site and so that resuming is one line.
  for (const id of LINKS_ONLY_NOW) assert.ok(Object.values(sources.parts).some((b) => b[id]), `${id} links stay in the file`);
});

test('no fetchable link sits on a no-fetch host, under any retailer id', () => {
  const hosts = noFetchHosts(sources, retailers);
  const reached = Object.entries(fetchableSources(sources, retailers)).flatMap(([p, b]) => Object.entries(b).filter(([, url]) => hosts.has(new URL(url).host)).map(([r, url]) => `${p} @ ${r}: ${url}`));
  assert.deepEqual(reached, []);
});

test('listing the links-only retailers leaves the paused results as they are', () => {
  const { linksOnly: _, ...withoutThem } = sources;
  assert.deepEqual([...pausedIds(sources, retailers)].sort(), PAUSED_NOW);
  assert.deepEqual(activeSources(sources, retailers), activeSources(withoutThem, retailers));
  assert.deepEqual([...pausedHosts(sources, retailers)].sort(), [...pausedHosts(withoutThem, retailers)].sort());
  for (const h of ['www.cheaperthandirt.com', 'www.brownells.com', 'www.sigsauer.com', 'palmettostatearmory.com']) assert.ok(!pausedHosts(sources, retailers).has(h), h);
  assert.ok(Object.values(activeSources(sources, retailers)).some((b) => b.CTD), 'activeSources still holds their links');
});

// The scripts run network code on import, so the line itself is checked as text.
test('the price job, weight reader and link check refuse a no-fetch host at request time, in politeFetch', () => {
  for (const file of ['scripts/update-prices.mjs', 'scripts/read-weights.mjs', 'scripts/check-links.mjs']) {
    const text = read(file);
    assert.match(text, /^import \{ readNoFetchHosts \} from '\.\/sources\.mjs';$/m, file);
    assert.match(text, /^const NO_FETCH_HOSTS = readNoFetchHosts\(\);$/m, file);
    assert.match(text, /async function politeFetch\(url, init = \{\}\) \{\r?\n {2}const u = new URL\(url\);\r?\n {2}if \(NO_FETCH_HOSTS\.has\(u\.host\)\) throw new Error\(`no-fetch host \$\{u\.host\}`\);\r?\n/, file);
  }
});

/** The guard each politeFetch has, in front of a made-up network. `asked` records what got past it. */
const guardedGate = (answer, refuse = (u) => noFetchHosts(sources, retailers).has(u.host)) => {
  const asked = [];
  const get = async (url) => {
    const u = new URL(url);
    if (refuse(u)) throw new Error(`no-fetch host ${u.host}`);
    asked.push(url);
    return answer(url);
  };
  return { asked, ...robotsGate({ get, agent: 'TestBot' }) };
};

test('a no-fetch host\'s robots.txt counts as unreadable, so that host is disallowed and nothing reaches it', async () => {
  const g = guardedGate(() => new Response('', { status: 200 }));
  for (const url of ['https://www.brownells.com/p', 'https://blog.cheaperthandirt.com/p', 'https://www.primaryarms.com/p']) {
    const got = await g.safeGet(url);
    assert.equal(got.blocked, url);
    assert.equal(got.unreadable, true, url);
    assert.match(got.error.message, /^no-fetch host /, url);
    assert.equal(await g.allowed(url), false, url);
  }
  assert.deepEqual(g.asked, []);
});

test('a robots.txt that redirects onto a no-fetch host counts as unreadable too, and an ordinary host still works', async () => {
  const g = guardedGate((url) => {
    if (url === 'https://shop.example/robots.txt') return new Response(null, { status: 301, headers: { location: 'https://www.sigsauer.com/robots.txt' } });
    return new Response('page', { status: url.endsWith('/robots.txt') ? 404 : 200 });
  });
  const got = await g.safeGet('https://shop.example/p');
  assert.equal(got.blocked, 'https://shop.example/p');
  assert.equal(got.unreadable, true);
  assert.equal((await g.safeGet('https://other.example/p')).res.status, 200);
  assert.deepEqual(g.asked, ['https://shop.example/robots.txt', 'https://other.example/robots.txt', 'https://other.example/p']);
});

test('a page refused after its robots.txt was read rejects, into the script\'s own catch', async () => {
  const g = guardedGate(() => new Response('', { status: 404 }), (u) => u.pathname !== '/robots.txt');
  await assert.rejects(g.safeGet('https://shop.example/p'), /no-fetch host shop\.example/);
  assert.deepEqual(g.asked, ['https://shop.example/robots.txt']);
});

test('the no-fetch hosts cover the links-only retailers\' whole sites, the paused ones, and no one else', () => {
  const hosts = noFetchHosts(sources, retailers);
  for (const h of ['www.cheaperthandirt.com', 'blog.cheaperthandirt.com', 'cheaperthandirt.com', 'www.brownells.com', 'brownells.com', 'www.sigsauer.com', 'palmettostatearmory.com', 'www.palmettostatearmory.com', ...pausedHosts(sources, retailers)]) assert.ok(hosts.has(h), h);
  for (const h of ['notcheaperthandirt.com', 'cheaperthandirt.com.example.net', 'blog.cheaperthandirt.example', 'mybrownells.com', 'sigsauer.co', 'palmettostatearmory.org', 'magpul.com']) assert.ok(!hosts.has(h), h);
  for (const id of Object.keys(retailers).filter((id) => !PAUSED_NOW.includes(id) && !LINKS_ONLY_NOW.includes(id))) assert.ok(!hosts.has(new URL(retailers[id].search).host), id);
});
