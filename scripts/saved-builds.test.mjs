import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdirSync } from 'node:fs';

// The site's store, bundled for node like check-data does.
mkdirSync('node_modules/.cache', { recursive: true });
const out = 'node_modules/.cache/store-test.mjs';
buildSync({ entryPoints: ['src/store.ts'], bundle: true, platform: 'node', format: 'esm', logLevel: 'warning', outfile: out });
const items = new Map();
globalThis.localStorage = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, String(v)), removeItem: (k) => items.delete(k) };
const { loadSavedBuilds, storeSavedBuilds } = await import(`../${out}`);

const KEY = 'firearm-designer:saved:v1';
const good = (id) => ({ id, name: `Build ${id}`, platform: 'ar15', selection: {}, savedAt: '2026-10-01T00:00:00Z' });

test('skips a damaged saved build and keeps showing the rest', () => {
  items.set(KEY, JSON.stringify([good('a'), { id: 'b', name: 'No parts', platform: 'ar15', savedAt: 'x' }, null, good('c')]));
  assert.deepEqual(loadSavedBuilds().map((s) => s.id), ['a', 'c']);
});

test('saving keeps entries it could not read, and entries for shelved platforms', () => {
  const broken = { id: 'b', name: 'No parts', platform: 'ar15', savedAt: 'x' };
  const shelved = { ...good('s'), platform: 'gone-platform' };
  items.set(KEY, JSON.stringify([good('a'), broken, shelved, good('c')]));
  const list = loadSavedBuilds().filter((s) => s.id !== 'c'); // the visitor deleted "c"
  storeSavedBuilds(list);
  assert.deepEqual(JSON.parse(items.get(KEY)).map((s) => s.id), ['a', 'b', 's']);
  assert.deepEqual(JSON.parse(items.get(KEY))[1], broken);
});

test('a stored list that is not readable at all is set aside before saving', () => {
  items.clear();
  items.set(KEY, '{not json');
  assert.deepEqual(loadSavedBuilds(), []);
  storeSavedBuilds([]);
  assert.equal(items.get(KEY + ':unreadable'), '{not json');
  assert.equal(items.get(KEY), '[]');
});
