// The first read of a part at a store has no earlier price of its own to be judged against, and a wrong one (a kit, a
// longer rail, a bundle) goes straight to the site, the price charts and the alert emails. So a read with no entry in
// the previous data/prices.json has to land within 40% of a baseline, or it's held: nothing is written for it and it's
// logged for the owner in data/price-holds.json. Holding is stateless. The next night is another first read.
//
// Baselines, best first: the owner's approved figure (data/price-approvals.json), the part's last price history point,
// its hand-checked list price (data/list-prices.json), then its lowest in-stock estimate (data/estimates.json, made by
// scripts/estimates.mjs), paused stores' estimates only when every store with an estimate is paused. No baseline at all
// is a hold too. Prices already live are never checked, and an implausiblePrice read never gets this far.
//
// The owner writes data/price-approvals.json ({ "part-id": { "RETAILER": 616.99 } }) and the bot never does. The bot
// writes data/price-holds.json and nothing reads it but the bot. Everything here is pure, since update-prices.mjs runs
// on import: file reads come in as functions, so a missing or broken file can be handled and tested the same way.

/** The furthest a first read may sit from its baseline, either way. Exactly this far passes. */
export const MAX_FIRST_READ_PERCENT = 40;

const isPrice = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cents = (n) => Math.round(n * 100);

/** Whether a price sits more than 40% from its baseline. Whole cents, so no rounding error can move the line. */
export function movedTooFar(price, baseline) {
  const base = cents(baseline);
  return Math.abs(cents(price) - base) * 100 > MAX_FIRST_READ_PERCENT * base;
}

/** The lowest in-stock estimate, from stores that aren't paused unless every store with an estimate is. */
function estimateBaseline(byStore, paused) {
  const all = Object.entries(isPlainObject(byStore) ? byStore : {}).filter(([, offer]) => isPrice(offer?.price));
  const open = all.filter(([store]) => !paused.has(store));
  const pool = (open.length ? open : all).filter(([, offer]) => offer.inStock === true);
  if (!pool.length) return null;
  return { baseline: Math.min(...pool.map(([, offer]) => offer.price)), baselineType: open.length ? 'estimate' : 'estimate-paused' };
}

/**
 * What a first read of this pair is judged against, or { baseline: null, baselineType: 'none' }.
 * `data`: { approvals, history, listPrices, estimates, paused }, every one of them optional. `paused` is a Set of store
 * ids, read at run time, so a pause counts from the night it's made whatever the estimates file holds.
 */
export function baselineFor(part, store, data = {}) {
  const approved = data.approvals?.[part]?.[store];
  if (isPrice(approved)) return { baseline: approved, baselineType: 'approved' };
  const lastPoint = data.history?.parts?.[part]?.at(-1)?.[1];
  if (isPrice(lastPoint)) return { baseline: lastPoint, baselineType: 'history' };
  const listed = data.listPrices?.parts?.[part]?.price;
  if (isPrice(listed)) return { baseline: listed, baselineType: 'list' };
  return estimateBaseline(data.estimates?.[part], data.paused ?? new Set()) ?? { baseline: null, baselineType: 'none' };
}

/**
 * The hold for one read, or null when it may be written. A pair with a prior offer is never checked. Stock doesn't
 * matter: an out-of-stock read shows on the site like any other. `hadOffer` is whether the previous prices had this pair.
 */
export function firstReadHold({ part, store, price, hadOffer }, data = {}) {
  if (hadOffer) return null;
  const { baseline, baselineType } = baselineFor(part, store, data);
  if (baseline !== null && !movedTooFar(price, baseline)) return null;
  return { part, store, price, baseline, baselineType };
}

/** How a hold's pair is named in the sets mergeHolds takes. */
export const holdKey = (part, store) => `${part}\u0000${store}`;

const byPartThenStore = (a, b) => (a.part === b.part ? (a.store < b.store ? -1 : a.store > b.store ? 1 : 0) : a.part < b.part ? -1 : 1);

/**
 * Tonight's holds file. `held`: tonight's holds. `passed`: Set of holdKey for pairs whose read was written tonight, and
 * those holds are over. `tracked`: Set of holdKey for the links we may read, so a link that's gone, paused or links
 * only drops out. Anything else, such as a failed read, leaves last night's hold as it was. firstHeld never moves.
 */
