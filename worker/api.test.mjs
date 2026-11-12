// Tests the community API against an in-memory SQLite database shaped like Cloudflare D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cleanText, handle, networkOf, visitorOf } from './src/api.js';
import { NFA_SHORT_NOTICE } from './src/share.js';

/**
 * `statements` counts every query the code runs (each statement in a batch counts as one), to check D1's
 * per-invocation query limit. Setting `failBatchAt` to an index makes the next batch fail at that statement;
 * setting `failBatchSkip` as well lets that many batches through first.
 *
 * `queries` counts as Cloudflare does: each run(), all() or first() is one query, and a whole batch() is one
 * query however many statements it holds. Setting `queryLimit` (the free plan's is 50) makes every query past
 * it throw, as D1 does once an invocation has used its queries up. A test zeroes `queries` to start an invocation.
 *
 * `pool`, when set to { used, limit }, is one counter shared with the fake network (see `network`): every query
 * here and every fetch there adds one, and anything past `limit` throws. It stands for the reading of Cloudflare's
 * limits in which D1 queries and fetch calls come out of the same 50.
 */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('./migrations/', import.meta.url)).sort()) db.exec(readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));
  const d1 = { statements: 0, failBatchAt: undefined, failBatchSkip: 0, queries: 0, queryLimit: undefined, pool: undefined };
  const query = () => {
    d1.queries++;
    if (d1.queryLimit !== undefined && d1.queries > d1.queryLimit) throw new Error('D1_ERROR: Too many API requests by single worker invocation.');
    if (d1.pool && ++d1.pool.used > d1.pool.limit) throw new Error('Too many subrequests (D1 queries and fetch calls together).');
  };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    all: async () => { d1.statements++; query(); return { results: db.prepare(sql).all(...args) }; },
    first: async () => { d1.statements++; query(); return db.prepare(sql).get(...args) ?? null; },
    run: async () => { d1.statements++; query(); return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
  });
  d1.prepare = (sql) => stmt(sql);
  d1.exec = (sql) => db.exec(sql); // test setup only, not counted
  // Like D1: the statements run in order as one transaction, so either all of them take effect or none do.
  d1.batch = async (list) => {
    d1.statements += list.length;
    query();
    const skip = d1.failBatchAt !== undefined && d1.failBatchSkip > 0;
    if (skip) d1.failBatchSkip--;
    const failAt = skip ? undefined : d1.failBatchAt;
    if (!skip) d1.failBatchAt = undefined;
    db.exec('BEGIN');
    try {
      const out = list.map((s, i) => {
        const q = db.prepare(s.sql);
        const result = /^\s*select/i.test(s.sql) ? { results: q.all(...s.args) } : { results: [], meta: { changes: Number(q.run(...s.args).changes) } };
        if (i === failAt) throw new Error('D1_ERROR: batch failed');
        return result;
      });
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
  return d1;
}

const env = () => ({ DB: fakeD1(), SALT: 'test' });
const req = (method, path, body, ip = '1.1.1.1') =>
  new Request(`https://api.example${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, origin: 'https://rubycrest1700.github.io' },
    body: body ? JSON.stringify(body) : undefined,
  });
const call = async (e, ...a) => { const r = await handle(req(...a), e); return { status: r.status, body: await r.json(), headers: r.headers }; };
const share = (e, extra = {}, ip) => call(e, 'POST', '/api/builds', { platform: 'glock19', name: 'Carry G19', note: 'Daily carry', parts: ['g19-frame-g5', 'g-fcg-apex5', 'g19-slide-mos'], ...extra }, ip);

test('shares a build and lists it', async () => {
  const e = env();
  const s = await share(e);
  assert.equal(s.status, 201);
  assert.match(s.body.build.id, /^[a-z0-9]{10}$/);
  assert.equal(s.headers.get('access-control-allow-origin'), 'https://rubycrest1700.github.io');
  const l = await call(e, 'GET', '/api/builds?platform=glock19');
  assert.deepEqual(l.body.builds.map((b) => b.name), ['Carry G19']);
  assert.deepEqual(l.body.builds[0].parts, ['g19-frame-g5', 'g-fcg-apex5', 'g19-slide-mos']);
  // Old Glock 17/19/26 ids land in the one double-stack 9mm Glock builder.
  assert.equal(l.body.builds[0].platform, 'glock9');
  assert.deepEqual((await call(e, 'GET', '/api/builds?platform=glock9')).body.builds.map((b) => b.name), ['Carry G19']);
  assert.equal((await call(e, 'GET', '/api/builds?platform=ar15')).body.builds.length, 0);
});

test('lists a family of platforms and nothing for unknown ones', async () => {
  const e = env();
  await share(e);
  await share(e, { platform: 'glock34', name: 'Long G34' }, '2.2.2.2');
  const names = async (q) => (await call(e, 'GET', `/api/builds?platform=${q}`)).body.builds.map((b) => b.name).sort();
  assert.deepEqual(await names('glock9,p320,ar15'), ['Carry G19', 'Long G34']);
  assert.deepEqual(await names('ar15,p320'), []);
  assert.deepEqual(await names('nope'), []);
});

test('rejects bad input', async () => {
  const e = env();
  assert.equal((await share(e, { platform: 'nope' })).status, 400);
  assert.equal((await share(e, { name: 'x' })).status, 400);
  assert.equal((await share(e, { parts: ['ok-part', 'DROP TABLE builds;--', 'x'] })).status, 400);
  assert.equal((await share(e, { parts: ['a', 'b'] })).status, 400);
  assert.equal((await share(e, { parts: Array.from({ length: 41 }, (_, i) => `p${i}`) })).status, 400);
  assert.equal((await share(e, { parts: ['g19-frame-g5', 'g-fcg-apex5', 'g19-slide-mos', 'at-light-r45'] })).status, 201);
});

test('strips markup and control characters from text', () => {
  assert.equal(cleanText('<script>alert(1)</script>  hi\n\nthere', 60), 'script alert(1) /script hi there');
  assert.equal(cleanText('x'.repeat(100), 60).length, 60);
});

test('one vote per visitor, and votes can be taken back', async () => {
  const e = env();
  const { id } = (await share(e)).body.build;
  await call(e, 'POST', `/api/builds/${id}/vote`);
  const twice = await call(e, 'POST', `/api/builds/${id}/vote`);
  assert.equal(twice.body.build.votes, 1);
  const other = await call(e, 'POST', `/api/builds/${id}/vote`, null, '2.2.2.2');
  assert.equal(other.body.build.votes, 2);
  const back = await call(e, 'POST', `/api/builds/${id}/unvote`);
  assert.equal(back.body.build.votes, 1);
});

test('counts one buy click per visitor per day', async () => {
  const e = env();
  const { id } = (await share(e)).body.build;
  await call(e, 'POST', `/api/builds/${id}/click`);
  const r = await call(e, 'POST', `/api/builds/${id}/click`);
  assert.equal(r.body.build.clicks, 1);
});

test('reports from five different networks hide a build', async () => {
  const e = env();
  const { id } = (await share(e)).body.build;
  const report = (ip) => call(e, 'POST', `/api/builds/${id}/report`, null, ip);
  await report('1.0.0.1');
  await report('1.0.0.1');
  await report('1.0.0.2'); // same network as the first: counts once
  for (const ip of ['2.0.0.1', '3.0.0.1']) await report(ip);
  await report('2001:db8:1::5');
  assert.equal((await call(e, 'GET', '/api/builds')).body.builds.length, 1);
  const fifth = await report('2001:db8:2::5');
  assert.equal(fifth.body.hidden, true);
  assert.equal((await call(e, 'GET', '/api/builds')).body.builds.length, 0);
});

test('a build with more votes needs as many reports', async () => {
  const e = env();
  const { id } = (await share(e)).body.build;
  for (let n = 1; n <= 7; n++) await call(e, 'POST', `/api/builds/${id}/vote`, null, `9.9.${n}.1`);
  for (let n = 1; n <= 6; n++) await call(e, 'POST', `/api/builds/${id}/report`, null, `8.8.${n}.1`);
  assert.equal((await call(e, 'GET', '/api/builds')).body.builds.length, 1);
  const seventh = await call(e, 'POST', `/api/builds/${id}/report`, null, '8.8.7.1');
  assert.equal(seventh.body.hidden, true);
});

test('groups addresses by network', () => {
  assert.equal(networkOf('203.0.113.7'), '203.0.113');
  assert.equal(networkOf('2001:0db8:0001:aaaa::1'), '2001:db8:1');
  assert.equal(networkOf('2001:db8::1'), '2001:db8:0');
  assert.equal(networkOf('::ffff:203.0.113.7'), '203.0.113');
});

test('one visitor is a full IPv4 address or an IPv6 /64', () => {
  assert.equal(visitorOf('203.0.113.7'), '203.0.113.7');
  assert.equal(visitorOf('::FFFF:203.0.113.7'), '203.0.113.7');
  assert.equal(visitorOf('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(visitorOf('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(visitorOf('2001:db8::1'), '2001:db8:0:0::/64');
});

test('addresses in one IPv6 /64 vote once and share the daily limits', async () => {
  const e = env();
  const home = (i) => `2001:db8:1:2::${i.toString(16)}`;
  const { id } = (await share(e, {}, home(0))).body.build;
  for (let i = 1; i <= 20; i++) await call(e, 'POST', `/api/builds/${id}/vote`, null, home(i));
  for (let i = 1; i <= 5; i++) await call(e, 'POST', `/api/builds/${id}/click`, null, home(i));
  const b = (await call(e, 'GET', `/api/builds/${id}`)).body.build;
  assert.equal(b.votes, 1);
  assert.equal(b.clicks, 1);
  for (let i = 1; i < 10; i++) assert.equal((await share(e, { name: `Build ${i}` }, home(100 + i))).status, 201);
  assert.equal((await share(e, { name: 'One too many' }, home(200))).status, 429);
  // Another /64, even in the same /48, is someone else.
  assert.equal((await share(e, { name: 'Neighbor' }, '2001:db8:1:3::1')).status, 201);
  assert.equal((await call(e, 'POST', `/api/builds/${id}/vote`, null, '2001:db8:1:3::1')).body.build.votes, 2);
  // IPv4-mapped addresses count as the IPv4 address.
  await call(e, 'POST', `/api/builds/${id}/vote`, null, '203.0.113.7');
  assert.equal((await call(e, 'POST', `/api/builds/${id}/vote`, null, '::ffff:203.0.113.7')).body.build.votes, 3);
});

test('featured picks the most voted builds of the week', async () => {
  const e = env();
  const a = (await share(e, { name: 'Build A' })).body.build.id;
  const b = (await share(e, { name: 'Build B' })).body.build.id;
  await share(e, { name: 'Build C' });
  for (const ip of ['9.0.0.1', '9.0.0.2']) await call(e, 'POST', `/api/builds/${b}/vote`, null, ip);
  await call(e, 'POST', `/api/builds/${a}/vote`, null, '9.0.0.3');
  const f = await call(e, 'GET', '/api/featured');
  assert.deepEqual(f.body.builds.map((x) => x.name), ['Build B', 'Build A']);
});

test('limits how many builds one visitor can share per day', async () => {
  const e = env();
  for (let i = 0; i < 10; i++) assert.equal((await share(e, { name: `Build ${i}` })).status, 201);
  assert.equal((await share(e, { name: 'One too many' })).status, 429);
  assert.equal((await share(e, { name: 'Someone else' }, '5.5.5.5')).status, 201);
});

/* ------------------------------------------------------------- share links */

const INDEX = {
  platforms: {
    glock9: { name: 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47', parts: { 'g19-frame-g5': ['Glock Gen 5 frame', 200], 'g-fcg-apex5': ['Apex trigger', 150.4], 'g19-slide-mos': ['Glock MOS slide', 300] } },
  },
};
const page = async (e, path, index = INDEX) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/og/index.json')) return new Response(JSON.stringify(index));
    return new Response(null, { status: init?.method === 'HEAD' && String(url).includes('/og/c/') ? 404 : 200 });
  };
  try {
    const r = await handle(new Request(`https://share.example${path}`), e);
    return { status: r.status, type: r.headers.get('content-type'), text: await r.text() };
  } finally {
    globalThis.fetch = realFetch;
  }
};
const meta = (text, prop) => text.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];

test('a share link for any build names its platform and best-price total', async () => {
  // Links made before the Glock 17, 19 and 26 became one builder still open, under the new name.
  const r = await page(env(), '/b/glock19~g19-frame-g5.g-fcg-apex5.g19-slide-mos.at-light-r45');
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/html/);
  assert.equal(meta(r.text, 'og:title'), 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47 build · $650');
  assert.match(meta(r.text, 'og:description'), /3 parts · \$650 at the best prices/);
  assert.equal(meta(r.text, 'og:image'), 'https://dropinbuilds.com/og/glock9.png');
  assert.equal(meta(r.text, 'twitter:card'), 'summary_large_image');
  assert.match(r.text, /url=https:\/\/dropinbuilds\.com\/\?b=glock9~g19-frame-g5\.g-fcg-apex5\.g19-slide-mos\.at-light-r45/);
});

test('a community share link uses the build name and note, escaped', async () => {
  const e = env();
  const s = await share(e, { name: 'Carry "G19" & more', note: 'Daily carry' });
  const r = await page(e, `/c/${s.body.build.id}`);
  assert.equal(r.status, 200);
  assert.equal(meta(r.text, 'og:title'), 'Carry &#34;G19&#34; &#38; more');
  assert.match(meta(r.text, 'og:description'), /^Daily carry Glock 17 \/ 19 \/ 19X \/ 26 \/ 34 \/ 45 \/ 47 · 3 parts · \$650/);
  // No picture of its own yet, so the platform picture stands in.
  assert.equal(meta(r.text, 'og:image'), 'https://dropinbuilds.com/og/glock9.png');
});

test('share links still work when the price index is unreachable', async () => {
  const r = await page(env(), '/b/glock19~g19-frame-g5', null);
  assert.equal(r.status, 200);
  assert.equal(meta(r.text, 'og:title'), 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47 build');
});

test('bad share links get the site card and a 404', async () => {
  assert.equal((await page(env(), '/b/nope~x')).status, 404);
  assert.equal((await page(env(), '/b/glock19~<script>')).status, 404);
  assert.equal((await page(env(), '/c/aaaaaaaaaa')).status, 404);
  assert.equal((await page(env(), '/api/builds')).status, 200);
  const bad = await page(env(), '/b/%E0');
  assert.equal(bad.status, 404);
  assert.match(bad.type, /^text\/html/);
  assert.equal(meta(bad.text, 'og:title'), 'Drop-In Builds');
});

test('share pages allow only their redirect script and cannot be framed', async () => {
  const { default: worker } = await import('./src/index.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(INDEX));
  try {
    for (const path of ['/b/glock19~g19-frame-g5.g-fcg-apex5', '/b/%E0']) {
      const r = await worker.fetch(new Request(`https://share.example${path}`), env());
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /default-src 'none'/);
      assert.match(csp, /frame-ancestors 'none'/);
      const script = (await r.text()).match(/<script>([^<]*)<\/script>/)[1];
      const hash = createHash('sha256').update(script).digest('base64');
      assert.ok(csp.includes(`script-src 'sha256-${hash}'`), csp);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ------------------------------------------------------------- price alerts */

import { REBASELINE, runAlerts } from './src/alerts.js';

const ALERT_INDEX = (apex = 150, slide = 300) => ({
  platforms: { glock9: { name: 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47', parts: { 'g19-frame-g5': ['Glock Gen 5 frame', 200], 'g-fcg-apex5': ['Apex trigger', apex], 'g19-slide-mos': ['Glock MOS slide', slide] } } },
});
/**
 * Email set up, with every email kept in `outbox`. By default the one-time re-baseline is marked done, as it
 * will be after the first run in production; the re-baseline tests pass { rebaselined: false }. `pause` stands in
 * for the alert run's wait between sends, so the tests don't wait.
 */
const alertEnv = ({ rebaselined = true } = {}) => {
  const outbox = [];
  const e = { ...env(), RESEND_API_KEY: 'k', MAILING_ADDRESS: 'PO Box 1, Town, ST 00000', sendEmail: async (m) => { outbox.push(m); }, outbox, pause: async () => {} };
  if (rebaselined) e.DB.exec(`INSERT INTO meta (key, value) VALUES ('rebaseline', '${REBASELINE}')`);
  return e;
};
const withIndex = async (index, fn) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(index));
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
};
const G19 = { name: 'Carry G19', platform: 'glock19', parts: ['g19-frame-g5', 'g-fcg-apex5', 'g19-slide-mos'] };
const signup = (e, email = 'Me@Example.com', builds = [G19], ip) => withIndex(ALERT_INDEX(), () => call(e, 'POST', '/api/alerts', { email, builds }, ip));
const visit = (e, method, path) => handle(new Request(`https://share.example${path}`, { method }), e);
const form = (path, body) => new Request(`https://share.example${path}`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
/** The RFC 8058 one-click unsubscribe a mail app sends from the List-Unsubscribe header. */
const oneClick = (e, token, now) => handle(form(`/alerts/stop?t=${token}`, 'List-Unsubscribe=One-Click'), e, now);
const DAY = 86_400_000;
/** The one-time code in a confirmation email's link. */
const codeIn = (mail) => mail.html.match(/\/alerts\/confirm\?c=([a-f0-9]{32})"/)[1];
/** Presses the button on the confirmation page, as the person who got the email does. */
const pressConfirm = (e, code, now) => handle(new Request('https://share.example/alerts/confirm', { method: 'POST', body: `c=${code}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } }), e, now);
const confirmMail = async (e, mail) => (await pressConfirm(e, codeIn(mail))).text();

test('alerts stay off until Resend and a mailing address are set', async () => {
  const e = env();
  assert.deepEqual((await call(e, 'GET', '/api/alerts/status')).body, { enabled: false });
  assert.equal((await signup(e)).status, 503);
  assert.deepEqual((await call(alertEnv(), 'GET', '/api/alerts/status')).body, { enabled: true });
});

test('signing up sends a confirmation email and rejects bad input', async () => {
  const e = alertEnv();
  const r = await signup(e);
  assert.equal(r.status, 201);
  assert.match(r.body.token, /^[a-f0-9]{32}$/);
  assert.equal(r.body.email, 'me@example.com');
  assert.equal(e.outbox.length, 1);
  // The email links to a one-time code of its own, never the token the site got back.
  const code = codeIn(e.outbox[0]);
  assert.notEqual(code, r.body.token);
  assert.ok(e.outbox[0].text.includes(`/alerts/confirm?c=${code}\n`));
  assert.ok(!e.outbox[0].html.includes(`confirm?t=`));
  assert.match(e.outbox[0].html, /PO Box 1/);
  assert.match(e.outbox[0].headers['List-Unsubscribe'], /alerts\/stop/);
  assert.equal((await signup(e, 'not an email')).status, 400);
  assert.equal((await signup(e, 'a@b.co', [{ platform: 'nope', parts: [] }])).status, 400);
  assert.equal((await call(e, 'GET', `/api/alerts/${r.body.token}`)).body.confirmed, false);
});

test('limits signups per visitor per day', async () => {
  const e = alertEnv();
  for (let i = 0; i < 5; i++) assert.equal((await signup(e, `x${i}@example.com`)).status, 201);
  assert.equal((await signup(e, 'y@example.com')).status, 429);
});

test('limits signups overall per day, so confirmations cannot use up the alert emails', async () => {
  const e = alertEnv();
  for (let i = 0; i < 20; i++) assert.equal((await signup(e, `x${i}@example.com`, [G19], `2.0.0.${i}`)).status, 201);
  assert.equal((await signup(e, 'late@example.com', [G19], '3.0.0.1')).status, 429);
  assert.equal(e.outbox.length, 20);
});

test('every response carries basic browser protections', async () => {
  const { default: worker } = await import('./src/index.js');
  const res = await worker.fetch(req('GET', '/health'), env());
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await res.json(), { ok: true });
  const { withSecurityHeaders } = await import('./src/index.js');
  const other = await withSecurityHeaders(new Response('<p>hi</p>', { headers: { 'content-type': 'text/html' } }));
  assert.match(other.headers.get('content-security-policy'), /default-src 'none'.*frame-ancestors 'none'/);
});

test('price alert pages run no scripts, post only to themselves and cannot be framed', async () => {
  const e = alertEnv();
  const { token } = (await signup(e)).body;
  const csp = (await visit(e, 'GET', `/alerts/stop?t=${token}`)).headers.get('content-security-policy');
  assert.equal(csp, "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
});

test('the API answers only the site, and local dev servers only when DEV is set', async () => {
  const from = (origin, e = env()) => handle(new Request('https://api.example/health', { headers: { origin } }), e).then((r) => r.headers.get('access-control-allow-origin'));
  assert.equal(await from('https://dropinbuilds.com'), 'https://dropinbuilds.com');
  assert.equal(await from('http://localhost:5173'), 'https://rubycrest1700.github.io');
  assert.equal(await from('https://evil.example'), 'https://rubycrest1700.github.io');
  assert.equal(await from('http://localhost:5173', { ...env(), DEV: '1' }), 'http://localhost:5173');
});

test('emails confirmed signups when prices move, once, then stays quiet', async () => {
  const e = alertEnv();
  const { token } = (await signup(e)).body;
  // Unconfirmed: nothing goes out
  await withIndex(ALERT_INDEX(120), () => runAlerts(e));
  assert.equal(e.outbox.length, 1);
  assert.match(await confirmMail(e, e.outbox[0]), /Price Alerts Are On/);
  assert.equal((await call(e, 'GET', `/api/alerts/${token}`)).body.confirmed, true);
  // Apex down $30, slide up $40 (both over $20 and 10%)
  const r = await withIndex(ALERT_INDEX(120, 340), () => runAlerts(e));
  assert.equal(r.sent, 1);
  const mail = e.outbox[1];
  assert.equal(mail.to[0], 'me@example.com');
  assert.equal(mail.subject, 'Prices changed on "Carry G19"');
  assert.match(mail.html, /Apex trigger[\s\S]*\$150\.00[\s\S]*↓ \$120\.00/);
  assert.match(mail.html, /MOS slide[\s\S]*↑ \$340\.00/);
  assert.match(mail.text, /dropinbuilds\.com\/\?b=glock9~/);
  // Same prices the next day: no email. Moves under $20 or 10%: no email.
  await withIndex(ALERT_INDEX(120, 340), () => runAlerts(e));
  await withIndex(ALERT_INDEX(110, 355), () => runAlerts(e));
  assert.equal(e.outbox.length, 2);
  // ...but small moves add up: the apex is now $20 under what we last reported
  await withIndex(ALERT_INDEX(100, 340), () => runAlerts(e));
  assert.equal(e.outbox.length, 3);
  assert.match(e.outbox[2].html, /Apex trigger[\s\S]*\$120\.00[\s\S]*↓ \$100\.00/);
});

test('one email per address covers every browser and build it watches', async () => {
  const e = alertEnv();
  const a = (await signup(e, 'me@example.com', [G19], '1.0.0.1')).body.token;
  const b = (await signup(e, 'me@example.com', [{ ...G19, name: 'Range G19', parts: ['g-fcg-apex5'] }], '1.0.0.2')).body.token;
  for (const mail of [e.outbox[0], e.outbox[1]]) assert.match(await confirmMail(e, mail), /Price Alerts Are On/);
  for (const t of [a, b]) assert.equal((await call(e, 'GET', `/api/alerts/${t}`)).body.confirmed, true);
  await withIndex(ALERT_INDEX(120), () => runAlerts(e));
  assert.equal(e.outbox.length, 3);
  assert.equal(e.outbox[2].subject, 'Price drop on 2 of your builds');
});

test('the site keeps the watched builds in sync', async () => {
  const e = alertEnv();
  const { token } = (await signup(e)).body;
  assert.match(await confirmMail(e, e.outbox[0]), /Price Alerts Are On/);
  // Apex already fell before this update; the new build's slide starts from today's price
  const put = await withIndex(ALERT_INDEX(120, 260), () => call(e, 'PUT', `/api/alerts/${token}`, { builds: [G19, { ...G19, name: 'Second' }] }));
  assert.equal(put.status, 200);
  await withIndex(ALERT_INDEX(120, 260), () => runAlerts(e));
  const mail = e.outbox.at(-1);
  assert.match(mail.html, /Apex trigger/);
  assert.match(mail.html, /MOS slide/); // the original build's slide was seen at $300
  assert.equal((await call(e, 'PUT', `/api/alerts/${'0'.repeat(32)}`, { builds: [] })).status, 404);
});

test('unsubscribing removes every signup for the address, including one-click', async () => {
  const e = alertEnv();
  const a = (await signup(e, 'me@example.com', [G19], '1.0.0.1')).body.token;
  const b = (await signup(e, 'me@example.com', [G19], '1.0.0.2')).body.token;
  // Both confirmed: only a confirmed signup's token reaches the address's other signups.
  for (const mail of [e.outbox[0], e.outbox[1]]) assert.match(await confirmMail(e, mail), /Price Alerts Are On/);
  // Opening the link only asks (email scanners open links by themselves); the button unsubscribes
  const ask = await (await visit(e, 'GET', `/alerts/stop?t=${a}`)).text();
  assert.match(ask, /Stop Price Alerts\?[\s\S]*me@example\.com[\s\S]*<form method="post"/);
  assert.equal((await call(e, 'GET', `/api/alerts/${b}`)).status, 200);
  const pressed = await handle(new Request(`https://share.example/alerts/stop?t=${a}`, { method: 'POST', body: 'from=page', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), e);
  assert.match(await pressed.text(), /We won't send price alerts to this address unless it signs up again\./);
  assert.equal((await call(e, 'GET', `/api/alerts/${b}`)).status, 404);
  assert.match(await (await visit(e, 'GET', `/alerts/stop?t=${a}`)).text(), /isn't getting price alerts/);
  const c = (await signup(e, 'you@example.com', [G19], '1.0.0.3')).body.token;
  assert.equal((await visit(e, 'POST', `/alerts/stop?t=${c}`)).status, 204);
  assert.equal((await call(e, 'GET', `/api/alerts/${c}`)).status, 404);
  // The one-click List-Unsubscribe POST from a mail app, on a confirmed address with two signups.
  const d = (await signup(e, 'them@example.com', [G19], '1.0.0.4')).body.token;
  const f = (await signup(e, 'them@example.com', [G19], '1.0.0.5')).body.token;
  for (const mail of e.outbox.slice(-2)) assert.match(await confirmMail(e, mail), /Price Alerts Are On/);
  assert.equal((await oneClick(e, d)).status, 204);
  for (const t of [d, f]) assert.equal((await call(e, 'GET', `/api/alerts/${t}`)).status, 404);
});

/* ------------------------------------------------- confirming and suppression */

const signupAt = (e, now, email = 'me@example.com', ip = '1.1.1.1') =>
  withIndex(ALERT_INDEX(), async () => { const r = await handle(req('POST', '/api/alerts', { email, builds: [G19] }, ip), e, now); return { status: r.status, body: await r.json() }; });
const confirmedOf = async (e, token) => (await e.DB.prepare('SELECT confirmed FROM alerts WHERE token = ?').bind(token).first())?.confirmed;
const unsubscribe = (e, token) => handle(new Request(`https://share.example/alerts/stop?t=${token}`, { method: 'POST', body: 'from=page', headers: { 'content-type': 'application/x-www-form-urlencoded' } }), e);

test('the token the site gets back cannot confirm a signup', async () => {
  const e = alertEnv();
  const r = await signup(e);
  const code = codeIn(e.outbox[0]);
  assert.notEqual(code, r.body.token);
  assert.ok(!JSON.stringify(r.body).includes(code));
  assert.match(await (await visit(e, 'GET', `/alerts/confirm?t=${r.body.token}`)).text(), /This Link Has Expired/);
  assert.match(await (await visit(e, 'GET', `/alerts/confirm?c=${r.body.token}`)).text(), /This Link Has Expired/);
  assert.match(await (await pressConfirm(e, r.body.token)).text(), /This Link Has Expired/);
  assert.equal(await confirmedOf(e, r.body.token), 0);
  assert.equal((await call(e, 'GET', `/api/alerts/${r.body.token}`)).body.confirmed, false);
  // Only a hash of the code is stored.
  const { confirm_hash } = await e.DB.prepare('SELECT confirm_hash FROM alerts WHERE token = ?').bind(r.body.token).first();
  assert.equal(confirm_hash, createHash('sha256').update(code).digest('hex'));
  assert.notEqual(confirm_hash, code);
});

test('opening the confirmation link only asks; the button confirms once', async () => {
  const e = alertEnv();
  const { token } = (await signup(e)).body;
  const code = codeIn(e.outbox[0]);
  const ask = await visit(e, 'GET', `/alerts/confirm?c=${code}`);
  const html = await ask.text();
  assert.match(html, /Turn On Price Alerts\?[\s\S]*<form method="post" action="\/alerts\/confirm"><input type="hidden" name="c" value="[a-f0-9]{32}">/);
  assert.doesNotMatch(html, /<script/);
  assert.equal(ask.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  assert.equal(await confirmedOf(e, token), 0);
  await visit(e, 'GET', `/alerts/confirm?c=${code}`); // a scanner opening it again changes nothing
  assert.equal(await confirmedOf(e, token), 0);
  assert.match(await (await pressConfirm(e, code)).text(), /Price Alerts Are On/);
  assert.equal(await confirmedOf(e, token), 1);
  assert.equal((await e.DB.prepare('SELECT confirm_hash FROM alerts WHERE token = ?').bind(token).first()).confirm_hash, null);
  assert.match(await (await pressConfirm(e, code)).text(), /This Link Has Expired/);
  assert.match(await (await visit(e, 'GET', `/alerts/confirm?c=${code}`)).text(), /This Link Has Expired/);
});

test('wrong, malformed and old confirmation codes have expired', async () => {
  const e = alertEnv();
  const now = Date.now();
  const old = (await signupAt(e, now - 8 * DAY)).body.token;
  const oldCode = codeIn(e.outbox[0]);
  const fresh = (await signupAt(e, now, 'you@example.com')).body.token;
  for (const c of ['0'.repeat(32), 'nothex', `${codeIn(e.outbox[1])}0`, codeIn(e.outbox[1]).toUpperCase(), '', oldCode]) {
    assert.match(await (await pressConfirm(e, c, now)).text(), /This Link Has Expired/, c);
  }
  assert.match(await (await handle(new Request(`https://share.example/alerts/confirm?c=${oldCode}`), e, now)).text(), /This Link Has Expired/);
  assert.equal(await confirmedOf(e, old), 0);
  assert.equal(await confirmedOf(e, fresh), 0);
  assert.match(await (await pressConfirm(e, codeIn(e.outbox[1]), now)).text(), /Price Alerts Are On/);
});

test('signups from before confirmation codes: pending links expire, confirmed ones keep getting alerts', async () => {
  const e = alertEnv();
  const now = Date.now();
  const add = (token, email, confirmed) => e.DB.prepare('INSERT INTO alerts (token, email, builds, seen, confirmed, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(token, email, JSON.stringify([G19]), JSON.stringify({ 'glock19/g-fcg-apex5': 150, 'glock19/g19-slide-mos': 300, 'glock19/g19-frame-g5': 200 }), confirmed, now - DAY, 'x').run();
  const pending = 'a'.repeat(32);
  await add(pending, 'pending@example.com', 0);
  await add('b'.repeat(32), 'old@example.com', 1);
  assert.match(await (await visit(e, 'GET', `/alerts/confirm?t=${pending}`)).text(), /This Link Has Expired/);
  assert.match(await (await pressConfirm(e, pending)).text(), /This Link Has Expired/);
  assert.equal(await confirmedOf(e, pending), 0);
  const r = await withIndex(ALERT_INDEX(120), () => runAlerts(e, now));
  assert.equal(r.sent, 1);
  assert.deepEqual(e.outbox.map((m) => m.to[0]), ['old@example.com']);
});

test('an address that unsubscribes after confirming gets no confirmation email for 90 days', async () => {
  const e = alertEnv();
  const now = Date.now();
  const first = await signupAt(e, now - 2 * DAY);
  assert.match(await (await pressConfirm(e, codeIn(e.outbox[0]), now - 2 * DAY)).text(), /Price Alerts Are On/);
  await unsubscribe(e, first.body.token);
  const rows = (await e.DB.prepare('SELECT * FROM suppressed').all()).results;
  assert.equal(rows.length, 1);
  assert.match(rows[0].email_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(rows), /@/);
  // Signed up again: the same answer as anyone gets, the row is saved, but no email goes out.
  const again = await signupAt(e, now, 'Me@Example.com', '7.7.7.7');
  assert.equal(again.status, 201);
  assert.deepEqual(Object.keys(again.body).sort(), ['confirmed', 'email', 'token']);
  assert.match(again.body.token, /^[a-f0-9]{32}$/);
  assert.equal(again.body.email, 'me@example.com');
  assert.equal(again.body.confirmed, false);
  assert.equal(await confirmedOf(e, again.body.token), 0);
  assert.equal(e.outbox.length, 1);
  // After 90 days the suppression no longer applies.
  const later = await signupAt(e, now + 89 * DAY, 'me@example.com', '7.7.7.8');
  assert.equal(later.status, 201);
  assert.equal(e.outbox.length, 1);
  const after = await signupAt(e, now + 91 * DAY, 'me@example.com', '7.7.7.9');
  assert.equal(after.status, 201);
  assert.equal(e.outbox.length, 2);
  assert.equal(e.outbox[1].to[0], 'me@example.com');
});

test('cancelling a signup nobody confirmed does not suppress the address', async () => {
  const e = alertEnv();
  const { token } = (await signup(e)).body;
  assert.equal((await unsubscribe(e, token)).status, 200);
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM suppressed').first()).n, 0);
  assert.equal((await signup(e, 'me@example.com', [G19], '7.7.7.7')).status, 201);
  assert.equal(e.outbox.length, 2);
});

test('without the private salt nothing is written', async () => {
  const e = { ...alertEnv(), SALT: undefined };
  delete e.SALT;
  e.FEEDBACK_EMAIL = 'owner@example.com';
  assert.equal((await share(e)).status, 503);
  assert.equal((await signup(e)).status, 503);
  assert.equal((await call(e, 'PUT', `/api/alerts/${'0'.repeat(32)}`, { builds: [] })).status, 503);
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'Looks good to me' })).status, 503);
  assert.equal((await call(e, 'POST', '/api/builds/aaaaaaaaaa/vote')).status, 503);
  assert.equal(e.outbox.length, 0);
  for (const t of ['builds', 'alerts', 'feedback', 'votes']) assert.equal((await e.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n, 0, t);
  // Reading still works.
  assert.equal((await call(e, 'GET', '/api/builds')).status, 200);
  assert.equal((await call(e, 'GET', '/health')).status, 200);
});

test('saves feedback and emails one daily digest', async () => {
  const { runFeedback } = await import('./src/feedback.js');
  const e = env();
  const sent = [];
  Object.assign(e, { RESEND_API_KEY: 'k', FEEDBACK_EMAIL: 'owner@example.com', sendEmail: async (m) => sent.push(m) });
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'Please add the CZ P-10.\n\nThanks!', email: 'Fan@Example.com', page: '/faq/' })).status, 201);
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'Love <b>it</b>', page: '/#build' }, '2.2.2.2')).status, 201);
  assert.deepEqual(await runFeedback(e), { sent: 1, messages: 2 });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['owner@example.com']);
  assert.match(sent[0].subject, /2 new feedback messages/);
  assert.match(sent[0].text, /Please add the CZ P-10\.\n\nThanks!/);
  assert.match(sent[0].html, /mailto:fan@example\.com/);
  assert.doesNotMatch(sent[0].html, /<b>it/);
  assert.deepEqual(await runFeedback(e), { sent: 0, waiting: 0 });
});

