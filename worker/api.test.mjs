// Tests the community API against an in-memory SQLite database shaped like Cloudflare D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { cleanText, handle } from './src/api.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8'));
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

test('three reports from different visitors hide a build', async () => {
  const e = env();
  const { id } = (await share(e)).body.build;
  await call(e, 'POST', `/api/builds/${id}/report`, null, '1.0.0.1');
  await call(e, 'POST', `/api/builds/${id}/report`, null, '1.0.0.1');
  await call(e, 'POST', `/api/builds/${id}/report`, null, '1.0.0.2');
  assert.equal((await call(e, 'GET', '/api/builds')).body.builds.length, 1);
  const third = await call(e, 'POST', `/api/builds/${id}/report`, null, '1.0.0.3');
  assert.equal(third.body.hidden, true);
  assert.equal((await call(e, 'GET', '/api/builds')).body.builds.length, 0);
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
    glock19: { name: 'Glock 19', parts: { 'g19-frame-g5': ['Glock Gen 5 frame', 200], 'g-fcg-apex5': ['Apex trigger', 150.4], 'g19-slide-mos': ['Glock MOS slide', 300] } },
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
  const r = await page(env(), '/b/glock19~g19-frame-g5.g-fcg-apex5.g19-slide-mos.at-light-r45');
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/html/);
  assert.equal(meta(r.text, 'og:title'), 'Glock 19 build · $650');
  assert.match(meta(r.text, 'og:description'), /3 parts · \$650 at the best prices/);
  assert.equal(meta(r.text, 'og:image'), 'https://dropinbuilds.com/og/glock19.png');
  assert.equal(meta(r.text, 'twitter:card'), 'summary_large_image');
  assert.match(r.text, /url=https:\/\/dropinbuilds\.com\/\?b=glock19~g19-frame-g5\.g-fcg-apex5\.g19-slide-mos\.at-light-r45/);
});

test('a community share link uses the build name and note, escaped', async () => {
  const e = env();
  const s = await share(e, { name: 'Carry "G19" & more', note: 'Daily carry' });
  const r = await page(e, `/c/${s.body.build.id}`);
  assert.equal(r.status, 200);
  assert.equal(meta(r.text, 'og:title'), 'Carry &#34;G19&#34; &#38; more');
  assert.match(meta(r.text, 'og:description'), /^Daily carry Glock 19 · 3 parts · \$650/);
  // No picture of its own yet, so the platform picture stands in.
  assert.equal(meta(r.text, 'og:image'), 'https://dropinbuilds.com/og/glock19.png');
});

test('share links still work when the price index is unreachable', async () => {
  const r = await page(env(), '/b/glock19~g19-frame-g5', null);
  assert.equal(r.status, 200);
  assert.equal(meta(r.text, 'og:title'), 'Glock 19 build');
});

test('bad share links get the site card and a 404', async () => {
  assert.equal((await page(env(), '/b/nope~x')).status, 404);
  assert.equal((await page(env(), '/b/glock19~<script>')).status, 404);
  assert.equal((await page(env(), '/c/aaaaaaaaaa')).status, 404);
  assert.equal((await page(env(), '/api/builds')).status, 200);
});
