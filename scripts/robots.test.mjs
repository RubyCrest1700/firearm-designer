// robots.txt handling shared by the price job, the weight reader and the link check (scripts/robots.mjs).
// Every test uses a fake fetch: nothing here touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISALLOW_ALL, MAX_REDIRECTS, PAGE_MAX_BYTES, ROBOTS_MAX_BYTES, blockedKind, isAllowed, patternMatches, readCapped, readPage, robotsGate, robotsRules } from './robots.mjs';
import { isPrivateHost, registrableDomain } from './domains.mjs';

const AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/**
 * A fake fetch over a table of url -> Response, a function returning one, or an Error to throw. Every call is logged
 * as [url, redirect mode]. A url missing from the table fails the test, so nothing unexpected is ever "fetched".
 */
function fakeFetch(table) {
  const calls = [];
  const get = async (url, init = {}) => {
    calls.push([url, init.redirect]);
    if (!(url in table)) throw new Error(`unexpected request: ${url}`);
    const answer = typeof table[url] === 'function' ? table[url]() : table[url];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { get, calls, urls: () => calls.map(([u]) => u) };
}
const ok = (body = '<html>page</html>') => () => new Response(body, { status: 200 });
const status = (code) => () => new Response('', { status: code });
const robots = (text) => () => new Response(text, { status: 200 });
const redirect = (to, code = 301) => () => new Response(null, { status: code, headers: { location: to } });
const gate = (table) => {
  const f = fakeFetch(table);
  return { ...robotsGate({ get: f.get, agent: AGENT }), ...f };
};

/* ------------------------------------------------------------------ robotsRules */

test('a 200 robots.txt is parsed for our agent', () => {
  const rules = robotsRules(200, 'User-agent: *\nDisallow: /cart\n', AGENT);
  assert.deepEqual(rules, [{ allow: false, path: '/cart' }]);
});

test('404 and 410 mean no robots.txt: everything is allowed', () => {
  for (const code of [404, 410]) assert.deepEqual(robotsRules(code, 'Not found', AGENT), [], String(code));
});

test('401, 403, 429, 500 and 503 disallow everything', () => {
  for (const code of [401, 403, 429, 500, 503]) assert.deepEqual(robotsRules(code, '', AGENT), DISALLOW_ALL, String(code));
  assert.deepEqual(DISALLOW_ALL, [{ allow: false, path: '/' }]);
});

/* ------------------------------------------------------------------ the gate before every request */

test('robots.txt that throws (unreachable) disallows the whole host, and the page is never requested', async () => {
  const g = gate({ 'https://a.example/robots.txt': new TypeError('fetch failed') });
  const got = await g.safeGet('https://a.example/p/1');
  assert.equal(got.blocked, 'https://a.example/p/1');
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt']);
  assert.equal(await g.allowed('https://a.example/anything'), false);
});

test('a robots.txt timeout disallows the whole host', async () => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const g = gate({ 'https://a.example/robots.txt': timeout });
  assert.ok((await g.safeGet('https://a.example/p/1')).blocked);
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt']);
});

test('a 503 or 403 robots.txt blocks the page; a 404 one lets it through', async () => {
  for (const code of [503, 403, 429, 401]) {
    const g = gate({ 'https://a.example/robots.txt': status(code) });
    assert.ok((await g.safeGet('https://a.example/p/1')).blocked, String(code));
    assert.deepEqual(g.urls(), ['https://a.example/robots.txt'], String(code));
  }
  for (const code of [404, 410]) {
    const g = gate({ 'https://a.example/robots.txt': status(code), 'https://a.example/p/1': ok('hello') });
    const got = await g.safeGet('https://a.example/p/1');
    assert.equal(got.blocked, undefined, String(code));
    assert.equal(await got.res.text(), 'hello');
    assert.equal(got.url, 'https://a.example/p/1');
  }
});

test('a page robots.txt disallows is not requested', async () => {
  const g = gate({ 'https://a.example/robots.txt': robots('User-agent: *\nDisallow: /p/\n') });
  const got = await g.safeGet('https://a.example/p/1');
  assert.equal(got.blocked, 'https://a.example/p/1');
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt']);
});