test('feedback is checked and capped', async () => {
  const { runFeedback } = await import('./src/feedback.js');
  const e = env();
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'hi' })).status, 400);
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'Looks good', email: 'not an email' })).status, 400);
  // Bots that fill the hidden field get a normal answer, and nothing is saved.
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'Buy cheap pills', website: 'spam.example' })).status, 201);
  for (let i = 0; i < 5; i++) assert.equal((await call(e, 'POST', '/api/feedback', { message: `Note number ${i}` })).status, 201);
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'One too many' })).status, 429);
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'From another network' }, '3.3.3.3')).status, 201);
  // Without FEEDBACK_EMAIL it's saved but not sent.
  assert.deepEqual(await runFeedback(e), { sent: 0, skipped: 'not set up' });
});

test('builds for a shelved platform stay stored but are not listed or opened', async () => {
  const e = env();
  const s = await share(e);
  await e.DB.prepare('UPDATE builds SET platform = ? WHERE id = ?').bind('ak74', s.body.build.id).run();
  assert.equal((await call(e, 'GET', '/api/builds')).body.builds.length, 0);
  assert.equal((await call(e, 'GET', '/api/builds?platform=ak74')).body.builds.length, 0);
  assert.equal((await call(e, 'GET', `/api/builds/${s.body.build.id}`)).status, 404);
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM builds').first()).n, 1);
});

/* ------------------------------------------------------ logs and retention */

import { format } from 'node:util';
import { runRetention, RETENTION_LIVE } from './src/retention.js';

/** Runs fn with every console line captured instead of printed. */
const captureLogs = async (fn) => {
  const lines = [];
  const real = { ...console };
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => lines.push(format(...a));
  try { return { result: await fn(), lines }; } finally { Object.assign(console, real); }
};
/** Answers the price index and turns every Resend call into a 422 that repeats the address. */
const resend422 = (index) => async (url) => (String(url).includes('api.resend.com')
  ? new Response('{"message":"Invalid `to` field: victim@example.com is not allowed","name":"validation_error"}', { status: 422 })
  : new Response(JSON.stringify(index)));
const withFetch = async (fake, fn) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
};

