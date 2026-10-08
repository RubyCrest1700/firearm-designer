/**
 * Renders the guide pages to static HTML. Fit charts run the builder's own rules on each pair of
 * parts, and prices come from the same catalog (sample prices overlaid with the nightly live ones),
 * so a guide never says something the builder disagrees with.
 */
import { PLATFORMS, PRICES_UPDATED_AT } from '../data';
import { RETAILERS, buyUrl } from '../data/retailers';
import { bestOffer, money, presetSelection, worst } from '../engine';
import type { Part, Platform, Severity, Tier } from '../types';
import { GUIDES, type AcrossChart, type FitChart, type Guide, type PairChart } from './content';
import { titleCase } from '../text';
import { COMMUNITY_API, CONTENT_SECURITY_POLICY } from '../config';

export const SITE = 'https://dropinbuilds.com';
const ANALYTICS_TOKEN = '00e0977ba6ee49a7b9a386502da1ef3f';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const label = (p: Part) => (p.name.startsWith(p.brand) ? p.name : `${p.brand} ${p.name}`);
/** A guide's platform: a builder, or a model inside one (a Glock 19 guide charts the Glock 19's own parts). */
const platformOf = (id: string): PageView => {
  const p = PAGE_VIEWS.find((x) => x.pageId === id);
  if (!p) throw new Error(`Guide platform ${id} is not in the catalog`);
  return p;
};
/** Opens the builder on a platform, optionally with parts already chosen. */
const builderUrl = (platform: string, ids: string[] = []) => `/?b=${encodeURIComponent(`${platform}~${ids.join('.')}`)}`;

/* ------------------------------------------------------------------ fit charts */

type Verdict = 'ok' | Severity;
const VERDICT: Record<Verdict, { text: string; order: number }> = {
  ok: { text: 'Fits', order: 0 },
  info: { text: 'Fits, with a note', order: 1 },
  warn: { text: 'Check', order: 2 },
  error: { text: "Won't fit", order: 3 },
};

interface Group { verdict: Verdict; reasons: string[]; labels: string[] }
const byVerdict = (x: Group, y: Group) => VERDICT[x.verdict].order - VERDICT[y.verdict].order;

/** The verdict and reasons for one combination, from the issues that involve every one of `slots`. */
function judge(platform: Platform, build: Record<string, Part>, slots: string[]) {
  const issues = platform.rules(build).filter((i) => slots.every((s) => i.slots.includes(s)));
  return { verdict: (worst(issues) ?? 'ok') as Verdict, reasons: [...new Set(issues.map((i) => i.message))] };
}

/** Parts every combination in a chart is checked with, such as the frame that carries the rail. */
function extras(platform: Platform, ids: string[]) {
  const out: Record<string, Part> = {};
  for (const id of ids) {
    const p = platform.parts.find((x) => x.id === id);
    if (!p) throw new Error(`${platform.id}: no part ${id}`);
    out[p.slot] = p;
  }
  return out;
}

function addTo(groups: Map<string, Group>, j: { verdict: Verdict; reasons: string[] }, name: string) {
  const key = j.verdict + '|' + j.reasons.join('|');
  const g = groups.get(key) ?? { ...j, labels: [] };
  g.labels.push(name);
  groups.set(key, g);
}

/** Every part in slot A against every part in slot B, using only the issues the pair raises between them. */
export function fitChart(platform: Platform, a: string, b: string, withIds: string[] = []) {
  const left = platform.parts.filter((p) => p.slot === a);
  const right = platform.parts.filter((p) => p.slot === b);
  if (!left.length || !right.length) throw new Error(`${platform.id}: no parts in ${a} or ${b}`);
  return left.map((pa) => {
    const groups = new Map<string, Group>();
    for (const pb of right) addTo(groups, judge(platform, { ...extras(platform, withIds), [a]: pa, [b]: pb }, [a, b]), label(pb));
    return { part: pa, groups: [...groups.values()].sort(byVerdict) };
  });
}

/** Every part in one slot (from all the models' catalogs) against each model. */
export function acrossChart(c: AcrossChart) {
  const rows = new Map<string, Part>();
  for (const m of c.models) for (const p of platformOf(m.platform).parts) if (p.slot === c.slot && !rows.has(p.id)) rows.set(p.id, p);
  if (!rows.size) throw new Error(`No parts in ${c.slot} for ${c.heading}`);
  return [...rows.values()].map((part) => {
    const groups = new Map<string, Group>();
    for (const m of c.models) {
      const platform = platformOf(m.platform);
      addTo(groups, judge(platform, { ...extras(platform, m.with ?? []), [c.slot]: part }, [c.slot]), m.label);
    }
    return { part, groups: [...groups.values()].sort(byVerdict) };
  });
}

function listHtml(rows: { part: Part; groups: Group[] }[]) {
  return rows
    .map(({ part, groups }) => `
      <div class="fit-row">
        <h4>${esc(label(part))}</h4>
        <ul>${groups.map((g) => `
          <li class="v-${g.verdict}"><span class="verdict">${VERDICT[g.verdict].text}</span>
            <span class="parts">${g.labels.map(esc).join('<span class="sep"> · </span>')}</span>
            ${g.reasons.map((r) => `<span class="why">${esc(r)}</span>`).join('')}</li>`).join('')}
        </ul>
      </div>`)
    .join('');
}

