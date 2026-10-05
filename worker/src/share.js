// Share links with picture cards. Reddit, Discord, forums and text messages don't run the site's
// JavaScript, so a plain dropinbuilds.com/?b=… link only ever shows the site-wide card. These links
// answer with a small page whose preview tags name the build, its parts and its best-price total,
// then send people straight on to the build on the site.
//   GET /c/<id>                  a community build
//   GET /b/<platform>~<parts>    any build, in the same form as the site's ?b= links
// The pictures and the price index are drawn when the site is built (scripts/og-cards.tsx).

import { PLATFORM_IDS } from './api.js';

export const SITE = 'https://dropinbuilds.com';
const PART_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX_PARTS = 40;
/** Used when the price index can't be reached. */
const PLATFORM_NAMES = { ar15: 'AR-15', ar10: 'AR-10', akm: 'AKM', ak74: 'AK-74', glock17: 'Glock 17', glock19: 'Glock 19', glock26: 'Glock 26', glock43x: 'Glock 43X / 48', glock20: 'Glock 20 / 21', p320: 'Sig P320', p365: 'Sig P365', mp2: 'S&W M&P 2.0', hellcat: 'Springfield Hellcat' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Part names and best prices, published with the site and cached here for an hour. */
async function priceIndex() {
  try {
    const res = await fetch(`${SITE}/og/index.json`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cf: { cacheTtl: 600, cacheEverything: true } });
    return res.ok;
  } catch {
    return false;
  }
}

/** Parses `<platform>~<part>.<part>…`; returns null for anything malformed. */
export function parseCode(code) {
  const [platform, ids = ''] = code.split('~');
  const parts = ids.split('.').filter(Boolean);
  if (!PLATFORM_IDS.includes(platform) || parts.length > MAX_PARTS || !parts.every((p) => PART_ID.test(p))) return null;
  return { platform, parts };
}

/** Title and description for a build, from the price index when it's reachable. */
export function describe(index, platform, parts, name, note) {
  const p = index?.platforms?.[platform];
  const platformName = p?.name ?? PLATFORM_NAMES[platform] ?? platform;
  const known = parts.map((id) => p?.parts?.[id]).filter(Boolean);
  const total = known.reduce((sum, [, price]) => sum + price, 0);
  const title = name || `${platformName} build${total ? ` · ${money(total)}` : ''}`;
  const facts = known.length ? `${platformName} · ${known.length} parts · ${money(total)} at the best prices we found.` : `A ${platformName} build.`;
  const names = known.map(([label]) => label);
  const highlights = names.length ? ` Includes ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}.` : '';
  const description = `${note ? `${note} ` : ''}${facts}${highlights} Open it to check the fit and compare retailers.`;
  return { title, description };
}

function page({ title, description, image, url, target }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Drop-In Builds</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#0e2a47">
<meta name="robots" content="noindex">
<meta property="og:site_name" content="Drop-In Builds">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`Blueprint drawing of ${title}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="icon" href="${SITE}/favicon.svg">
</head>
<body style="font-family: system-ui, sans-serif; background: #0e2a47; color: #e8eef5; padding: 32px;">
<p>Opening <a style="color: #ec8a45" href="${esc(target)}">${esc(title)}</a> on Drop-In Builds…</p>
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>
</body>
</html>`;
}

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=300' : 'no-store' },
  });

/** Answers a share link, or returns null when the path isn't one. */
export async function sharePage(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  const community = path.match(/^\/c\/([a-z0-9]{10})$/);
  const custom = path.match(/^\/b\/([^/]+)$/);
  if (!community && !custom) return null;

  let platform, parts, name = '', note = '', image;
  if (community) {
    const row = await env.DB.prepare('SELECT platform, name, note, parts FROM builds WHERE id = ? AND hidden = 0').bind(community[1]).first();
    if (!row) return html(page({ title: 'Build not found', description: 'This shared build was removed.', image: `${SITE}/og/site.png`, url: url.href, target: SITE }), 404);
    ({ platform, name, note } = row);
    parts = JSON.parse(row.parts);
    const own = `${SITE}/og/c/${community[1]}.png`;
    image = (await exists(own)) ? own : `${SITE}/og/${platform}.png`;
  } else {
    const parsed = parseCode(decodeURIComponent(custom[1]));
    if (!parsed) return html(page({ title: 'Drop-In Builds', description: 'Plan a firearm build part by part.', image: `${SITE}/og/site.png`, url: url.href, target: SITE }), 404);
    ({ platform, parts } = parsed);
    image = `${SITE}/og/${platform}.png`;
  }

  const index = await priceIndex();
  const { title, description } = describe(index, platform, parts, name, note);
  const target = `${SITE}/?b=${encodeURIComponent(`${platform}~${parts.join('.')}`)}`;
  return html(page({ title, description, image, url: url.href, target }));
}