test('the daily alert run logs no addresses and counts sent, deferred and failed emails', async () => {
  const e = alertEnv();
  const now = Date.now();
  const seen = JSON.stringify({ 'glock9/g-fcg-apex5': 150, 'glock9/g19-slide-mos': 300, 'glock9/g19-frame-g5': 200 });
  // 81 confirmed addresses whose apex trigger fell; one address's send fails with an error naming it.
  for (let i = 0; i < 81; i++) {
    await e.DB.prepare('INSERT INTO alerts (token, email, builds, seen, confirmed, created_at, ip_hash) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(i.toString(16).padStart(32, '0'), `u${String(i).padStart(2, '0')}@example.com`, JSON.stringify([G19]), seen, now - DAY, 'x').run();
  }
  e.sendEmail = async (m) => { if (m.to[0] === 'u05@example.com') throw new Error(`Mailbox ${m.to[0]} rejected`); e.outbox.push(m); };
  const { result, lines } = await captureLogs(() => withIndex(ALERT_INDEX(120), () => runAlerts(e, now)));
  assert.deepEqual(result, { sent: 29, deferred: 51, failed: 1, watched: 81 });
  assert.equal(e.outbox.length, 29);
  for (const line of lines) assert.doesNotMatch(line, /@/);
  // The daily job logs the counts, again without addresses.
  const { runDaily } = await import('./src/index.js');
  const daily = await captureLogs(() => withIndex(ALERT_INDEX(100), () => runDaily(e, now)));
  assert.ok(daily.lines.some((l) => /^Price alerts \{"sent":\d+,"deferred":\d+,"failed":1,/.test(l)), daily.lines.join('\n'));
  for (const line of daily.lines) assert.doesNotMatch(line, /@/);
});

test('a Resend error during signup still answers the usual 201 and logs neither the address nor the error text', async () => {
  const e = { ...env(), RESEND_API_KEY: 'k', MAILING_ADDRESS: 'PO Box 1, Town, ST 00000' };
  const waits = [];
  const { result, lines } = await captureLogs(() => withFetch(resend422(ALERT_INDEX()), async () => {
    const r = await handle(req('POST', '/api/alerts', { email: 'victim@example.com', builds: [G19] }), e, Date.now(), { waitUntil: (p) => waits.push(p) });
    const out = { status: r.status, body: await r.json() };
    await Promise.all(waits);
    return out;
  }));
  assert.equal(waits.length, 1);
  assert.equal(result.status, 201);
  assert.deepEqual(Object.keys(result.body).sort(), ['confirmed', 'email', 'token']);
  assert.match(result.body.token, /^[a-f0-9]{32}$/);
  assert.equal(result.body.email, 'victim@example.com');
  assert.equal(result.body.confirmed, false);
  assert.deepEqual(lines, ['Confirmation email failed: Error: Resend 422']);
  for (const line of lines) {
    assert.doesNotMatch(line, /@/);
    assert.doesNotMatch(line, /Invalid|validation_error|not allowed/);
  }
});

test('a Resend error in the feedback digest throws and logs only the status', async () => {
  const { runFeedback } = await import('./src/feedback.js');
  const { runDaily } = await import('./src/index.js');
  const e = { ...env(), RESEND_API_KEY: 'k', FEEDBACK_EMAIL: 'owner@example.com' };
  assert.equal((await call(e, 'POST', '/api/feedback', { message: 'Please add the CZ P-10', email: 'fan@example.com' })).status, 201);
  const direct = await captureLogs(() => withFetch(resend422(INDEX), () => runFeedback(e).then(() => null, (err) => err)));
  assert.equal(direct.result.message, 'Resend 422');
  assert.equal(direct.lines.length, 0);
  const daily = await captureLogs(() => withFetch(resend422(INDEX), () => runDaily(e)));
  assert.ok(daily.lines.includes('Feedback failed: Error: Resend 422'), daily.lines.join('\n'));
  for (const line of daily.lines) {
    assert.doesNotMatch(line, /@/);
    assert.doesNotMatch(line, /Invalid|validation_error/);
  }
  // Unsent, so it waits for tomorrow.
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE emailed_at IS NULL').first()).n, 1);
});

test('the scheduled handler logs failed jobs by name, without addresses', async () => {
  const { default: worker } = await import('./src/index.js');
  const e = { ...alertEnv(), DB: { prepare: () => { throw new TypeError('D1 lost row for me@example.com, token abc'); } } };
  const waits = [];
  const { lines } = await captureLogs(async () => {
    worker.scheduled({}, e, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  });
  assert.equal(waits.length, 1);
  for (const job of ['Price alerts', 'Retention']) assert.ok(lines.includes(`${job} failed: TypeError: D1 lost row for <address> token abc`), lines.join('\n'));
  assert.ok(lines.includes('Feedback {"sent":0,"skipped":"not set up"}'), lines.join('\n'));
  for (const line of lines) assert.doesNotMatch(line, /@/);
});

/** One row of each kind `age` days old, plus a click that day. */
async function seedAged(e, now, age, tag) {
  const at = now - age * DAY;
  const id = `b${tag}`.padEnd(10, '0');
  await e.DB.prepare('INSERT INTO builds (id, platform, name, parts, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(id, 'glock9', `Build ${tag}`, '[]', at, `ip${tag}`).run();
  await e.DB.prepare('INSERT INTO alerts (token, email, builds, confirmed, created_at, ip_hash) VALUES (?, ?, ?, 1, ?, ?)').bind(tag.padEnd(32, '0'), `${tag}@example.com`, '[]', at, `ip${tag}`).run();
  await e.DB.prepare('INSERT INTO clicks (build_id, voter, day) VALUES (?, ?, ?)').bind(id, `ip${tag}`, Math.floor(at / DAY)).run();
  await e.DB.prepare('INSERT INTO suppressed (email_hash, created_at) VALUES (?, ?)').bind(tag.padEnd(64, '0'), at).run();
  await e.DB.prepare('INSERT INTO votes (build_id, voter, created_at) VALUES (?, ?, ?)').bind(id, `ip${tag}`, at).run();
  await e.DB.prepare('INSERT INTO reports (build_id, voter) VALUES (?, ?)').bind(id, `net${tag}`).run();
  await e.DB.prepare('INSERT INTO signups (ip_hash, email_hash, created_at) VALUES (?, ?, ?)').bind(`ip${tag}`, tag.padEnd(64, '0'), at).run();
}
const addFeedback = (e, created, emailed, tag) => e.DB.prepare('INSERT INTO feedback (message, email, created_at, ip_hash, emailed_at) VALUES (?, ?, ?, ?, ?)')
  .bind(`Message ${tag}`, `${tag}@example.com`, created, `ip${tag}`, emailed).run();
const snapshot = async (e) => {
  const out = {};
  for (const t of ['builds', 'alerts', 'clicks', 'suppressed', 'votes', 'reports', 'feedback', 'signups']) out[t] = (await e.DB.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all()).results;
  return out;
};
/** Ages in days: recent rows, and rows past each limit. */
async function seedRetention(e, now) {
  await seedAged(e, now, 5, 'aa');
  await seedAged(e, now, 31, 'bb');
  await seedAged(e, now, 100, 'cc');
  await addFeedback(e, now - 10 * DAY, now - 9 * DAY, 'f1'); // sent 9 days ago: all kept
  await addFeedback(e, now - 50 * DAY, now - 40 * DAY, 'f2'); // sent 40 days ago: email and ip_hash blanked
  await addFeedback(e, now - 120 * DAY, now - 95 * DAY, 'f3'); // sent 95 days ago: deleted
  await addFeedback(e, now - 170 * DAY, null, 'f4'); // never sent, 170 days: ip_hash blanked, message and email kept
  await addFeedback(e, now - 190 * DAY, null, 'f5'); // never sent, 190 days: deleted
}
const EXPECTED_COUNTS = {
  feedbackDeleted: 2, feedbackEmailsBlanked: 1, feedbackIpHashesBlanked: 2,
  alertIpHashesBlanked: 2, buildIpHashesBlanked: 2, clicksDeleted: 2, suppressedDeleted: 1, signupsDeleted: 2,
};

test('retention runs live from the daily job; the dry run still only counts', async () => {
  assert.equal(RETENTION_LIVE, true);
  const e = env(); // no Resend settings: retention runs anyway
  const now = Date.now();
  await seedRetention(e, now);
  const before = await snapshot(e);
  // Dry run: counts, changes nothing, logs nothing.
  const dry = await captureLogs(() => runRetention(e, now, false));
  assert.deepEqual(dry.result, { live: false, ...EXPECTED_COUNTS });
  assert.deepEqual(await snapshot(e), before);
  assert.equal(dry.lines.length, 0);
  // Expected end state: the same seed after a direct live run, in a separate DB.
  const ref = env();
  await seedRetention(ref, now);
  await runRetention(ref, now, true);
  const after = await snapshot(ref);
  assert.notDeepEqual(after, before);
  // The daily job runs it live and logs only the counts.
  const { runDaily } = await import('./src/index.js');
  const daily = await captureLogs(() => withIndex(ALERT_INDEX(), () => runDaily(e, now)));
  assert.ok(daily.lines.includes(`Retention ${JSON.stringify({ live: true, ...EXPECTED_COUNTS })}`), daily.lines.join('\n'));
  for (const line of daily.lines) assert.doesNotMatch(line, /@/);
  assert.deepEqual(await snapshot(e), after);
  // A second daily run finds nothing left.
  const again = await captureLogs(() => withIndex(ALERT_INDEX(), () => runDaily(e, now)));
  assert.ok(again.lines.includes(`Retention ${JSON.stringify({ live: true, ...Object.fromEntries(Object.keys(EXPECTED_COUNTS).map((k) => [k, 0])) })}`), again.lines.join('\n'));
  for (const line of again.lines) assert.doesNotMatch(line, /@/);
  assert.deepEqual(await snapshot(e), after);
});

test('live retention deletes and blanks old data and keeps recent data', async () => {
  const e = env();
  const now = Date.now();
  await seedRetention(e, now);
  assert.deepEqual(await runRetention(e, now, true), { live: true, ...EXPECTED_COUNTS });
  const s = await snapshot(e);
  assert.deepEqual(s.builds.map((b) => [b.name, b.ip_hash, b.clicks]), [['Build aa', 'ipaa', 0], ['Build bb', '', 0], ['Build cc', '', 0]]);
  assert.deepEqual(s.alerts.map((a) => [a.email, a.ip_hash, a.confirmed]), [['aa@example.com', 'ipaa', 1], ['bb@example.com', '', 1], ['cc@example.com', '', 1]]);
  assert.deepEqual(s.clicks.map((c) => c.voter), ['ipaa']);
  assert.deepEqual(s.suppressed.map((x) => x.email_hash.slice(0, 2)), ['aa', 'bb']);
  assert.deepEqual(s.signups.map((x) => x.ip_hash), ['ipaa']);
  assert.equal(s.votes.length, 3);
  assert.equal(s.reports.length, 3);
  assert.deepEqual(s.feedback.map((f) => [f.message, f.email, f.ip_hash]), [
    ['Message f1', 'f1@example.com', 'ipf1'],
    ['Message f2', '', ''],
    ['Message f4', 'f4@example.com', ''],
  ]);
  // Nothing left to do on the next run.
  assert.deepEqual(await runRetention(e, now, true), { live: true, ...Object.fromEntries(Object.keys(EXPECTED_COUNTS).map((k) => [k, 0])) });
});

test('daily limits still work after old ip hashes are blanked', async () => {
  const e = alertEnv();
  const now = Date.now();
  await seedRetention(e, now);
  await runRetention(e, now, true);
  for (let i = 0; i < 5; i++) assert.equal((await signupAt(e, now, `x${i}@example.com`)).status, 201);
  assert.equal((await signupAt(e, now, 'y@example.com')).status, 429);
  for (let i = 0; i < 5; i++) assert.equal((await handle(req('POST', '/api/feedback', { message: `Note number ${i}` }), e, now)).status, 201);
  assert.equal((await handle(req('POST', '/api/feedback', { message: 'One too many' }), e, now)).status, 429);
  for (let i = 0; i < 10; i++) assert.equal((await handle(req('POST', '/api/builds', { platform: 'glock9', name: `Build ${i}`, parts: ['a', 'b', 'c'] }), e, now)).status, 201);
  assert.equal((await handle(req('POST', '/api/builds', { platform: 'glock9', name: 'One too many', parts: ['a', 'b', 'c'] }), e, now)).status, 429);
});

/* ------------------------------------------------- review round 1: alerts */

const count = async (e, table) => (await e.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;
const statusOf = async (e, token) => (await call(e, 'GET', `/api/alerts/${token}`)).status;

test('a pending signup\'s token for someone else\'s address cannot cancel or suppress their confirmed alerts', async () => {
  const e = alertEnv();
  const victim = (await signup(e, 'victim@example.com', [G19], '1.0.0.1')).body.token;
  assert.match(await confirmMail(e, e.outbox[0]), /Price Alerts Are On/);
  // A stranger signs the victim's address up (they never see the email) and uses the token they got back,
  // every way an unsubscribe can arrive.
  const ways = [(t) => unsubscribe(e, t), (t) => oneClick(e, t), (t) => visit(e, 'POST', `/alerts/stop?t=${t}`)];
  for (const [i, way] of ways.entries()) {
    const stranger = (await signup(e, 'victim@example.com', [G19], `6.6.6.${i}`)).body.token;
    assert.ok((await way(stranger)).status < 300);
    assert.equal(await statusOf(e, stranger), 404); // their own pending signup is gone
  }
  assert.equal(await confirmedOf(e, victim), 1);
  assert.equal(await statusOf(e, victim), 200);
  assert.equal(await count(e, 'suppressed'), 0);
});

test('signup limits count signups, so unsubscribing does not reset them', async () => {
  // Per visitor: sign up, turn off, repeat.
  const e = alertEnv();
  for (let i = 0; i < 5; i++) {
    const { status, body } = await signup(e, `x${i}@example.com`);
    assert.equal(status, 201);
    assert.equal((await visit(e, 'POST', `/alerts/stop?t=${body.token}`)).status, 204);
  }
  assert.equal(await count(e, 'alerts'), 0);
  assert.equal((await signup(e, 'y@example.com')).status, 429);
  // Per address, from different visitors, unsubscribing from the email page in between.
  const a = alertEnv();
  for (let i = 0; i < 5; i++) {
    const { status, body } = await signup(a, 'same@example.com', [G19], `4.0.0.${i}`);
    assert.equal(status, 201);
    await unsubscribe(a, body.token);
  }
  assert.equal((await signup(a, 'Same@Example.com', [G19], '4.0.1.1')).status, 429);
  assert.equal((await signup(a, 'other@example.com', [G19], '4.0.1.2')).status, 201);
  // The overall daily cap survives unsubscribes too.
  const g = alertEnv();
  for (let i = 0; i < 20; i++) {
    const { status, body } = await signup(g, `x${i}@example.com`, [G19], `2.0.0.${i}`);
    assert.equal(status, 201);
    await visit(g, 'POST', `/alerts/stop?t=${body.token}`);
  }
  assert.equal(await count(g, 'alerts'), 0);
  assert.equal((await signup(g, 'late@example.com', [G19], '3.0.0.1')).status, 429);
  // The signups table holds only salted hashes.
  const rows = (await g.DB.prepare('SELECT * FROM signups').all()).results;
  assert.equal(rows.length, 20);
  assert.doesNotMatch(JSON.stringify(rows), /@|example/);
  for (const r of rows) assert.match(r.email_hash, /^[a-f0-9]{64}$/);
});

test('signups for a suppressed address count toward the limits like any other', async () => {
  const e = alertEnv();
  const now = Date.now();
  const first = await signupAt(e, now - 2 * DAY);
  await pressConfirm(e, codeIn(e.outbox[0]), now - 2 * DAY);
  await unsubscribe(e, first.body.token);
  for (let i = 0; i < 5; i++) assert.equal((await signupAt(e, now, 'me@example.com', `8.0.0.${i}`)).status, 201);
  assert.equal((await signupAt(e, now, 'me@example.com', '8.0.0.9')).status, 429);
  assert.equal(e.outbox.length, 1);
});

test('only an unsubscribe from an email suppresses; Turn Off on the site does not', async () => {
  const e = alertEnv();
  const now = Date.now();
  const on = async (email, ip) => {
    const { body } = await signupAt(e, now - DAY, email, ip);
    assert.match(await (await pressConfirm(e, codeIn(e.outbox.at(-1)), now - DAY)).text(), /Price Alerts Are On/);
    return body.token;
  };
  // Turn Off on the site: POST with no body (src/alerts.ts stopAlerts).
  const site = await on('site@example.com', '1.0.0.1');
  assert.equal((await handle(new Request(`https://share.example/alerts/stop?t=${site}`, { method: 'POST' }), e, now)).status, 204);
  assert.equal(await statusOf(e, site), 404);
  assert.equal(await count(e, 'suppressed'), 0);
  const sent = e.outbox.length;
  assert.equal((await signupAt(e, now, 'site@example.com', '1.0.0.2')).status, 201);
  assert.equal(e.outbox.length, sent + 1); // turning it back on sends a confirmation straight away
  // The Unsubscribe page's button (from=page) and the mail app's one-click POST both suppress.
  const page = await on('page@example.com', '2.0.0.1');
  await unsubscribe(e, page);
  assert.equal(await count(e, 'suppressed'), 1);
  const click = await on('click@example.com', '3.0.0.1');
  assert.equal((await oneClick(e, click, now)).status, 204);
  assert.equal(await count(e, 'suppressed'), 2);
  const before = e.outbox.length;
  assert.equal((await signupAt(e, now, 'page@example.com', '2.0.0.2')).status, 201);
  assert.equal((await signupAt(e, now, 'click@example.com', '3.0.0.2')).status, 201);
  assert.equal(e.outbox.length, before);
  // Any other body is treated like the site's Turn Off.
  const other = await on('other@example.com', '5.0.0.1');
  await handle(form(`/alerts/stop?t=${other}`, 'from=pages&List-Unsubscribe=Yes'), e, now);
  assert.equal(await statusOf(e, other), 404);
  assert.equal(await count(e, 'suppressed'), 2);
});

// Turn Off on the site (src/alerts.ts stopAlerts) is a cross-origin POST with no body. The browser only lets
// the site read the 204 if it carries the same CORS headers as the JSON answers.
const turnOff = (e, token, origin, now) =>
  handle(new Request(`https://share.example/alerts/stop?t=${token}`, { method: 'POST', headers: { origin } }), e, now);

test('Turn Off on the site gets a 204 the site is allowed to read', async () => {
  const e = alertEnv();
  const now = Date.now();
  const { body } = await signupAt(e, now - DAY, 'site@example.com', '1.0.0.1');
  const spare = (await signupAt(e, now - DAY, 'site@example.com', '1.0.0.2')).body.token;
  assert.match(await (await pressConfirm(e, codeIn(e.outbox[0]), now - DAY)).text(), /Price Alerts Are On/);
  assert.equal(await confirmedOf(e, body.token), 1);
  // A confirmed signup: every signup for the address goes, nothing is suppressed.
  const res = await turnOff(e, body.token, 'https://dropinbuilds.com', now);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://dropinbuilds.com');
  assert.equal(res.headers.get('vary'), 'origin');
  assert.equal(await res.text(), '');
  assert.equal(await statusOf(e, body.token), 404);
  assert.equal(await statusOf(e, spare), 404);
  assert.equal(await count(e, 'alerts'), 0);
  assert.equal(await count(e, 'suppressed'), 0);
  // An unknown token: the same readable 204, and nothing else changes.
  const unknown = await turnOff(e, 'c'.repeat(32), 'https://dropinbuilds.com', now);
  assert.equal(unknown.status, 204);
  assert.equal(unknown.headers.get('access-control-allow-origin'), 'https://dropinbuilds.com');
  assert.equal(unknown.headers.get('vary'), 'origin');
  assert.equal(await count(e, 'suppressed'), 0);
});

test('Turn Off never hands its CORS header to an origin that is not the site', async () => {
  const e = alertEnv();
  const now = Date.now();
  const { body } = await signupAt(e, now, 'site@example.com');
  const res = await turnOff(e, body.token, 'https://evil.example', now);
  assert.equal(res.status, 204);
  assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://evil.example');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://rubycrest1700.github.io');
  assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
});

test('the Unsubscribe page button still gets its page, and the Worker entry keeps the CORS header', async () => {
  const e = alertEnv();
  const now = Date.now();
  const first = await signupAt(e, now, 'page@example.com', '1.0.0.1');
  const pressed = await unsubscribe(e, first.body.token);
  assert.equal(pressed.status, 200);
  assert.match(pressed.headers.get('content-type'), /^text\/html/);
  assert.match(await pressed.text(), /<h1>You&#39;re Unsubscribed<\/h1><p>We won't send price alerts to this address unless it signs up again\./);
  // Through the full fetch entry (index.js, with withSecurityHeaders) the 204 keeps its CORS headers.
  const { default: worker } = await import('./src/index.js');
  const second = await signupAt(e, now, 'site@example.com', '2.0.0.1');
  const res = await worker.fetch(new Request(`https://share.example/alerts/stop?t=${second.body.token}`, { method: 'POST', headers: { origin: 'https://dropinbuilds.com' } }), e, null);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://dropinbuilds.com');
  assert.equal(res.headers.get('vary'), 'origin');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await statusOf(e, second.body.token), 404);
});

test('signup answers before the confirmation email is sent', async () => {
  const e = alertEnv();
  let release;
  const gate = new Promise((r) => { release = r; });
  e.sendEmail = async (m) => { await gate; e.outbox.push(m); };
  const waits = [];
  const r = await withIndex(ALERT_INDEX(), () => handle(req('POST', '/api/alerts', { email: 'me@example.com', builds: [G19] }), e, Date.now(), { waitUntil: (p) => waits.push(p) }));
  assert.equal(r.status, 201);
  assert.equal(waits.length, 1);
  assert.equal(e.outbox.length, 0);
  release();
  await Promise.all(waits);
  assert.equal(e.outbox.length, 1);
});

test('a suppressed address gets exactly the same answer as any other', async () => {
  const e = alertEnv();
  const now = Date.now();
  const first = await signupAt(e, now - 2 * DAY, 'gone@example.com', '1.0.0.1');
  await pressConfirm(e, codeIn(e.outbox[0]), now - 2 * DAY);
  await unsubscribe(e, first.body.token);
  assert.equal(await count(e, 'suppressed'), 1);
  const answer = async (email, ip) => {
    const r = await withIndex(ALERT_INDEX(), () => handle(req('POST', '/api/alerts', { email, builds: [G19] }, ip), e, now));
    const body = await r.json();
    return { status: r.status, type: r.headers.get('content-type'), keys: Object.keys(body), confirmed: body.confirmed, email: body.email, token: body.token };
  };
  const suppressed = await answer('gone@example.com', '2.0.0.1');
  const fresh = await answer('new@example.com', '2.0.0.2');
  assert.equal(suppressed.email, 'gone@example.com');
  assert.equal(fresh.email, 'new@example.com');
  for (const a of [suppressed, fresh]) assert.match(a.token, /^[a-f0-9]{32}$/);
  assert.deepEqual({ ...suppressed, email: '', token: '' }, { ...fresh, email: '', token: '' });
  assert.deepEqual(suppressed.keys, ['token', 'email', 'confirmed']);
  assert.equal(suppressed.status, 201);
  assert.deepEqual(e.outbox.map((m) => m.to[0]), ['gone@example.com', 'new@example.com']);
});

const blockIn = (mail) => mail.html.match(/\/alerts\/block\?c=([a-f0-9]{32})"/)[1];
const pressBlock = (e, code, now) => handle(form('/alerts/block', `c=${code}`), e, now);

test('"Not you?" in the confirmation email blocks the address for 90 days, and only that code works', async () => {
  const e = alertEnv();
  const now = Date.now();
  const { body } = await signupAt(e, now, 'me@example.com');
  const mail = e.outbox[0];
  const code = blockIn(mail);
  assert.equal(code, codeIn(mail)); // the same one-time code as the confirm link
  assert.ok(mail.text.includes(`Not you? Don't email me again: https://share.dropinbuilds.com/alerts/block?c=${code}\n`));
  assert.match(mail.html, /Not you\? Don't email me again<\/a>/);
  // Opening the link only asks.
  const ask = await handle(new Request(`https://share.example/alerts/block?c=${code}`), e, now);
  const html = await ask.text();
  assert.match(html, /Stop These Emails\?[\s\S]*me@example\.com[\s\S]*<form method="post" action="\/alerts\/block"><input type="hidden" name="c" value="[a-f0-9]{32}">/);
  assert.doesNotMatch(html, /<script/);
  assert.equal(ask.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  assert.equal(await statusOf(e, body.token), 200);
  assert.equal(await count(e, 'suppressed'), 0);
  // The token from the signup answer, wrong codes and GET-style POSTs without a code can't block.
  for (const c of [body.token, '0'.repeat(32), 'nothex', '', code.toUpperCase()]) {
    assert.match(await (await pressBlock(e, c, now)).text(), /This Link Has Expired/, c);
    assert.match(await (await handle(new Request(`https://share.example/alerts/block?c=${c}`), e, now)).text(), /This Link Has Expired/, c);
  }
  assert.equal(await statusOf(e, body.token), 200);
  assert.equal(await count(e, 'suppressed'), 0);
  // The button blocks: the pending signup is deleted and the address suppressed (as a hash).
  assert.match(await (await pressBlock(e, code, now)).text(), /<h1>We Won&#39;t Email You Again<\/h1><p>The signup is cancelled/);
  assert.equal(await statusOf(e, body.token), 404);
  const rows = (await e.DB.prepare('SELECT * FROM suppressed').all()).results;
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /@/);
  assert.match(await (await pressBlock(e, code, now)).text(), /This Link Has Expired/);
  assert.match(await (await pressConfirm(e, code, now)).text(), /This Link Has Expired/);
  // No confirmation emails for 90 days, then they go out again.
  assert.equal((await signupAt(e, now + DAY, 'me@example.com', '7.7.7.1')).status, 201);
  assert.equal((await signupAt(e, now + 89 * DAY, 'me@example.com', '7.7.7.2')).status, 201);
  assert.equal(e.outbox.length, 1);
  assert.equal((await signupAt(e, now + 91 * DAY, 'me@example.com', '7.7.7.3')).status, 201);
  assert.equal(e.outbox.length, 2);
});

test('"Not you?" no longer works once the signup is confirmed or the code is too old', async () => {
  const e = alertEnv();
  const now = Date.now();
  const { body } = await signupAt(e, now);
  const code = blockIn(e.outbox[0]);
  assert.match(await (await pressConfirm(e, code, now)).text(), /Price Alerts Are On/);
  assert.match(await (await pressBlock(e, code, now)).text(), /This Link Has Expired/);
  assert.equal(await confirmedOf(e, body.token), 1);
  const old = await signupAt(e, now - 8 * DAY, 'old@example.com', '2.2.2.2');
  assert.match(await (await pressBlock(e, blockIn(e.outbox[1]), now)).text(), /This Link Has Expired/);
  assert.equal(await confirmedOf(e, old.body.token), 0);
  assert.equal(await count(e, 'suppressed'), 0);
});

test('the confirmation page names the builds it will watch, escaped', async () => {
  const e = alertEnv();
  const now = Date.now();
  await withIndex(ALERT_INDEX(), () => handle(req('POST', '/api/alerts', { email: 'me@example.com', builds: [{ ...G19, name: 'Tom\'s "G19" & <b>co</b>' }, { ...G19, name: 'Range' }] }), e, now));
  const html = await (await handle(new Request(`https://share.example/alerts/confirm?c=${codeIn(e.outbox[0])}`), e, now)).text();
  assert.match(html, /Builds you'll get alerts for:<\/p><ul><li>Tom&#39;s &#34;G19&#34; &#38; b co \/b<\/li><li>Range<\/li><\/ul>/);
  // A name stored with markup (from before names were cleaned, say) is escaped on the page.
  const code = 'c'.repeat(32);
  await e.DB.prepare('INSERT INTO alerts (token, email, builds, created_at, ip_hash, confirm_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('d'.repeat(32), 'x@example.com', JSON.stringify([{ ...G19, name: '<script>alert(1)</script>' }]), now, 'x', createHash('sha256').update(code).digest('hex')).run();
  const raw = await (await handle(new Request(`https://share.example/alerts/confirm?c=${code}`), e, now)).text();
  assert.ok(raw.includes('<li>&#60;script&#62;alert(1)&#60;/script&#62;</li>'), raw);
  assert.doesNotMatch(raw, /<script/);
});

test('without the private salt, confirming and unsubscribing still work', async () => {
  const e = alertEnv();
  delete e.SALT;
  const now = Date.now();
  const code = 'e'.repeat(32);
  const add = (token, email, confirmed, hash) => e.DB.prepare('INSERT INTO alerts (token, email, builds, confirmed, created_at, ip_hash, confirm_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(token, email, JSON.stringify([G19]), confirmed, now - DAY, 'x', hash).run();
  await add('a'.repeat(32), 'pending@example.com', 0, createHash('sha256').update(code).digest('hex'));
  await add('b'.repeat(32), 'on@example.com', 1, null);
  await add('f'.repeat(32), 'on@example.com', 1, null);
  assert.match(await (await pressConfirm(e, code, now)).text(), /Price Alerts Are On/);
  assert.equal(await confirmedOf(e, 'a'.repeat(32)), 1);
  const stop = await handle(form(`/alerts/stop?t=${'b'.repeat(32)}`, 'from=page'), e, now);
  assert.equal(stop.status, 200);
  assert.match(await stop.text(), /<h1>You&#39;re Unsubscribed<\/h1><p>We won't send price alerts to this address unless it signs up again\./);
  assert.equal(await confirmedOf(e, 'f'.repeat(32)), undefined);
  assert.equal((await oneClick(e, 'a'.repeat(32), now)).status, 204);
  assert.equal(await count(e, 'alerts'), 0);
  assert.equal(await count(e, 'suppressed'), 0); // no salt, so nothing to hash with
});

test('a confirmation code exactly 7 days old has expired; a millisecond younger still works', async () => {
  // The rule is created_at > now - 7 days. At exactly 7 days the code no longer confirms, though the daily
  // run (created_at < now - 7 days) only deletes the signup a millisecond later.
  const e = alertEnv();
  const now = Date.now();
  const edge = await signupAt(e, now - 7 * DAY, 'edge@example.com', '1.0.0.1');
  const inside = await signupAt(e, now - 7 * DAY + 1, 'inside@example.com', '1.0.0.2');
  const edgeCode = codeIn(e.outbox[0]);
  assert.match(await (await handle(new Request(`https://share.example/alerts/confirm?c=${edgeCode}`), e, now)).text(), /This Link Has Expired/);
  assert.match(await (await pressConfirm(e, edgeCode, now)).text(), /This Link Has Expired/);
  assert.equal(await confirmedOf(e, edge.body.token), 0);
  assert.match(await (await handle(new Request(`https://share.example/alerts/confirm?c=${codeIn(e.outbox[1])}`), e, now)).text(), /Turn On Price Alerts\?/);
  assert.match(await (await pressConfirm(e, codeIn(e.outbox[1]), now)).text(), /Price Alerts Are On/);
  assert.equal(await confirmedOf(e, inside.body.token), 1);
  await withIndex(ALERT_INDEX(), () => runAlerts(e, now));
  assert.equal(await confirmedOf(e, edge.body.token), 0);
  await withIndex(ALERT_INDEX(), () => runAlerts(e, now + 1));
  assert.equal(await confirmedOf(e, edge.body.token), undefined);
});

test('the first daily run after the retailer pause re-baselines prices quietly, once', async () => {
  const e = alertEnv({ rebaselined: false });
  const { token } = (await signup(e, 'me@example.com', [G19], '1.0.0.1')).body;
  assert.match(await confirmMail(e, e.outbox[0]), /Price Alerts Are On/);
  const pending = (await signup(e, 'later@example.com', [G19], '1.0.0.2')).body.token;
  const seenOf = async (t) => JSON.parse((await e.DB.prepare('SELECT seen FROM alerts WHERE token = ?').bind(t).first()).seen);
  assert.equal((await seenOf(token))['glock9/g-fcg-apex5'], 150);
  const mails = e.outbox.length;
  // The pause raised the apex $30 and the slide $60: well over the email bar, but nobody is emailed.
  const { result, lines } = await captureLogs(async () => {
    const { runDaily } = await import('./src/index.js');
    return withIndex(ALERT_INDEX(180, 360), () => runDaily(e));
  });
  assert.ok(lines.includes('Price alerts {"sent":0,"rebaselined":2}'), lines.join('\n'));
  for (const line of lines) assert.doesNotMatch(line, /@/);
  assert.equal(result, undefined);
  assert.equal(e.outbox.length, mails);
  for (const t of [token, pending]) assert.deepEqual(await seenOf(t), { 'glock9/g19-frame-g5': 200, 'glock9/g-fcg-apex5': 180, 'glock9/g19-slide-mos': 360 });
  assert.equal((await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first()).value, REBASELINE);
  // The next run: a real $30 drop from the re-baselined price emails as usual.
  const next = await withIndex(ALERT_INDEX(150, 360), () => runAlerts(e));
  assert.deepEqual(next, { sent: 1, deferred: 0, failed: 0, watched: 1 });
  assert.match(e.outbox.at(-1).html, /Apex trigger[\s\S]*\$180\.00[\s\S]*↓ \$150\.00/);
  assert.doesNotMatch(e.outbox.at(-1).html, /MOS slide/);
  // And it never re-baselines again: a further move is reported, not swallowed.
  const again = await withIndex(ALERT_INDEX(120, 360), () => runAlerts(e));
  assert.deepEqual(again, { sent: 1, deferred: 0, failed: 0, watched: 1 });
  assert.equal((await seenOf(token))['glock9/g-fcg-apex5'], 120);
});

test('the re-baseline waits for a run that can read the price index', async () => {
  const e = alertEnv({ rebaselined: false });
  await signup(e);
  assert.deepEqual(await withIndex(null, () => runAlerts(e)), { sent: 0, skipped: 'price index unreachable' });
  assert.equal(await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first(), null);
  assert.deepEqual(await withIndex(ALERT_INDEX(), () => runAlerts(e)), { sent: 0, rebaselined: 1 });
});

/** Builds to vary the re-baseline rows, and the prices each should end up with under ALERT_INDEX(180, 360). */
const MIXED_BUILDS = [
  [[G19], { 'glock9/g19-frame-g5': 200, 'glock9/g-fcg-apex5': 180, 'glock9/g19-slide-mos': 360 }],
  [[{ ...G19, parts: ['g19-frame-g5'] }], { 'glock9/g19-frame-g5': 200 }],
  [[{ ...G19, platform: 'glock17', parts: ['g-fcg-apex5', 'g19-slide-mos'] }], { 'glock9/g-fcg-apex5': 180, 'glock9/g19-slide-mos': 360 }],
  [[{ ...G19, parts: ['g19-frame-g5', 'no-such-part'] }, { ...G19, name: 'Spare', parts: ['g-fcg-apex5'] }], { 'glock9/g19-frame-g5': 200, 'glock9/g-fcg-apex5': 180 }],
  [[], {}],
];
/** n signups, alternately pending and confirmed, cycling through MIXED_BUILDS, all with stale last-seen prices. */
const addMixed = async (e, n, now) => {
  const stale = JSON.stringify({ 'glock9/g-fcg-apex5': 150, 'glock9/g19-slide-mos': 300, 'glock9/g19-frame-g5': 200 });
  for (let i = 0; i < n; i++) {
    await e.DB.prepare('INSERT INTO alerts (token, email, builds, seen, confirmed, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(i.toString(16).padStart(32, '0'), `m${i}@example.com`, JSON.stringify(MIXED_BUILDS[i % MIXED_BUILDS.length][0]), stale, i % 2, now - DAY, 'x').run();
  }
};
const allSeen = async (e) => (await e.DB.prepare('SELECT token, seen FROM alerts ORDER BY token').all()).results;

test('the re-baseline of 1,000 signups stays well inside D1\'s 50 queries for the whole daily run', async (t) => {
  const e = alertEnv({ rebaselined: false });
  const now = Date.now();
  await addMixed(e, 1000, now);
  const { runDaily } = await import('./src/index.js');
  e.DB.statements = 0;
  const { lines } = await captureLogs(() => withIndex(ALERT_INDEX(180, 360), () => runDaily(e, now)));
  const queries = e.DB.statements;
  assert.ok(lines.includes('Price alerts {"sent":0,"rebaselined":1000}'), lines.join('\n'));
  for (const line of lines) assert.doesNotMatch(line, /failed/, line);
  assert.equal(e.outbox.length, 0);
  const rows = await allSeen(e);
  assert.equal(rows.length, 1000);
  rows.forEach((row, i) => assert.deepEqual(JSON.parse(row.seen), MIXED_BUILDS[parseInt(row.token, 16) % MIXED_BUILDS.length][1], `row ${i}`));
  assert.equal((await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first()).value, REBASELINE);
  // Alerts, feedback and retention all count towards the one limit.
  t.diagnostic(`re-baseline daily run of 1,000 signups: ${queries} D1 queries`);
  assert.ok(queries < 50, `${queries} queries`);
});

test('a re-baseline whose batch fails changes nothing and runs again the next day', async () => {
  const e = alertEnv({ rebaselined: false });
  const now = Date.now();
  await addMixed(e, 100, now);
  const before = await allSeen(e);
  // 100 signups make 4 update statements; fail on the last, the mark, after all the updates have run.
  e.DB.failBatchAt = 4;
  await assert.rejects(withIndex(ALERT_INDEX(180, 360), () => runAlerts(e, now)), /batch failed/);
  assert.deepEqual(await allSeen(e), before);
  assert.equal(await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first(), null);
  // And a failure part way through the updates also leaves every row as it was.
  e.DB.failBatchAt = 1;
  await assert.rejects(withIndex(ALERT_INDEX(180, 360), () => runAlerts(e, now)), /batch failed/);
  assert.deepEqual(await allSeen(e), before);
  assert.equal(await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first(), null);
  assert.equal(e.outbox.length, 0);
  // The next day's run re-baselines every row.
  assert.deepEqual(await withIndex(ALERT_INDEX(180, 360), () => runAlerts(e, now + DAY)), { sent: 0, rebaselined: 100 });
  for (const row of await allSeen(e)) assert.deepEqual(JSON.parse(row.seen), MIXED_BUILDS[parseInt(row.token, 16) % MIXED_BUILDS.length][1]);
  assert.equal((await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first()).value, REBASELINE);
});

/* ------------------------------------------------------------- compliance round 1: re-baseline, NFA notice, prices, privacy */

const PRIVACY = 'https://dropinbuilds.com/privacy/';
const SHORT_NOTICE_TEXT = 'May be regulated under the NFA. Not legal advice: check federal, state and local law.';
const CONFIRM_PRICE = 'Prices change; confirm at the retailer.';
const privacyLink = (html) => (html.match(new RegExp(`<a [^>]*href="${PRIVACY.replace(/[.]/g, '\\.')}"[^>]*>Privacy Policy</a>`, 'g')) ?? []).length;

test('the re-baseline mark is the Gritr links-only bump', () => {
  assert.equal(REBASELINE, '2026-11-gritr-links-only');
});

test('a run with a stale re-baseline mark re-baselines every signup quietly, and the next run stays quiet too', async () => {
  const e = alertEnv({ rebaselined: false });
  e.DB.exec("INSERT INTO meta (key, value) VALUES ('rebaseline', '2026-10-pause')");
  const now = Date.now();
  // Last told $150 for the apex and $300 for the slide; the frame was in the index then.
  const seen = { 'glock9/g-fcg-apex5': 150, 'glock9/g19-slide-mos': 300, 'glock9/g19-frame-g5': 200 };
  for (const [i, confirmed] of [[1, 1], [2, 1], [3, 0]])
    await e.DB.prepare('INSERT INTO alerts (token, email, builds, seen, confirmed, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(String(i).repeat(32), `pause${i}@example.com`, JSON.stringify([G19]), JSON.stringify(seen), confirmed, now - DAY, 'x').run();
  // After the pause the apex rose $50 (over $20 and 10%) and the frame has no price left, so it's out of the index.
  const index = { platforms: { glock9: { name: 'Glock', parts: { 'g-fcg-apex5': ['Apex trigger', 200], 'g19-slide-mos': ['Glock MOS slide', 300] } } } };
  assert.deepEqual(await withIndex(index, () => runAlerts(e, now)), { sent: 0, rebaselined: 3 });
  assert.equal(e.outbox.length, 0);
  for (const row of (await e.DB.prepare('SELECT seen FROM alerts').all()).results)
    assert.deepEqual(JSON.parse(row.seen), { 'glock9/g-fcg-apex5': 200, 'glock9/g19-slide-mos': 300 });
  assert.equal((await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first()).value, '2026-11-gritr-links-only');
  // The next run with the same index: nothing moved, nothing sent.
  assert.deepEqual(await withIndex(index, () => runAlerts(e, now + DAY)), { sent: 0, deferred: 0, failed: 0, watched: 2 });
  assert.equal(e.outbox.length, 0);
});

test('the Worker\'s short NFA notice is the approved wording, marked as the same text as the site\'s', () => {
  assert.equal(NFA_SHORT_NOTICE, SHORT_NOTICE_TEXT);
  assert.match(readFileSync(new URL('./src/share.js', import.meta.url), 'utf8'),
    /\/\*\* Owner-approved wording \(2026-10-26\)\. Same text as NFA_SHORT_NOTICE in src\/data\/helpers\.ts\. \*\/\r?\nexport const NFA_SHORT_NOTICE = /);
});

const AR_INDEX = {
  platforms: {
    ...INDEX.platforms,
    ar15: { name: 'AR-15', parts: { 'ar-lower-aero': ['Aero lower', 100], 'ar-bbl-ba10': ['BA 10.3" barrel', 200] } },
  },
};

test('AR-15, AR-9 and AR-10 share pages carry the short NFA notice, on the page and at the start of the description; pistol pages do not', async () => {
  const ar = await page(env(), '/b/ar15~ar-lower-aero.ar-bbl-ba10', AR_INDEX);
  assert.equal(ar.status, 200);
  for (const prop of ['og:description', 'twitter:description', 'description']) assert.ok(meta(ar.text, prop).startsWith(`${SHORT_NOTICE_TEXT} `), prop);
  // Then the usual description, in its usual order.
  assert.equal(meta(ar.text, 'og:description'), `${SHORT_NOTICE_TEXT} AR-15 · 2 parts · $300 at the best prices we found. Prices change; confirm at the retailer. Includes Aero lower, BA 10.3&#34; barrel. Open it to check the fit and compare retailers.`);
  assert.equal(ar.text.split(`<p>${SHORT_NOTICE_TEXT}</p>`).length, 2, 'once on the page');
  for (const id of ['ar9', 'ar10']) {
    const r = await page(env(), `/b/${id}~x-part`, null);
    assert.ok(meta(r.text, 'og:description').startsWith(`${SHORT_NOTICE_TEXT} `), id);
    assert.ok(r.text.includes(`<p>${SHORT_NOTICE_TEXT}</p>`), id);
  }
  for (const path of ['/b/glock19~g19-frame-g5.g-fcg-apex5', '/b/p365~x-part', '/b/hellcat~x-part']) {
    const r = await page(env(), path);
    assert.equal(r.status, 200, path);
    assert.doesNotMatch(r.text, /regulated under the NFA/, path);
  }
  // A pistol description is exactly as before.
  const glock = await page(env(), '/b/glock19~g19-frame-g5.g-fcg-apex5');
  assert.equal(meta(glock.text, 'og:description'), 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47 · 2 parts · $350 at the best prices we found. Prices change; confirm at the retailer. Includes Glock Gen 5 frame, Apex trigger. Open it to check the fit and compare retailers.');
});

test('share-page totals say to confirm the price at the retailer; no total, no price line', async () => {
  const priced = await page(env(), '/b/glock19~g19-frame-g5.g-fcg-apex5.g19-slide-mos');
  for (const prop of ['og:description', 'twitter:description']) assert.match(meta(priced.text, prop), /3 parts · \$650 at the best prices we found\. Prices change; confirm at the retailer\. Includes /, prop);
  assert.ok(priced.text.includes(`<p>${CONFIRM_PRICE}</p>`), 'next to the total on the page too');
  const unpriced = await page(env(), '/b/glock19~g19-frame-g5', null);
  assert.ok(!unpriced.text.includes(CONFIRM_PRICE));
});

const AR_ALERT_INDEX = (barrel = 200) => ({ platforms: { ...ALERT_INDEX().platforms, ar15: { name: 'AR-15', parts: { 'ar-bbl-ba10': ['BA 10.3" barrel', barrel] } } } });
const AR_BUILD = { name: 'Short AR', platform: 'ar15', parts: ['ar-bbl-ba10'] };

test('an alert email carries the short NFA notice once when it lists an AR build, and none for pistols only', async () => {
  const e = alertEnv();
  await withIndex(AR_ALERT_INDEX(), () => call(e, 'POST', '/api/alerts', { email: 'ar@example.com', builds: [AR_BUILD, G19] }));
  await confirmMail(e, e.outbox[0]);
  // Both builds move: the AR barrel and the Glock apex.
  const index = { platforms: { ...ALERT_INDEX(120).platforms, ar15: { name: 'AR-15', parts: { 'ar-bbl-ba10': ['BA 10.3" barrel', 150] } } } };
  assert.equal((await withIndex(index, () => runAlerts(e))).sent, 1);
  const mail = e.outbox.at(-1);
  assert.equal(mail.html.split(SHORT_NOTICE_TEXT).length, 2, 'once in the html');
  assert.equal(mail.text.split(SHORT_NOTICE_TEXT).length, 2, 'once in the text');
  // A Glock-only email has none.
  const g = alertEnv();
  await signup(g, 'glock@example.com');
  await confirmMail(g, g.outbox[0]);
  await withIndex(ALERT_INDEX(120), () => runAlerts(g));
  assert.equal(g.outbox.length, 2);
  assert.ok(!g.outbox[1].html.includes(SHORT_NOTICE_TEXT) && !g.outbox[1].text.includes(SHORT_NOTICE_TEXT));
  // An AR build that didn't move isn't in the email, so a Glock-only move carries none either.
  const quiet = alertEnv();
  await withIndex(AR_ALERT_INDEX(), () => call(quiet, 'POST', '/api/alerts', { email: 'mixed@example.com', builds: [AR_BUILD, G19] }));
  await confirmMail(quiet, quiet.outbox[0]);
  await withIndex({ platforms: { ...ALERT_INDEX(120).platforms, ...AR_ALERT_INDEX().platforms } }, () => runAlerts(quiet));
  assert.ok(!quiet.outbox.at(-1).html.includes(SHORT_NOTICE_TEXT));
});

test('confirmation and alert emails link the Privacy Policy, in html and text', async () => {
  const e = alertEnv();
  await signup(e, 'privacy@example.com');
  const confirm = e.outbox[0];
  assert.equal(privacyLink(confirm.html), 1);
  assert.ok(confirm.text.includes(`\nPrivacy Policy: ${PRIVACY}\n`));
  await confirmMail(e, confirm);
  await withIndex(ALERT_INDEX(120), () => runAlerts(e));
  const alert = e.outbox[1];
  assert.equal(privacyLink(alert.html), 1);
  assert.ok(alert.text.includes(`\nPrivacy Policy: ${PRIVACY}\n`));
  // The mailing address and unsubscribe link are still there.
  assert.match(alert.html, /PO Box 1/);
  assert.match(alert.text, /Unsubscribe: https:\/\/share\.dropinbuilds\.com\/alerts\/stop\?t=/);
});

test('the confirm, unsubscribe and "Not you?" pages link the Privacy Policy', async () => {
  const e = alertEnv();
  const { token } = (await signup(e, 'pages@example.com')).body;
  const code = codeIn(e.outbox[0]);
  const pages = [
    await (await visit(e, 'GET', `/alerts/confirm?c=${code}`)).text(),
    await (await visit(e, 'GET', `/alerts/block?c=${code}`)).text(),
    await (await visit(e, 'GET', '/alerts/confirm?c=bad')).text(),
    await (await visit(e, 'GET', '/alerts/block?c=bad')).text(),
    await (await pressConfirm(e, code)).text(),
    await (await visit(e, 'GET', `/alerts/stop?t=${token}`)).text(),
    await (await handle(form(`/alerts/stop?t=${token}`, 'from=page'), e)).text(),
    await (await visit(e, 'GET', `/alerts/stop?t=${token}`)).text(),
  ];
  assert.match(pages[4], /Price Alerts Are On/);
  assert.match(pages[6], /You&#39;re Unsubscribed/);
  for (const [i, html] of pages.entries()) assert.equal(privacyLink(html), 1, `page ${i}`);
  // A "Not you?" result page too.
  const b = alertEnv();
  await signup(b, 'notme@example.com');
  const done = await (await handle(form('/alerts/block', `c=${codeIn(b.outbox[0])}`), b)).text();
  assert.match(done, /We Won&#39;t Email You Again/);
  assert.equal(privacyLink(done), 1);
});

test('the unsubscribe result page uses the owner-approved wording', async () => {
  assert.match(readFileSync(new URL('./src/alerts.js', import.meta.url), 'utf8'), /\/\*\* Owner-approved wording \(2026-10-26\)\. \*\/\r?\nconst UNSUBSCRIBED = "We won't send price alerts to this address unless it signs up again\.";/);
  const e = alertEnv();
  const { token } = (await signup(e, 'wording@example.com')).body;
  const done = await (await handle(form(`/alerts/stop?t=${token}`, 'from=page'), e)).text();
  assert.ok(done.includes("<h1>You&#39;re Unsubscribed</h1><p>We won't send price alerts to this address unless it signs up again. Your saved builds are still on the site.</p>"));
  assert.doesNotMatch(done, /won't email this address again/);
});

test('the share page shows the price line only where the page shows the total; the description keeps it with any total', async () => {
  // A named community build: the page shows the name, not the total, so the line stays in the description only.
  const e = env();
  const s = await share(e, { name: 'Carry G19', note: '' });
  const named = await page(e, `/c/${s.body.build.id}`);
  assert.equal(meta(named.text, 'og:title'), 'Carry G19');
  assert.match(meta(named.text, 'og:description'), /\$650 at the best prices we found\. Prices change; confirm at the retailer\./);
  assert.ok(!named.text.includes(`<p>${CONFIRM_PRICE}</p>`), 'no total on the page, no line');
  // An unnamed /b/ build: the page's title carries the total, so the line follows it.
  const unnamed = await page(env(), '/b/glock19~g19-frame-g5.g-fcg-apex5.g19-slide-mos');
  assert.match(unnamed.text, /<p>Opening <a [^>]*>Glock 17 \/ 19 \/ 19X \/ 26 \/ 34 \/ 45 \/ 47 build · \$650<\/a> on Drop-In Builds…<\/p>\n<p>Prices change; confirm at the retailer\.<\/p>/);
});

test('a community AR-15 build carries the notice once on the page and opens its description with it; a Glock one has none', async () => {
  const e = env();
  const ar = await share(e, { platform: 'ar15', name: 'Short AR', note: 'Range day', parts: ['ar-lower-aero', 'ar-bbl-ba10', 'ar-grip-k2'] });
  assert.equal(ar.status, 201);
  const r = await page(e, `/c/${ar.body.build.id}`, AR_INDEX);
  assert.equal(r.status, 200);
  assert.equal(r.text.split(SHORT_NOTICE_TEXT).length, 5, 'once on the page, plus the description, og and twitter tags');
  assert.equal(r.text.split(`<p>${SHORT_NOTICE_TEXT}</p>`).length, 2, 'once in the page body');
  for (const prop of ['og:description', 'twitter:description', 'description']) assert.ok(meta(r.text, prop).startsWith(`${SHORT_NOTICE_TEXT} Range day AR-15 · 2 parts · $300`), prop);
  const glock = await share(e);
  const g = await page(e, `/c/${glock.body.build.id}`, AR_INDEX);
  assert.equal(g.status, 200);
  assert.doesNotMatch(g.text, /regulated under the NFA/);
});

test('AR-9 and AR-10 share pages with prices open their description with the notice, then the priced summary', async () => {
  const index = { platforms: {
    ar9: { name: 'AR-9', parts: { 'a9-lower': ['9mm lower', 150], 'a9-bbl': ['9mm barrel', 120] } },
    ar10: { name: 'AR-10', parts: { 'a10-lower': ['.308 lower', 180], 'a10-bbl': ['.308 barrel', 250] } },
  } };
  for (const [id, name, total] of [['ar9', 'AR-9', '$270'], ['ar10', 'AR-10', '$430']]) {
    const r = await page(env(), `/b/${id}~${id === 'ar9' ? 'a9-lower.a9-bbl' : 'a10-lower.a10-bbl'}`, index);
    assert.equal(r.status, 200, id);
    assert.ok(meta(r.text, 'og:description').startsWith(`${SHORT_NOTICE_TEXT} ${name} · 2 parts · ${total} at the best prices we found. Prices change; confirm at the retailer.`), id);
    assert.equal(r.text.split(`<p>${SHORT_NOTICE_TEXT}</p>`).length, 2, `${id}: once in the page body`);
  }
});

/* ------------------------------------------------------------- estimates in totals */

const GLOCK_PATH = '/b/glock19~g19-frame-g5.g-fcg-apex5.g19-slide-mos';
/** The share index with an `estimates` list; call with no argument for an index from before the list existed. */
const ESTIMATE_INDEX = (...args) => ({ platforms: { glock9: { ...INDEX.platforms.glock9, ...(args.length ? { estimates: args[0] } : {}) } } });
const GLOCK_NAME = 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47';
const facts = (phrase) => `${GLOCK_NAME} · 3 parts · $650 at the best prices we found${phrase}. Prices change; confirm at the retailer. Includes Glock Gen 5 frame, Apex trigger, Glock MOS slide. Open it to check the fit and compare retailers.`;

test('a share page counts the estimates in its total, in the description and the title', async () => {
  const several = await page(env(), GLOCK_PATH, ESTIMATE_INDEX(['g19-frame-g5', 'g-fcg-apex5', 'g19-slide-mos']));
  for (const prop of ['og:description', 'twitter:description', 'description']) assert.equal(meta(several.text, prop), facts(', including 3 estimates'), prop);
  for (const prop of ['og:title', 'twitter:title']) assert.equal(meta(several.text, prop), `${GLOCK_NAME} build · $650, including 3 estimates`, prop);
  assert.ok(several.text.includes(`<title>${GLOCK_NAME} build · $650, including 3 estimates | Drop-In Builds</title>`));
  assert.match(several.text, />Glock 17 [^<]* build · \$650, including 3 estimates<\/a> on Drop-In Builds…<\/p>\n<p>Prices change; confirm at the retailer\.<\/p>/);

  const one = await page(env(), GLOCK_PATH, ESTIMATE_INDEX(['g-fcg-apex5']));
  assert.equal(meta(one.text, 'og:description'), facts(', including 1 estimate'));
  assert.equal(meta(one.text, 'og:title'), `${GLOCK_NAME} build · $650, including 1 estimate`);
});

test('a share page counts only estimates in the build that have a price', async () => {
  // Priced estimate in the build, priced estimate not in it, and an unpriced part on the list that is in it.
  const index = ESTIMATE_INDEX(['g-fcg-apex5', 'g19-slide-mos', 'g-unpriced']);
  const r = await page(env(), '/b/glock19~g19-frame-g5.g-fcg-apex5.g-unpriced', index);
  assert.match(meta(r.text, 'og:description'), /· 2 parts · \$350 at the best prices we found, including 1 estimate\. Prices/);
  // Only estimates of parts this build doesn't have, or that have no price: the old text.
  const none = await page(env(), '/b/glock19~g19-frame-g5.g-unpriced', index);
  assert.doesNotMatch(none.text, /estimate/);
  // A repeated part is in the total twice, so it is counted twice.
  const twice = await page(env(), '/b/glock19~g-fcg-apex5.g-fcg-apex5', index);
  assert.match(meta(twice.text, 'og:description'), /· 2 parts · \$301 at the best prices we found, including 2 estimates\. Prices/);
});

test('a share page with no estimates, or an index with no list, reads exactly as before', async () => {
  const absent = await page(env(), GLOCK_PATH, ESTIMATE_INDEX());
  assert.equal(meta(absent.text, 'og:description'), facts(''));
  assert.equal(meta(absent.text, 'og:title'), `${GLOCK_NAME} build · $650`);
  assert.doesNotMatch(absent.text, /estimate/);
  // Byte for byte, whichever way "no estimates" arrives.
  for (const list of [[], ['g-not-in-this-build'], null, 'g-fcg-apex5', { 'g-fcg-apex5': true }]) assert.equal((await page(env(), GLOCK_PATH, ESTIMATE_INDEX(list))).text, absent.text, JSON.stringify(list));
  assert.equal((await page(env(), GLOCK_PATH, INDEX)).text, absent.text);
  // No index at all: no total, no phrase.
  const noIndex = await page(env(), GLOCK_PATH, null);
  assert.equal(noIndex.status, 200);
  assert.doesNotMatch(noIndex.text, /estimate|best prices/);
});

test('a named community build keeps its name as the title; the description counts the estimates, and escaping is unchanged', async () => {
  const e = env();
  const s = await share(e, { name: 'Carry G19', note: '' });
  const named = await page(e, `/c/${s.body.build.id}`, ESTIMATE_INDEX(['g-fcg-apex5', 'g19-slide-mos']));
  assert.equal(meta(named.text, 'og:title'), 'Carry G19');
  assert.match(meta(named.text, 'og:description'), /\$650 at the best prices we found, including 2 estimates\. Prices change; confirm at the retailer\./);

  const ar = await page(env(), '/b/ar15~ar-lower-aero.ar-bbl-ba10', { platforms: { ar15: { ...AR_INDEX.platforms.ar15, estimates: ['ar-bbl-ba10'] } } });
  assert.equal(meta(ar.text, 'og:description'), `${SHORT_NOTICE_TEXT} AR-15 · 2 parts · $300 at the best prices we found, including 1 estimate. Prices change; confirm at the retailer. Includes Aero lower, BA 10.3&#34; barrel. Open it to check the fit and compare retailers.`);
});

const ALERT_FOOTER = 'Prices are checked every night at the stores we track; always confirm the price at the retailer.';
/** A Carry G19 subscriber whose apex trigger falls from $150 to $120, under this index entry. Returns the alert email. */
const movedMail = async (extra = {}, base = ALERT_INDEX(120)) => {
  const e = alertEnv();
  await signup(e, 'estimates@example.com');
  await confirmMail(e, e.outbox[0]);
  const result = await withIndex({ platforms: { glock9: { ...base.platforms.glock9, ...extra } } }, () => runAlerts(e));
  assert.equal(result.sent, 1);
  return e.outbox.at(-1);
};

test('an alert email counts the estimates in the total, in html and text', async () => {
  const mail = await movedMail({ estimates: ['g19-slide-mos'] });
  assert.ok(mail.html.includes('Now $620.00 at the best prices we found, including 1 estimate</p>'));
  assert.ok(mail.html.includes('↓ $120.00</td>'));
  assert.ok(mail.text.includes('Carry G19 (now $620.00 at the best prices we found, including 1 estimate)\n'));
  assert.ok(mail.text.includes('  Apex trigger: $150.00 -> $120.00\n'));
});

test('an alert email lists only parts with live prices, and counts the build\'s estimates in the total', async () => {
  // The two estimates didn't move; the part that moved has a live price.
  const mail = await movedMail({ estimates: ['g19-frame-g5', 'g19-slide-mos'] });
  assert.ok(mail.html.includes('Now $620.00 at the best prices we found, including 2 estimates</p>'));
  assert.ok(mail.text.includes('(now $620.00 at the best prices we found, including 2 estimates)\n'));
  assert.ok(!mail.html.includes('(estimate)') && !mail.text.includes('(estimate)'));
  // An estimate that went up has no row, among others that do.
  const up = await movedMail({ estimates: ['g-fcg-apex5'] }, ALERT_INDEX(200, 200));
  assert.ok(!up.html.includes('↑ $200.00'));
  assert.ok(up.html.includes('↓ $200.00</td>'));
  assert.ok(up.text.includes('  Glock MOS slide: $300.00 -> $200.00\n'));
  assert.ok(!up.text.includes('Apex trigger'));
});

test('an alert email counts only estimates with a price, build by build', async () => {
  // The slide is on the list but has dropped out of the index: it isn't in the total, so it isn't counted.
  const { platforms: { glock9 } } = ALERT_INDEX(120);
  const { 'g19-slide-mos': _gone, ...parts } = glock9.parts;
  const mail = await movedMail({ parts, estimates: ['g19-frame-g5', 'g19-slide-mos'] });
  assert.ok(mail.text.includes('(now $320.00 at the best prices we found, including 1 estimate)\n'));

  // Two builds in one email: the phrase follows the build with the estimate only.
  const e = alertEnv();
  await withIndex(AR_ALERT_INDEX(), () => call(e, 'POST', '/api/alerts', { email: 'two@example.com', builds: [{ ...AR_BUILD, parts: ['ar-bbl-ba10', 'ar-grip-k2'] }, G19] }));
  await confirmMail(e, e.outbox[0]);
  const index = { platforms: { ...ALERT_INDEX(120).platforms, ar15: { name: 'AR-15', parts: { 'ar-bbl-ba10': ['BA 10.3" barrel', 100], 'ar-grip-k2': ['K2 grip', 50] }, estimates: ['ar-grip-k2'] } } };
  assert.equal((await withIndex(index, () => runAlerts(e))).sent, 1);
  const two = e.outbox.at(-1);
  assert.ok(two.text.includes('Short AR (now $150.00 at the best prices we found, including 1 estimate)\n'));
  assert.ok(two.text.includes('Carry G19 (now $620.00)\n'));
  assert.ok(two.html.includes('Now $620.00 at the best prices we found</p>'));
  assert.ok(!two.html.includes('(estimate)'), 'no estimate row');
});

test('an alert email with no estimates, or an index with no list, has the old total and rows', async () => {
  for (const extra of [{}, { estimates: [] }, { estimates: ['g-not-in-this-build'] }, { estimates: null }, { estimates: 'g-fcg-apex5' }]) {
    const label = JSON.stringify(extra);
    const mail = await movedMail(extra);
    assert.ok(mail.html.includes('Now $620.00 at the best prices we found</p>'), label);
    assert.ok(mail.html.includes('↓ $120.00</td>'), label);
    assert.ok(mail.text.includes('Carry G19 (now $620.00)\n  Apex trigger: $150.00 -> $120.00\n'), label);
    assert.doesNotMatch(mail.html + mail.text, /estimate/, label);
    assert.equal(mail.subject, 'Price drop on "Carry G19"', label);
  }
  // No index at all: nothing is sent, as before.
  const e = alertEnv();
  await signup(e, 'noindex@example.com');
  await confirmMail(e, e.outbox[0]);
  assert.deepEqual(await withIndex(null, () => runAlerts(e)), { sent: 0, skipped: 'price index unreachable' });
  assert.equal(e.outbox.length, 1);
});

test('the alert email footer says where prices are checked, once, in html and text, with or without estimates', async () => {
  for (const extra of [{}, { estimates: ['g19-slide-mos'] }]) {
    const mail = await movedMail(extra);
    assert.equal(mail.html.split(ALERT_FOOTER).length, 2);
    assert.equal(mail.text.split(ALERT_FOOTER).length, 2);
  }
  // Nothing in the Worker still has the old sentence, including share pages.
  for (const file of readdirSync(new URL('./src/', import.meta.url)))
    assert.doesNotMatch(readFileSync(new URL(`./src/${file}`, import.meta.url), 'utf8'), /checked every night;/, file);
});

test('estimates leave an email\'s escaping and the prices it remembers as they were', async () => {
  const name = 'Apex "Flat" & Co';
  const { platforms: { glock9 } } = ALERT_INDEX(120);
  const mail = await movedMail({ parts: { ...glock9.parts, 'g-fcg-apex5': [name, 120] }, estimates: ['g19-slide-mos'] });
  assert.ok(mail.html.includes('Apex &#34;Flat&#34; &#38; Co'));
  assert.ok(!mail.html.includes(name));
  assert.ok(mail.text.includes(`  ${name}: $150.00 -> $120.00\n`));

  // A real move stores the same last-reported prices with and without the list.
  const seenAfter = async (extra) => {
    const e = alertEnv();
    await signup(e, 'seen@example.com');
    await confirmMail(e, e.outbox[0]);
    await withIndex({ platforms: { glock9: { ...glock9, ...extra } } }, () => runAlerts(e));
    return JSON.parse((await e.DB.prepare('SELECT seen FROM alerts').first()).seen);
  };
  assert.deepEqual(await seenAfter({ estimates: ['g19-slide-mos'] }), await seenAfter({}));
  // A move that is only an estimate stores nothing.
  assert.deepEqual(await seenAfter({ estimates: ['g-fcg-apex5', 'g19-slide-mos'] }), { 'glock9/g19-frame-g5': 200, 'glock9/g-fcg-apex5': 150, 'glock9/g19-slide-mos': 300 });
});

/* ------------------------------------------------- part ids Object already has */

import { changesFor } from './src/alerts.js';

// `constructor` passes the part id check, and on a plain object it finds Object's built-in, not a part.
const WITH_CONSTRUCTOR = { ...G19, parts: [...G19.parts, 'constructor'] };
const seenOf = async (e) => JSON.parse((await e.DB.prepare('SELECT seen FROM alerts').first()).seen);

test('a share link for a part id Object already has opens as a build with no parts', async () => {
  const r = await page(env(), '/b/glock19~constructor');
  assert.equal(r.status, 200);
  assert.equal(meta(r.text, 'og:title'), `${GLOCK_NAME} build`);
  assert.equal(meta(r.text, 'og:description'), `A ${GLOCK_NAME} build. Open it to check the fit and compare retailers.`);
});

test('a share link counts only the known part alongside a part id Object already has', async () => {
  const r = await page(env(), '/b/glock19~g19-frame-g5.constructor');
  assert.equal(r.status, 200);
  assert.equal(meta(r.text, 'og:title'), `${GLOCK_NAME} build · $200`);
  assert.match(meta(r.text, 'og:description'), /· 1 parts · \$200 at the best prices we found\. /);
  assert.match(meta(r.text, 'og:description'), /Includes Glock Gen 5 frame\. /);
  assert.doesNotMatch(r.text, /NaN/);
  // Nor is it counted as an estimate, even when the list names it.
  const listed = await page(env(), '/b/glock19~g19-frame-g5.constructor', ESTIMATE_INDEX(['constructor', 'g19-frame-g5']));
  assert.equal(meta(listed.text, 'og:title'), `${GLOCK_NAME} build · $200, including 1 estimate`);
});

test('an alert for a build with a part id Object already has shows a real total', async () => {
  const seen = { 'glock9/g-fcg-apex5': 150, 'glock9/constructor': 100 };
  const build = { ...WITH_CONSTRUCTOR, platform: 'glock9' };
  const [moved] = changesFor(ALERT_INDEX(120), [build], seen);
  assert.equal(moved.total, 620);
  assert.deepEqual(moved.changes.map((c) => c.name), ['Apex trigger']);

  const e = alertEnv();
  await signup(e, 'partid@example.com', [WITH_CONSTRUCTOR]);
  await confirmMail(e, e.outbox[0]);
  assert.equal((await withIndex(ALERT_INDEX(120), () => runAlerts(e))).sent, 1);
  const mail = e.outbox.at(-1);
  assert.ok(mail.html.includes('Now $620.00 at the best prices we found</p>'));
  assert.ok(mail.text.includes('Carry G19 (now $620.00)\n'));
  assert.doesNotMatch(mail.html + mail.text, /NaN/);
  assert.equal(mail.html.split('<s>').length, 2, 'one row, the apex trigger');
});

// Pins stored data only: the old lookup's undefined never reached JSON, so this can't catch a return of that code.
test('regression pin on stored data: nothing with `constructor` is stored as a last reported price', async () => {
  const known = ['glock9/g-fcg-apex5', 'glock9/g19-frame-g5', 'glock9/g19-slide-mos'];
  const e = alertEnv();
  const { token } = (await signup(e, 'partid@example.com', [WITH_CONSTRUCTOR])).body;
  assert.deepEqual(Object.keys(await seenOf(e)).sort(), known);
  assert.equal((await withIndex(ALERT_INDEX(), () => call(e, 'PUT', `/api/alerts/${token}`, { builds: [WITH_CONSTRUCTOR] }))).status, 200);
  assert.deepEqual(Object.keys(await seenOf(e)).sort(), known);
});

test('a build with a part id Object already has still works when the price index is unreachable', async () => {
  for (const index of [null, {}, { platforms: {} }, { platforms: { glock9: {} } }]) {
    const label = JSON.stringify(index);
    const r = await page(env(), '/b/glock19~g19-frame-g5.constructor', index);
    assert.equal(r.status, 200, label);
    assert.equal(meta(r.text, 'og:title'), `${GLOCK_NAME} build`, label);
    assert.deepEqual(changesFor(index, [{ ...WITH_CONSTRUCTOR, platform: 'glock9' }], { 'glock9/g-fcg-apex5': 150 }), [], label);

    const e = alertEnv();
    const signed = await withIndex(index, () => call(e, 'POST', '/api/alerts', { email: 'noindex@example.com', builds: [WITH_CONSTRUCTOR] }));
    assert.equal(signed.status, 201, label);
    assert.deepEqual(await seenOf(e), {}, label);
    const put = await withIndex(index, () => call(e, 'PUT', `/api/alerts/${signed.body.token}`, { builds: [WITH_CONSTRUCTOR] }));
    assert.equal(put.status, 200, label);
    assert.deepEqual(await seenOf(e), {}, label);
  }
});

/* ------------------------------------------------- moves to and from an estimate */

const MOVE_CASES = JSON.parse(readFileSync(new URL('../scripts/price-move-cases.json', import.meta.url), 'utf8')).cases;
const FRAME = 'glock9/g19-frame-g5';
const APEX = 'glock9/g-fcg-apex5';
const SLIDE = 'glock9/g19-slide-mos';
const ALL_SEEN = { [FRAME]: 200, [APEX]: 150, [SLIDE]: 300 };
const APEX_ID = 'g-fcg-apex5';
const SLIDE_ID = 'g19-slide-mos';
/** ALERT_INDEX with an `estimates` list, as the site publishes it today. */
const LISTED = (apex = 150, slide = 300, estimates = []) => ({ platforms: { glock9: { ...ALERT_INDEX(apex, slide).platforms.glock9, estimates } } });
const tokenOf = (n) => String(n).padStart(32, '0');
/** A confirmed signup with these last reported prices, stored straight in the table. */
const addAlert = (e, n, seen, builds = [G19], email = `a${String(n).padStart(4, '0')}@example.com`) =>
  e.DB.prepare('INSERT INTO alerts (token, email, builds, seen, confirmed, created_at, ip_hash) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(tokenOf(n), email, JSON.stringify(builds), JSON.stringify(seen), Date.now() - DAY, 'x').run();
const seenAt = async (e, n) => JSON.parse((await e.DB.prepare('SELECT seen FROM alerts WHERE token = ?').bind(tokenOf(n)).first()).seen);
const QUIET = { sent: 0, deferred: 0, failed: 0 };

test('price-move-cases.json holds for the Worker: rows through changesFor, stored prices through the daily run', async () => {
  assert.equal(MOVE_CASES.length, 4);
  for (const c of MOVE_CASES) {
    const label = JSON.stringify(c);
    const before = c.saved === 'live' ? { [APEX]: 150 } : {};
    const index = LISTED(120, 300, c.today === 'estimate' ? [APEX_ID] : []);
    const build = { name: 'Carry G19', platform: 'glock9', parts: [APEX_ID] };

    const moved = changesFor(index, [build], before);
    assert.deepEqual(moved.flatMap((m) => m.changes.map((x) => [x.was, x.now])), c.reported ? [[150, 120]] : [], label);

    const e = alertEnv();
    await addAlert(e, 1, before, [build]);
    await withIndex(index, () => runAlerts(e));
    assert.equal(e.outbox.length, c.reported ? 1 : 0, label);
    // "saved" is the price kept until it's reported. The site keeps it on the saved build; the Worker has now
    // told this person, so as for every real move, the price it told them is the one it keeps.
    const stored = { saved: c.reported ? 120 : 150, today: 120 }[c.stored];
    assert.deepEqual(await seenAt(e, 1), stored === undefined ? {} : { [APEX]: stored }, label);
  }
});

test('a move that is only an estimate sends nothing and stores nothing', async () => {
  // Live to estimate, down and up, with the old live price held.
  for (const apex of [100, 220]) {
    const e = alertEnv();
    await addAlert(e, 1, ALL_SEEN);
    assert.deepEqual(await withIndex(LISTED(apex, 300, [APEX_ID]), () => runAlerts(e)), { ...QUIET, watched: 1 });
    assert.equal(e.outbox.length, 0);
    assert.deepEqual(await seenAt(e, 1), ALL_SEEN);
  }
  // Estimate to estimate: nothing was stored for it, and nothing is.
  const e = alertEnv();
  await addAlert(e, 1, { [FRAME]: 200, [SLIDE]: 300 });
  for (const apex of [150, 100]) assert.deepEqual(await withIndex(LISTED(apex, 300, [APEX_ID]), () => runAlerts(e)), { ...QUIET, watched: 1 });
  assert.equal(e.outbox.length, 0);
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [SLIDE]: 300 });
});

test('a mixed email lists only the real moves, and its subject follows them', async () => {
  const e = alertEnv();
  const spare = { name: 'Spare Slide', platform: 'glock9', parts: [SLIDE_ID] };
  await addAlert(e, 1, ALL_SEEN, [G19, spare]);
  // The apex falls for real; the slide jumps, but it's an estimate now. With its row the subject would be "Prices changed".
  assert.equal((await withIndex(LISTED(120, 500, [SLIDE_ID]), () => runAlerts(e))).sent, 1);
  const mail = e.outbox[0];
  assert.equal(mail.subject, 'Price drop on "Carry G19"');
  assert.equal(mail.html.split('<s>').length, 2, 'one row, the apex');
  assert.ok(mail.text.includes('Carry G19 (now $820.00 at the best prices we found, including 1 estimate)\n  Apex trigger: $150.00 -> $120.00\n'));
  // A build whose only move is an estimate isn't in the email at all.
  assert.doesNotMatch(mail.html + mail.text, /Spare Slide|MOS slide|\(estimate\)/);
});

test('an estimate that turns live with no email stores the price quietly, and the next real drop emails', async () => {
  const e = alertEnv();
  await addAlert(e, 1, { [FRAME]: 200, [SLIDE]: 300 });
  await withIndex(LISTED(150, 300, [APEX_ID]), () => runAlerts(e));
  assert.equal((await seenAt(e, 1))[APEX], undefined);
  // Live at $100, far under the estimate: no email, because nothing real moved.
  assert.deepEqual(await withIndex(LISTED(100), () => runAlerts(e)), { ...QUIET, watched: 1 });
  assert.equal(e.outbox.length, 0);
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [APEX]: 100, [SLIDE]: 300 });
  const next = await withIndex(LISTED(70), () => runAlerts(e));
  assert.equal(next.sent, 1);
  assert.equal(e.outbox[0].subject, 'Price drop on "Carry G19"');
  assert.ok(e.outbox[0].text.includes('  Apex trigger: $100.00 -> $70.00\n'));
});

test('a quiet write adds missing keys and never overwrites a price, even one changed during the run', async () => {
  const e = alertEnv();
  await addAlert(e, 1, ALL_SEEN);
  await addAlert(e, 2, { [FRAME]: 190, [APEX]: 150 });
  await addAlert(e, 3, { [FRAME]: 195 });
  const send = e.sendEmail;
  // A site update lands while the run is sending: the run's copy of signup 3 is now out of date.
  e.sendEmail = async (m) => {
    await send(m);
    await e.DB.prepare('UPDATE alerts SET seen = ? WHERE token = ?').bind(JSON.stringify({ [FRAME]: 205, [SLIDE]: 310 }), tokenOf(3)).run();
  };
  // Signup 1 gets the slide drop. Signup 2's apex is an estimate today and its price is held; its slide is missing.
  assert.equal((await withIndex(LISTED(100, 200, [APEX_ID]), () => runAlerts(e))).sent, 1);
  assert.deepEqual(await seenAt(e, 2), { [FRAME]: 190, [APEX]: 150, [SLIDE]: 200 });
  assert.deepEqual(await seenAt(e, 3), { [FRAME]: 205, [SLIDE]: 310 });
});

test('a held price survives a PUT, and new parts start from live prices only', async () => {
  const e = alertEnv();
  await addAlert(e, 1, ALL_SEEN);
  const { platforms: { glock9 } } = LISTED(100, 300, [APEX_ID, 'g-new-est']);
  const index = { platforms: { glock9: { ...glock9, parts: { ...glock9.parts, 'g-new-live': ['New live', 50], 'g-new-est': ['New estimate', 60] } } } };
  const parts = ['g19-frame-g5', APEX_ID, 'g-new-live', 'g-new-est'];
  const put = await withIndex(index, () => call(e, 'PUT', `/api/alerts/${tokenOf(1)}`, { builds: [{ ...G19, parts }] }));
  assert.equal(put.status, 200);
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [APEX]: 150, 'glock9/g-new-live': 50 });
});

test('a new signup stores no estimate', async () => {
  const e = alertEnv();
  await withIndex(LISTED(150, 300, [APEX_ID]), () => call(e, 'POST', '/api/alerts', { email: 'new@example.com', builds: [G19] }));
  assert.deepEqual(await seenOf(e), { [FRAME]: 200, [SLIDE]: 300 });
});

test('a held price survives an email about something else, and a real move later compares with it', async () => {
  const e = alertEnv();
  await addAlert(e, 1, ALL_SEEN);
  assert.equal((await withIndex(LISTED(100, 200, [APEX_ID]), () => runAlerts(e))).sent, 1);
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [APEX]: 150, [SLIDE]: 200 });
  assert.equal((await withIndex(LISTED(120, 200), () => runAlerts(e))).sent, 1);
  assert.ok(e.outbox[1].text.includes('  Apex trigger: $150.00 -> $120.00\n'));
  assert.equal((await seenAt(e, 1))[APEX], 120);
});

test('an address whose send failed or was put off gets no quiet write', async () => {
  // Each moved signup has a real drop on the apex and a missing slide key.
  const moved = { [FRAME]: 200, [APEX]: 150 };
  const failed = alertEnv();
  await addAlert(failed, 1, moved);
  await addAlert(failed, 2, { [FRAME]: 200 }, [{ ...G19, parts: ['g19-frame-g5', SLIDE_ID] }]);
  failed.sendEmail = async () => { throw new Error('send refused'); };
  assert.deepEqual(await withIndex(LISTED(120), () => runAlerts(failed)), { sent: 0, deferred: 0, failed: 1, watched: 2 });
  assert.deepEqual(await seenAt(failed, 1), moved);
  // The address that had nothing to send still gets its write.
  assert.deepEqual(await seenAt(failed, 2), { [FRAME]: 200, [SLIDE]: 300 });

  const deferred = alertEnv();
  for (let n = 1; n <= 80; n++) await addAlert(deferred, n, moved);
  assert.deepEqual(await withIndex(LISTED(120), () => runAlerts(deferred)), { sent: 30, deferred: 50, failed: 0, watched: 80 });
  assert.deepEqual(await seenAt(deferred, 80), moved);
  assert.equal((await seenAt(deferred, 30))[SLIDE], 300, 'an emailed address stores it with the email');
});

/** n signups each missing the apex, numbered from `first`. */
const addMissing = async (e, n, first = 1) => { for (let i = first; i < first + n; i++) await addAlert(e, i, { [FRAME]: 200, [SLIDE]: 300 }); };
const countWritten = async (e) => (await e.DB.prepare(`SELECT COUNT(*) AS n FROM alerts WHERE seen LIKE '%apex%'`).first()).n;

test('a day of quiet writes stays well inside D1\'s 50 queries for the whole daily run', async (t) => {
  const e = alertEnv();
  await addMissing(e, 1000);
  const { runDaily } = await import('./src/index.js');
  e.DB.statements = 0;
  await captureLogs(() => withIndex(LISTED(), () => runDaily(e)));
  t.diagnostic(`daily run with 1,000 quiet rows waiting: ${e.DB.statements} D1 queries`);
  assert.ok(e.DB.statements < 50, `${e.DB.statements} queries`);
  assert.equal(e.outbox.length, 0);
  assert.equal(await countWritten(e), 165);
});

// Replaces a test that pinned the R8 bug: 79 emails a run, each followed by its own UPDATE (3 + 79 + 5 queries,
// past D1's 50 for one invocation). The same day now: 30 emails, their rows claimed in 3 batches before sending.
test('quiet writes add at most 5 statements, in one query, to a full day of emails', async (t) => {
  const e = alertEnv();
  for (let n = 1; n <= 79; n++) await addAlert(e, n, ALL_SEEN);
  await addMissing(e, 200, 100);
  e.DB.statements = 0;
  e.DB.queries = 0;
  e.DB.queryLimit = 50;
  assert.deepEqual(await withIndex(LISTED(120, 300), () => runAlerts(e)), { sent: 30, deferred: 49, failed: 0, watched: 279 });
  assert.equal(e.outbox.length, 30);
  t.diagnostic(`alert job with 30 emails and quiet rows waiting: ${e.DB.statements} statements in ${e.DB.queries} D1 queries`);
  // Statements: the cleanup, the mark, the read, one claim per emailed signup, then the 5.
  assert.equal(e.DB.statements, 3 + 30 + 5);
  // Queries, as Cloudflare counts them: the cleanup, the mark, the read, 3 claim batches of 10, then 1 quiet batch.
  assert.equal(e.DB.queries, 3 + 3 + 1);
});

test('rows over the quiet cap are written on the following days, and then the writes stop', async () => {
  const e = alertEnv();
  await addMissing(e, 170);
  await withIndex(LISTED(), () => runAlerts(e));
  assert.equal(await countWritten(e), 165);
  assert.deepEqual(await seenAt(e, 165), { [FRAME]: 200, [SLIDE]: 300, [APEX]: 150 });
  assert.deepEqual(await seenAt(e, 166), { [FRAME]: 200, [SLIDE]: 300 });
  await withIndex(LISTED(), () => runAlerts(e));
  assert.equal(await countWritten(e), 170);
  e.DB.statements = 0;
  await withIndex(LISTED(), () => runAlerts(e));
  assert.equal(e.DB.statements, 3, 'nothing left to write, so no batch');
  assert.equal(e.outbox.length, 0);
});

test('a failed quiet batch leaves its rows as they were, keeps the emails counted, and tries again next day', async () => {
  const e = alertEnv();
  await addAlert(e, 1, ALL_SEEN);
  await addMissing(e, 40, 2);
  // 40 quiet rows make 2 statements; fail on the second, after the first has run.
  e.DB.failBatchAt = 1;
  e.DB.failBatchSkip = 1; // the claim batch for the one email comes first
  const { result, lines } = await captureLogs(() => withIndex(LISTED(120, 300), () => runAlerts(e)));
  assert.deepEqual(result, { sent: 1, deferred: 0, failed: 0, watched: 41 });
  assert.equal(await countWritten(e), 1, 'only the emailed signup');
  assert.equal((await seenAt(e, 1))[APEX], 120);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /batch failed/);
  assert.doesNotMatch(lines[0], /@/);
  await withIndex(LISTED(120, 300), () => runAlerts(e));
  assert.equal(await countWritten(e), 41);
  assert.equal(e.outbox.length, 1);
});

test('a re-baseline leaves estimates out of every signup, within the same query budget', async (t) => {
  const e = alertEnv({ rebaselined: false });
  const now = Date.now();
  await addMixed(e, 1000, now);
  const { runDaily } = await import('./src/index.js');
  e.DB.statements = 0;
  const { lines } = await captureLogs(() => withIndex(LISTED(180, 360, [APEX_ID]), () => runDaily(e, now)));
  assert.ok(lines.includes('Price alerts {"sent":0,"rebaselined":1000}'), lines.join('\n'));
  t.diagnostic(`re-baseline daily run of 1,000 signups with estimates: ${e.DB.statements} D1 queries`);
  assert.ok(e.DB.statements < 50, `${e.DB.statements} queries`);
  for (const row of await allSeen(e)) {
    const { [APEX]: _left, ...want } = MIXED_BUILDS[parseInt(row.token, 16) % MIXED_BUILDS.length][1];
    assert.deepEqual(JSON.parse(row.seen), want);
  }
});

test('the bump clears an estimate already stored, so its turning live is no false drop', async () => {
  const e = alertEnv({ rebaselined: false });
  // What production holds today: the mark from the last pause, and an estimate stored as a last reported price.
  e.DB.exec("INSERT INTO meta (key, value) VALUES ('rebaseline', '2026-10-26-pause')");
  await addAlert(e, 1, ALL_SEEN);
  assert.deepEqual(await withIndex(LISTED(150, 300, [APEX_ID]), () => runAlerts(e)), { sent: 0, rebaselined: 1 });
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [SLIDE]: 300 });
  assert.equal((await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first()).value, REBASELINE);
  // Live at $120, $30 under the old estimate: not a drop anyone is told about.
  assert.deepEqual(await withIndex(LISTED(120), () => runAlerts(e)), { ...QUIET, watched: 1 });
  assert.equal(e.outbox.length, 0);
  assert.equal((await seenAt(e, 1))[APEX], 120);
  // A real drop from there is.
  assert.equal((await withIndex(LISTED(90), () => runAlerts(e))).sent, 1);
  assert.ok(e.outbox[0].text.includes('  Apex trigger: $120.00 -> $90.00\n'));
});

test('old rows without keys, under old platform ids, don\'t crash and gain only what is missing', async () => {
  const e = alertEnv();
  await addAlert(e, 1, {});
  await addAlert(e, 2, { 'glock19/g19-frame-g5': 200, 'glock19/g-fcg-apex5': 150 });
  await addAlert(e, 3, ALL_SEEN, []);
  assert.deepEqual(await withIndex(LISTED(100, 300, [APEX_ID]), () => runAlerts(e)), { ...QUIET, watched: 3 });
  assert.equal(e.outbox.length, 0);
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [SLIDE]: 300 });
  assert.deepEqual(await seenAt(e, 2), { 'glock19/g19-frame-g5': 200, 'glock19/g-fcg-apex5': 150, [SLIDE]: 300 });
  assert.deepEqual(await seenAt(e, 3), ALL_SEEN);
});

test('an index with no usable estimates list behaves as before: no quiet writes, and every price counts as live', async () => {
  for (const extra of [{}, { estimates: null }, { estimates: 'g-fcg-apex5' }]) {
    const label = JSON.stringify(extra);
    const index = { platforms: { glock9: { ...ALERT_INDEX(120).platforms.glock9, ...extra } } };
    const e = alertEnv();
    await addAlert(e, 1, {});
    await addAlert(e, 2, ALL_SEEN);
    e.DB.statements = 0;
    assert.equal((await withIndex(index, () => runAlerts(e))).sent, 1, label);
    assert.equal(e.DB.statements, 4, label);
    assert.deepEqual(await seenAt(e, 1), {}, label);
    assert.equal((await seenAt(e, 2))[APEX], 120, label);
    const put = await withIndex(index, () => call(e, 'PUT', `/api/alerts/${tokenOf(1)}`, { builds: [G19] }));
    assert.equal(put.status, 200, label);
    assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [APEX]: 120, [SLIDE]: 300 }, label);
  }
});

const NO_INDEX = [async () => { throw new Error('offline'); }, async () => new Response('nope', { status: 503 })];
/** LISTED without one part, as when its last price has gone from the index. */
const WITHOUT = (id, ...prices) => {
  const { platforms: { glock9 } } = LISTED(...prices);
  const { [id]: _gone, ...parts } = glock9.parts;
  return { platforms: { glock9: { ...glock9, parts } } };
};

test('a PUT that can\'t read the index keeps the stored prices, and a later real drop emails', async () => {
  for (const fake of NO_INDEX) {
    const e = alertEnv();
    await addAlert(e, 1, ALL_SEEN);
    const put = await withFetch(fake, () => call(e, 'PUT', `/api/alerts/${tokenOf(1)}`, { builds: [G19] }));
    assert.equal(put.status, 200);
    assert.deepEqual(await seenAt(e, 1), ALL_SEEN);
    assert.equal((await withIndex(LISTED(120), () => runAlerts(e))).sent, 1);
    assert.ok(e.outbox[0].text.includes('  Apex trigger: $150.00 -> $120.00\n'));
  }
});

test('a PUT that can\'t read the index still keeps only parts in the builds', async () => {
  for (const fake of NO_INDEX) {
    const e = alertEnv();
    await addAlert(e, 1, ALL_SEEN);
    await withFetch(fake, () => call(e, 'PUT', `/api/alerts/${tokenOf(1)}`, { builds: [{ ...G19, parts: ['g19-frame-g5', 'g-new-part'] }] }));
    assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200 });
  }
});

test('a held price survives its part leaving the index, and the drop emails when the part comes back lower', async () => {
  const e = alertEnv();
  await addAlert(e, 1, ALL_SEEN);
  // The apex is gone; the slide's drop sends an email, which rewrites `seen`.
  assert.equal((await withIndex(WITHOUT(APEX_ID, 150, 200), () => runAlerts(e))).sent, 1);
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [APEX]: 150, [SLIDE]: 200 });
  // So does a PUT made while it's gone.
  await withIndex(WITHOUT(APEX_ID, 150, 200), () => call(e, 'PUT', `/api/alerts/${tokenOf(1)}`, { builds: [G19] }));
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [APEX]: 150, [SLIDE]: 200 });
  assert.equal((await withIndex(LISTED(120, 200), () => runAlerts(e))).sent, 1);
  assert.ok(e.outbox[1].text.includes('  Apex trigger: $150.00 -> $120.00\n'));
  assert.equal((await seenAt(e, 1))[APEX], 120);
});

