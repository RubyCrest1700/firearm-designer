import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { CONTENT_SECURITY_POLICY } from './src/config';

/** Adds the security policy to the published page only; the dev server needs inline scripts for hot reload. */
const securityPolicy = (): Plugin => ({
  name: 'security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`),
});

export default defineConfig({
  plugins: [react(), securityPolicy()],
  base: './',
  build: { cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