test('robots.txt is read once per origin; it and the pages are fetched with manual redirects, through get', async () => {
  const g = gate({ 'https://a.example/robots.txt': robots(''), 'https://a.example/p/1': ok(), 'https://a.example/p/2': ok() });
  await g.safeGet('https://a.example/p/1');
  await g.safeGet('https://a.example/p/2');
  assert.deepEqual(g.calls, [['https://a.example/robots.txt', 'manual'], ['https://a.example/p/1', 'manual'], ['https://a.example/p/2', 'manual']]);
});

/* ------------------------------------------------------------------ redirects, checked hop by hop */

test('a redirect to another host that disallows the path is not requested', async () => {
  const g = gate({
    'https://a.example.com/robots.txt': robots(''),
    'https://a.example.com/p/1': redirect('https://b.example.com/secret/1'),
    'https://b.example.com/robots.txt': robots('User-agent: *\nDisallow: /secret/\n'),
  });
  const got = await g.safeGet('https://a.example.com/p/1');
  assert.equal(got.blocked, 'https://b.example.com/secret/1');
  assert.deepEqual(g.urls(), ['https://a.example.com/robots.txt', 'https://a.example.com/p/1', 'https://b.example.com/robots.txt']);
});

test('a redirect to another host whose robots.txt is unreachable is not requested', async () => {
  const g = gate({
    'https://a.example.com/robots.txt': robots(''),
    'https://a.example.com/p/1': redirect('https://b.example.com/p/1', 302),
    'https://b.example.com/robots.txt': status(500),
  });
  assert.equal((await g.safeGet('https://a.example.com/p/1')).blocked, 'https://b.example.com/p/1');
  assert.ok(!g.urls().includes('https://b.example.com/p/1'));
});

test('a same-host redirect to a disallowed path is not requested', async () => {
  const g = gate({
    'https://a.example/robots.txt': robots('User-agent: *\nDisallow: /cart\n'),
    'https://a.example/p/1': redirect('/cart?add=1', 307),
  });
  const got = await g.safeGet('https://a.example/p/1');
  assert.equal(got.blocked, 'https://a.example/cart?add=1');
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt', 'https://a.example/p/1']);
});

test('an allowed chain returns the final page, checking each new host before its hop', async () => {
  const g = gate({
    'https://a.example.com/robots.txt': robots(''),
    'https://a.example.com/p/1': redirect('https://b.example.com/p/1'),
    'https://b.example.com/robots.txt': status(404),
    'https://b.example.com/p/1': redirect('/p/2', 308),
    'https://b.example.com/p/2': ok('final'),
  });
  const got = await g.safeGet('https://a.example.com/p/1');
  assert.equal(got.url, 'https://b.example.com/p/2');
  assert.equal(await got.res.text(), 'final');
  assert.deepEqual(g.urls(), ['https://a.example.com/robots.txt', 'https://a.example.com/p/1', 'https://b.example.com/robots.txt', 'https://b.example.com/p/1', 'https://b.example.com/p/2']);
});

test(`${MAX_REDIRECTS} redirects are followed; a 6th fails without being requested`, async () => {
  assert.equal(MAX_REDIRECTS, 5);
  const chain = (n) => {
    const t = { 'https://a.example/robots.txt': robots('') };
    for (let i = 0; i < n; i++) t[`https://a.example/h/${i}`] = redirect(`/h/${i + 1}`);
    t[`https://a.example/h/${n}`] = ok('end');
    return t;
  };
  const five = gate(chain(5));
  assert.equal(await (await five.safeGet('https://a.example/h/0')).res.text(), 'end');
  const six = gate(chain(6));
  await assert.rejects(six.safeGet('https://a.example/h/0'), /more than 5 redirects/);
  assert.ok(!six.urls().includes('https://a.example/h/6'), 'the 6th hop is never requested');
  assert.equal(six.urls().filter((u) => u.includes('/h/')).length, 6);
});

test('a redirect to a non-web address is refused', async () => {
  const g = gate({ 'https://a.example/robots.txt': robots(''), 'https://a.example/p/1': redirect('file:///etc/passwd') });
  await assert.rejects(g.safeGet('https://a.example/p/1'), /non-web address/);
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt', 'https://a.example/p/1']);
});

test('a 3xx without a Location header is the final answer', async () => {
  const g = gate({ 'https://a.example/robots.txt': robots(''), 'https://a.example/p/1': () => new Response(null, { status: 304 }) });
  const got = await g.safeGet('https://a.example/p/1');
  assert.equal(got.res.status, 304);
});