const CELL: Record<Verdict, string> = { ok: 'Fits', info: 'Note', warn: 'Check', error: 'No' };

/** A table with one column per label; parts that share a label must fit every row the same way. */
function gridHtml(platform: Platform, c: PairChart & { columns: (p: Part) => string }) {
  const left = platform.parts.filter((p) => p.slot === c.a).sort((x, y) => (c.rowOrder ? c.rowOrder(x) - c.rowOrder(y) : 0));
  const cols = new Map<string, Part[]>();
  const right = platform.parts.filter((x) => x.slot === c.b).sort((x, y) => parseFloat(c.columns(x)) - parseFloat(c.columns(y)) || c.columns(x).localeCompare(c.columns(y)));
  for (const p of right) cols.set(c.columns(p), [...(cols.get(c.columns(p)) ?? []), p]);
  const cells = left.map((pa) =>
    [...cols.entries()].map(([name, ps]) => {
      const results = ps.map((pb) => judge(platform, { ...extras(platform, c.with ?? []), [c.a]: pa, [c.b]: pb }, [c.a, c.b]));
      const first = JSON.stringify(results[0]);
      if (results.some((r) => JSON.stringify(r) !== first)) throw new Error(`${platform.id}: parts in column ${name} fit ${label(pa)} differently`);
      return results[0];
    }));
  return `
      <div class="grid-wrap"><table class="grid">
        <thead><tr><th scope="col"></th>${[...cols.keys()].map((n) => `<th scope="col">${esc(n)}</th>`).join('')}</tr></thead>
        <tbody>${left.map((pa, i) => `
          <tr><th scope="row">${esc(label(pa))}</th>${cells[i].map((r) => `<td class="v-${r.verdict}"${r.reasons.length ? ` title="${esc(r.reasons.join(' '))}"` : ''}>${esc(c.short && r.reasons.length ? [...new Set(r.reasons.map(c.short))].join(', ') : CELL[r.verdict])}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table></div>`;
}

function chartHtml(platform: Platform, c: FitChart) {
  const body = 'slot' in c ? listHtml(acrossChart(c)) : c.columns ? gridHtml(platform, { ...c, columns: c.columns }) : listHtml(fitChart(platform, c.a, c.b, c.with));
  return `
    <section class="chart">
      <h2>${esc(titleCase(c.heading))}</h2>
      <p class="muted">${esc(c.intro)}</p>
      ${body}
    </section>`;
}

/* ---------------------------------------------------------------- prices, picks */

const TIER_LABEL: Record<Tier, string> = { budget: 'Budget Pick', value: 'Best Value Pick', premium: 'Premium Pick' };
const TIERS: Tier[] = ['budget', 'value', 'premium'];

function priceHtml(part: Part) {
  const o = bestOffer(part);
  if (!o) return '';
  const store = RETAILERS[o.retailer]?.name ?? o.retailer;
  const href = buyUrl(o, `${part.brand} ${part.name}`);
  const when = o.checkedAt ? `checked ${shortDate(o.checkedAt)}` : 'sample price';
  return `<p class="price"><b>${money(o.price)}</b> at <a href="${esc(href)}" rel="sponsored nofollow noopener" target="_blank">${esc(store)}</a> <span class="muted">(${when})</span></p>`;
}

function picksHtml(platform: Platform, slots: string[]) {
  return slots
    .map((slot) => {
      const all = platform.parts.filter((p) => p.slot === slot);
      const picked = all.filter((p) => p.pick).sort((x, y) => TIERS.indexOf(x.pick!.tier) - TIERS.indexOf(y.pick!.tier));
      const list = picked.length ? picked : [...all].sort((x, y) => (bestOffer(x)?.price ?? 0) - (bestOffer(y)?.price ?? 0)).slice(0, 3);
      const name = platform.slots.find((s) => s.id === slot)?.name ?? slot;
      return `
      <h3>${esc(titleCase(name))}</h3>
      <div class="cards">${list.map((p) => `
        <div class="card">
          ${p.pick ? `<p class="tier tier-${p.pick.tier}">${TIER_LABEL[p.pick.tier]}</p>` : ''}
          <p class="pname">${esc(label(p))}</p>
          <p class="specs">${p.specs.map(esc).join(' · ')}</p>
          ${p.pick ? `<p>${esc(p.pick.note)}</p>` : ''}
          ${priceHtml(p)}
        </div>`).join('')}
      </div>`;
    })
    .join('');
}

function startersHtml(platform: Platform) {
  return TIERS.map((tier) => {
    const sel = presetSelection(platform, tier);
    const ids = Object.values(sel);
    const total = ids.reduce((sum, id) => sum + (bestOffer(platform.parts.find((p) => p.id === id)!)?.price ?? 0), 0);
    const name = tier === 'value' ? 'Best Value' : tier[0].toUpperCase() + tier.slice(1);
    return `<a class="starter" href="${builderUrl(platform.id, ids)}"><b>${name} ${esc(platform.name)}</b><span>${ids.length} parts, ${money(total)} at the lowest prices we list</span></a>`;
  }).join('');
}

/* ---------------------------------------------------------------------- pages */

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function layout(o: { title: string; description: string; path: string; body: string; jsonLd: object[]; notFound?: boolean; image?: string; current?: 'build' | 'faq' }) {
  const current = o.current ?? (o.notFound ? undefined : 'faq');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />
<meta name="referrer" content="strict-origin-when-cross-origin" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(o.title)}</title>${o.notFound ? '\n<meta name="robots" content="noindex" />' : ''}
<meta name="description" content="${esc(o.description)}" />
<link rel="canonical" href="${SITE}${o.path}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="theme-color" content="#0e2a47" />
<meta property="og:site_name" content="Drop-In Builds" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="${esc(o.description)}" />
<meta property="og:url" content="${SITE}${o.path}" />
${o.image ? `<meta property="og:image" content="${SITE}${o.image}" />\n<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />\n<meta name="twitter:card" content="summary_large_image" />\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Archivo+Narrow:wght@500;600;700&display=swap" />
<style>${CSS}</style>
${o.jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<header class="site-header"><div class="wrap header-row">
  <a class="brand" href="/">${MARK}<span class="brand-name">Drop-In <b>Builds</b></span></a>
  <nav aria-label="Main"><a href="/">Home</a><a href="/#build"${current === 'build' ? ' aria-current="page"' : ''}>Build</a><a href="/#saved">My Builds</a><a href="/#community">Community</a><a href="/faq/"${current === 'faq' ? ' aria-current="page"' : ''}>FAQ</a></nav>
</div></header>
<main class="wrap">${o.body}</main>
<footer class="site-footer"><div class="wrap">
  <p class="brand-name small">Drop-In <b>Builds</b></p>
  <p>Plan a build part by part, check that everything fits, and see where each part costs least. We don't sell anything.</p>
  <p>Fit charts come from the same rules the builder uses. Prices marked Sample aren't tracked yet; always confirm the price and fit with the retailer and the maker. Parts that are the serialized firearm ship to a licensed dealer, and laws vary by state.</p>
  <p>Some retailer links may earn us a small commission at no extra cost to you. It never changes which parts we show or how we check fit.</p>
  <p><a class="foot-link" href="/feedback/">Send Feedback</a></p>
</div></footer>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${ANALYTICS_TOKEN}"}'></script>
</body>
</html>
`;
}

export function guidePage(g: Guide, builtAt: string) {
  const platform = platformOf(g.platform);
  const path = `/faq/${g.slug}/`;
  const body = `
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/faq/">FAQ</a> › <span>${esc(g.crumb ?? platform.name)}</span></nav>
  <article>
    <h1>${esc(g.h1)}</h1>
    <p class="lede">${esc(g.lede)}</p>
    <section class="answers">
      <h2>The Short Answer</h2>
      <ul>${g.answers.map((a) => `<li>${a}</li>`).join('')}</ul>
      <a class="cta" href="${builderUrl(platform.id)}">Check Your Own ${esc(platform.name)} Build</a>
    </section>
    ${g.charts.map((c) => chartHtml(platform, c)).join('')}
    <section>
      <h2>Parts Worth a Look</h2>
      <p class="muted">Our picks from the ${esc(platform.name)} catalog, with the lowest price we list${PRICES_UPDATED_AT ? ` (prices last checked ${shortDate(PRICES_UPDATED_AT)})` : ''}.</p>
      ${picksHtml(platform, g.picks)}
    </section>
    <section>
      <h2>Start from a Complete Build</h2>
      <p class="muted">Every part already checked to fit. Open one in the builder and swap anything you like.</p>
      <div class="starters">${startersHtml(platform)}</div>
    </section>
    <section class="sources">
      <h2>Sources</h2>
      <ul>${g.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join('')}</ul>
      <p class="muted">Updated ${shortDate(builtAt)}.</p>
    </section>
    ${relatedHtml(g)}
  </article>`;
  return layout({
    title: `${g.title} | Drop-In Builds`,
    description: g.description,
    path,
    body,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, dateModified: builtAt, mainEntityOfPage: SITE + path, publisher: { '@type': 'Organization', name: 'Drop-In Builds', url: SITE } },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'FAQ', item: SITE + '/faq/' },
        { '@type': 'ListItem', position: 3, name: g.title, item: SITE + path },
      ] },
    ],
  });
}

