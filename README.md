# Firearm Designer

A PCPartPicker-style build planner for modular firearm platforms. Pick a platform, choose a part for
each slot, and the app checks compatibility, compares retailer prices, and suggests budget,
best-value and premium builds. It is a planning tool, not a store.

Platforms: AR-15, AR-10 (DPMS and Armalite patterns), Glock 17, 19, 26, Glock 43X/48, Sig P320, Sig P365.

## Run it

    npm install
    npm run dev            # local dev server
    npm test               # price extractor and robots.txt tests
    npm run check-data     # every preset build is complete and conflict-free
    npm run build          # type-check + production build to dist/
    npm run update-prices  # refresh data/prices.json from retailer pages
    npm run artifact       # inline the build into dist/artifact.html (single-file preview)

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
  labeled "Sample". If a fetch fails, the last good price is kept for up to 7 days.

Some retailers' terms of use restrict automated price collection. The longer-term plan is to use
free affiliate product feeds (for example AvantLink, which Palmetto State Armory uses) where
available.

## Where things live

- `src/data/<platform>.ts`: slots, parts with sample prices, compatibility rules and presets
- `src/data/retailers.ts`: retailer names and search-link templates
- `src/engine.ts`: compatibility evaluation, best-price and one-store-cart math
- `src/App.tsx`, `src/styles.css`: the UI

Each part has `attrs` (gas length, journal size, slide generation, optic footprint and so on).
Each platform's `rules(build)` returns issues (`error`, `warn` or `info`) naming the slots involved.
The picker runs the rules with each candidate swapped in, so every option shows whether it fits.
