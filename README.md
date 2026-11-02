# Drop-In Builds

A PCPartPicker-style build planner for modular firearm platforms. Pick a platform, choose a part for
each slot, and the app checks compatibility, compares retailer prices, and suggests budget,
best-value and premium builds. It is a planning tool, not a store.

Platforms: AR-15, AR-10 (DPMS and Armalite patterns), AR-9, Glock 17 / 19 / 19X / 26 / 34 / 45 / 47, Glock 43X / 48,
Glock 20 / 21, Sig P320, Sig P365, S&W M&P 2.0, Springfield Hellcat. The AKs and 1911/2011 are shelved in archive/.

## Run it

    npm install
    npm run dev            # local dev server
    npm test               # price extractor and robots.txt tests
    npm run check-data     # every preset build is complete and conflict-free
    npm run build          # type-check + production build to dist/, then the guide pages
    npm run guides         # write dist/faq/ (and /guides/ forwards), sitemap.xml and robots.txt (runs as part of build)
    npm run update-prices  # refresh data/prices.json from retailer pages
    npm run estimates      # write data/estimates.json from the catalog (the nightly job does this; no need to run it)
    npm run artifact       # inline the build into dist/artifact.html (single-file preview)

## Guide pages

`src/guides/content.ts` holds the hand-written text of each guide (`/faq/<slug>/`): the question,
short answers, which fit charts to show and sources. `src/guides/render.ts` turns them into static
HTML at build time, running the builder's own rules on every pair of parts for the fit charts and
reading prices from the same catalog, so the guides refresh with the nightly price deploy. Add a
guide by adding an entry to `GUIDES`; it is listed on `/faq/` and in `sitemap.xml` automatically.

## Hosting and live prices ($0)

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to
`main`. Once a night it first runs `npm run update-prices`, commits any price changes, then deploys.
One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

How prices are collected:

- `data/sources.json` maps a part id and retailer id to that retailer's product page URL.
  Add a URL there to start tracking that price.
- `scripts/update-prices.mjs` fetches each page, one request per site every 5 seconds, and
  skips any URL the site's robots.txt disallows. It reads the schema.org product data most
  retailers publish for search engines (`scripts/extract-price.mjs`).
- Results go to `data/prices.json`. They override the sample price for that retailer and show
  as "Live" with the date they were checked. Parts without a tracked URL keep their sample price,
  labeled "Estimate". If a fetch fails, the last good price is kept for up to 7 days.

First reads are held for review. When a part and store have no entry in the previous `data/prices.json`,
the read must be within 40% of a baseline, either way and in stock or not (`scripts/first-read-guard.mjs`).
Exactly 40.00% passes. A held read is not written to `data/prices.json` or `data/price-history.json`, so
the site doesn't change, and the next night is another first read. Prices already live aren't checked.
The baseline is the first of these that exists:

1. the owner's approved figure in `data/price-approvals.json`
2. the part's last price history point
3. its hand-checked list price in `data/list-prices.json`
4. its lowest in-stock estimate at a store that isn't paused, or at a paused store if every store with an
   estimate is paused

With no baseline at all, the read is held.

- `data/price-holds.json` is the bot's file: each hold's part, store, price, baseline, baseline type and
  first-held date. The nightly run commits it and lists it in the run's step summary. A hold stays through a
  failed read, and drops when the pair passes or its link is gone, paused or links only. Never edit this file.
- `data/price-approvals.json` is the owner's file, and the bot never writes it. To release a hold, add the
  price you checked by hand: `{ "part-id": { "RETAILER": 616.99 } }`. That figure becomes the baseline, still
  ±40%. `npm run check-data` fails on an unknown part, a store with no link, or a price that isn't positive.
- `data/estimates.json` is not committed. The nightly job generates it from the catalog's sample prices just
  before the price run (`scripts/estimates.mjs`). If that fails, or the file can't be read, the run warns and
  carries on, and pairs with no other baseline are held.

Some retailers' terms of use restrict automated price collection. The longer-term plan is to use
free affiliate product feeds (for example AvantLink, which Palmetto State Armory uses) where
available.

Pausing a retailer: list its id under `"paused"` in `data/sources.json`, with the date and the
reason (`"PA": { "since": "2026-10-24", "reason": "paused pending review of ..." }`). Its product links stay in the file,
but `update-prices`, `check-links` and `read-weights` skip its pages and search links
(`scripts/sources.mjs`), its old live prices drop out on the next nightly run, and the site leaves
its prices, live or sample, out of every page, best price and total (`src/data/helpers.ts`). A part
only that retailer sold shows no price. To undo, delete the entry; the next nightly run reads its
pages again. An id that isn't in `src/data/retailers.ts` fails the tests and the price job. Paused
since 2026-10-24: AR15Discounts (`ARD`), Primary Arms (`PA`) and Vedder Holsters (`VED`).

Links only is not a pause. List the id under `"linksOnly"` in `data/sources.json`, with the date and
the reason, the same way (`"CTD": { "since": "2026-10-31", "reason": "..." }`). `update-prices`,
`read-weights` and `check-links` then send nothing to that retailer's site, robots.txt and subdomains
included, but the site keeps its links and estimated prices as they were. An id can't be under both
`"paused"` and `"linksOnly"`, and the same checks apply to an unknown id or a missing date or reason.
A store's estimated price and link show only on parts with no live or list price. Listing a store that has
live prices drops them on the next nightly run, so measure the effect on shown prices first and use
Plan A, the merge order that keeps price-alert emails quiet. To undo, delete the entry and remove the id
from `LINKS_ONLY` in `scripts/sources.test.mjs` and `LINKS_ONLY_IDS` in `scripts/unit.test.ts`.
`RETAILERS.md` shows the status, so either change needs `npm run retailers` in the same PR.

## Where things live

- `src/data/<platform>.ts`: slots, parts with sample prices, compatibility rules and presets
- `src/data/retailers.ts`: retailer names and search-link templates
- `src/engine.ts`: compatibility evaluation, best-price and one-store-cart math
- `src/App.tsx`, `src/styles.css`: the UI

Each part has `attrs` (gas length, journal size, slide generation, optic footprint and so on).
Each platform's `rules(build)` returns issues (`error`, `warn` or `info`) naming the slots involved.
The picker runs the rules with each candidate swapped in, so every option shows whether it fits.
