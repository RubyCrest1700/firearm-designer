// Draws the link preview pictures that Reddit, Discord, forums and text messages show for our links.
// Runs after `vite build` and writes into dist/og/:
//   site.png              the site-wide card (index.html points at it)
//   <platform>.png        one per platform, for shared builds that don't have their own picture yet
//   c/<id>.png            one per community build, with its own drawing, name and best-price total
//   index.json            part names and best prices, so the share service can describe any build
// Everything is drawn from our own blueprint drawings and rasterized locally; nothing is uploaded.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { Resvg } from '@resvg/resvg-js';
import { Blueprint, type RegionState } from '../src/Blueprint';
import { COMMUNITY_API } from '../src/config';
import { PLATFORMS, canonicalPlatform } from '../src/data/index';
import { baseSelection, bestOffer, partIds, type Selection } from '../src/engine';
import { buildOf, selectionFromParts, totalOf } from '../src/store';
import type { Platform } from '../src/types';

const OUT = 'dist/og';
const W = 1200;
const H = 630;
const FONTS = ['Archivo-Bold.ttf', 'Archivo-Medium.ttf', 'IBMPlexMono-Medium.ttf'].map((f) => `scripts/og/fonts/${f}`);

const C = { navy: '#0e2a47', onNavy: '#e8eef5', muted: '#a9b8c8', cta: '#d4691e', bp: '#164777', bp2: '#123f6b', ink: '#eaf3ff' };

/** The blueprint's stylesheet (src/styles.css) with its colour variables written out. */
const BP_CSS = `
.bp-center { stroke: rgba(234,243,255,.35); stroke-width: 1; stroke-dasharray: 18 4 3 4; fill: none; }
.bp-part path { fill: rgba(234,243,255,.05); stroke: ${C.ink}; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.bp-part .detail { fill: none; stroke-width: .9; opacity: .8; }
.bp-part path.solid { fill: ${C.bp}; stroke: none; }
.bp-part .hidden-line { fill: none; stroke-dasharray: 5 3.5; stroke-width: 1; opacity: .75; }
.internal path { fill: none; stroke-dasharray: 5 3.5; stroke-width: 1; opacity: .75; }
.static { opacity: .4; }
.empty path { fill: none; stroke: rgba(234,243,255,.5); stroke-dasharray: 2 3; }
`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The build drawing, re-wrapped to sit inside a box on the card. */
function drawing(platform: Platform, sel: Selection, x: number, y: number, w: number, h: number) {
  const { build, place } = buildOf(platform.id, sel);
  const states = Object.fromEntries(platform.slots.map((s) => [s.id, build[s.id] ? 'ok' : 'empty'])) as Record<string, RegionState>;
  const svg = renderToStaticMarkup(<Blueprint platform={platform} build={build} place={place} states={states} compact />);
  const viewBox = svg.match(/viewBox="([^"]+)"/)![1];
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function mark(x: number, y: number, size: number) {
  return `<g transform="translate(${x} ${y}) scale(${size / 48})" fill="none" stroke="${C.onNavy}" stroke-linejoin="round">
    <path d="M24 3l18.19 10.5v21L24 45 5.81 34.5v-21z" stroke-width="3"/>
    <g transform="translate(11.7 10.8) scale(.55)">
      <path d="M4 9h10a15 15 0 0 1 0 30H4z" stroke-width="4.5"/>
      <rect x="36" y="9" width="7" height="30" rx="1.5" fill="${C.cta}" stroke="none"/>
    </g></g>`;
}

/** Shrinks long titles so they stay on one line. */
function titleSize(text: string, max: number, width: number) {
  return Math.max(30, Math.min(max, Math.floor(width / (text.length * 0.56))));
}

