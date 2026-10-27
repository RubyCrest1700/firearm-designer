// Tests the community API against an in-memory SQLite database shaped like Cloudflare D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cleanText, handle, networkOf, visitorOf } from './src/api.js';

/**
 * `statements` counts every query the code runs (each statement in a batch counts as one), to check D1's
 * per-invocation query limit. Setting `failBatchAt` to an index makes the next batch fail at that statement.
 */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('./migrations/', import.meta.url)).sort()) db.exec(readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));
  const d1 = { statements: 0, failBatchAt: undefined };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    all: async () => { d1.statements++; return { results: db.prepare(sql).all(...args) }; },
    first: async () => { d1.statements++; return db.prepare(sql).get(...args) ?? null; },
    run: async () => { d1.statements++; return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
  });
  d1.prepare = (sql) => stmt(sql);
  d1.exec = (sql) => db.exec(sql); // test setup only, not counted
  // Like D1: the statements run in order as one transaction, so either all of them take effect or none do.
  d1.batch = async (list) => {
    d1.statements += list.length;
    const failAt = d1.failBatchAt;
    d1.failBatchAt = undefined;
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
 * will be after the first run in production; the re-baseline tests pass { rebaselined: false }.
 */
const alertEnv = ({ rebaselined = true } = {}) => {
  const outbox = [];
  const e = { ...env(), RESEND_API_KEY: 'k', MAILING_ADDRESS: 'PO Box 1, Town, ST 00000', sendEmail: async (m) => { outbox.push(m); }, outbox };
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
  assert.match(await pressed.text(), /We won't email this address again/);
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
  assert.deepEqual(result, { sent: 79, deferred: 1, failed: 1, watched: 81 });
  assert.equal(e.outbox.length, 79);
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

test('retention ships as a dry run that only counts', async () => {
  assert.equal(RETENTION_LIVE, false);
  const e = env(); // no Resend settings: retention runs anyway
  const now = Date.now();
  await seedRetention(e, now);
  const before = await snapshot(e);
  const { result, lines } = await captureLogs(() => runRetention(e, now));
  assert.deepEqual(result, { live: false, ...EXPECTED_COUNTS });
  assert.deepEqual(await snapshot(e), before);
  assert.equal(lines.length, 0);
  // The daily job runs it and logs only the counts.
  const { runDaily } = await import('./src/index.js');
  const daily = await captureLogs(() => withIndex(ALERT_INDEX(), () => runDaily(e, now)));
  assert.ok(daily.lines.includes(`Retention ${JSON.stringify({ live: false, ...EXPECTED_COUNTS })}`), daily.lines.join('\n'));
  for (const line of daily.lines) assert.doesNotMatch(line, /@/);
  assert.deepEqual(await snapshot(e), before);
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
  assert.match(await pressed.text(), /<h1>You&#39;re Unsubscribed<\/h1><p>We won't email this address again/);
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
  assert.match(await stop.text(), /<h1>You&#39;re Unsubscribed<\/h1><p>We won't email this address again/);
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

import { NFA_SHORT_NOTICE } from './src/share.js';


const PRIVACY = 'https://dropinbuilds.com/privacy/';
const SHORT_NOTICE_TEXT = 'May be regulated under the NFA. Not legal advice: check federal, state and local law.';
const CONFIRM_PRICE = 'Prices change; confirm at the retailer.';
const privacyLink = (html) => (html.match(new RegExp(`<a [^>]*href="${PRIVACY.replace(/[.]/g, '\\.')}"[^>]*>Privacy Policy</a>`, 'g')) ?? []).length;

test('the re-baseline mark is the 2026-10-26 pause', () => {
  assert.equal(REBASELINE, '2026-10-26-pause');
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
  assert.equal((await e.DB.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first()).value, '2026-10-26-pause');
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

test('AR-15, AR-9 and AR-10 share pages carry the short NFA notice, on the page and at the end of the description; pistol pages do not', async () => {
  const ar = await page(env(), '/b/ar15~ar-lower-aero.ar-bbl-ba10', AR_INDEX);
  assert.equal(ar.status, 200);
  for (const prop of ['og:description', 'twitter:description', 'description']) assert.ok(meta(ar.text, prop).endsWith(` ${SHORT_NOTICE_TEXT}`), prop);
  assert.equal(ar.text.split(`<p>${SHORT_NOTICE_TEXT}</p>`).length, 2, 'once on the page');
  for (const id of ['ar9', 'ar10']) {
    const r = await page(env(), `/b/${id}~x-part`, null);
    assert.ok(meta(r.text, 'og:description').endsWith(` ${SHORT_NOTICE_TEXT}`), id);
    assert.ok(r.text.includes(`<p>${SHORT_NOTICE_TEXT}</p>`), id);
  }
  for (const path of ['/b/glock19~g19-frame-g5.g-fcg-apex5', '/b/p365~x-part', '/b/hellcat~x-part']) {
    const r = await page(env(), path);
    assert.equal(r.status, 200, path);
    assert.doesNotMatch(r.text, /regulated under the NFA/, path);
  }
});

test('share-page totals say to confirm the price at the retailer; no total, no price line', async () => {
  const priced = await page(env(), '/b/glock19~g19-frame-g5.g-fcg-apex5.g19-slide-mos');
  for (const prop of ['og:description', 'twitter:description']) assert.match(meta(priced.text, prop), /3 parts · \$650 at the best prices we found\. Prices change; confirm at the retailer\. Includes /, prop);
  assert.ok(priced.text.includes(`<p>${CONFIRM_PRICE}</p>`), 'next to the total on the page too');
  const unpriced = await page(env(), '/b/glock19~g19-frame-g5', null);
  assert.ok(!unpriced.text.includes(CONFIRM_PRICE));
});

