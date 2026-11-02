// Writes data/estimates.json: every part's estimated price at each store, from the catalog's own sample offers.
// scripts/first-read-guard.mjs uses them as a last-resort baseline for a first read. The nightly job makes this file
// just before the price run. It isn't committed, so it can't go stale and nobody has to run this by hand.
//
// The site's catalog drops a part's samples once it has a live or list price, and a paused store's altogether, so the
// catalog is bundled here with those three data files stubbed out. The figures then stay put as parts go live, and
// paused stores stay in: the guard filters pauses at run time.
//
//   { "parts": { "<partId>": { "<retailer>": { "price": 149.99, "inStock": true } } } }

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The data files that would change the samples, and what stands in for them. */
export const STUBS = {
  'prices.json': { updatedAt: null, offers: {} },
  'sources.json': { parts: {} },
  'list-prices.json': { from: [], factory: [], parts: {} },
};

const stubPlugin = {
  name: 'stub-price-data',
  setup(b) {
    b.onLoad({ filter: /[\\/]data[\\/](prices|sources|list-prices)\.json$/ }, (args) => ({
      contents: JSON.stringify(STUBS[args.path.split(/[\\/]/).pop()]),
      loader: 'json',
    }));
  },
};

/** The catalog's platforms, with nothing but sample offers. */
export async function loadCatalog() {
  const { outputFiles } = await build({
    stdin: { contents: "export { PLATFORMS } from './src/data/index';", resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    plugins: [stubPlugin],
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));
  return module.exports.PLATFORMS;
}

/** The file's contents, sorted so the output doesn't depend on catalog order. A part on several platforms is one part. */
export function estimatesFrom(platforms) {
  const found = {};
  for (const platform of platforms)
    for (const part of platform.parts)
      for (const offer of part.offers) (found[part.id] ??= {})[offer.retailer] = { price: offer.price, inStock: offer.inStock };
  const parts = {};
  for (const id of Object.keys(found).sort()) parts[id] = Object.fromEntries(Object.entries(found[id]).sort(([a], [b]) => (a < b ? -1 : 1)));
  if (!Object.keys(parts).length) throw new Error('the catalog gave no estimates');
  return { parts };
}

export const generateEstimates = async () => estimatesFrom(await loadCatalog());

if (basename(process.argv[1] ?? '') === 'estimates.mjs') {
  const estimates = await generateEstimates();
  writeFileSync(new URL('../data/estimates.json', import.meta.url), `${JSON.stringify(estimates, null, 2)}\n`);
  console.log(`Wrote data/estimates.json (${Object.keys(estimates.parts).length} parts).`);
}