function relatedHtml(g: Guide) {
  const maker = platformOf(g.platform).maker;
  const same = (x: Guide) => Number(platformOf(x.platform).maker === maker);
  const others = GUIDES.filter((x) => x !== g).sort((x, y) => same(y) - same(x)).slice(0, 4);
  return `<section><h2>More Fit Questions</h2><ul class="guide-list">${others.map((x) => `<li><a href="/faq/${x.slug}/">${esc(x.h1)}</a></li>`).join('')}</ul></section>`;
}

/** Site questions at the top of the FAQ page, in sections. Plain text answers, also published as FAQPage structured data. */
const GENERAL_FAQ: { section: string; items: { q: string; a: string }[] }[] = [
  { section: 'About Drop-In Builds', items: [
    { q: 'Is Drop-In Builds a store?', a: "No. We don't sell anything. You plan the build here, and every buy link goes to the retailer or maker, where you check out as usual." },
    { q: 'Do I need an account?', a: 'No. There is nothing to sign up for. Builds you save are kept in your browser, and Copy Link gives you a link that opens the same build on any other device.' },
    { q: 'Which platforms can I build?', a: 'The AR-15, AR-10 and AR-9, the Glock 17, 19, 19X, 26, 34, 45 and 47, the Glock 43X and 48, the Glock 20 and 21, the Sig P320, the Sig P365, the S&W M&P 2.0 and the Springfield Hellcat. More platforms are on the way.' },
    { q: 'Do you make money from the links?', a: 'Some retailer links may earn us a small commission at no extra cost to you. It never changes which parts we show or how we check fit.' },
  ] },
  { section: 'Using the Builder', items: [
    { q: 'How do you know the parts fit?', a: "Each part carries its real measurements and the maker's own fit notes, and the builder checks every part against the rest of your build. Always confirm fit with the maker before you buy." },
    { q: 'What do Conflict, Check and Note mean?', a: "Conflict means the part won't work with something already in your build. Check means it can work but needs something extra, like an adapter plate, or a second look at the maker's fit notes. Note is useful information that doesn't change whether it fits." },
    { q: 'What is the Heads Up section?', a: "Things worth knowing about the build as a whole, like extra flash and blast from a short barrel, a light trigger pull, or ammo that must never go in that chamber. None of them stop the build from working." },
    { q: 'What are starter builds?', a: 'For each platform we put together three complete, compatible builds: Budget, Best Value and Premium. Open one in the builder and swap any part you like.' },
    { q: 'How accurate are the drawings and weights?', a: "Drawings are drawn to each part's real proportions from published dimensions and patent drawings, so they show how the build will look. They aren't for machining. Weights marked ≈ include estimates until we confirm the makers' listed weights." },
    { q: 'Can I share a build?', a: 'Yes. Copy Link gives you a link that opens the exact build. A complete build with no conflicts can also be shared on the Community page, where other builders can vote on it.' },
    { q: 'How are community builds featured?', a: 'Each week the builds with the most votes, and the most people clicking through to buy the parts, are featured at the top of the Community page.' },
  ] },
  { section: 'Prices and Alerts', items: [
    { q: 'Where do the prices come from?', a: "We check retailer and maker sites every night where they allow it, and show each part's price at every retailer we track. Prices marked Sample aren't tracked yet, so always confirm the price at the retailer." },
    { q: "Why isn't my favorite retailer listed?", a: "Some retailers don't allow automated price checks, and we respect that. We add retailers as they make their prices available to us." },
    { q: 'How do price alerts work?', a: 'Save a build to My Builds, then enter your email there. We send one email a day at most, only when a part in a saved build moves by $20 and 10% or more. Every email has a one-click unsubscribe link.' },
    { q: 'What do you do with my email address?', a: "We only use it to send the price alerts you asked for. We don't sell it or share it, and unsubscribing deletes it." },
  ] },
  { section: 'Buying and the Law', items: [
    { q: 'What does FFL mean on a part?', a: 'FFL marks the serialized part, which is legally the firearm (a pistol frame or fire control unit, or an AR lower receiver). It ships to a licensed dealer near you, who handles the transfer and background check.' },
    { q: 'Can every part ship to my state?', a: 'Not always. Some states limit magazine capacity, muzzle devices or other features, and retailers will not ship restricted items there. Check your state and local laws before you buy.' },
    { q: 'Is it legal to build my own firearm?', a: "Laws vary by country, state and city, and they change. We don't give legal advice, so check the rules where you live, and buy the serialized part through a licensed dealer." },
  ] },
];
const FAQ_ITEMS = GENERAL_FAQ.flatMap((g) => g.items);

