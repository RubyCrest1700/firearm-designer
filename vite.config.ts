import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { CONTENT_SECURITY_POLICY, ROUTE_SCRIPT, ROUTE_SCRIPT_HASH } from './src/config';
import { fontTags } from './src/fonts';
import { packPrices } from './scripts/price-table.mjs';

/** Adds the security policy to the published page only; the dev server needs inline scripts for hot reload. */
const securityPolicy = (): Plugin => ({
  name: 'security-policy',
  apply: 'build',
  transformIndexHtml(html) {
    const hash = `sha256-${createHash('sha256').update(ROUTE_SCRIPT).digest('base64')}`;
    if (hash !== ROUTE_SCRIPT_HASH) throw new Error(`ROUTE_SCRIPT changed: set ROUTE_SCRIPT_HASH in src/config.ts to '${hash}'`);
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />\n    <script>${ROUTE_SCRIPT}</script>`);
  },
});

/** Font preloads and faces (src/fonts.ts) in the page head. */
const fonts = (): Plugin => ({
  name: 'fonts',
  transformIndexHtml: (html) => html.replace('\n  </head>', `\n${fontTags('    ')}\n  </head>`),
});

/**
 * Live prices (data/prices.json) and product links (data/sources.json) ship as one compact table, each link once
 * (scripts/price-table.mjs). The app still imports both files and gets the same shapes back; the scripts and the
 * Worker read the files themselves.
 */
const compactPrices = (): Plugin => {
  const FILES: Record<string, string> = { [resolve('data/prices.json')]: 'unpackPrices', [resolve('data/sources.json')]: 'unpackSources' };
  const TABLE = '\0price-table';
  return {
    name: 'compact-prices',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === TABLE) return TABLE;
      const file = importer && source.endsWith('.json') ? resolve(importer, '..', source) : '';
      return FILES[file] ? `\0${FILES[file]}` : null;
    },
    load(id) {
      const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
      if (id === TABLE) {
        Object.keys(FILES).forEach((f) => this.addWatchFile(f));
        return `export default ${JSON.stringify(packPrices(read('data/prices.json'), read('data/sources.json')))}`;
      }
      const unpack = Object.values(FILES).find((u) => id === `\0${u}`);
      return unpack ? `import t from '${TABLE}';\nimport { ${unpack} } from '${resolve('scripts/price-table.mjs')}';\nexport default ${unpack}(t);` : null;
    },
  };
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), compactPrices(), securityPolicy(), fonts()],
  base: './',
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    // The drawings load as a second file (see src/drawings.tsx). The one-page Artifact preview keeps everything in one.
    rollupOptions: mode === 'artifact' ? { output: { inlineDynamicImports: true } } : {},
  },
}));
