// Writes the static guide pages, sitemap.xml and robots.txt into dist/ after the Vite build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { GUIDES } from '../src/guides/content';
import { guidePage, indexPage, robots, sitemap } from '../src/guides/render';

const builtAt = new Date().toISOString();
const write = (path: string, text: string) => {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, text);
};

for (const g of GUIDES) write(`dist/guides/${g.slug}/index.html`, guidePage(g, builtAt));
write('dist/guides/index.html', indexPage(builtAt));
write('dist/sitemap.xml', sitemap(builtAt));
write('dist/robots.txt', robots());
console.log(`Wrote ${GUIDES.length} guide pages, sitemap.xml and robots.txt`);
