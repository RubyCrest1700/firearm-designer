// A paused retailer's "since" date must be on or after the last price we read from it. If the nightly job read a store
// after its pause date (for example the job on main ran before a pause branch merged), the site would keep showing
// history from that store as trusted. check-data runs this and fails, so the pause date is bumped before merging.
//
// data/price-history.json keeps one lowest price per part per day, not per retailer, so a history point can only be
// tied to a paused store while data/prices.json still holds that store's offer: same part, same day, same price, and
// no active store at that price.

const day = (iso) => String(iso ?? '').slice(0, 10);

/** Problems as plain sentences; an empty list means the data agrees with every pause date. */
export function pausedPriceProblems(paused, prices, history) {
  const out = [];
  const offers = prices?.offers ?? {};
  for (const [partId, byRetailer] of Object.entries(offers)) {
    for (const [retailer, offer] of Object.entries(byRetailer)) {
      const since = paused?.[retailer]?.since;
      if (!since || day(offer.checkedAt) <= since) continue;
      out.push(`data/prices.json: ${partId} @ ${retailer} was read on ${day(offer.checkedAt)}, after ${retailer}'s pause date ${since}`);
      const activeAtPrice = Object.entries(byRetailer).some(([r, o]) => !paused[r] && o.price === offer.price);
      for (const [d, price] of history?.parts?.[partId] ?? [])
        if (d === day(offer.checkedAt) && price === offer.price && !activeAtPrice)
          out.push(`data/price-history.json: ${partId} on ${d} ($${price}) is ${retailer}'s price, after its pause date ${since}`);
    }
  }
  return out;
}
