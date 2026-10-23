// Tests the community API against an in-memory SQLite database shaped like Cloudflare D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cleanText, handle, networkOf, visitorOf } from './src/api.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('./migrations/', import.meta.url)).sort()) db.exec(readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { prepare: (sql) => stmt(sql) };
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

import { runAlerts } from './src/alerts.js';

const ALERT_INDEX = (apex = 150, slide = 300) => ({
  platforms: { glock9: { name: 'Glock 17 / 19 / 19X / 26 / 34 / 45 / 47', parts: { 'g19-frame-g5': ['Glock Gen 5 frame', 200], 'g-fcg-apex5': ['Apex trigger', apex], 'g19-slide-mos': ['Glock MOS slide', slide] } } },
});
const alertEnv = () => {
  const outbox = [];
  return { ...env(), RESEND_API_KEY: 'k', MAILING_ADDRESS: 'PO Box 1, Town, ST 00000', sendEmail: async (m) => { outbox.push(m); }, outbox };
};
const withIndex = async (index, fn) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(index));
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
};
const G19 = { name: 'Carry G19', platform: 'glock19', parts: ['g19-frame-g5', 'g-fcg-apex5', 'g19-slide-mos'] };
const signup = (e, email = 'Me@Example.com', builds = [G19], ip) => withIndex(ALERT_INDEX(), () => call(e, 'POST', '/api/alerts', { email, builds }, ip));
const visit = (e, method, path) => handle(new Request(`https://share.example${path}`, { method }), e);
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

test('a Resend error during signup answers 500 and logs neither the address nor the error text', async () => {
  const e = { ...env(), RESEND_API_KEY: 'k', MAILING_ADDRESS: 'PO Box 1, Town, ST 00000' };
  const { result, lines } = await captureLogs(() => withFetch(resend422(ALERT_INDEX()), async () => {
    const r = await handle(req('POST', '/api/alerts', { email: 'victim@example.com', builds: [G19] }), e);
    return { status: r.status, body: await r.json() };
  }));
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Something went wrong. Please try again.' });
  assert.deepEqual(lines, ['Error: Resend 422']);
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
}
const addFeedback = (e, created, emailed, tag) => e.DB.prepare('INSERT INTO feedback (message, email, created_at, ip_hash, emailed_at) VALUES (?, ?, ?, ?, ?)')
  .bind(`Message ${tag}`, `${tag}@example.com`, created, `ip${tag}`, emailed).run();
const snapshot = async (e) => {
  const out = {};
  for (const t of ['builds', 'alerts', 'clicks', 'suppressed', 'votes', 'reports', 'feedback']) out[t] = (await e.DB.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all()).results;
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
  alertIpHashesBlanked: 2, buildIpHashesBlanked: 2, clicksDeleted: 2, suppressedDeleted: 1,
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