export function indexPage(builtAt: string) {
  const makers = [...new Set(GUIDES.map((g) => platformOf(g.platform).maker))];
  const body = `
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>FAQ</span></nav>
  <h1>Frequently Asked Questions</h1>
  <p class="lede">How the site works, and straight answers to "will this fit?" for the most common pistol and rifle builds.</p>
  ${GENERAL_FAQ.map((g) => `
  <section>
    <h2>${esc(g.section)}</h2>
    <div class="faq">${g.items.map((f) => `
      <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
    </div>
  </section>`).join('')}
  ${makers.map((m) => `
  <section>
    <h2>${esc(m)} Fit Questions</h2>
    <ul class="guide-cards">${GUIDES.filter((g) => platformOf(g.platform).maker === m).map((g) => `
      <li><a href="/faq/${g.slug}/"><b>${esc(g.h1)}</b><span>${esc(g.description)}</span></a></li>`).join('')}
    </ul>
  </section>`).join('')}
  <p><a class="cta" href="/#build">Open the Builder</a></p>
  <p class="muted">Every fit chart is checked part against part with the same rules the builder uses. Updated ${shortDate(builtAt)}.</p>`;
  return layout({
    title: 'FAQ: Glock, Sig, M&P, Hellcat and AR-15 Parts Compatibility | Drop-In Builds',
    description: 'How Drop-In Builds works, plus fit charts for Glock, Sig, S&W M&P 2.0, Springfield Hellcat and AR-15 parts: slides, frames, barrels, optics and more.',
    path: '/faq/',
    body,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'FAQ', url: SITE + '/faq/' },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ_ITEMS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  });
}

/* -------------------------------------------------------------- platform pages */

/**
 * One page per platform at /build/<slug>/, so search engines can find each platform's parts, starter
 * builds and prices (the builder itself lives at one address and is drawn by JavaScript). Platforms
 * added later get a page automatically, with an address made from their name.
 */
const PLATFORM_SLUGS: Record<string, string> = {
  ar15: 'ar-15', ar10: 'ar-10', glock9: 'glock-17-19-19x-26-34-45-47', glock17: 'glock-17', glock19: 'glock-19', glock26: 'glock-26', glock43x: 'glock-43x-48',
  glock20: 'glock-20-21', p320: 'sig-p320', p365: 'sig-p365', mp2: 'smith-wesson-mp-2-0', hellcat: 'springfield-hellcat',
};
/**
 * The pages: one per builder, plus one per model inside a builder that has models, so the Glock 17, 19 and 26
 * keep their own pages (with their own starter builds and parts) inside the double-stack 9mm Glock builder.
 */
export interface PageView extends Platform { pageId: string }
export const PAGE_VIEWS: PageView[] = PLATFORMS.flatMap((p) => [
  { ...p, pageId: p.id },
  ...(p.models ?? []).map((m) => ({ ...p, pageId: m.id, name: m.name, blurb: m.blurb, presets: m.presets, parts: m.parts ? p.parts.filter(m.parts) : p.parts })),
]);

export const platformSlug = (p: Platform & { pageId?: string }) =>
  PLATFORM_SLUGS[p.pageId ?? p.id] ?? p.name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const partsByPrice = (parts: Part[]) => [...parts].sort((x, y) => (bestOffer(x)?.price ?? 0) - (bestOffer(y)?.price ?? 0));

function starterListHtml(platform: Platform) {
  return TIERS.map((tier) => {
    const parts = Object.values(presetSelection(platform, tier)).map((id) => platform.parts.find((p) => p.id === id)!).filter(Boolean);
    const name = tier === 'value' ? 'Best Value' : tier[0].toUpperCase() + tier.slice(1);
    return `
      <details class="starter-parts"><summary>What's in the ${name} ${esc(platform.name)}</summary><ul>${parts.map((p) => {
        const slot = platform.slots.find((s) => s.id === p.slot)?.name ?? p.slot;
        const o = bestOffer(p);
        return `<li><span class="muted">${esc(titleCase(slot))}:</span> ${esc(label(p))}${o ? ` <b>${money(o.price)}</b>` : ''}</li>`;
      }).join('')}</ul></details>`;
  }).join('');
}

function slotTableHtml(platform: Platform) {
  return platform.slots
    .map((slot) => {
      const parts = partsByPrice(platform.parts.filter((p) => p.slot === slot.id));
      if (!parts.length) return '';
      const prices = parts.map((p) => bestOffer(p)?.price).filter((n): n is number => n != null);
      const range = prices.length ? (prices[0] === prices[prices.length - 1] ? money(prices[0]) : `${money(prices[0])} to ${money(prices[prices.length - 1])}`) : '';
      return `
      <section class="slot">
        <h3>${esc(titleCase(slot.name))}</h3>
        <p class="muted">${parts.length} option${parts.length > 1 ? 's' : ''}${range ? `, ${range}` : ''}.${slot.hint ? ` ${esc(slot.hint)}` : ''}</p>
        <div class="grid-wrap"><table class="parts">
          <tbody>${parts.map((p) => `
            <tr><th scope="row">${esc(label(p))}${p.pick ? ` <span class="tier tier-${p.pick.tier}">${TIER_LABEL[p.pick.tier]}</span>` : ''}<span class="specs">${p.specs.map(esc).join(' · ')}</span></th>
              <td>${priceHtml(p)}</td></tr>`).join('')}
          </tbody>
        </table></div>
      </section>`;
    })
    .join('');
}

/** A model's page says which builder it lives in. */
function includesHtml(platform: PageView) {
  if (platform.pageId === platform.id) return '';
  const builder = PLATFORMS.find((p) => p.id === platform.id)!;
  return `\n    <p class="includes">Built in our ${esc(builder.name)} builder, where frames and slides mix freely.</p>`;
}

export function platformPage(platform: PageView) {
  const slug = platformSlug(platform);
  const path = `/build/${slug}/`;
  const brands = new Set(platform.parts.map((p) => p.brand)).size;
  const guides = GUIDES.filter((g) => platformOf(g.platform).id === platform.id);
  const related = guides.length ? guides : GUIDES.filter((g) => platformOf(g.platform).maker === platform.maker).slice(0, 4);
  const others = PAGE_VIEWS.filter((p) => p.pageId !== platform.pageId);
  const budget = Object.values(presetSelection(platform, 'budget')).reduce((sum, id) => sum + (bestOffer(platform.parts.find((p) => p.id === id)!)?.price ?? 0), 0);
  const body = `
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/build/">Platforms</a> › <span>${esc(platform.name)}</span></nav>
  <article>
    <h1>${esc(platform.name)} Build Planner: Parts, Fit and Prices</h1>
    <p class="lede">${esc(platform.blurb)} ${platform.parts.length} parts from ${brands} brands, each checked for fit against the rest of your build, with prices compared across retailers.</p>${includesHtml(platform)}
    <a class="cta" href="${builderUrl(platform.id)}">Open the ${esc(platform.name)} Builder</a>
    <section>
      <h2>Start from a Complete Build</h2>
      <p class="muted">Three ${esc(platform.name)} builds where every part already fits, from ${money(budget)}. Open one in the builder and swap anything you like.</p>
      <div class="starters">${startersHtml(platform)}</div>
      ${starterListHtml(platform)}
    </section>
    <section>
      <h2>${esc(platform.name)} Parts and Prices</h2>
      <p class="muted">Every ${esc(platform.name)} part we list, cheapest first, with the lowest price we found${PRICES_UPDATED_AT ? ` (prices last checked ${shortDate(PRICES_UPDATED_AT)})` : ''}. The builder checks how each one fits with the rest of your parts.</p>
      ${slotTableHtml(platform)}
    </section>
    ${related.length ? `<section><h2>Fit Questions</h2><ul class="guide-list">${related.map((g) => `<li><a href="/faq/${g.slug}/">${esc(g.h1)}</a></li>`).join('')}</ul></section>` : ''}
    <section><h2>Other Platforms</h2><ul class="guide-list cols">${others.map((p) => `<li><a href="/build/${platformSlug(p)}/">${esc(p.name)}</a></li>`).join('')}</ul></section>
  </article>`;
  return layout({
    title: `${platform.name} Build Planner: Parts, Fit and Prices | Drop-In Builds`,
    description: `Plan a ${platform.name} build part by part. ${platform.parts.length} parts checked for fit, prices compared across retailers, and starter builds from ${money(budget)}.`,
    path,
    body,
    image: `/og/${platform.id}.png`,
    current: 'build',
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebPage', name: `${platform.name} Build Planner`, url: SITE + path, publisher: { '@type': 'Organization', name: 'Drop-In Builds', url: SITE } },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Platforms', item: SITE + '/build/' },
        { '@type': 'ListItem', position: 3, name: platform.name, item: SITE + path },
      ] },
    ],
  });
}

/** /build/: every platform, grouped like the builder's platform menu. */
export function platformsIndexPage() {
  const families = [...new Set(PAGE_VIEWS.map((p) => p.family))];
  const body = `
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>Platforms</span></nav>
  <h1>Build Planners for Every Platform</h1>
  <p class="lede">Pick a platform to see its parts, starter builds and prices, then open it in the builder to check the fit of every part.</p>
  ${families.map((f) => `
  <section>
    <h2>${esc(f)}s</h2>
    <ul class="guide-cards">${PAGE_VIEWS.filter((p) => p.family === f).map((p) => `
      <li><a href="/build/${platformSlug(p)}/"><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span></a></li>`).join('')}
    </ul>
  </section>`).join('')}
  <p><a class="cta" href="/#build">Open the Builder</a></p>`;
  return layout({
    title: 'Firearm Build Planners: AR, Glock, Sig and More | Drop-In Builds',
    description: 'Plan an AR-15, AR-10, AR-9, Glock, Sig, M&P or Hellcat build part by part. Parts checked for fit, prices compared across retailers.',
    path: '/build/',
    body,
    current: 'build',
    jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Build Planners', url: SITE + '/build/' }],
  });
}

/** GitHub Pages shows /404.html for any address that doesn't exist. */
export function notFoundPage() {
  return layout({
    title: 'Page Not Found | Drop-In Builds',
    description: 'This page doesn\'t exist on Drop-In Builds.',
    path: '/404.html',
    notFound: true,
    jsonLd: [],
    body: `<h1>Page Not Found</h1>
  <p>That address doesn't match a page on Drop-In Builds. It may have been mistyped, or the page may have moved.</p>
  <p><a href="/">Go to the Home Page</a> · <a href="/#build">Start a Build</a> · <a href="/faq/">Read the FAQ</a></p>`,
  });
}

/**
 * Send Feedback page, linked from every footer. public/feedback.js sends the form to the Worker
 * (worker/src/feedback.js) along with the page the visitor came from. Kept out of search and the sitemap.
 */
export function feedbackPage() {
  return layout({
    title: 'Send Feedback | Drop-In Builds',
    description: 'Tell us what to add, fix or change on Drop-In Builds.',
    path: '/feedback/',
    notFound: true,
    jsonLd: [],
    body: `<h1>Send Feedback</h1>
  <p class="lede">Something wrong, missing or confusing? A part or platform you want added? We read every message.</p>
  <form id="feedback" class="feedback-form" data-api="${esc(COMMUNITY_API)}" novalidate>
    <label for="fb-message">Your Feedback</label>
    <textarea id="fb-message" name="message" rows="6" maxlength="2000" required placeholder="What should we add, fix or change?"></textarea>
    <label for="fb-email">Email <span class="muted">(Optional)</span></label>
    <input id="fb-email" name="email" type="email" maxlength="254" autocomplete="email" placeholder="Only if you'd like a reply" />
    <div class="hp" aria-hidden="true"><label for="fb-website">Website</label><input id="fb-website" name="website" tabindex="-1" autocomplete="off" /></div>
    <input type="hidden" name="page" />
    <p class="form-error" role="alert" hidden></p>
    <button class="cta" type="submit">Send Feedback</button>
    <p class="muted small-print">We only use your email to answer you. Please don't include personal details you wouldn't want stored.</p>
  </form>
  <div id="feedback-sent" class="answers" hidden>
    <h2 tabindex="-1">Thanks for the Feedback</h2>
    <p>Your message is on its way. If you left an email, we'll reply when we can.</p>
    <p><a class="back-link" href="/">Back to the Site</a></p>
  </div>
  <script defer src="/feedback.js"></script>`,
  });
}

export function sitemap(builtAt: string) {
  const day = builtAt.slice(0, 10);
  const urls = ['/', '/build/', ...PAGE_VIEWS.map((p) => `/build/${platformSlug(p)}/`), '/faq/', ...GUIDES.map((g) => `/faq/${g.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${day}</lastmod></url>`).join('\n')}
</urlset>
`;
}