test('a blocked result says why, and keeps the robots.txt error for the link check', async () => {
  const dns = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  const g = gate({ 'https://gone.example/robots.txt': dns, 'https://a.example/robots.txt': status(503) });
  const gone = await g.safeGet('https://gone.example/p');
  assert.equal(gone.error, dns);
  assert.match(gone.why, /robots\.txt unreachable/);
  assert.match((await g.safeGet('https://a.example/p')).why, /robots\.txt answered HTTP 503/);
});

/* ------------------------------------------------------------------ the three scripts use it, with their manners unchanged */

// The scripts run network code on import, so they're checked as text.
test('the price job, weight reader and link check fetch pages only through robotsGate, with the same agent and pace', () => {
  const manners = {
    'scripts/update-prices.mjs': ["const USER_AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';", 'const HOST_DELAY_MS = 5000;', 'const HOSTS_AT_ONCE = 6;'],
    'scripts/read-weights.mjs': ["const USER_AGENT = 'FirearmDesignerPriceBot/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';", 'const HOST_DELAY_MS = 5000;'],
    'scripts/check-links.mjs': ["const USER_AGENT = 'FirearmDesignerLinkCheck/0.1 (+https://github.com/RubyCrest1700/firearm-designer)';", 'const HOST_DELAY_MS = 3000;'],
  };
  for (const [file, lines] of Object.entries(manners)) {
    const text = read(file);
    for (const line of lines) assert.ok(text.split(/\r?\n/).includes(line), `${file}: ${line}`);
    assert.match(text, /^import \{ robotsGate \} from '\.\/robots\.mjs';$/m, file);
    assert.match(text, /robotsGate\(\{ get: politeFetch, agent: USER_AGENT \}\)/, file);
    assert.match(text, /AbortSignal\.timeout\(20000\)/, `${file} keeps its timeout`);
    // No page is fetched outside the gate, and nothing parses robots.txt by hand any more.
    assert.equal(text.match(/\bpoliteFetch\(/g)?.length, 1, `${file}: politeFetch is defined once and only handed to robotsGate`);
    assert.doesNotMatch(text, /parseRobots|isAllowed|robotsCache/, file);
  }
});
/* ------------------------------------------------------------------ review round: matcher, caps, redirect safety */

test('the wildcard matcher agrees with the RFC 9309 examples', () => {
  const cases = [
    ['/fish', '/fish', true], ['/fish', '/fish.html', true], ['/fish', '/Fish.asp', false], ['/fish', '/catfish', false],
    ['/fish*', '/fishheads/yummy.html', true], ['/*.php', '/index.php', true], ['/*.php', '/folder/any.php.file.html', true],
    ['/*.php', '/windows.PHP', false], ['/*.php$', '/filename.php', true], ['/*.php$', '/filename.php?parameters', false],
    ['/*.php$', '/filename.php/', false], ['/fish*.php', '/fishheads/catfish.php?parameters', true], ['/fish*.php', '/Fish.PHP', false],
    ['/*?q=', '/s?q=lower', true], ['/a$', '/a', true], ['/a$', '/ab', false], ['/a*b*c$', '/axxbyyc', true], ['/a*b*c$', '/axxbyycz', false],
    ['/a.b(c)', '/a.b(c)/x', true], ['/a.b', '/aXb', false], ['/x$y', '/x$y', true],
  ];
  for (const [pattern, path, want] of cases) assert.equal(patternMatches(pattern, path), want, `${pattern} vs ${path}`);
});

test('a pathological robots.txt pattern is matched quickly', () => {
  const rules = [{ allow: false, path: '/' + 'a*'.repeat(200) + 'b$' }];
  const path = '/' + 'a'.repeat(50_000);
  const start = process.hrtime.bigint();
  assert.equal(isAllowed(rules, path), true);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 500, `${ms} ms`);
});

/** A response whose body is `size` bytes of `fill`, sent in chunks, recording whether it was cancelled. */
function streamed(size, { status = 200, headers = {}, fill = 97, chunk = 64 * 1024 } = {}) {
  const state = { sent: 0, cancelled: false };
  const body = new ReadableStream({
    pull(c) {
      if (state.sent >= size) return c.close();
      const n = Math.min(chunk, size - state.sent);
      state.sent += n;
      c.enqueue(new Uint8Array(n).fill(fill));
    },
    cancel() { state.cancelled = true; },
  });
  return { res: new Response(body, { status, headers }), state };
}

