// Price history for price-drop badges. data/price-history.json keeps, per part, the days its lowest
// live price changed: { parts: { "<partId>": [["2026-10-04", 189], ["2026-10-09", 169]] } }.
// A part's price on any day is the last change on or before it, so the file stays small.

export const HISTORY_DAYS = 120;

/** Lowest live price for each part: in-stock offers first, out-of-stock only when nothing is in stock. */
export function lowestByPart(offers) {
  const out = {};
  for (const [partId, byRetailer] of Object.entries(offers)) {
    const all = Object.values(byRetailer);
    const inStock = all.filter((o) => o.inStock);
    const pool = inStock.length ? inStock : all;
    if (pool.length) out[partId] = Math.min(...pool.map((o) => o.price));
  }
  return out;
}

/**
 * Adds today's lowest prices to the history. Same-day reruns replace today's point; an unchanged price adds
 * nothing. Points older than HISTORY_DAYS are dropped, except the one that sets the price at the window's start.
 */
export function recordHistory(history, offers, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - HISTORY_DAYS * 864e5).toISOString().slice(0, 10);
  const parts = { ...(history?.parts ?? {}) };
  for (const [partId, price] of Object.entries(lowestByPart(offers))) {
    let series = [...(parts[partId] ?? [])];
    if (series.length && series[series.length - 1][0] === day) series.pop();
    if (!series.length || series[series.length - 1][1] !== price) series.push([day, price]);
    const firstInWindow = series.findIndex(([d]) => d >= cutoff);
    if (firstInWindow > 1) series = series.slice(firstInWindow - 1);
    else if (firstInWindow === -1 && series.length > 1) series = series.slice(-1);
    parts[partId] = series;
  }
  return { parts };
}

/** One part per line, so the nightly commit's diff shows which prices moved. */
export function formatHistory(history) {
  const ids = Object.keys(history.parts).sort();
  return `{\n  "parts": {\n${ids.map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(history.parts[id])}`).join(',\n')}\n  }\n}\n`;
}