test('a price for a part no longer in the builds goes when `seen` is rewritten, even if the part left the index too', async () => {
  const e = alertEnv();
  await addAlert(e, 1, ALL_SEEN, [{ ...G19, parts: ['g19-frame-g5', SLIDE_ID] }]);
  assert.equal((await withIndex(WITHOUT(APEX_ID, 150, 200), () => runAlerts(e))).sent, 1);
  assert.deepEqual(await seenAt(e, 1), { [FRAME]: 200, [SLIDE]: 200 });
});

test('a daily run reads each platform\'s estimates list a fixed number of times, however many signups it has', async () => {
  const readsFor = async (signups, options) => {
    let reads = 0;
    const { platforms: { glock9 } } = LISTED();
    const { estimates: _list, ...rest } = glock9;
    const index = { platforms: { glock9: { ...rest, get estimates() { reads++; return []; } } } };
    const e = alertEnv(options);
    await addMissing(e, signups);
    await withFetch(async () => ({ ok: true, json: async () => index }), () => runAlerts(e));
    return reads;
  };
  assert.equal(await readsFor(6), await readsFor(1));
  assert.equal(await readsFor(6, { rebaselined: false }), await readsFor(1, { rebaselined: false }));
});

/* ------------------------------------------------- batch 3, W1: the alert run's budget, and never emailing twice */