test('bodies are read up to their cap: robots.txt keeps what fits, a page over 5 MiB is a failed read', async () => {
  assert.equal(ROBOTS_MAX_BYTES, 500 * 1024);
  assert.equal(PAGE_MAX_BYTES, 5 * 1024 * 1024);
  const small = await readCapped(streamed(1000).res, 4096);
  assert.equal(small.text.length, 1000);
  assert.equal(small.truncated, false);
  const big = streamed(10_000, { chunk: 1000 });
  const cut = await readCapped(big.res, 4096);
  assert.equal(cut.text.length, 4096);
  assert.equal(cut.truncated, true);
  assert.equal(big.state.cancelled, true, 'the rest is cancelled, not read');
  assert.ok(big.state.sent < 10_000);
  await assert.rejects(readPage(streamed(6 * 1024 * 1024).res), /larger than 5242880 bytes/);
  assert.equal((await readPage(streamed(2048).res)).length, 2048);
});

test('a robots.txt over 500 KiB is parsed up to the cap', async () => {
  const head = 'User-agent: *\nDisallow: /cart\n';
  const pad = '#'.repeat(ROBOTS_MAX_BYTES);
  const g = gate({
    'https://a.example/robots.txt': () => new Response(head + pad + '\nDisallow: /p/\n', { status: 200 }),
    'https://a.example/p/1': ok('page'),
  });
  assert.equal(await g.allowed('https://a.example/cart'), false, 'rules within the cap apply');
  assert.equal((await g.safeGet('https://a.example/p/1')).url, 'https://a.example/p/1', 'rules past the cap are ignored');
});

test('robots.txt redirects are followed by hand, across hosts, at most 5; more counts as unreadable', async () => {
  const g = gate({
    'https://a.example/robots.txt': redirect('https://cdn.other.example/robots/a.txt'),
    'https://cdn.other.example/robots/a.txt': robots('User-agent: *\nDisallow: /p/\n'),
  });
  assert.equal(await g.allowed('https://a.example/p/1'), false);
  assert.deepEqual(g.calls, [['https://a.example/robots.txt', 'manual'], ['https://cdn.other.example/robots/a.txt', 'manual']]);
  const chain = (n) => {
    const t = {};
    for (let i = 0; i < n; i++) t[i ? `https://a.example/r${i}` : 'https://a.example/robots.txt'] = redirect(`https://a.example/r${i + 1}`);
    t[`https://a.example/r${n}`] = robots('');
    t['https://a.example/p'] = ok();
    return t;
  };
  const five = gate(chain(5));
  assert.equal((await five.safeGet('https://a.example/p')).url, 'https://a.example/p');
  const six = gate(chain(6));
  const got = await six.safeGet('https://a.example/p');
  assert.equal(got.blocked, 'https://a.example/p');
  assert.equal(got.unreadable, true);
  assert.match(got.why, /more than 5 times/);
  assert.ok(!six.urls().includes('https://a.example/r6'));
});

test('robots.txt redirects to a private address or from https to http are refused (unreadable)', async () => {
  for (const to of ['http://a.example/robots.txt', 'https://127.0.0.1/robots.txt', 'https://[::1]/robots.txt']) {
    const g = gate({ 'https://a.example/robots.txt': redirect(to) });
    const got = await g.safeGet('https://a.example/p');
    assert.equal(got.unreadable, true, to);
    assert.match(got.why, /redirect refused/, to);
    assert.deepEqual(g.urls(), ['https://a.example/robots.txt'], to);
  }
});

test('a page redirect from https to http on the same host is refused, and not requested', async () => {
  const g = gate({ 'https://a.example/robots.txt': robots(''), 'https://a.example/p/1': redirect('http://a.example/p/1') });
  await assert.rejects(g.safeGet('https://a.example/p/1'), /redirect refused: https to http/);
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt', 'https://a.example/p/1']);
});

test('page redirects to local or private addresses are refused; so is a private starting address', async () => {
  const targets = ['https://localhost/x', 'https://shop.localhost/x', 'https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://172.20.0.1/x', 'https://192.168.1.1/x',
    'https://169.254.169.254/latest/meta-data', 'https://100.64.0.1/x', 'https://0.0.0.0/x', 'https://[::1]/x', 'https://[fd00::1]/x', 'https://[fe80::1]/x', 'https://[::ffff:127.0.0.1]/x'];
  for (const to of targets) {
    const g = gate({ 'https://a.example/robots.txt': robots(''), 'https://a.example/p/1': redirect(to) });
    await assert.rejects(g.safeGet('https://a.example/p/1'), /redirect refused: local or private address/, to);
    assert.equal(g.urls().length, 2, to);
  }
  await assert.rejects(gate({}).safeGet('https://192.168.0.10/p'), /request refused: local or private address/);
});

