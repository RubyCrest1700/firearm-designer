// Inlines the Vite build into one self-contained HTML page (dist/artifact.html)
// for publishing as a claude.ai Artifact preview.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = 'dist/assets';
const files = readdirSync(dir);
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8');

const page = `<title>Drop-In Builds</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Archivo+Narrow:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync('dist/artifact.html', page);
console.log(`dist/artifact.html ${(page.length / 1024).toFixed(0)} KB`);
