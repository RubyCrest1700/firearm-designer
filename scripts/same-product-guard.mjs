// A catalog part marked `sameAs` is a copy of another part (its main copy): the same product listed under a second id
// for another platform. The site reads the copy's store links, live and list prices and price history under the main
// copy's id (productKey in src/data/helpers.ts), so the copy must really be the same product and must keep no price
// data of its own. check-data runs this and fails, naming the part, its main copy and the rule.
//
// Weight is the one thing a copy may file under its own id. An entry of its own must equal its main copy's; with none,
// the site shows the main copy's weight for it (parts() in src/data/helpers.ts), so the entry can simply be left out.
//
// Rows left under a copy's id in data/prices.json and data/price-history.json are the price bot's and are not a
// failure: the site never reads them. sameProductLeftovers lists them for a note.

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (obj, key) => isPlainObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
const quoted = (v) => (v === undefined ? 'none' : JSON.stringify(v));

/** One estimate offer as written in the catalog, [store, price, in stock (default true)], as text to compare. */
const offerText = (tuple) => (Array.isArray(tuple) ? `${tuple[0]} $${tuple[1]}${tuple[2] ?? true ? '' : ' (out of stock)'}` : 'unreadable');
/** A part's estimate offers in a fixed order, so the order they were written in doesn't count. */
const offersText = (offers) => (Array.isArray(offers) ? offers.map(offerText).sort().join(', ') : '') || 'none';

/** A weight entry in data/weights.json as text to compare, whatever order its keys are in. */
const weightText = (w) => (isPlainObject(w) ? JSON.stringify(Object.keys(w).sort().map((k) => [k, w[k]])) : JSON.stringify(w));

/** The copies among the catalog's parts, each once per main copy it names. */
function copiesOf(parts) {
  const seen = new Set();
  return (Array.isArray(parts) ? parts : []).filter((p) => {
    if (!isPlainObject(p) || p.sameAs === undefined || p.sameAs === null) return false;
    const key = `${p.id}\u0000${p.sameAs}`;
    return seen.has(key) ? false : !!seen.add(key);
  });
}

/**
 * Problems as plain sentences; an empty list means every copy is sound.
 * `parts`: every catalog part as { id, sameAs?, brand, name, mpn?, serialized?, offers }, with `offers` the estimate offers as
 * written in src/data ([store, price, in stock?]), not the ones the site shows. A part listed on several platforms may
 * appear more than once. `data`: { sources, listPrices, approvals, weights }, the data files as parsed.
 */
export function sameProductProblems(parts, data) {
  const { sources, listPrices, approvals, weights } = data ?? {};
  const list = (Array.isArray(parts) ? parts : []).filter(isPlainObject);
  const byId = new Map();
  for (const p of list) if (!byId.has(p.id)) byId.set(p.id, p);
  const copyIds = new Map(copiesOf(list).map((p) => [p.id, p.sameAs]));
  const out = [];
  for (const copy of copiesOf(list)) {
    const { id, sameAs: target } = copy;
    const who = `${id} is marked sameAs ${quoted(target)}`;
    if (target === id) { out.push(`catalog (src/data): ${who}, which is itself; sameAs must name another part`); continue; }
    const main = typeof target === 'string' ? byId.get(target) : undefined;
    if (!main) { out.push(`catalog (src/data): ${who}, but no part has that id`); continue; }
    if (copyIds.has(target)) { out.push(`catalog (src/data): ${who}, which is itself a copy (sameAs ${quoted(copyIds.get(target))}); name the main copy, no chains`); continue; }
    for (const field of ['brand', 'name', 'mpn'])
      if (copy[field] !== main[field]) out.push(`catalog (src/data): ${who}, but its ${field} differs (${quoted(copy[field])} against ${target}'s ${quoted(main[field])})`);
    // The FFL mark is about the product, not the platform it is listed on. A part without the flag is not serialized.
    if (!!copy.serialized !== !!main.serialized)
      out.push(`catalog (src/data): ${who}, but its serialized mark (FFL) differs (${!!copy.serialized} against ${target}'s ${!!main.serialized})`);
    if (offersText(copy.offers) !== offersText(main.offers))
      out.push(`catalog (src/data): ${who}, but its estimate offers differ (${offersText(copy.offers)} against ${target}'s ${offersText(main.offers)})`);
    if (has(weights?.parts, id) && (!has(weights.parts, target) || weightText(weights.parts[id]) !== weightText(weights.parts[target])))
      out.push(`data/weights.json: ${who}, but its weight differs from ${target}'s; make the two entries equal or remove ${id}'s`);
    if (has(sources?.parts, id)) out.push(`data/sources.json parts: ${who}, so it must have no links of its own; move them to ${target}`);
    if (has(listPrices?.parts, id)) out.push(`data/list-prices.json parts: ${who}, so it must have no list price of its own; ${target}'s is used`);
    for (const key of ['from', 'factory'])
      if (Array.isArray(listPrices?.[key]) && listPrices[key].includes(id)) out.push(`data/list-prices.json ${key}: ${who}, so it must not be listed here; ${target}'s entry is used`);
    if (has(approvals, id)) out.push(`data/price-approvals.json: ${who}, so it must have no approvals of its own; approve prices under ${target}`);
  }
  return out;
}

/**
 * check-data's "every part has a weight" rule for one part, as a sentence, or undefined when the part has one. A part's
 * weight is its own entry in data/weights.json; a copy with no entry of its own carries its main copy's, so it fails
 * only when its main copy has none either. `weights`: data/weights.json as parsed.
 */
export function missingWeightProblem(part, weights) {
  const { id, sameAs } = isPlainObject(part) ? part : {};
  const filed = (key) => has(weights?.parts, key) && isPlainObject(weights.parts[key]);
  if (filed(id)) return undefined;
  if (sameAs === undefined || sameAs === null || sameAs === id) return `${id} has no weight in data/weights.json`;
  if (filed(sameAs)) return undefined;
  return `${id} has no weight in data/weights.json, and neither has ${sameAs}, the main copy it is marked sameAs; give ${sameAs} one`;
}

/**
 * The copies that still have rows of their own in the price bot's files, as { file, parts }, for a note that fails
 * nothing. `files`: { 'data/prices.json': prices.offers, 'data/price-history.json': history.parts }.
 */
export function sameProductLeftovers(parts, files) {
  const ids = [...new Set(copiesOf(parts).map((p) => p.id))];
  return Object.entries(isPlainObject(files) ? files : {})
    .map(([file, rows]) => ({ file, parts: ids.filter((id) => has(rows, id)) }))
    .filter((f) => f.parts.length);
}
