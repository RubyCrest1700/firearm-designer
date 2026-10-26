// robots.txt handling shared by the price job, the weight reader and the link check (scripts/robots.mjs).
// Every test uses a fake fetch: nothing here touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISALLOW_ALL, MAX_REDIRECTS, robotsGate, robotsRules } from './robots.mjs';

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

test('robots.txt is read once per origin, following its own redirects; pages are fetched with manual redirects', async () => {
  const g = gate({ 'https://a.example/robots.txt': robots(''), 'https://a.example/p/1': ok(), 'https://a.example/p/2': ok() });
  await g.safeGet('https://a.example/p/1');
  await g.safeGet('https://a.example/p/2');
  assert.deepEqual(g.calls, [['https://a.example/robots.txt', 'follow'], ['https://a.example/p/1', 'manual'], ['https://a.example/p/2', 'manual']]);
});

/* ------------------------------------------------------------------ redirects, checked hop by hop */

test('a redirect to another host that disallows the path is not requested', async () => {
  const g = gate({
    'https://a.example/robots.txt': robots(''),
    'https://a.example/p/1': redirect('https://b.example/secret/1'),
    'https://b.example/robots.txt': robots('User-agent: *\nDisallow: /secret/\n'),
  });
  const got = await g.safeGet('https://a.example/p/1');
  assert.equal(got.blocked, 'https://b.example/secret/1');
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt', 'https://a.example/p/1', 'https://b.example/robots.txt']);
});

test('a redirect to another host whose robots.txt is unreachable is not requested', async () => {
  const g = gate({
    'https://a.example/robots.txt': robots(''),
    'https://a.example/p/1': redirect('https://b.example/p/1', 302),
    'https://b.example/robots.txt': status(500),
  });
  assert.equal((await g.safeGet('https://a.example/p/1')).blocked, 'https://b.example/p/1');
  assert.ok(!g.urls().includes('https://b.example/p/1'));
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
    'https://a.example/robots.txt': robots(''),
    'https://a.example/p/1': redirect('https://b.example/p/1'),
    'https://b.example/robots.txt': status(404),
    'https://b.example/p/1': redirect('/p/2', 308),
    'https://b.example/p/2': ok('final'),
  });
  const got = await g.safeGet('https://a.example/p/1');
  assert.equal(got.url, 'https://b.example/p/2');
  assert.equal(await got.res.text(), 'final');
  assert.deepEqual(g.urls(), ['https://a.example/robots.txt', 'https://a.example/p/1', 'https://b.example/robots.txt', 'https://b.example/p/1', 'https://b.example/p/2']);
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
