// The builder's copy of data/prices.json and data/sources.json, packed into one small table at build time
// (vite.config.ts). The two files repeat every product link; the table keeps each link once and each live price
// as [link, price, in stock, day checked] (plus the price's own link when it differs, until the next price run): { updatedAt, days: [iso, ...], parts: { "<partId>": { "<retailer>": link | [...] } } }.
// The app unpacks it into the same shapes the files have, so nothing else changes.

/** Packs prices.json and sources.json into the table. */
export function packPrices(prices, sources) {
  const days = [];
  const day = (iso) => (days.includes(iso) ? days.indexOf(iso) : days.push(iso) - 1);
  const links = sources.parts ?? {};
  const parts = {};
  for (const id of new Set([...Object.keys(links), ...Object.keys(prices.offers)])) {
    parts[id] = {};
    for (const r of new Set([...Object.keys(links[id] ?? {}), ...Object.keys(prices.offers[id] ?? {})])) {
      const o = prices.offers[id]?.[r];
      const link = links[id]?.[r];
      if (!o) parts[id][r] = link;
      else parts[id][r] = [link ?? '', o.price, o.inStock ? 1 : 0, day(o.checkedAt), ...(o.url !== link ? [o.url ?? ''] : [])];
    }
  }
  return { updatedAt: prices.updatedAt, days, parts };
}

/** The table back as prices.json: { updatedAt, offers }. */
export function unpackPrices(t) {
  const offers = {};
  for (const [id, byRetailer] of Object.entries(t.parts))
    for (const [r, v] of Object.entries(byRetailer))
      if (typeof v !== 'string') {
        const url = v.length > 4 ? v[4] : v[0];
        (offers[id] ??= {})[r] = { price: v[1], inStock: v[2] === 1, ...(url ? { url } : {}), checkedAt: t.days[v[3]] };
      }
  return { updatedAt: t.updatedAt, offers };
}

/** The table back as sources.json: { parts }. */
export function unpackSources(t) {
  const parts = {};
  for (const [id, byRetailer] of Object.entries(t.parts))
    for (const [r, v] of Object.entries(byRetailer)) {
      const link = typeof v === 'string' ? v : v[0];
      if (link) (parts[id] ??= {})[r] = link;
    }
  return { parts };
}