export const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;

/* ----------------------------------------------------------------------- style */

const MARK = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3l18.19 10.5v21L24 45 5.81 34.5v-21z" fill="none" stroke="currentColor" stroke-width="2.5"/><g transform="translate(11.7 10.8) scale(.55)"><path d="M4 9h10a15 15 0 0 1 0 30H4z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><rect x="36" y="9" width="7" height="30" rx="1.5" fill="#d4691e"/></g></svg>`;

const CSS = `
:root{--bg:#f2f3f0;--surface:#fff;--surface-2:#f7f8f6;--ink:#17212b;--muted:#56616b;--line:#dde2e0;--navy:#0e2a47;--on-navy:#e8eef5;--on-navy-muted:#a9b8c8;--blue:#1e5a91;--cta:#d4691e;--cta-ink:#fff;
--ok:#2e7d4f;--ok-soft:#e4f2e9;--warn:#a8670a;--warn-soft:#fbefd9;--note:#1d5fa8;--note-soft:#e3eefb;--err:#b8382c;--err-soft:#fbe6e3;--shadow:0 1px 2px rgba(16,30,45,.06),0 4px 14px rgba(16,30,45,.06);
--f-sans:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--f-head:'Archivo Narrow','Archivo',system-ui,sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0e1318;--surface:#151c23;--surface-2:#1a232c;--ink:#e6ebef;--muted:#a3aeb8;--line:#2a3540;--navy:#0a1f36;--blue:#6aa6dd;--cta:#ec8a45;--cta-ink:#1a0f06;
--ok:#5fc58a;--ok-soft:rgba(95,197,138,.12);--warn:#e7b04f;--warn-soft:rgba(231,176,79,.13);--note:#79aef0;--note-soft:rgba(121,174,240,.14);--err:#f07a6c;--err-soft:rgba(240,122,108,.13);--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 18px rgba(0,0,0,.25);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.6 var(--f-sans);-webkit-text-size-adjust:100%}
a{color:var(--blue)}
.wrap{max-width:860px;margin:0 auto;padding:0 16px}
.site-header{background:var(--navy);color:var(--on-navy)}
.header-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;padding:10px 0;margin-right:auto}
.mark{width:34px;height:34px}
.brand-name{font:500 19px/1 var(--f-head);letter-spacing:.01em;text-transform:uppercase;margin:0}
.brand-name b{font-weight:700;color:var(--cta)}
.brand-name.small{font-size:16px;margin-bottom:8px}
.site-header nav{display:flex;gap:4px}
@media (max-width:560px){.header-row{gap:0}.site-header nav{width:calc(100% + 16px);margin:0 -8px 4px;justify-content:space-between;gap:0}}
.site-header nav a{color:var(--on-navy-muted);text-decoration:none;font-weight:600;font-size:15px;padding:8px 10px;border-radius:6px}
.site-header nav a:hover{color:var(--on-navy);background:rgba(255,255,255,.08)}
@media (max-width:560px){.site-header nav a{padding:8px 6px;font-size:14px;white-space:nowrap}}
@media (max-width:360px){.site-header nav a{padding:8px 3px;font-size:13px}}
main.wrap{padding-top:20px;padding-bottom:40px}
.crumbs{font-size:14px;color:var(--muted);margin-bottom:8px}
.crumbs a{color:var(--muted)}
h1{font:700 clamp(28px,5vw,40px)/1.1 var(--f-head);margin:8px 0 12px;letter-spacing:-.01em}
h2{font:700 24px/1.2 var(--f-head);margin:36px 0 8px}
h3{font:700 19px/1.2 var(--f-head);margin:20px 0 8px}
h4{font-size:16px;margin:0 0 6px}
.lede{font-size:18px;color:var(--muted);margin:0 0 16px}
.includes{font-weight:700;color:var(--blue);margin:-6px 0 16px}
.muted{color:var(--muted);font-size:15px}
section{margin:0}
.answers{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--cta);border-radius:10px;padding:4px 20px 20px;box-shadow:var(--shadow)}
.answers h2{margin-top:16px}
.answers li{margin:6px 0}
.cta{display:inline-block;background:var(--cta);color:var(--cta-ink);text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;margin-top:8px}
.fit-row{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0;box-shadow:var(--shadow)}
.fit-row ul{list-style:none;margin:0;padding:0}
.fit-row li{padding:8px 10px;border-radius:6px;margin-top:6px;font-size:15px}
.verdict{display:inline-block;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.03em;margin-right:8px}
.why{display:block;color:var(--muted);font-size:14px;margin-top:2px}
.sep{color:var(--muted)}
.v-ok{background:var(--ok-soft)}.v-ok .verdict{color:var(--ok)}
.v-info{background:var(--note-soft)}.v-info .verdict{color:var(--note)}
.v-warn{background:var(--warn-soft)}.v-warn .verdict{color:var(--warn)}
.v-error{background:var(--err-soft)}.v-error .verdict{color:var(--err)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;box-shadow:var(--shadow);font-size:15px}
.card p{margin:4px 0}
.pname{font-weight:700}
.specs{color:var(--muted);font-size:14px}
.tier{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--cta)}
.price b{font-size:17px}
.starters{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.starter{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;text-decoration:none;color:var(--ink);box-shadow:var(--shadow)}
.starter span{color:var(--muted);font-size:14px}
.starter:hover{border-color:var(--cta)}
.sources li,.guide-list li{margin:4px 0}
.grid-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);margin:10px 0}
.grid{border-collapse:collapse;font-size:14px;width:100%}
@media (min-width:1140px){.grid-wrap{margin-left:-140px;margin-right:-140px}}
.grid th,.grid td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}
.grid thead th{font-size:13px;color:var(--muted);white-space:normal}
.grid tbody th{text-align:left;font-weight:600;white-space:normal;min-width:140px;position:sticky;left:0;background:var(--surface);padding-left:10px}
@media (max-width:560px){.grid{font-size:13px}.grid tbody th{min-width:120px}}
.grid td{font-weight:700;font-size:13px;padding:8px 3px}
.grid td.v-ok{color:var(--ok)}.grid td.v-info{color:var(--note)}.grid td.v-warn{color:var(--warn)}.grid td.v-error{color:var(--err)}
.faq{display:grid;gap:8px}
.faq details{background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow)}
.faq summary{cursor:pointer;font-weight:700;padding:14px 16px;list-style-position:inside}
.faq summary:hover{color:var(--blue)}
.faq details p{padding:0 16px 14px;color:var(--muted);margin:0}
.site-header nav a[aria-current]{color:var(--on-navy);background:rgba(255,255,255,.1)}
.guide-cards{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.guide-cards a{display:block;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;text-decoration:none;color:var(--ink);box-shadow:var(--shadow)}
.guide-cards a:hover{border-color:var(--cta)}
.guide-cards span{display:block;color:var(--muted);font-size:15px;margin-top:2px}
.starter-parts{background:var(--surface);border:1px solid var(--line);border-radius:10px;margin-top:10px;box-shadow:var(--shadow)}
.starter-parts summary{cursor:pointer;font-weight:700;padding:12px 16px}
.starter-parts ul{margin:0;padding:0 16px 14px 34px;font-size:15px}
.starter-parts li{margin:3px 0}
.parts{border-collapse:collapse;width:100%;font-size:15px}
.parts th,.parts td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
.parts tr:last-child th,.parts tr:last-child td{border-bottom:0}
.parts th{font-weight:600}
.parts th .specs{display:block;font-weight:400;margin-top:2px}
.parts th .tier{display:inline-block;margin-left:6px}
.parts td{white-space:nowrap;width:1%}
.parts td .price{margin:0}
@media (max-width:560px){.parts td{white-space:normal;width:38%}.parts td .muted{display:block}}
.guide-list.cols{columns:2 200px}
.site-footer{border-top:1px solid var(--line);padding:24px 0 40px;color:var(--muted);font-size:14px}
.site-footer .foot-link{color:var(--muted)}
.feedback-form{display:grid;gap:6px;max-width:560px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;box-shadow:var(--shadow)}
.feedback-form label{font-weight:700;font-size:15px;margin-top:8px}
.feedback-form label:first-child{margin-top:0}
.feedback-form textarea,.feedback-form input{width:100%;font:inherit;font-size:16px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.feedback-form textarea{resize:vertical;min-height:130px}
.feedback-form textarea:focus,.feedback-form input:focus{outline:2px solid var(--blue);outline-offset:1px}
.feedback-form .cta{border:0;font:inherit;font-weight:700;cursor:pointer;justify-self:start;margin-top:10px}
.feedback-form .cta:disabled{opacity:.6;cursor:wait}
.feedback-form[hidden]{display:none}
.feedback-form .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.form-error{color:var(--err);margin:4px 0 0;font-size:15px}
.small-print{margin:4px 0 0;font-size:13px}
@media (max-width:560px){.feedback-form .cta{justify-self:stretch;text-align:center}}
`;

/** The FAQ moved from /guides/ to /faq/. GitHub Pages can't send real redirects, so each old address gets a
 *  page that forwards at once; search engines read an instant refresh plus a canonical link as a permanent move. */
export function redirectPage(path: string) {
  const to = esc(SITE + path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved | Drop-In Builds</title>
<link rel="canonical" href="${to}">
<meta http-equiv="refresh" content="0; url=${to}">
</head>
<body><p>This page moved to <a href="${to}">${to}</a>.</p></body>
</html>
`;
}