import { alertKey } from './src/alerts.js';

/** Cloudflare's free plan, per Worker invocation. */
const QUERY_LIMIT = 50;
const SUBREQUEST_LIMIT = 50;
/** The cautious reading of Cloudflare's pages: D1 queries and fetch calls together, out of one 50. */
const COMBINED_LIMIT = 50;

/** Resend's two kinds of 429, as its documentation gives them: the error's name is the only difference. */
const QUOTA_429 = (name = 'daily_quota_exceeded') => ({ status: 429, body: JSON.stringify({ statusCode: 429, name, message: 'Quota used up, to victim@example.com' }) });
const RATE_429 = (retryAfter) => ({ status: 429, body: JSON.stringify({ statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests, to victim@example.com' }), headers: retryAfter === undefined ? {} : { 'retry-after': String(retryAfter) } });

/**
 * Stands in for the network: answers the price index and plays Resend. `subrequests` counts every call as
 * Cloudflare counts fetches, and with `limit` set every call past it throws; `pool` is the counter shared with the
 * fake D1 (see `fakeD1`). `resend(send, n)` gives the status Resend answers the n-th email request with, or
 * { status, body, headers } to set the answer's body and headers too (or throws, for a network error); `sends`
 * holds every request made and `accepted` the ones answered 2xx. `fetch` replaces globalThis.fetch; `hook` is the
 * same thing as env.sendEmail.
 */
const network = (index, { limit, pool, resend = () => 200 } = {}) => {
  const net = { subrequests: 0, sends: [], accepted: [] };
  const count = () => {
    net.subrequests++;
    if (limit !== undefined && net.subrequests > limit) throw new Error('Too many subrequests.');
    if (pool && ++pool.used > pool.limit) throw new Error('Too many subrequests (D1 queries and fetch calls together).');
  };
  const deliver = async (message, headers, signal) => {
    count();
    const send = { to: message.to[0], key: headers?.['Idempotency-Key'], headers, message, signal };
    net.sends.push(send);
    const answer = await resend(send, net.sends.length - 1);
    const out = typeof answer === 'number' ? { status: answer } : answer;
    if (out.status < 300) net.accepted.push(send);
    return out;
  };
  net.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) {
      const { status, body = '{"message":"to victim@example.com"}', headers = {} } = await deliver(JSON.parse(init.body), init.headers, init.signal);
      return new Response(body, { status, headers });
    }
    count();
    return new Response(JSON.stringify(index));
  };
  net.hook = async (message, headers) => {
    const { status } = await deliver(message, headers);
    if (status >= 300) throw Object.assign(new Error(`Resend ${status}`), { status });
  };
  return net;
};
/** alertEnv without the sendEmail hook, so emails go through fetch as they do in production. */
const liveEnv = (options) => { const e = alertEnv(options); delete e.sendEmail; return e; };
const tokenFor = (label) => createHash('sha256').update(`token ${label}`).digest('hex').slice(0, 32);
const RANGE = { ...G19, name: 'Range G19', parts: [APEX_ID] };
/** A confirmed signup with a move waiting under LISTED(120): the apex was last reported at $150. */
const addRow = (e, label, email, { created, sent = null, seen = ALL_SEEN, builds = [G19] }) =>
  e.DB.prepare('INSERT INTO alerts (token, email, builds, seen, confirmed, created_at, ip_hash, last_sent_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
    .bind(tokenFor(label), email, JSON.stringify(builds), JSON.stringify(seen), created, '', sent).run();
const rowOf = async (e, label) => {
  const row = await e.DB.prepare('SELECT seen, last_sent_at FROM alerts WHERE token = ?').bind(tokenFor(label)).first();
  return { seen: JSON.parse(row.seen), sent: row.last_sent_at };
};
const CLAIMED = { [FRAME]: 200, [APEX]: 120, [SLIDE]: 300 };
const T0 = Date.UTC(2026, 10, 12, 11);
const pad = (n) => String(n).padStart(3, '0');
/**
 * One invocation: the D1 and subrequest counters start from zero, with all three free-plan limits on (D1 queries,
 * fetch calls, and the two together). `net.pool.used` is the combined count.
 */
const invocation = (e, index, options = {}) => {
  e.DB.queries = 0;
  e.DB.queryLimit = QUERY_LIMIT;
  e.DB.pool = { used: 0, limit: COMBINED_LIMIT };
  return Object.assign(network(index, { limit: SUBREQUEST_LIMIT, pool: e.DB.pool, ...options }), { pool: e.DB.pool });
};
/** The invocation is over: what a test reads from the database afterwards counts against nothing. */
const afterRun = (e) => { e.DB.queryLimit = undefined; e.DB.pool = undefined; };
/** A row exactly as stored, to check a put-back byte for byte. */
const rawRow = (e, label) => e.DB.prepare('SELECT seen, last_sent_at FROM alerts WHERE token = ?').bind(tokenFor(label)).first();
const noSecrets = (lines) => { for (const line of lines) { assert.doesNotMatch(line, /@/); assert.doesNotMatch(line, /[a-f0-9]{32}/); } };

/**
 * 200 addresses that each have a move, 20 of them with two rows. The address strings sort in the opposite order
 * to how long each has waited, `aaa@example.com` signed up last, and one address's second row has waited longer
 * than anyone. Returns the addresses in the order they should be emailed: longest-waiting first.
 */
async function seedMovers(e, now) {
  const base = now - 20 * DAY;
  const people = [];
  for (let i = 0; i < 199; i++) {
    const email = `m${pad(198 - i)}@example.com`;
    await addRow(e, `m${i}`, email, { created: base + i * 1000 });
    let key = base + i * 1000;
    if (i % 10 === 0) await addRow(e, `m${i}b`, email, { created: base + i * 1000 + 500, seen: { [APEX]: 150 }, builds: [RANGE] });
    if (i === 150) { key = base - 5000; await addRow(e, 'm150old', email, { created: key, seen: { [APEX]: 150 }, builds: [RANGE] }); }
    people.push({ email, key });
  }
  await addRow(e, 'aaa', 'aaa@example.com', { created: base + 300_000 });
  people.push({ email: 'aaa@example.com', key: base + 300_000 });
  return people.sort((a, b) => a.key - b.key).map((p) => p.email);
}

/** Runs the Worker's scheduled handler for one cron value (or none), waits for what it returns, and returns the log lines. */
const cron = async (e, value, fake) => {
  const { default: worker } = await import('./src/index.js');
  const { lines } = await captureLogs(() => withFetch(fake, () => worker.scheduled(value === undefined ? {} : { cron: value }, e, { waitUntil: () => {} })));
  return lines;
};
const countsIn = (lines, job) => JSON.parse(lines.find((l) => l.startsWith(`${job} {`)).slice(job.length + 1));

test('a full day stays inside the free plan: 30 alert emails in one run, the digest and the cleanup in the other', async (t) => {
  const e = { ...liveEnv(), FEEDBACK_EMAIL: 'owner@example.com' };
  const now = Date.now();
  const order = await seedMovers(e, now);
  await addMissing(e, 1000);
  for (let i = 0; i < 150; i++) await addFeedback(e, now - 3_600_000 + i, null, `n${i}`);
  await seedRetention(e, now);
  const index = LISTED(120, 300);

  // 11:00 UTC: price alerts only.
  const first = invocation(e, index);
  const cpu = process.cpuUsage();
  const alertLines = await cron(e, '0 11 * * *', first.fetch);
  const used = process.cpuUsage(cpu);
  t.diagnostic(`11:00 run: ${e.DB.queries} D1 queries, ${first.subrequests} fetch calls, ${first.pool.used} together, ${((used.user + used.system) / 1000).toFixed(1)} ms CPU in Node (not workerd; not asserted)`);
  assert.equal(alertLines.length, 1, alertLines.join('\n'));
  assert.deepEqual(countsIn(alertLines, 'Price alerts'), { sent: 30, deferred: 170, failed: 0, watched: 1224 });
  // The cleanup, the mark, the read, 3 claim batches and the quiet batch; the price index and 30 sends.
  assert.equal(e.DB.queries, 3 + 3 + 1);
  assert.equal(first.subrequests, 1 + 30);
  assert.equal(first.pool.used, 38);
  afterRun(e);
  assert.deepEqual(first.accepted.map((s) => s.to), order.slice(0, 30));
  // Every mover's row already holds an apex price (221 rows); 165 of the 1,000 quiet rows gain theirs.
  assert.equal(await countWritten(e), 221 + 165, 'the quiet rows still get their prices');
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE emailed_at IS NULL').first()).n, 152, 'no digest in this run');

  // 11:30 UTC: the feedback digest and retention only.
  const second = invocation(e, index);
  const otherLines = await cron(e, '30 11 * * *', second.fetch);
  t.diagnostic(`11:30 run: ${e.DB.queries} D1 queries, ${second.subrequests} fetch calls, ${second.pool.used} together`);
  assert.equal(otherLines.length, 2, otherLines.join('\n'));
  assert.deepEqual(countsIn(otherLines, 'Feedback'), { sent: 1, messages: 152 });
  assert.deepEqual(countsIn(otherLines, 'Retention'), { live: true, ...EXPECTED_COUNTS });
  // The feedback read and its mark, and retention's one batch; the digest.
  assert.equal(e.DB.queries, 2 + 1);
  assert.equal(second.subrequests, 1);
  assert.equal(second.pool.used, 4);
  afterRun(e);
  assert.deepEqual(second.accepted.map((s) => s.to), ['owner@example.com']);
  noSecrets([...alertLines, ...otherLines]);
});

/**
 * The alert run's worst case: 35 addresses with a move (5 over the cap) and 10 quiet rows. One send in each chunk
 * of 10 is refused, so each chunk needs a revert, and every other send is answered 503.
 */
const seedWorstCase = async (e) => {
  for (let i = 0; i < 35; i++) await addRow(e, `w${i}`, `w${pad(i)}@example.com`, { created: T0 - 5 * DAY + i });
  await addMissing(e, 10);
};
const worstCaseResend = (send) => (send.to === 'owner@example.com' ? 200 : /w0[012]5@/.test(send.to) ? 422 : 503);

test('the worst case the header comment works out: 35 fetch calls and 10 D1 queries, 45 together, with all three limits on', async () => {
  const e = liveEnv();
  await seedWorstCase(e);
  const net = invocation(e, LISTED(120), { resend: worstCaseResend });
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 0, deferred: 5, failed: 3, unconfirmed: 27, watched: 45 });
  assert.equal(net.subrequests, 1 + 30 + 4);
  assert.equal(e.DB.queries, 3 + 3 + 3 + 1);
  assert.equal(net.pool.used, 45);
  assert.equal(lines.length, 0);
});

test('all three daily jobs in one invocation, at the alert run\'s worst case: 36 fetch calls and 13 D1 queries, 49 together, with all three limits on', async () => {
  const e = { ...liveEnv(), FEEDBACK_EMAIL: 'owner@example.com' };
  await seedWorstCase(e);
  await addFeedback(e, T0 - 3_600_000, null, 'n0');
  await seedRetention(e, T0);
  const net = invocation(e, LISTED(120), { resend: worstCaseResend });
  // A cron value the handler doesn't know runs everything.
  const lines = await cron(e, '0 12 * * *', net.fetch);
  const used = { queries: e.DB.queries, fetches: net.subrequests, together: net.pool.used };
  afterRun(e);
  assert.equal(lines.length, 3, lines.join('\n'));
  assert.ok(!lines.some((l) => /failed:/.test(l)), lines.join('\n'));
  const { watched, ...alerts } = countsIn(lines, 'Price alerts');
  assert.deepEqual(alerts, { sent: 0, deferred: 5, failed: 3, unconfirmed: 27 });
  assert.ok(watched >= 45);
  assert.equal(countsIn(lines, 'Feedback').sent, 1);
  assert.equal(countsIn(lines, 'Retention').live, true);
  // The alert run's 35 and 10, plus the digest (1 fetch call, 2 queries) and retention (1 query).
  assert.deepEqual(used, { queries: 10 + 2 + 1, fetches: 35 + 1, together: 49 });
  noSecrets(lines);
});

test('seven days of the same 200 moves email every address exactly once, longest-waiting first', async () => {
  const e = liveEnv();
  const order = await seedMovers(e, T0);
  assert.equal(order.at(-1), 'aaa@example.com', 'signed up last, so served last, however its address sorts');
  assert.equal(order[0], 'm048@example.com', 'placed by the row that has waited longest');
  const emailed = [];
  // 30 a day for six days, and the last 20 on the seventh.
  for (let day = 0; day < 7; day++) {
    const net = invocation(e, LISTED(120, 300));
    const result = await withFetch(net.fetch, () => runAlerts(e, T0 + day * DAY));
    const sent = day < 6 ? 30 : 20;
    assert.deepEqual(result, { sent, deferred: 200 - 30 * day - sent, failed: 0, watched: 221 }, `day ${day + 1}`);
    assert.equal(net.sends.length, sent);
    emailed.push(...net.accepted.map((s) => s.to));
  }
  assert.deepEqual(emailed, order);
  assert.equal(new Set(emailed).size, 200);
  // Nothing new moved, so the eighth day emails nobody.
  const net = invocation(e, LISTED(120, 300));
  assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0 + 7 * DAY)), { sent: 0, deferred: 0, failed: 0, watched: 221 });
  assert.equal(net.sends.length, 0);
});

