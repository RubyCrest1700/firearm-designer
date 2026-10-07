// Tests the community API against an in-memory SQLite database shaped like Cloudflare D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { cleanText, handle, networkOf } from './src/api.js';

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
  // Old Glock 17/19/26 ids land in the one Glock 9mm builder.
  assert.equal(l.body.builds[0].platform, 'glock9');
  assert.deepEqual((await call(e, 'GET', '/api/builds?platform=glock9')).body.builds.map((b) => b.name), ['Carry G19']);
  assert.equal((await call(e, 'GET', '/api/builds?platform=ar15')).body.builds.length, 0);
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
    glock9: { name: 'Glock 9mm', parts: { 'g19-frame-g5': ['Glock Gen 5 frame', 200], 'g-fcg-apex5': ['Apex trigger', 150.4], 'g19-slide-mos': ['Glock MOS slide', 300] } },
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
  assert.equal(meta(r.text, 'og:title'), 'Glock 9mm build · $650');
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
  assert.match(meta(r.text, 'og:description'), /^Daily carry Glock 9mm · 3 parts · \$650/);
  // No picture of its own yet, so the platform picture stands in.
  assert.equal(meta(r.text, 'og:image'), 'https://dropinbuilds.com/og/glock9.png');
});

test('share links still work when the price index is unreachable', async () => {
  const r = await page(env(), '/b/glock19~g19-frame-g5', null);
  assert.equal(r.status, 200);
  assert.equal(meta(r.text, 'og:title'), 'Glock 9mm build');
});

test('bad share links get the site card and a 404', async () => {
  assert.equal((await page(env(), '/b/nope~x')).status, 404);
  assert.equal((await page(env(), '/b/glock19~<script>')).status, 404);
  assert.equal((await page(env(), '/c/aaaaaaaaaa')).status, 404);
  assert.equal((await page(env(), '/api/builds')).status, 200);
});

/* ------------------------------------------------------------- price alerts */

import { runAlerts } from './src/alerts.js';

const ALERT_INDEX = (apex = 150, slide = 300) => ({
  platforms: { glock9: { name: 'Glock 9mm', parts: { 'g19-frame-g5': ['Glock Gen 5 frame', 200], 'g-fcg-apex5': ['Apex trigger', apex], 'g19-slide-mos': ['Glock MOS slide', slide] } } },
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
  assert.match(e.outbox[0].html, new RegExp(`/alerts/confirm\\?t=${r.body.token}`));
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
});

test('emails confirmed signups when prices move, once, then stays quiet', async () => {
  const e = alertEnv();
  const { token } = (await signup(e)).body;
  // Unconfirmed: nothing goes out
  await withIndex(ALERT_INDEX(120), () => runAlerts(e));
  assert.equal(e.outbox.length, 1);
  assert.match(await (await visit(e, 'GET', `/alerts/confirm?t=${token}`)).text(), /Price Alerts Are On/);
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
  for (const t of [a, b]) await visit(e, 'GET', `/alerts/confirm?t=${t}`);
  await withIndex(ALERT_INDEX(120), () => runAlerts(e));
  assert.equal(e.outbox.length, 3);
  assert.equal(e.outbox[2].subject, 'Price drop on 2 of your builds');
});

test('the site keeps the watched builds in sync', async () => {
  const e = alertEnv();
  const { token } = (await signup(e)).body;
  await visit(e, 'GET', `/alerts/confirm?t=${token}`);
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