function card(title: string, line: string, art: string) {
  const ts = titleSize(title, 60, W - 120);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="rgba(234,243,255,.07)" stroke-width="1"/></pattern>
    <style>${BP_CSS}</style>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.navy}"/>
  ${mark(56, 36, 52)}
  <text x="122" y="71" font-family="Archivo" font-weight="700" font-size="26" fill="${C.onNavy}" letter-spacing="0.5">Drop-In <tspan fill="${C.cta}">Builds</tspan></text>
  <text x="${W - 60}" y="71" text-anchor="end" font-family="IBM Plex Mono" font-weight="500" font-size="22" fill="${C.muted}">dropinbuilds.com</text>
  <text x="60" y="${118 + ts * 0.72}" font-family="Archivo" font-weight="700" font-size="${ts}" fill="#ffffff">${esc(title)}</text>
  <text x="60" y="${150 + ts * 0.72 + 12}" font-family="IBM Plex Mono" font-weight="500" font-size="25" fill="${C.muted}">${line}</text>
  <rect x="40" y="250" width="${W - 80}" height="${H - 290}" rx="14" fill="${C.bp}"/>
  <rect x="40" y="250" width="${W - 80}" height="${H - 290}" rx="14" fill="url(#grid)"/>
  ${art}
  <rect x="0" y="${H - 12}" width="${W}" height="12" fill="${C.cta}"/>
</svg>`;
}

const ART = { x: 70, y: 268, w: W - 140, h: H - 326 };

function buildCard(title: string, platform: Platform, sel: Selection) {
  const { build } = buildOf(platform.id, sel);
  const n = partIds(sel).length;
  const line = `${esc(platform.name.toUpperCase())} · ${n} PARTS · <tspan fill="${C.cta}">${money(totalOf(platform, build))}</tspan> BEST-PRICE TOTAL`;
  return card(title, line, drawing(platform, sel, ART.x, ART.y, ART.w, ART.h));
}

/** For shared builds without their own picture: the platform drawing, with no parts count or total to get wrong. */
function platformCard(platform: Platform) {
  const line = `CHECKED FOR FIT · <tspan fill="${C.cta}">BEST PRICES</tspan> ACROSS RETAILERS`;
  return card(`${platform.name} build`, line, drawing(platform, baseSelection(platform), ART.x, ART.y, ART.w, ART.h));
}

function siteCard() {
  const ar = PLATFORMS.find((p) => p.id === 'ar15') ?? PLATFORMS[0];
  return card(
    'Plan your build. Check the fit. Pay less.',
    'AR-15 · AR-10 · AR-9 · GLOCK · SIG · S&amp;W M&amp;P · HELLCAT',
    drawing(ar, baseSelection(ar), ART.x, ART.y, ART.w, ART.h),
  );
}

function png(svg: string, file: string) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Archivo' } });
  writeFileSync(file, r.render().asPng());
}

interface Shared { id: string; platform: string; name: string; parts: string[] }

/** Every community build we can list, newest and top-voted per platform. Skipped when offline. */
async function communityBuilds(): Promise<Shared[]> {
  if (!COMMUNITY_API) return [];
  const seen = new Map<string, Shared>();
  for (const p of PLATFORMS) for (const sort of ['new', 'top']) {
    try {
      const res = await fetch(`${COMMUNITY_API}/api/builds?platform=${p.id}&sort=${sort}&limit=60`, { signal: AbortSignal.timeout(10_000) });
      const { builds } = (await res.json()) as { builds: Shared[] };
      for (const b of builds) seen.set(b.id, b);
    } catch (e) {
      console.log(`Community builds unavailable (${(e as Error).message}); skipping their pictures.`);
      return [...seen.values()];
    }
  }
  return [...seen.values()];
}

mkdirSync(`${OUT}/c`, { recursive: true });
png(siteCard(), `${OUT}/site.png`);
for (const p of PLATFORMS) png(platformCard(p), `${OUT}/${p.id}.png`);

const shared = await communityBuilds();
for (const b of shared) {
  const platform = PLATFORMS.find((p) => p.id === canonicalPlatform(b.platform));
  if (platform && /^[a-z0-9]{10}$/.test(b.id)) png(buildCard(b.name, platform, selectionFromParts(platform.id, b.parts)), `${OUT}/c/${b.id}.png`);
}

const index = {
  platforms: Object.fromEntries(PLATFORMS.map((p) => [p.id, {
    name: p.name,
    parts: Object.fromEntries(p.parts.map((part) => [part.id, [`${part.brand} ${part.name}`, bestOffer(part)?.price ?? 0]])),
  }])),
};
writeFileSync(`${OUT}/index.json`, JSON.stringify(index));
console.log(`Link previews: site, ${PLATFORMS.length} platforms, ${shared.length} community builds (${(readFileSync(`${OUT}/index.json`).length / 1024).toFixed(0)} KB index)`);