export function mergeHolds(previous, { held = [], passed = new Set(), tracked = new Set(), day }) {
  const before = new Map(previous.map((h) => [holdKey(h.part, h.store), h]));
  const out = new Map();
  for (const [key, hold] of before) if (tracked.has(key) && !passed.has(key)) out.set(key, hold);
  for (const h of held) {
    const key = holdKey(h.part, h.store);
    out.set(key, { part: h.part, store: h.store, price: h.price, baseline: h.baseline, baselineType: h.baselineType, firstHeld: before.get(key)?.firstHeld ?? day });
  }
  return [...out.values()].sort(byPartThenStore);
}

/** One hold per line and no run timestamp, so holds that didn't change leave the file byte for byte the same. */
export function formatHolds(holds) {
  if (!holds.length) return '{\n  "holds": []\n}\n';
  return `{\n  "holds": [\n${holds.map((h) => `    ${JSON.stringify(h)}`).join(',\n')}\n  ]\n}\n`;
}

/** The workflow's step summary section, or '' when there's nothing to say. `warnings`: files that couldn't be used. */
export function holdsSummary(holds, warnings = []) {
  const lines = [];
  if (holds.length || warnings.length) lines.push('## First-read price holds', '');
  for (const w of warnings) lines.push(`**Warning:** ${w}`, '');
  if (holds.length) {
    lines.push(`${holds.length} held for review, none of them on the site. To release one, add the figure to data/price-approvals.json.`, '');
    lines.push('| Part | Store | Price | Baseline | Baseline type | First held |', '|---|---|---|---|---|---|');
    for (const h of holds) lines.push(`| ${h.part} | ${h.store} | $${h.price} | ${h.baseline === null ? 'none' : `$${h.baseline}`} | ${h.baselineType} | ${h.firstHeld} |`);
    lines.push('');
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/**
 * A JSON object from a file, by way of `read`, which returns its text and may throw. Never throws itself: a missing or
 * broken file gives { value: {}, problem }, so the night runs on and the pairs that needed the file are held.
 */
export function readJsonObject(read) {
  try {
    const value = JSON.parse(read());
    return isPlainObject(value) ? { value } : { value: {}, problem: 'is not a JSON object' };
  } catch (err) {
    return { value: {}, problem: err?.code === 'ENOENT' ? 'is missing' : `can't be read (${err?.message ?? err})` };
  }
}

/** data/estimates.json's parts, or {} with a problem when it's missing, broken or empty. */
export function readEstimates(read) {
  const { value, problem } = readJsonObject(read);
  if (problem) return { value: {}, problem };
  if (!isPlainObject(value.parts) || !Object.keys(value.parts).length) return { value: {}, problem: 'has no parts' };
  return { value: value.parts };
}

/** data/price-holds.json's holds. A broken file starts over, which only resets the firstHeld dates. */
export function readHolds(read) {
  const { value, problem } = readJsonObject(read);
  if (problem) return { value: [], problem };
  if (!Array.isArray(value.holds)) return { value: [], problem: 'has no list of holds' };
  return { value: value.holds.filter((h) => isPlainObject(h) && typeof h.part === 'string' && typeof h.store === 'string') };
}

/** What's wrong in data/price-approvals.json: each entry must name a real part, a link we hold for that store, and a positive price. */
export function approvalProblems(approvals, { partIds, links }) {
  const file = 'data/price-approvals.json';
  if (!isPlainObject(approvals)) return [`${file} must be an object of { "part-id": { "RETAILER": 616.99 } }`];
  const out = [];
  for (const [part, byStore] of Object.entries(approvals)) {
    if (!partIds.has(part)) out.push(`${file}: ${part} is not a part`);
    if (!isPlainObject(byStore)) { out.push(`${file}: ${part} must be an object of { "RETAILER": price }`); continue; }
    for (const [store, price] of Object.entries(byStore)) {
      if (!links?.[part]?.[store]) out.push(`${file}: ${part} has no ${store} link in data/sources.json`);
      if (!isPrice(price)) out.push(`${file}: ${part} @ ${store} needs a positive price`);
    }
  }
  return out;
}
