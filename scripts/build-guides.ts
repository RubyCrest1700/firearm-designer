// Writes the static FAQ guide pages, the Send Feedback page (plus forwarding pages at their old /guides/ addresses), sitemap.xml and robots.txt into dist/ after the Vite build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { GUIDES } from '../src/guides/content';
import { PLATFORMS } from '../src/data';
import { feedbackPage, guidePage, indexPage, notFoundPage, platformPage, platformSlug, platformsIndexPage, redirectPage, robots, sitemap } from '../src/guides/render';

const builtAt = new Date().toISOString();
const write = (path: string, text: string) => {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, text);
};

for (const g of GUIDES) write(`dist/faq/${g.slug}/index.html`, guidePage(g, builtAt));
write('dist/faq/index.html', indexPage(builtAt));
// Old /guides/ addresses (already in Google and shared links) forward to the same page under /faq/.
for (const g of GUIDES) write(`dist/guides/${g.slug}/index.html`, redirectPage(`/faq/${g.slug}/`));
write('dist/guides/index.html', redirectPage('/faq/'));
for (const p of PLATFORMS) write(`dist/build/${platformSlug(p)}/index.html`, platformPage(p));
write('dist/build/index.html', platformsIndexPage());
write('dist/404.html', notFoundPage());
write('dist/feedback/index.html', feedbackPage());
write('dist/sitemap.xml', sitemap(builtAt));
write('dist/robots.txt', robots());
console.log(`Wrote ${GUIDES.length} guide pages, ${PLATFORMS.length} platform pages, 404.html, the feedback page, sitemap.xml and robots.txt`);
