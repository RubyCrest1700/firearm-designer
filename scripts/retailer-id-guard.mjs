// Every retailer id in the data must be a store in RETAILERS (src/data/retailers.ts). The site looks each id up
// there for the store's name and search address, so an id that isn't listed has neither. check-data runs this and
// fails, naming the file, the part and the id. ("paused" in data/sources.json has its own check in check-presets.ts.)

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const entries = (v) => (isPlainObject(v) ? Object.entries(v) : []);

/**
 * Problems as plain sentences; an empty list means every id is a known store.
 * `retailerIds`: the ids in RETAILERS. `data.catalog`: the catalog's own offers that name an unknown store, as
 * { part, retailer } (UNKNOWN_RETAILER_OFFERS in src/data/helpers.ts, filled as the catalog is built).
 */
export function unknownRetailerProblems(retailerIds, data) {
  const known = new Set(retailerIds);
  const { sources, prices, listPrices, approvals, catalog } = data ?? {};
  const out = [];
  for (const [part, byRetailer] of entries(sources?.parts))
    for (const retailer of Object.keys(isPlainObject(byRetailer) ? byRetailer : {}))
      if (!known.has(retailer)) out.push(`data/sources.json parts: ${part} has a link for unknown retailer ${retailer}`);
  for (const retailer of Object.keys(isPlainObject(sources?.linksOnly) ? sources.linksOnly : {}))
    if (!known.has(retailer)) out.push(`data/sources.json linksOnly: unknown retailer ${retailer}`);
  for (const [part, byRetailer] of entries(prices?.offers))
    for (const retailer of Object.keys(isPlainObject(byRetailer) ? byRetailer : {}))
      if (!known.has(retailer)) out.push(`data/prices.json: ${part} has a price from unknown retailer ${retailer}`);
  for (const [part, listed] of entries(listPrices?.parts))
    if (!known.has(listed?.retailer)) out.push(`data/list-prices.json: ${part} names unknown retailer ${listed?.retailer}`);
  for (const [part, byStore] of entries(approvals))
    for (const retailer of Object.keys(isPlainObject(byStore) ? byStore : {}))
      if (!known.has(retailer)) out.push(`data/price-approvals.json: ${part} names unknown retailer ${retailer}`);
  for (const { part, retailer } of Array.isArray(catalog) ? catalog : [])
    if (!known.has(retailer)) out.push(`catalog (src/data): ${part} has an offer from unknown retailer ${retailer}`);
  return out;
}
