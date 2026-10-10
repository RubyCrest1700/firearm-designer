// Pre-builds the home page into dist/index.html after the Vite build, so a phone shows it straight away instead
// of a blank page while the code downloads. React then takes it over (src/main.tsx). Other addresses (?b= share
// links, #build and so on) hide it before it paints: ROUTE_SCRIPT in src/config.ts.
// The drawings stay as the empty placeholders React first draws too (their code loads separately, and rendering
// here happens before it has): their shapes would double the size of the page.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import App from '../src/App';

// The page as a first-time visitor at / sees it: no saved builds, nothing in this tab yet.
Object.assign(globalThis, { location: { pathname: '/', search: '', hash: '' } });

const html = renderToString(<App />).replace('<div class="site">', '<div class="site" data-prebuilt="">');
if (!html.includes('data-prebuilt')) throw new Error('prerender-home: no .site element in the home page');
const file = 'dist/index.html';
const page = readFileSync(file, 'utf8');
if (!page.includes('<div id="root"></div>')) throw new Error(`prerender-home: no empty #root in ${file}`);
writeFileSync(file, page.replace('<div id="root"></div>', () => `<div id="root">${html}</div>`));
console.log(`Pre-built the home page into ${file} (${(html.length / 1024).toFixed(0)} KB)`);