test('addresses that have waited equally long go in token order, never in address order', async () => {
  const e = liveEnv();
  const labels = ['t0', 't1', 't2', 't3', 't4', 't5'];
  for (const [i, label] of labels.entries()) await addRow(e, label, `z${5 - i}@example.com`, { created: T0 - DAY });
  const net = invocation(e, LISTED(120));
  await withFetch(net.fetch, () => runAlerts(e, T0));
  const want = [...labels].sort((a, b) => (tokenFor(a) < tokenFor(b) ? -1 : 1)).map((label) => `z${5 - labels.indexOf(label)}@example.com`);
  assert.deepEqual(net.accepted.map((s) => s.to), want);
});

test('a run whose sends all fail after the claim emails nobody about that change again, and says unconfirmed', async () => {
  const e = liveEnv();
  for (let i = 0; i < 8; i++) await addRow(e, `c${i}`, `c${i}@example.com`, { created: T0 - 5 * DAY + i });
  const down = invocation(e, LISTED(120), { resend: () => { throw new TypeError('fetch failed for c0@example.com'); } });
  const { result, lines } = await captureLogs(() => withFetch(down.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 0, deferred: 0, failed: 0, unconfirmed: 8, watched: 8 });
  // Each send once, and a second try for the first 4 only.
  assert.equal(down.sends.length, 8 + 4);
  noSecrets(lines);
  for (let i = 0; i < 8; i++) assert.deepEqual(await rowOf(e, `c${i}`), { seen: CLAIMED, sent: T0 }, 'the claim stays');
  // Day 2, with the network back: the same change is not sent, because any of them may already have it.
  const up = invocation(e, LISTED(120));
  assert.deepEqual(await withFetch(up.fetch, () => runAlerts(e, T0 + DAY)), { sent: 0, deferred: 0, failed: 0, watched: 8 });
  assert.equal(up.sends.length, 0);
});

test('a 429 that names a used-up quota puts that address back as it was, stops the run at once, and the address is emailed exactly once the next day', async () => {
  const e = liveEnv();
  const before = T0 - 6 * DAY;
  for (let i = 0; i < 25; i++) {
    const email = `r${pad(i)}@example.com`;
    if (i === 2) {
      // Emailed 6 days ago, about two signups.
      await addRow(e, 'r2', email, { created: T0 - 30 * DAY, sent: before });
      await addRow(e, 'r2b', email, { created: T0 - 29 * DAY, sent: before, seen: { [APEX]: 150 }, builds: [RANGE] });
    } else await addRow(e, `r${i}`, email, { created: i < 2 ? T0 - 8 * DAY + i : T0 - 5 * DAY + i });
  }
  const limited = invocation(e, LISTED(120), { resend: (send) => (send.to === 'r002@example.com' ? QUOTA_429() : 200) });
  const { result, lines } = await captureLogs(() => withFetch(limited.fetch, () => runAlerts(e, T0)));
  // Two went, the third was refused, and the other 22 wait: 7 already claimed in that chunk, 15 in later chunks.
  assert.deepEqual(result, { sent: 2, deferred: 22, failed: 1, watched: 26 });
  assert.deepEqual(limited.sends.map((s) => s.to), ['r000@example.com', 'r001@example.com', 'r002@example.com'], 'no retry');
  assert.equal(e.DB.queries, 3 + 1 + 1, 'one claim batch and one revert batch');
  assert.equal(lines.length, 0);
  assert.deepEqual(await rowOf(e, 'r0'), { seen: CLAIMED, sent: T0 });
  assert.deepEqual(await rowOf(e, 'r2'), { seen: ALL_SEEN, sent: before });
  assert.deepEqual(await rowOf(e, 'r2b'), { seen: { [APEX]: 150 }, sent: before });
  assert.deepEqual(await rowOf(e, 'r3'), { seen: ALL_SEEN, sent: null }, 'claimed in the same chunk, never sent, put back');
  assert.deepEqual(await rowOf(e, 'r15'), { seen: ALL_SEEN, sent: null }, 'a later chunk, never claimed');
  // Day 2: everyone who waited is emailed once, the refused address included, with both its builds.
  const next = invocation(e, LISTED(120));
  assert.deepEqual(await withFetch(next.fetch, () => runAlerts(e, T0 + DAY)), { sent: 23, deferred: 0, failed: 0, watched: 26 });
  const again = next.accepted.filter((s) => s.to === 'r002@example.com');
  assert.equal(again.length, 1);
  assert.equal(again[0].message.subject, 'Price drop on 2 of your builds');
  assert.equal(next.accepted.filter((s) => s.to === 'r000@example.com').length, 0);
  assert.deepEqual(await rowOf(e, 'r2'), { seen: CLAIMED, sent: T0 + DAY });
});

test('a 5xx is retried once with the same Idempotency-Key and counted as sent once', async () => {
  const e = liveEnv();
  await addRow(e, 'x', 'x@example.com', { created: T0 - DAY });
  const net = invocation(e, LISTED(120), { resend: (_send, n) => (n === 0 ? 503 : 200) });
  assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0)), { sent: 1, deferred: 0, failed: 0, watched: 1 });
  assert.equal(net.sends.length, 2);
  assert.equal(net.accepted.length, 1);
  assert.match(net.sends[0].key, /^alert-[a-f0-9]{32}-2026-11-12$/);
  assert.equal(net.sends[1].key, net.sends[0].key);
  assert.deepEqual(net.sends[1].message, net.sends[0].message);
  assert.deepEqual(await rowOf(e, 'x'), { seen: CLAIMED, sent: T0 });
});

test('at most 4 retries in a run, and a send that stays unclear keeps its claim', async () => {
  const e = liveEnv();
  for (let i = 0; i < 10; i++) await addRow(e, `u${i}`, `u${i}@example.com`, { created: T0 - 5 * DAY + i });
  const net = invocation(e, LISTED(120), { resend: () => 500 });
  assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0)), { sent: 0, deferred: 0, failed: 0, unconfirmed: 10, watched: 10 });
  assert.equal(net.sends.length, 10 + 4);
  assert.deepEqual(net.sends.map((s) => s.to).filter((to) => to === 'u0@example.com').length, 2);
  assert.deepEqual(net.sends.map((s) => s.to).filter((to) => to === 'u3@example.com').length, 2);
  assert.deepEqual(net.sends.map((s) => s.to).filter((to) => to === 'u4@example.com').length, 1);
  assert.deepEqual(net.sends.map((s) => s.to).filter((to) => to === 'u6@example.com').length, 1);
  for (let i = 0; i < 10; i++) assert.deepEqual(await rowOf(e, `u${i}`), { seen: CLAIMED, sent: T0 });
  const next = invocation(e, LISTED(120));
  assert.equal((await withFetch(next.fetch, () => runAlerts(e, T0 + DAY))).sent, 0);
  assert.equal(next.sends.length, 0);
});

test('after an unclear first try only an accepted retry settles it; a 409 is never retried; both keep the claim', async () => {
  // 503, then 422 on the retry: the 422 says nothing about whether the first request sent the email.
  const e = liveEnv();
  await addRow(e, 'x', 'x@example.com', { created: T0 - DAY });
  const net = invocation(e, LISTED(120), { resend: (_send, n) => (n === 0 ? 503 : 422) });
  assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0)), { sent: 0, deferred: 0, failed: 0, unconfirmed: 1, watched: 1 });
  assert.equal(net.sends.length, 2);
  assert.deepEqual(await rowOf(e, 'x'), { seen: CLAIMED, sent: T0 });
  // 409: Resend has already had a request with this key today.
  const f = liveEnv();
  await addRow(f, 'x', 'x@example.com', { created: T0 - DAY });
  await addRow(f, 'y', 'y@example.com', { created: T0 - DAY + 1 });
  const conflict = invocation(f, LISTED(120), { resend: (send) => (send.to === 'x@example.com' ? 409 : 200) });
  assert.deepEqual(await withFetch(conflict.fetch, () => runAlerts(f, T0)), { sent: 1, deferred: 0, failed: 0, unconfirmed: 1, watched: 2 });
  assert.equal(conflict.sends.length, 2);
  assert.deepEqual(await rowOf(f, 'x'), { seen: CLAIMED, sent: T0 });
});

test('a refused send (4xx) is put back and tried the next day; the others in its chunk are sent', async () => {
  const e = liveEnv();
  for (let i = 0; i < 3; i++) await addRow(e, `v${i}`, `v${i}@example.com`, { created: T0 - 5 * DAY + i });
  const net = invocation(e, LISTED(120), { resend: (send) => (send.to === 'v1@example.com' ? 422 : 200) });
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 2, deferred: 0, failed: 1, watched: 3 });
  assert.equal(net.sends.length, 3, 'a refusal is not retried');
  assert.equal(lines.length, 0);
  // The change is still waiting; the try is recorded, so the address goes to the back of the line.
  assert.deepEqual(await rowOf(e, 'v1'), { seen: ALL_SEEN, sent: T0 });
  const next = invocation(e, LISTED(120));
  assert.deepEqual(await withFetch(next.fetch, () => runAlerts(e, T0 + DAY)), { sent: 1, deferred: 0, failed: 0, watched: 3 });
  assert.deepEqual(next.accepted.map((s) => s.to), ['v1@example.com']);
});

