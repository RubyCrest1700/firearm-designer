import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdirSync } from 'node:fs';

// The site's store and guide pages, bundled for node like check-data does.
mkdirSync('node_modules/.cache', { recursive: true });
const out = 'node_modules/.cache/builder-links-test.mjs';
buildSync({ stdin: { contents: "export * from './src/store'; export { PAGE_VIEWS, platformPage, guidePage } from './src/guides/render'; export { GUIDES } from './src/guides/content'; export { baseSelection } from './src/engine';", resolveDir: '.', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', logLevel: 'error', outfile: out });
const { readSharedBuild, PAGE_VIEWS, platformPage, guidePage, GUIDES, baseSelection } = await import(`../${out}`);

const open = (b) => { globalThis.location = { search: `?b=${encodeURIComponent(b)}` }; return readSharedBuild(); };

test('a link with no parts opens the factory build of the model it names', () => {
  const g9 = PAGE_VIEWS.find((p) => p.pageId === 'glock9');
  const g26 = PAGE_VIEWS.find((p) => p.pageId === 'glock26');
  assert.deepEqual(open('glock9~'), { platform: 'glock9', selection: baseSelection(g9) });
  assert.deepEqual(open('glock26~'), { platform: 'glock9', selection: baseSelection(g26) });
  assert.notDeepEqual(baseSelection(g26), baseSelection(g9));
});

test('a link with parts keeps its parts', () => {
  const ar = PAGE_VIEWS.find((p) => p.pageId === 'ar15');
  const [first] = ar.parts;
  assert.deepEqual(open(`ar15~${first.id}`), { platform: 'ar15', selection: { [first.slot]: first.id } });
});

test('every platform page and guide opens the builder on its own factory build', () => {
  const ctas = (html) => [...html.matchAll(/<a class="cta" href="\/\?b=([^"]*)"/g)].map((m) => decodeURIComponent(m[1]));
  const check = (view, html, where) => {
    const links = ctas(html);
    assert.ok(links.length, `${where}: no builder link`);
    for (const b of links) assert.deepEqual(open(b).selection, baseSelection(view), `${where}: ${b}`);
  };
  for (const v of PAGE_VIEWS) check(v, platformPage(v), v.pageId);
  for (const g of GUIDES) check(PAGE_VIEWS.find((p) => p.pageId === g.platform), guidePage(g, '2026-10-10T00:00:00Z'), g.slug);
});
