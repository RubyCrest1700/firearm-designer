// Inlines the Vite build into one self-contained HTML page (dist/artifact.html)
// for publishing as a claude.ai Artifact preview.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = 'dist/assets';
const files = readdirSync(dir);
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8');

const page = `<title>Firearm Designer</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync('dist/artifact.html', page);
console.log(`dist/artifact.html ${(page.length / 1024).toFixed(0)} KB`);