test('addresses Resend always refuses go to the back of the line and never hold up the rest', async () => {
  const e = liveEnv();
  for (let i = 0; i < 30; i++) await addRow(e, `bad${i}`, `bad${pad(i)}@example.com`, { created: T0 - 5 * DAY + i });
  for (let i = 0; i < 20; i++) await addRow(e, `good${i}`, `good${pad(i)}@example.com`, { created: T0 - 4 * DAY + i });
  const resend = (send) => (send.to.startsWith('bad') ? 422 : 200);
  // Day 1: the 30 that signed up first fill the run, and every one is refused.
  const one = invocation(e, LISTED(120), { resend });
  const first = await captureLogs(() => withFetch(one.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(first.result, { sent: 0, deferred: 20, failed: 30, watched: 50 });
  assert.equal(one.sends.length, 30);
  assert.equal(e.DB.queries, 3 + 3 + 3);
  assert.equal(first.lines.length, 0);
  afterRun(e); // the checks below are not part of the run
  for (let i = 0; i < 30; i++) assert.deepEqual(await rowOf(e, `bad${i}`), { seen: ALL_SEEN, sent: T0 }, 'the change still waits; the try is recorded');
  // Day 2: the 20 good addresses go first and are all emailed; only then are refused ones tried again.
  const two = invocation(e, LISTED(120), { resend });
  assert.deepEqual(await withFetch(two.fetch, () => runAlerts(e, T0 + DAY)), { sent: 20, deferred: 20, failed: 10, watched: 50 });
  assert.deepEqual(two.sends.slice(0, 20).map((s) => s.to), Array.from({ length: 20 }, (_, i) => `good${pad(i)}@example.com`));
  assert.deepEqual(two.accepted.map((s) => s.to), two.sends.slice(0, 20).map((s) => s.to));
  // Day 3: nothing new for the good ones; the refused ones take turns, the ones tried longest ago first.
  const three = invocation(e, LISTED(120), { resend });
  assert.deepEqual(await withFetch(three.fetch, () => runAlerts(e, T0 + 2 * DAY)), { sent: 0, deferred: 0, failed: 30, watched: 50 });
  const triedOnDayTwo = new Set(two.sends.slice(20).map((s) => s.to));
  assert.equal(triedOnDayTwo.size, 10);
  for (const s of three.sends.slice(0, 20)) assert.ok(!triedOnDayTwo.has(s.to), 'not tried since day 1, so before the ones tried on day 2');
  for (const s of three.sends.slice(20)) assert.ok(triedOnDayTwo.has(s.to));
});

test('an error from before the request was made puts the address back whole, so it keeps its place', async () => {
  const e = alertEnv();
  await addRow(e, 'p0', 'p0@example.com', { created: T0 - 3 * DAY });
  await addRow(e, 'p1', 'p1@example.com', { created: T0 - 2 * DAY });
  e.sendEmail = async (m) => { if (m.to[0] === 'p0@example.com') throw new Error('never left for p0@example.com'); e.outbox.push(m); };
  const { result, lines } = await captureLogs(() => withIndex(LISTED(120), () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 1, deferred: 0, failed: 1, watched: 2 });
  assert.equal(lines.length, 0);
  assert.deepEqual(await rowOf(e, 'p0'), { seen: ALL_SEEN, sent: null });
  assert.deepEqual(await rowOf(e, 'p1'), { seen: CLAIMED, sent: T0 });
});

test('the run waits 120 ms between one email request and the next, and never after the last', async () => {
  const run = async (addresses, resend) => {
    const e = liveEnv();
    for (let i = 0; i < addresses; i++) await addRow(e, `q${i}`, `q${i}@example.com`, { created: T0 - 5 * DAY + i });
    await addMissing(e, 3);
    const events = [];
    e.pause = async (ms) => { events.push(`pause ${ms}`); };
    const net = invocation(e, LISTED(120), { resend: (send, n) => { events.push('send'); return resend(send, n); } });
    const result = await withFetch(net.fetch, () => runAlerts(e, T0));
    return { events, result };
  };
  // Three addresses, the second needing a retry: four requests, a wait before each but the first.
  const busy = await run(3, (_send, n) => (n === 1 ? 503 : 200));
  assert.equal(busy.result.sent, 3);
  assert.deepEqual(busy.events, ['send', 'pause 120', 'send', 'pause 120', 'send', 'pause 120', 'send']);
  // Across chunks too: 12 addresses, 11 waits.
  const two = await run(12, () => 200);
  assert.equal(two.events.filter((x) => x === 'send').length, 12);
  assert.equal(two.events.filter((x) => x === 'pause 120').length, 11);
  assert.equal(two.events.at(-1), 'send');
  // One email, or none: no wait at all.
  assert.deepEqual((await run(1, () => 200)).events, ['send']);
  assert.deepEqual((await run(0, () => 200)).events, []);
  // Without env.pause the wait is a real timer.
  const e = liveEnv();
  delete e.pause;
  for (let i = 0; i < 2; i++) await addRow(e, `q${i}`, `q${i}@example.com`, { created: T0 - 5 * DAY + i });
  const net = invocation(e, LISTED(120));
  const started = performance.now();
  assert.equal((await withFetch(net.fetch, () => runAlerts(e, T0))).sent, 2);
  assert.ok(performance.now() - started >= 100, 'one real wait of about 120 ms');
});

test('an alert email request that times out is unclear: one retry with the same key, then unconfirmed, claim kept', async () => {
  const e = liveEnv();
  await addRow(e, 'x', 'x@example.com', { created: T0 - DAY });
  const hung = invocation(e, LISTED(120), { resend: () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); } });
  const { result, lines } = await captureLogs(() => withFetch(hung.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 0, deferred: 0, failed: 0, unconfirmed: 1, watched: 1 });
  assert.equal(lines.length, 0);
  assert.equal(hung.sends.length, 2);
  assert.equal(hung.sends[1].key, hung.sends[0].key);
  // Each request carries its own time limit.
  for (const s of hung.sends) assert.ok(s.signal instanceof AbortSignal);
  assert.notEqual(hung.sends[0].signal, hung.sends[1].signal);
  assert.deepEqual(await rowOf(e, 'x'), { seen: CLAIMED, sent: T0 });
  // A runtime without AbortSignal.timeout still sends, with no limit.
  const f = liveEnv();
  await addRow(f, 'x', 'x@example.com', { created: T0 - DAY });
  const plain = invocation(f, LISTED(120));
  const real = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    assert.equal((await withFetch(plain.fetch, () => runAlerts(f, T0))).sent, 1);
  } finally {
    AbortSignal.timeout = real;
  }
  assert.equal(plain.sends[0].signal, undefined);
});

test('a claim batch that fails sends nothing for its chunk, puts nothing back, and ends the run cleanly', async () => {
  const seed = async () => {
    const e = liveEnv();
    for (let i = 0; i < 15; i++) await addRow(e, `k${i}`, `k${pad(i)}@example.com`, { created: T0 - 5 * DAY + i });
    return e;
  };
  // The second chunk's claim fails: the first 10 are emailed, the other 5 wait.
  const e = await seed();
  e.DB.failBatchAt = 0;
  e.DB.failBatchSkip = 1;
  const net = invocation(e, LISTED(120));
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 10, deferred: 5, failed: 0, watched: 15 });
  assert.equal(net.sends.length, 10);
  assert.deepEqual(lines, ['Alert claim failed: Error: D1_ERROR: batch failed']);
  assert.equal(e.DB.queries, 3 + 2, 'two claim batches, no revert');
  assert.deepEqual(await rowOf(e, 'k9'), { seen: CLAIMED, sent: T0 });
  for (let i = 10; i < 15; i++) assert.deepEqual(await rowOf(e, `k${i}`), { seen: ALL_SEEN, sent: null });
  // They go the next day.
  const next = invocation(e, LISTED(120));
  assert.deepEqual(await withFetch(next.fetch, () => runAlerts(e, T0 + DAY)), { sent: 5, deferred: 0, failed: 0, watched: 15 });
  // The first chunk's claim fails: nobody is emailed and no later chunk is tried.
  const f = await seed();
  f.DB.failBatchAt = 3;
  const none = invocation(f, LISTED(120));
  const failed = await captureLogs(() => withFetch(none.fetch, () => runAlerts(f, T0)));
  assert.deepEqual(failed.result, { sent: 0, deferred: 15, failed: 0, watched: 15 });
  assert.equal(none.sends.length, 0);
  assert.equal(f.DB.queries, 3 + 1);
  for (let i = 0; i < 15; i++) assert.deepEqual(await rowOf(f, `k${i}`), { seen: ALL_SEEN, sent: null });
});

test('putting a refused address back leaves alone a row that changed after the claim', async () => {
  const e = alertEnv();
  await addRow(e, 'g0', 'g0@example.com', { created: T0 - 9 * DAY });
  await addRow(e, 'g1', 'g1@example.com', { created: T0 - 8 * DAY });
  await addRow(e, 'g1b', 'g1@example.com', { created: T0 - 7 * DAY, seen: { [APEX]: 150 }, builds: [RANGE] });
  const elsewhere = T0 + 5000;
  // While the refused email is being sent, another run claims one of the address's two rows.
  const net = network(LISTED(120), {
    resend: async (send) => {
      if (send.to !== 'g1@example.com') return 200;
      await e.DB.prepare('UPDATE alerts SET last_sent_at = ? WHERE token = ?').bind(elsewhere, tokenFor('g1')).run();
      return 422;
    },
  });
  e.sendEmail = net.hook;
  assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0)), { sent: 1, deferred: 0, failed: 1, watched: 3 });
  assert.deepEqual(await rowOf(e, 'g1'), { seen: CLAIMED, sent: elsewhere }, 'not put back');
  assert.deepEqual(await rowOf(e, 'g1b'), { seen: { [APEX]: 150 }, sent: T0 }, 'put back');
  assert.deepEqual(await rowOf(e, 'g0'), { seen: CLAIMED, sent: T0 });
});

test('the Idempotency-Key names the address\'s alert and the UTC day, and never holds the token', async () => {
  const token = tokenFor('a');
  const key = await alertKey(token, T0);
  assert.equal(key, `alert-${createHash('sha256').update(token).digest('hex').slice(0, 32)}-2026-11-12`);
  assert.ok(!key.includes(token));
  assert.equal(await alertKey(token, Date.UTC(2026, 10, 12, 23, 59, 59, 999)), key, 'the same all day');
  assert.notEqual(await alertKey(token, Date.UTC(2026, 10, 13)), key, 'another UTC day');
  assert.notEqual(await alertKey(tokenFor('b'), T0), key, 'another address');
  // In a run: one key per address, built from its smallest token, on the request and through the test hook alike.
  for (const viaFetch of [true, false]) {
    const e = viaFetch ? liveEnv() : alertEnv();
    await addRow(e, 'a', 'a@example.com', { created: T0 - 3 * DAY });
    await addRow(e, 'a2', 'a@example.com', { created: T0 - 2 * DAY, seen: { [APEX]: 150 }, builds: [RANGE] });
    await addRow(e, 'b', 'b@example.com', { created: T0 - DAY });
    const net = network(LISTED(120));
    if (!viaFetch) e.sendEmail = net.hook;
    await withFetch(net.fetch, () => runAlerts(e, T0));
    const smallest = [tokenFor('a'), tokenFor('a2')].sort()[0];
    assert.deepEqual(net.sends.map((s) => s.key), [await alertKey(smallest, T0), await alertKey(tokenFor('b'), T0)]);
    for (const s of net.sends) for (const label of ['a', 'a2', 'b']) assert.ok(!s.key.includes(tokenFor(label)));
    if (viaFetch) assert.deepEqual(Object.keys(net.sends[0].headers).sort(), ['Idempotency-Key', 'authorization', 'content-type']);
  }
});

test('a confirmation email\'s request is as it was: no Idempotency-Key', async () => {
  const e = liveEnv();
  const net = network(ALERT_INDEX());
  const r = await withFetch(net.fetch, () => call(e, 'POST', '/api/alerts', { email: 'new@example.com', builds: [G19] }));
  assert.equal(r.status, 201);
  assert.equal(net.sends.length, 1);
  assert.deepEqual(net.sends[0].headers, { authorization: 'Bearer k', 'content-type': 'application/json' });
  assert.equal(net.sends[0].signal, undefined, 'and no timeout');
  assert.deepEqual(Object.keys(net.sends[0].message).sort(), ['from', 'headers', 'html', 'subject', 'text', 'to']);
});

test('the 11:00 cron runs only price alerts, the 11:30 cron only the digest and retention, anything else all three', async () => {
  const jobsRun = async (value) => {
    const e = alertEnv();
    const lines = await cron(e, value, async () => new Response(JSON.stringify(ALERT_INDEX())));
    noSecrets(lines);
    return lines.map((l) => l.slice(0, l.indexOf(' {'))).sort();
  };
  assert.deepEqual(await jobsRun('0 11 * * *'), ['Price alerts']);
  assert.deepEqual(await jobsRun('30 11 * * *'), ['Feedback', 'Retention']);
  for (const other of [undefined, '', '0 12 * * *', '* * * * *']) assert.deepEqual(await jobsRun(other), ['Feedback', 'Price alerts', 'Retention'], String(other));
  // The two crons the handler knows are the two wrangler.toml sets.
  const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^crons = \["0 11 \* \* \*", "30 11 \* \* \*"\]\r?$/m);
  assert.equal(toml.match(/^crons\b/gm).length, 1);
  const { CRON_JOBS } = await import('./src/index.js');
  assert.deepEqual(CRON_JOBS, { '0 11 * * *': ['Price alerts'], '30 11 * * *': ['Feedback', 'Retention'] });
});

test('a failed job in a split cron run is still logged by name, without addresses', async () => {
  const broken = () => ({ ...alertEnv(), DB: { prepare: () => { throw new TypeError('D1 lost row for me@example.com, token abc'); }, batch: () => { throw new TypeError('D1 lost row for me@example.com, token abc'); } } });
  const index = async () => new Response(JSON.stringify(ALERT_INDEX()));
  assert.deepEqual(await cron(broken(), '0 11 * * *', index), ['Price alerts failed: TypeError: D1 lost row for <address> token abc']);
  assert.deepEqual((await cron(broken(), '30 11 * * *', index)).sort(), ['Feedback {"sent":0,"skipped":"not set up"}', 'Retention failed: TypeError: D1 lost row for <address> token abc']);
});

test('one-click unsubscribe suppresses the address whether the mail app posts urlencoded or multipart', async () => {
  const e = alertEnv();
  const now = Date.now();
  const on = async (email, ip) => {
    const { body } = await signupAt(e, now - DAY, email, ip);
    assert.match(await (await pressConfirm(e, codeIn(e.outbox.at(-1)), now - DAY)).text(), /Price Alerts Are On/);
    return body.token;
  };
  const multipart = (token, fields) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return new Request(`https://share.example/alerts/stop?t=${token}`, { method: 'POST', body });
  };
  // Urlencoded, as before.
  const plain = await on('plain@example.com', '1.0.0.1');
  assert.equal((await oneClick(e, plain, now)).status, 204);
  assert.equal(await statusOf(e, plain), 404);
  assert.equal(await count(e, 'suppressed'), 1);
  // Multipart: the same answer, and the address is suppressed too.
  const multi = await on('multi@example.com', '2.0.0.1');
  const request = multipart(multi, { 'List-Unsubscribe': 'One-Click' });
  assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/);
  const res = await handle(request, e, now);
  assert.equal(res.status, 204);
  assert.equal(await statusOf(e, multi), 404);
  assert.equal(await count(e, 'suppressed'), 2);
  const before = e.outbox.length;
  assert.equal((await signupAt(e, now, 'multi@example.com', '2.0.0.2')).status, 201);
  assert.equal(e.outbox.length, before, 'no confirmation email for 90 days');
  // A multipart body with other fields is still treated like the site's Turn Off.
  const other = await on('other@example.com', '3.0.0.1');
  assert.equal((await handle(multipart(other, { 'List-Unsubscribe': 'Yes', from: 'pages' }), e, now)).status, 204);
  assert.equal(await statusOf(e, other), 404);
  assert.equal(await count(e, 'suppressed'), 2);
  // The Unsubscribe page's button, posted as multipart, gets its page and suppresses.
  const paged = await on('paged@example.com', '4.0.0.1');
  const pressed = await handle(multipart(paged, { from: 'page' }), e, now);
  assert.equal(pressed.status, 200);
  assert.match(await pressed.text(), /We won't send price alerts to this address unless it signs up again\./);
  assert.equal(await count(e, 'suppressed'), 3);
  // No body (Turn Off on the site), with or without a form content type: unsubscribed, not suppressed.
  for (const [i, headers] of [{}, { 'content-type': 'application/x-www-form-urlencoded' }, { 'content-type': 'multipart/form-data; boundary=x' }].entries()) {
    const site = await on(`site${i}@example.com`, `5.0.${i}.1`);
    assert.equal((await handle(new Request(`https://share.example/alerts/stop?t=${site}`, { method: 'POST', headers }), e, now)).status, 204);
    assert.equal(await statusOf(e, site), 404);
    assert.equal(await count(e, 'suppressed'), 3);
  }
  // A body that isn't the multipart its header claims is read as text, as before.
  const odd = await on('odd@example.com', '6.0.0.1');
  const broken = new Request(`https://share.example/alerts/stop?t=${odd}`, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'multipart/form-data; boundary=x' } });
  assert.equal((await handle(broken, e, now)).status, 204);
  assert.equal(await statusOf(e, odd), 404);
  assert.equal(await count(e, 'suppressed'), 4);
});

test('live retention is one D1 query and one transaction, with the same counts and the same rows', async () => {
  const now = Date.now();
  const e = env();
  await seedRetention(e, now);
  const before = await snapshot(e);
  // A failure part way through changes nothing.
  e.DB.failBatchAt = 5;
  await assert.rejects(runRetention(e, now, true), /batch failed/);
  assert.deepEqual(await snapshot(e), before);
  e.DB.queries = 0;
  e.DB.statements = 0;
  e.DB.queryLimit = 1;
  assert.deepEqual(await runRetention(e, now, true), { live: true, ...EXPECTED_COUNTS });
  assert.equal(e.DB.queries, 1);
  assert.equal(e.DB.statements, 8);
  e.DB.queryLimit = undefined;
  const after = await snapshot(e);
  // The same end state as the eight statements run one at a time, as retention did before.
  const ref = env();
  await seedRetention(ref, now);
  const month = now - 30 * DAY;
  const doomed = '((emailed_at IS NOT NULL AND emailed_at < ?) OR (emailed_at IS NULL AND created_at < ?))';
  const doomedArgs = [now - 90 * DAY, now - 180 * DAY];
  const old = [
    [`DELETE FROM feedback WHERE ${doomed}`, doomedArgs],
    [`UPDATE feedback SET email = '' WHERE email != '' AND emailed_at IS NOT NULL AND emailed_at < ? AND NOT ${doomed}`, [month, ...doomedArgs]],
    [`UPDATE feedback SET ip_hash = '' WHERE ip_hash != '' AND created_at < ? AND NOT ${doomed}`, [month, ...doomedArgs]],
    ["UPDATE alerts SET ip_hash = '' WHERE ip_hash != '' AND created_at < ?", [month]],
    ["UPDATE builds SET ip_hash = '' WHERE ip_hash != '' AND created_at < ?", [month]],
    ['DELETE FROM clicks WHERE day < ?', [Math.floor(now / DAY) - 30]],
    ['DELETE FROM suppressed WHERE created_at < ?', [now - 90 * DAY]],
    ['DELETE FROM signups WHERE created_at < ?', [month]],
  ];
  const counts = [];
  for (const [sql, args] of old) counts.push((await ref.DB.prepare(sql).bind(...args).run()).meta.changes);
  assert.deepEqual(counts, Object.values(EXPECTED_COUNTS));
  assert.deepEqual(after, await snapshot(ref));
});

/* ------------------------- batch 3, W1 fix round: one shared limit, rate-limit answers, a claim that checks the row */

/** A run's waits, in order, instead of real ones. */
const recordWaits = (e) => { const waits = []; e.pause = async (ms) => { waits.push(ms); }; return waits; };

test('a 429 that names the monthly quota also stops the run at once, with no wait and no retry', async () => {
  const e = liveEnv();
  for (let i = 0; i < 3; i++) await addRow(e, `mq${i}`, `mq${i}@example.com`, { created: T0 - 5 * DAY + i });
  const before = [await rawRow(e, 'mq1'), await rawRow(e, 'mq2')];
  const waits = recordWaits(e);
  const net = invocation(e, LISTED(120), { resend: (send) => (send.to === 'mq1@example.com' ? QUOTA_429('monthly_quota_exceeded') : 200) });
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 1, deferred: 1, failed: 1, watched: 3 });
  assert.deepEqual(net.sends.map((s) => s.to), ['mq0@example.com', 'mq1@example.com']);
  assert.deepEqual(waits, [120], 'only the usual gap before the second request');
  assert.equal(lines.length, 0);
  assert.deepEqual([await rawRow(e, 'mq1'), await rawRow(e, 'mq2')], before);
});

test('a rate-limit 429 does not stop the run: that send is retried once after a wait, with the same key, and everyone is emailed', async () => {
  const e = liveEnv();
  for (let i = 0; i < 12; i++) await addRow(e, `rl${i}`, `rl${pad(i)}@example.com`, { created: T0 - 5 * DAY + i });
  const waits = recordWaits(e);
  // The fourth request is turned away by the rate limit, asking for 2 seconds; every other one is accepted.
  const net = invocation(e, LISTED(120), { resend: (_send, n) => (n === 3 ? RATE_429(2) : 200) });
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 12, deferred: 0, failed: 0, watched: 12 });
  assert.equal(lines.length, 0);
  assert.equal(net.sends.length, 13);
  assert.equal(net.sends[4].to, 'rl003@example.com');
  assert.equal(net.sends[3].to, 'rl003@example.com');
  assert.equal(net.sends[4].key, net.sends[3].key);
  assert.deepEqual(net.sends[4].message, net.sends[3].message);
  assert.deepEqual(net.accepted.map((s) => s.to), Array.from({ length: 12 }, (_, i) => `rl${pad(i)}@example.com`));
  assert.deepEqual(waits, [120, 120, 120, 2000, ...Array(8).fill(120)]);
  assert.equal(e.DB.queries, 3 + 2, 'two claim batches and nothing to put back');
  afterRun(e);
  for (let i = 0; i < 12; i++) assert.deepEqual(await rowOf(e, `rl${i}`), { seen: CLAIMED, sent: T0 });
});

test('two rate-limit 429s in a row put the address back exactly as it was and stop the run; it is emailed once the next day', async () => {
  const e = liveEnv();
  const earlier = T0 - 6 * DAY;
  for (let i = 0; i < 13; i++) {
    const email = `rr${pad(i)}@example.com`;
    if (i === 2) {
      await addRow(e, 'rr2', email, { created: T0 - 30 * DAY, sent: earlier });
      await addRow(e, 'rr2b', email, { created: T0 - 29 * DAY, sent: earlier, seen: { [APEX]: 150 }, builds: [RANGE] });
    } else await addRow(e, `rr${i}`, email, { created: i < 2 ? T0 - 8 * DAY + i : T0 - 5 * DAY + i });
  }
  const labels = ['rr2', 'rr2b', 'rr3', 'rr9', 'rr10', 'rr12'];
  const before = [];
  for (const label of labels) before.push(await rawRow(e, label));
  const waits = recordWaits(e);
  const net = invocation(e, LISTED(120), { resend: (send) => (send.to === 'rr002@example.com' ? RATE_429(1) : 200) });
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  // Two went, the third was turned away twice, and the other 10 wait: 7 already claimed in that chunk, 3 in the next.
  assert.deepEqual(result, { sent: 2, deferred: 10, failed: 1, watched: 14 });
  assert.deepEqual(net.sends.map((s) => s.to), ['rr000@example.com', 'rr001@example.com', 'rr002@example.com', 'rr002@example.com']);
  assert.equal(net.sends[3].key, net.sends[2].key);
  assert.deepEqual(waits, [120, 120, 1000]);
  assert.equal(e.DB.queries, 3 + 1 + 1, 'one claim batch and one revert batch');
  assert.equal(lines.length, 0);
  afterRun(e);
  const after = [];
  for (const label of labels) after.push(await rawRow(e, label));
  assert.deepEqual(after, before, 'byte for byte');
  const next = invocation(e, LISTED(120));
  assert.deepEqual(await withFetch(next.fetch, () => runAlerts(e, T0 + DAY)), { sent: 11, deferred: 0, failed: 0, watched: 14 });
  const again = next.accepted.filter((s) => s.to === 'rr002@example.com');
  assert.equal(again.length, 1);
  assert.equal(again[0].message.subject, 'Price drop on 2 of your builds');
});

test('a rate-limit 429 with no retry left in the run puts the address back and stops', async () => {
  const e = liveEnv();
  for (let i = 0; i < 6; i++) await addRow(e, `nr${i}`, `nr${i}@example.com`, { created: T0 - 5 * DAY + i });
  const before = [await rawRow(e, 'nr4'), await rawRow(e, 'nr5')];
  // The first four sends use up the run's four retries; the fifth is turned away by the rate limit.
  const net = invocation(e, LISTED(120), { resend: (send) => (send.to === 'nr4@example.com' ? RATE_429(1) : 503) });
  assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0)), { sent: 0, deferred: 1, failed: 1, unconfirmed: 4, watched: 6 });
  assert.equal(net.sends.length, 4 * 2 + 1);
  assert.deepEqual([await rawRow(e, 'nr4'), await rawRow(e, 'nr5')], before);
});

test('the wait before a rate-limit retry is the retry-after answer, kept between 1 and 3 seconds', async () => {
  for (const [retryAfter, want] of [[0, 1000], [1, 1000], [30, 3000], [undefined, 1000], [2, 2000], ['soon', 1000], [-5, 1000]]) {
    const e = liveEnv();
    await addRow(e, 'x', 'x@example.com', { created: T0 - DAY });
    const waits = recordWaits(e);
    const net = invocation(e, LISTED(120), { resend: (_send, n) => (n === 0 ? RATE_429(retryAfter) : 200) });
    assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0)), { sent: 1, deferred: 0, failed: 0, watched: 1 }, String(retryAfter));
    assert.deepEqual(waits, [want], `retry-after ${retryAfter}`);
  }
});