test('a redirect that leaves the site is reported as off-site and not followed', async () => {
  const g = gate({ 'https://www.shop.example/robots.txt': robots(''), 'https://www.shop.example/p/1': redirect('https://www.other.example/deal') });
  const got = await g.safeGet('https://www.shop.example/p/1');
  assert.equal(got.offsite, 'https://www.other.example/deal');
  assert.equal(got.from, 'https://www.shop.example/p/1');
  assert.equal(got.res, undefined);
  assert.match(got.why, /off-site/);
  assert.ok(!g.urls().some((u) => u.includes('other.example')));
  // Within the same registrable domain is fine: www to the bare domain.
  const same = gate({ 'https://www.shop.example/robots.txt': robots(''), 'https://www.shop.example/p': redirect('https://shop.example/p'), 'https://shop.example/robots.txt': robots(''), 'https://shop.example/p': ok() });
  assert.equal((await same.safeGet('https://www.shop.example/p')).url, 'https://shop.example/p');
});

test('the body of each redirect hop is cancelled', async () => {
  const hop = streamed(100_000, { status: 301, headers: { location: '/p/2' } });
  const g = gate({ 'https://a.example/robots.txt': robots(''), 'https://a.example/p/1': () => hop.res, 'https://a.example/p/2': ok() });
  await g.safeGet('https://a.example/p/1');
  assert.equal(hop.state.cancelled, true);
});

test('registrable domains and private hosts', () => {
  assert.equal(registrableDomain('www.primaryarms.com'), 'primaryarms.com');
  assert.equal(registrableDomain('blog.primaryarms.com'), 'primaryarms.com');
  assert.equal(registrableDomain('primaryarms.com'), 'primaryarms.com');
  assert.equal(registrableDomain('shop.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('WWW.Example.COM.'), 'example.com');
  assert.equal(registrableDomain('[2001:db8::1]'), '2001:db8::1');
  for (const h of ['localhost', 'a.localhost', '127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '100.64.0.1', '100.127.0.1', '0.0.0.0', '[::1]', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:7f00:1'])
    assert.equal(isPrivateHost(h), true, h);
  for (const h of ['www.brownells.com', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2001:4860::8888', '[2606:4700::1]'])
    assert.equal(isPrivateHost(h), false, h);
});

test('the link check files ENOTFOUND as broken, an unreadable robots.txt apart, and a Disallow as skipped', async () => {
  const dns = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  const g = gate({ 'https://gone.example/robots.txt': dns, 'https://a.example/robots.txt': status(403), 'https://b.example/robots.txt': robots('User-agent: *\nDisallow: /s\n') });
  assert.equal(blockedKind(await g.safeGet('https://gone.example/p')), 'broken');
  assert.equal(blockedKind(await g.safeGet('https://a.example/p')), 'unreadable');
  assert.equal(blockedKind(await g.safeGet('https://b.example/s?q=1')), 'skipped');
});

test('the scripts read pages under the byte cap, record nothing from off-site redirects, and the link check paces and groups like the price job', () => {
  for (const f of ['scripts/update-prices.mjs', 'scripts/read-weights.mjs']) {
    const text = read(f);
    assert.match(text, /await readPage\(res\)/, f);
    assert.doesNotMatch(text, /res\.text\(\)/, `${f} reads no uncapped body`);
    assert.match(text, /if \(got\.offsite\)/, f);
  }
  const links = read('scripts/check-links.mjs');
  assert.match(links, /for \(let wait; \(wait = \(lastHit\.get\(u\.host\) \?\? 0\) \+ HOST_DELAY_MS - Date\.now\(\)\) > 0; \) await new Promise/);
  assert.match(links, /const kind = blockedKind\(got\);/);
  assert.ok(links.includes('result.unreadable.push([url, `${new URL(got.blocked).host}: ${got.why}`]);'));
  assert.ok(links.includes(`show("robots.txt couldn't be read`));
  assert.match(links, /if \(got\.offsite\)/);
});