test('a 429 whose body is not JSON, or names no quota, is a rate limit; only the two quota names stop the run at once', async () => {
  const bodies = ['<html>Too many requests for victim@example.com</html>', '', 'null', '{"name":"something_else"}', '{"name":["daily_quota_exceeded"]}', '{"message":"daily_quota_exceeded"}'];
  for (const body of bodies) {
    const e = liveEnv();
    await addRow(e, 'x', 'x@example.com', { created: T0 - DAY });
    await addRow(e, 'y', 'y@example.com', { created: T0 - DAY + 1 });
    const net = invocation(e, LISTED(120), { resend: (_send, n) => (n === 0 ? { status: 429, body } : 200) });
    const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
    assert.deepEqual(result, { sent: 2, deferred: 0, failed: 0, watched: 2 }, body);
    assert.equal(net.sends.length, 3, body);
    assert.equal(lines.length, 0);
  }
  for (const name of ['daily_quota_exceeded', 'monthly_quota_exceeded']) {
    const e = liveEnv();
    await addRow(e, 'x', 'x@example.com', { created: T0 - DAY });
    await addRow(e, 'y', 'y@example.com', { created: T0 - DAY + 1 });
    const net = invocation(e, LISTED(120), { resend: () => QUOTA_429(name) });
    assert.deepEqual(await withFetch(net.fetch, () => runAlerts(e, T0)), { sent: 0, deferred: 1, failed: 1, watched: 2 }, name);
    assert.equal(net.sends.length, 1, name);
  }
});

test('after a rate-limit 429 the retry\'s answer stands: a refusal goes to the back of the line, an unclear one keeps the claim, and the run goes on', async () => {
  const run = async (second) => {
    const e = liveEnv();
    await addRow(e, 'x', 'x@example.com', { created: T0 - DAY });
    await addRow(e, 'y', 'y@example.com', { created: T0 - DAY + 1 });
    const net = invocation(e, LISTED(120), { resend: (send, n) => (send.to !== 'x@example.com' ? 200 : n === 0 ? RATE_429(1) : second) });
    const result = await withFetch(net.fetch, () => runAlerts(e, T0));
    return { result, sends: net.sends.map((s) => s.to), x: await rowOf(e, 'x') };
  };
  const tos = ['x@example.com', 'x@example.com', 'y@example.com'];
  // 422: Resend looked at the email and turned it down. The change still waits; the try is recorded.
  assert.deepEqual(await run(422), { result: { sent: 1, deferred: 0, failed: 1, watched: 2 }, sends: tos, x: { seen: ALL_SEEN, sent: T0 } });
  // 503: it may have gone. No third try, and the claim stays.
  assert.deepEqual(await run(503), { result: { sent: 1, deferred: 0, failed: 0, unconfirmed: 1, watched: 2 }, sends: tos, x: { seen: CLAIMED, sent: T0 } });
  // 409: Resend already has a request with this key. The claim stays.
  assert.deepEqual(await run(409), { result: { sent: 1, deferred: 0, failed: 0, unconfirmed: 1, watched: 2 }, sends: tos, x: { seen: CLAIMED, sent: T0 } });
  // A quota 429 on the retry: put back whole, and the run stops before the next address.
  assert.deepEqual(await run(QUOTA_429()), { result: { sent: 0, deferred: 1, failed: 1, watched: 2 }, sends: tos.slice(0, 2), x: { seen: ALL_SEEN, sent: null } });
});

test('a 429 answering the retry of a 5xx keeps that address\'s claim and stops the run', async () => {
  for (const second of [RATE_429(1), QUOTA_429()]) {
    const e = liveEnv();
    for (let i = 0; i < 3; i++) await addRow(e, `g${i}`, `g${i}@example.com`, { created: T0 - 5 * DAY + i });
    const before = [await rawRow(e, 'g1'), await rawRow(e, 'g2')];
    const net = invocation(e, LISTED(120), { resend: (_send, n) => (n === 0 ? 503 : second) });
    const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
    assert.deepEqual(result, { sent: 0, deferred: 2, failed: 0, unconfirmed: 1, watched: 3 });
    assert.deepEqual(net.sends.map((s) => s.to), ['g0@example.com', 'g0@example.com'], 'nobody else is tried');
    assert.equal(lines.length, 0);
    // The 503 may have sent it, so the first address keeps its claim; the other two are put back whole.
    assert.deepEqual(await rowOf(e, 'g0'), { seen: CLAIMED, sent: T0 });
    assert.deepEqual([await rawRow(e, 'g1'), await rawRow(e, 'g2')], before);
  }
});

test('the scheduled handler returns its run\'s promise, which settles only after the jobs have finished, for every cron value', async () => {
  const { default: worker } = await import('./src/index.js');
  const cases = [['0 11 * * *', ['h@example.com']], ['30 11 * * *', ['owner@example.com']], ['0 12 * * *', ['h@example.com', 'owner@example.com']], [undefined, ['h@example.com', 'owner@example.com']]];
  for (const [value, emailed] of cases) {
    const e = { ...liveEnv(), FEEDBACK_EMAIL: 'owner@example.com' };
    await addRow(e, 'h', 'h@example.com', { created: T0 - DAY });
    await addFeedback(e, Date.now() - 3_600_000, null, 'h');
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    // Every email request stays open until the test lets it go.
    const net = network(LISTED(120), { resend: async () => { await gate; return 200; } });
    const waits = [];
    const { lines } = await captureLogs(() => withFetch(net.fetch, async () => {
      const run = worker.scheduled(value === undefined ? {} : { cron: value }, e, { waitUntil: (p) => waits.push(p) });
      assert.ok(run instanceof Promise, `${value}: a promise the runtime can wait for`);
      let settled = false;
      run.then(() => { settled = true; }, () => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(settled, false, `${value}: still running while an email request is open`);
      assert.equal(net.sends.length, emailed.length);
      assert.equal(net.accepted.length, 0);
      release();
      assert.equal(await run, undefined);
    }));
    assert.deepEqual(net.accepted.map((s) => s.to).sort(), emailed, String(value));
    assert.equal(lines.length, value === '0 11 * * *' ? 1 : value === '30 11 * * *' ? 2 : 3, lines.join('\n'));
    assert.ok(!lines.some((l) => /failed/.test(l.slice(0, l.indexOf('{')))), lines.join('\n'));
    noSecrets(lines);
  }
});

/** Runs `change` once, just before the run's first batch: after it has read its rows, before it claims any. */
const beforeFirstBatch = (e, change) => {
  const batch = e.DB.batch;
  let done = false;
  e.DB.batch = async (list) => {
    if (!done) { done = true; await change(); }
    return batch(list);
  };
};

test('someone who unsubscribes after the run has read its rows gets no email, and their signup is not brought back', async () => {
  const e = liveEnv();
  for (let i = 0; i < 3; i++) await addRow(e, `d${i}`, `d${i}@example.com`, { created: T0 - 5 * DAY + i });
  // The site's Turn Off, through the real route, lands between the read and the claim.
  beforeFirstBatch(e, async () => {
    assert.equal((await handle(new Request(`https://share.example/alerts/stop?t=${tokenFor('d1')}`, { method: 'POST' }), e, T0)).status, 204);
  });
  const net = invocation(e, LISTED(120));
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 2, deferred: 0, failed: 0, skipped: 1, watched: 3 });
  assert.deepEqual(net.sends.map((s) => s.to), ['d0@example.com', 'd2@example.com']);
  assert.deepEqual(lines, []);
  // The run's own queries are what they were: 3 at the start and one claim batch. The other 2 are the unsubscribe's.
  assert.equal(e.DB.queries, 3 + 1 + 2);
  assert.equal(net.subrequests, 1 + 2);
  afterRun(e);
  assert.equal(await count(e, 'alerts'), 2);
  assert.equal(await e.DB.prepare('SELECT COUNT(*) AS n FROM alerts WHERE email = ?').bind('d1@example.com').first().then((r) => r.n), 0);
  assert.deepEqual(await rowOf(e, 'd0'), { seen: CLAIMED, sent: T0 });
  // And the next day's run has nothing for that address.
  const next = invocation(e, LISTED(100));
  assert.deepEqual(await withFetch(next.fetch, () => runAlerts(e, T0 + DAY)), { sent: 2, deferred: 0, failed: 0, watched: 2 });
  assert.deepEqual(next.sends.map((s) => s.to).sort(), ['d0@example.com', 'd2@example.com']);
});

test('a row another run claimed after this run read it gets no second email and is left as that run wrote it', async () => {
  const e = liveEnv();
  const earlier = T0 - 6 * DAY;
  await addRow(e, 'n0', 'n0@example.com', { created: T0 - 9 * DAY });
  await addRow(e, 'n1', 'n1@example.com', { created: T0 - 8 * DAY });
  await addRow(e, 'p0', 'p0@example.com', { created: T0 - 30 * DAY, sent: earlier });
  await addRow(e, 'p1', 'p1@example.com', { created: T0 - 30 * DAY, sent: earlier + 1 });
  const other = T0 - 5;
  // Another run's claim on one never-emailed row and one emailed before: today's prices, and its own time.
  beforeFirstBatch(e, () => e.DB.exec(`UPDATE alerts SET seen = '${JSON.stringify(CLAIMED)}', last_sent_at = ${other} WHERE token IN ('${tokenFor('n1')}', '${tokenFor('p1')}')`));
  const net = invocation(e, LISTED(120));
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 2, deferred: 0, failed: 0, skipped: 2, watched: 4 });
  // A row never emailed (NULL) and one emailed before are both claimed when they are still as they were read.
  assert.deepEqual(net.sends.map((s) => s.to).sort(), ['n0@example.com', 'p0@example.com']);
  assert.equal(lines.length, 0);
  assert.equal(e.DB.queries, 3 + 1, 'nothing of this run\'s to put back');
  for (const label of ['n1', 'p1']) assert.deepEqual(await rowOf(e, label), { seen: CLAIMED, sent: other }, 'as the other run left it');
  for (const label of ['n0', 'p0']) assert.deepEqual(await rowOf(e, label), { seen: CLAIMED, sent: T0 });
});

test('an address with two rows, one of them gone by the claim, gets no email and its other row is put back', async () => {
  const e = liveEnv();
  await addRow(e, 't0', 't0@example.com', { created: T0 - 9 * DAY });
  await addRow(e, 't1', 't1@example.com', { created: T0 - 8 * DAY });
  await addRow(e, 't1b', 't1@example.com', { created: T0 - 7 * DAY, seen: { [APEX]: 150 }, builds: [RANGE] });
  const before = await rawRow(e, 't1b');
  beforeFirstBatch(e, () => e.DB.exec(`DELETE FROM alerts WHERE token = '${tokenFor('t1')}'`));
  const net = invocation(e, LISTED(120));
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 1, deferred: 0, failed: 0, skipped: 1, watched: 3 });
  assert.deepEqual(net.sends.map((s) => s.to), ['t0@example.com']);
  assert.equal(lines.length, 0);
  assert.equal(e.DB.queries, 3 + 1 + 1, 'one claim batch, and one revert batch for the row that was claimed');
  assert.deepEqual(await rawRow(e, 't1b'), before, 'put back whole');
  assert.equal(await count(e, 'alerts'), 2, 'the deleted row is not recreated');
  // The row that is left is still a signup with a change waiting, so the next day it is told, once.
  const next = invocation(e, LISTED(120));
  assert.deepEqual(await withFetch(next.fetch, () => runAlerts(e, T0 + DAY)), { sent: 1, deferred: 0, failed: 0, watched: 2 });
  assert.equal(next.sends[0].message.subject, 'Price drop on "Range G19"');
});

test('two runs that overlap email each address once, even when the mail provider ignores the Idempotency-Key', async () => {
  const e = liveEnv();
  for (let i = 0; i < 12; i++) await addRow(e, `o${i}`, `o${pad(i)}@example.com`, { created: T0 - 5 * DAY + i, sent: i % 4 === 0 ? T0 - 3 * DAY + i : null });
  await addRow(e, 'o5b', 'o005@example.com', { created: T0 - 4 * DAY, seen: { [APEX]: 150 }, builds: [RANGE] });
  // Both runs read, then both claim their first chunk, and only then does either send.
  const batch = e.DB.batch;
  let arrived = 0;
  let claimed = 0;
  let bothHaveRead;
  let bothHaveClaimed;
  const read = new Promise((resolve) => { bothHaveRead = resolve; });
  const claims = new Promise((resolve) => { bothHaveClaimed = resolve; });
  e.DB.batch = async (list) => {
    const early = ++arrived <= 2;
    if (arrived === 2) bothHaveRead();
    if (early) await read;
    try { return await batch(list); } finally { if (early && ++claimed === 2) bothHaveClaimed(); }
  };
  // No limits here (two invocations share this network), and every request is accepted whatever its key.
  const net = network(LISTED(120), { resend: async () => { await claims; return 200; } });
  const [a, b] = await withFetch(net.fetch, () => Promise.all([runAlerts(e, T0), runAlerts(e, T0 + 7)]));
  const everyone = Array.from({ length: 12 }, (_, i) => `o${pad(i)}@example.com`);
  assert.deepEqual(net.sends.map((s) => s.to).sort(), everyone, 'one request per address across both runs');
  assert.equal(net.accepted.length, 12);
  assert.equal(a.sent + b.sent, 12);
  assert.equal((a.skipped ?? 0) + (b.skipped ?? 0), 12, 'each run skips what the other claimed');
  assert.equal(a.failed + b.failed + a.deferred + b.deferred + (a.unconfirmed ?? 0) + (b.unconfirmed ?? 0), 0);
  // The address with two rows got one email covering both.
  assert.equal(net.accepted.find((s) => s.to === 'o005@example.com').message.subject, 'Price drop on 2 of your builds');
  // A third run finds nothing left to tell.
  e.DB.batch = batch;
  const later = network(LISTED(120));
  assert.deepEqual(await withFetch(later.fetch, () => runAlerts(e, T0 + DAY)), { sent: 0, deferred: 0, failed: 0, watched: 13 });
  assert.equal(later.sends.length, 0);
});

test('a put-back that fails is caught: its addresses count as unconfirmed, one line is logged, and the run stops', async () => {
  const seed = async () => {
    const e = liveEnv();
    for (let i = 0; i < 25; i++) await addRow(e, `f${i}`, `f${pad(i)}@example.com`, { created: T0 - 5 * DAY + i });
    // The first chunk's put-back is the run's second batch.
    e.DB.failBatchAt = 0;
    e.DB.failBatchSkip = 1;
    return e;
  };
  // One refused send in the first chunk; the other nine go.
  const e = await seed();
  const net = invocation(e, LISTED(120), { resend: (send) => (send.to === 'f003@example.com' ? 422 : 200) });
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 9, deferred: 15, failed: 0, unconfirmed: 1, watched: 25 });
  assert.deepEqual(lines, ['Alert undo failed: Error: D1_ERROR: batch failed']);
  assert.equal(net.sends.length, 10, 'no later chunk is claimed or sent');
  assert.equal(e.DB.queries, 3 + 1 + 1);
  afterRun(e);
  // The refused address keeps its claim, so it is not told about this change: counted, not hidden.
  assert.deepEqual(await rowOf(e, 'f3'), { seen: CLAIMED, sent: T0 });
  for (let i = 10; i < 25; i++) assert.deepEqual(await rowOf(e, `f${i}`), { seen: ALL_SEEN, sent: null });
  const next = invocation(e, LISTED(120));
  assert.deepEqual(await withFetch(next.fetch, () => runAlerts(e, T0 + DAY)), { sent: 15, deferred: 0, failed: 0, watched: 25 });
  assert.ok(!next.sends.some((s) => s.to === 'f003@example.com'));

  // The quota runs out at the fourth address: it and the six claimed after it were to be put back.
  const f = await seed();
  const limited = invocation(f, LISTED(120), { resend: (send) => (send.to === 'f003@example.com' ? QUOTA_429() : 200) });
  const second = await captureLogs(() => withFetch(limited.fetch, () => runAlerts(f, T0)));
  assert.deepEqual(second.result, { sent: 3, deferred: 15, failed: 0, unconfirmed: 7, watched: 25 });
  assert.deepEqual(second.lines, ['Alert undo failed: Error: D1_ERROR: batch failed']);
  assert.equal(limited.sends.length, 4);
  afterRun(f);
  for (let i = 3; i < 10; i++) assert.deepEqual(await rowOf(f, `f${i}`), { seen: CLAIMED, sent: T0 }, 'the claim stays');
});

/** A confirmed signup; returns its token. */
const confirmedSignup = async (e, email, ip, now) => {
  const { body } = await signupAt(e, now - DAY, email, ip);
  assert.match(await (await pressConfirm(e, codeIn(e.outbox.at(-1)), now - DAY)).text(), /Price Alerts Are On/);
  return body.token;
};
const stopUrl = (token) => `https://share.example/alerts/stop?t=${token}`;
const URLENCODED = 'application/x-www-form-urlencoded';
/** A request body that counts how often it is read from, and whether reading was called off. Nothing is read until asked for. */
const watchedBody = (chunk = new Uint8Array(1024).fill(120)) => {
  const seen = { pulls: 0, cancelled: false };
  const stream = new ReadableStream({ pull(controller) { seen.pulls++; controller.enqueue(chunk); }, cancel() { seen.cancelled = true; } }, { highWaterMark: 0 });
  return { seen, stream };
};

test('every way of unsubscribing that worked still works, with the token checked before the body is read', async () => {
  const e = alertEnv();
  const now = Date.now();
  let n = 0;
  const on = () => { n++; return confirmedSignup(e, `stop${n}@example.com`, `9.0.${n}.1`, now); };
  let suppressed = 0;
  const gone = async (token, res, status, suppresses, label) => {
    assert.equal(res.status, status, label);
    assert.equal(await statusOf(e, token), 404, label);
    if (suppresses) suppressed++;
    assert.equal(await count(e, 'suppressed'), suppressed, label);
  };
  const post = (token, body, headers = {}) => handle(new Request(stopUrl(token), { method: 'POST', body, headers }), e, now);
  const multipart = (fields) => { const body = new FormData(); for (const [k, v] of Object.entries(fields)) body.set(k, v); return body; };
  const sized = async (token, body, type) => {
    // As a real client sends it: the body's length in a content-length header.
    const probe = new Request(stopUrl(token), { method: 'POST', body, headers: type ? { 'content-type': type } : {} });
    const bytes = new Uint8Array(await probe.arrayBuffer());
    return post(token, bytes, { 'content-type': probe.headers.get('content-type'), 'content-length': String(bytes.byteLength) });
  };

  // The link in the email (GET) only asks.
  const asked = await on();
  const ask = await visit(e, 'GET', `/alerts/stop?t=${asked}`);
  assert.equal(ask.status, 200);
  assert.match(await ask.text(), /Stop Price Alerts\?/);
  assert.equal(await statusOf(e, asked), 200);

  // One-click from a mail app, urlencoded and multipart, with and without a content-length.
  let token = await on();
  await gone(token, await post(token, 'List-Unsubscribe=One-Click', { 'content-type': URLENCODED }), 204, true, 'urlencoded');
  token = await on();
  await gone(token, await sized(token, 'List-Unsubscribe=One-Click', URLENCODED), 204, true, 'urlencoded, sized');
  token = await on();
  await gone(token, await post(token, multipart({ 'List-Unsubscribe': 'One-Click' })), 204, true, 'multipart');
  token = await on();
  await gone(token, await sized(token, multipart({ 'List-Unsubscribe': 'One-Click' })), 204, true, 'multipart, sized');

  // The Unsubscribe page's own button.
  token = await on();
  const pressed = await sized(token, 'from=page', URLENCODED);
  assert.match(await pressed.clone().text(), /<h1>You&#39;re Unsubscribed<\/h1><p>We won't send price alerts to this address unless it signs up again\./);
  await gone(token, pressed, 200, true, 'page button');

  // Turn Off on the site: no body. And an empty body.
  token = await on();
  await gone(token, await post(token), 204, false, 'no body');
  token = await on();
  await gone(token, await post(token, '', { 'content-type': URLENCODED, 'content-length': '0' }), 204, false, 'empty body');

  // A body that is not the multipart its header claims: no error, read as text as before.
  token = await on();
  await gone(token, await sized(token, '--x\r\nnot a part', 'multipart/form-data; boundary=x'), 204, false, 'malformed multipart');
  token = await on();
  await gone(token, await sized(token, 'List-Unsubscribe=One-Click', 'multipart/form-data; boundary=x'), 204, true, 'urlencoded text under a multipart header');

  // Exactly 4096 bytes is read; one more is not.
  const padded = (size) => `List-Unsubscribe=One-Click&pad=${'x'.repeat(size - 'List-Unsubscribe=One-Click&pad='.length)}`;
  token = await on();
  await gone(token, await sized(token, padded(4096), URLENCODED), 204, true, '4096 bytes');
  token = await on();
  await gone(token, await sized(token, padded(4097), URLENCODED), 204, false, '4097 bytes');

  // 1,024 bytes that would suppress the address if any of an oversized body were parsed.
  const oneClickChunk = new TextEncoder().encode(`List-Unsubscribe=One-Click&p=${'x'.repeat(994)}&`);
  assert.equal(oneClickChunk.byteLength, 1024);

  // Oversized by its content-length: unsubscribed without the body being read at all.
  token = await on();
  const big = watchedBody(oneClickChunk);
  const declared = new Request(stopUrl(token), { method: 'POST', body: big.stream, duplex: 'half', headers: { 'content-type': URLENCODED, 'content-length': '5000000' } });
  await gone(token, await handle(declared, e, now), 204, false, 'oversized, declared');
  assert.equal(big.seen.pulls, 0);
  assert.equal(declared.bodyUsed, false);

  // Oversized with no content-length: reading stops at the limit, and it still unsubscribes.
  token = await on();
  const endless = watchedBody(oneClickChunk);
  await gone(token, await handle(new Request(stopUrl(token), { method: 'POST', body: endless.stream, duplex: 'half', headers: { 'content-type': URLENCODED } }), e, now), 204, false, 'oversized, not declared');
  assert.equal(endless.seen.pulls, 5, '4 chunks of 1024 fit; the fifth goes over and ends the reading');
  assert.equal(endless.seen.cancelled, true);

  // A content-length that is not a number: the body is not read.
  token = await on();
  const odd = watchedBody(oneClickChunk);
  await gone(token, await handle(new Request(stopUrl(token), { method: 'POST', body: odd.stream, duplex: 'half', headers: { 'content-type': URLENCODED, 'content-length': 'lots' } }), e, now), 204, false, 'content-length not a number');
  assert.equal(odd.seen.pulls, 0);
});

test('an unsubscribe request for an unknown or malformed token is answered without reading its body', async () => {
  const e = alertEnv();
  const now = Date.now();
  const kept = await confirmedSignup(e, 'kept@example.com', '8.0.0.1', now);
  for (const token of ['c'.repeat(32), 'not-a-token', '', `${kept}0`, kept.toUpperCase()]) {
    for (const headers of [{ 'content-type': URLENCODED }, { 'content-type': URLENCODED, 'content-length': '10' }, { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '5000000' }]) {
      const body = watchedBody(new TextEncoder().encode('from=page&List-Unsubscribe=One-Click&'));
      const request = new Request(stopUrl(token), { method: 'POST', body: body.stream, duplex: 'half', headers });
      e.DB.queries = 0;
      const res = await handle(request, e, now);
      assert.equal(res.status, 204, token);
      assert.equal(body.seen.pulls, 0, token);
      assert.equal(request.bodyUsed, false, token);
      assert.ok(e.DB.queries <= 1, 'at most the one lookup');
    }
  }
  assert.equal(await statusOf(e, kept), 200);
  assert.equal(await count(e, 'suppressed'), 0);
});

test('log lines blank out signup tokens as well as addresses', async () => {
  const { errorText } = await import('./src/api.js');
  const token = tokenFor('log');
  const message = (t, address) => `D1_ERROR: UNIQUE constraint failed: alerts.token ${t} for ${address} (row ${t}), near "${t}"`;
  assert.equal(errorText(new Error(message(token, 'me@example.com'))), `Error: ${message('<token>', '<address>')}`);
  // Only 32 hex characters standing alone: a longer hash, a shorter id and ordinary words are left as they are.
  const plain = `hash ${'a'.repeat(64)} id ${'b'.repeat(31)} deadbeef token abc`;
  assert.equal(errorText(new TypeError(plain)), `TypeError: ${plain}`);
  // In the run: a claim that fails with such a message logs neither.
  const e = liveEnv();
  await addRow(e, 'log', 'me@example.com', { created: T0 - DAY });
  e.DB.batch = async () => { throw new Error(message(token, 'me@example.com')); };
  const net = invocation(e, LISTED(120));
  const { result, lines } = await captureLogs(() => withFetch(net.fetch, () => runAlerts(e, T0)));
  assert.deepEqual(result, { sent: 0, deferred: 1, failed: 0, watched: 1 });
  assert.deepEqual(lines, [`Alert claim failed: Error: ${message('<token>', '<address>')}`]);
  noSecrets(lines);
});

test('an alert email request is given up on after 10 seconds', async () => {
  const e = liveEnv();
  for (let i = 0; i < 2; i++) await addRow(e, `s${i}`, `s${i}@example.com`, { created: T0 - 5 * DAY + i });
  const net = invocation(e, LISTED(120), { resend: (_send, n) => (n === 0 ? 503 : 200) });
  const real = AbortSignal.timeout;
  const asked = [];
  AbortSignal.timeout = (ms) => { asked.push(ms); return real.call(AbortSignal, ms); };
  try {
    assert.equal((await withFetch(net.fetch, () => runAlerts(e, T0))).sent, 2);
  } finally {
    AbortSignal.timeout = real;
  }
  // One limit for each request, the retry included, and each of 10 seconds.
  assert.deepEqual(asked, [10_000, 10_000, 10_000]);
  assert.equal(net.sends.length, 3);
});
