// Two catalog parts with the same brand and name, or that track the same product page, look like one product listed
// twice. Each such set must either be grouped as one product (Part.sameAs, scripts/same-product-guard.mjs) or be listed
// in data/same-name-parts.json, the owner's list of sets that have been looked at ("different") or are still to be
// looked at ("unchecked"). check-data runs this and fails, naming the parts and the rule, so a new look-alike can't
// slip in unnoticed. The nightly job never writes that file.
//
// Rule 1, names: parts whose brand and name are equal (case and spacing aside) and that are not all one product need
//   one entry whose ids are exactly that set's ids.
// Rule 2, links: a product link in data/sources.json filed under more than one product needs all of those parts
//   inside one entry.
// The list itself must be sound: known ids, no id in two entries, at least two ids, a status and a reason, and no
// entry or id that neither rule asks for any more.
//
// "One product" is one product key: a copy's main copy's id, any other part's own id (productKey in
// src/data/helpers.ts). An add-on listed on several platforms under one id is one product and needs no entry.

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const STATUSES = ['unchecked', 'different'];
/** Query parameters that only say where a visitor came from. Every other one (?sku=...) can pick the product. */
const TRACKING = /^(utm_.+|gclid|fbclid|msclkid|mc_cid|mc_eid)$/i;

/** A part's brand and name as one text to compare: lower case, runs of spaces as one. */
export const nameKey = (part) => `${part?.brand ?? ''} ${part?.name ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A product link as text to compare: tracking parameters, the fragment and a trailing slash dropped, the host in lower
 * case, the other parameters in a fixed order. Text that isn't a URL is compared as written.
 */
export function linkKey(url) {
  const text = String(url ?? '').trim();
  let u;
  try { u = new URL(text); } catch { return text; }
  const kept = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.hash = '';
  u.search = kept.length ? `?${new URLSearchParams(kept)}` : '';
  u.hostname = u.hostname.toLowerCase();
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}

const listed = (ids) => (ids.length <= 1 ? ids.join('') : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`);
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Problems as plain sentences; an empty list means every look-alike set is grouped or listed, and the list is sound.
 * `parts`: every catalog part as { id, sameAs?, brand, name }; a part listed on several platforms may appear more than
 * once. `sources`: data/sources.json as parsed. `list`: data/same-name-parts.json as parsed.
 */
export function sameNameProblems(parts, sources, list) {
  const out = [];
  const FILE = 'data/same-name-parts.json';
  // The catalog: each id once, with its product key.
  const keyOf = new Map();
  const partOf = new Map();
  for (const p of (Array.isArray(parts) ? parts : []).filter(isPlainObject)) {
    if (typeof p.id !== 'string' || keyOf.has(p.id)) continue;
    keyOf.set(p.id, typeof p.sameAs === 'string' ? p.sameAs : p.id);
    partOf.set(p.id, p);
  }
  const keysOf = (ids) => new Set([...ids].map((id) => keyOf.get(id)));

  // Rule 1's sets: ids by brand and name, kept when they are more than one product.
  const byName = new Map();
  for (const [id, p] of partOf) {
    const k = nameKey(p);
    if (!byName.has(k)) byName.set(k, new Set());
    byName.get(k).add(id);
  }
  const nameSets = [...byName.values()].filter((ids) => keysOf(ids).size > 1);

  // Rule 2's sets: the products each link is filed under, kept when there is more than one, each set of products once.
  // A link filed under an id the catalog doesn't have is not this guard's to judge.
  const byLink = new Map();
  for (const [id, links] of Object.entries(isPlainObject(sources?.parts) ? sources.parts : {})) {
    if (!keyOf.has(id) || !isPlainObject(links)) continue;
    for (const url of Object.values(links)) {
      const k = linkKey(url);
      if (!byLink.has(k)) byLink.set(k, { url, keys: new Set() });
      byLink.get(k).keys.add(keyOf.get(id));
    }
  }
  const linkSets = new Map();
  for (const { url, keys } of byLink.values()) {
    if (keys.size < 2) continue;
    const sig = [...keys].sort().join('\u0000');
    if (!linkSets.has(sig)) linkSets.set(sig, { url, keys });
  }

  // The list.
  if (!isPlainObject(list) || !Array.isArray(list.entries)) {
    out.push(`${FILE}: must be an object with an "entries" list`);
  }
  const entries = (isPlainObject(list) && Array.isArray(list.entries) ? list.entries : []).map((e, i) => {
    const ids = isPlainObject(e) && Array.isArray(e.ids) ? e.ids.filter((id) => typeof id === 'string') : [];
    return { raw: e, ids: new Set(ids), count: ids.length, label: `${FILE} entry ${i + 1}${ids.length ? ` (${ids.join(', ')})` : ''}` };
  });
  const seenIn = new Map();
  for (const e of entries) {
    const { raw, ids, label } = e;
    e.sound = false;
    if (!isPlainObject(raw) || !Array.isArray(raw.ids) || raw.ids.some((id) => typeof id !== 'string')) { out.push(`${label}: needs "ids", a list of part ids`); continue; }
    let ok = true;
    if (ids.size !== e.count) { out.push(`${label}: lists an id twice`); ok = false; }
    if (ids.size < 2) { out.push(`${label}: needs at least two ids`); ok = false; }
    for (const id of ids) {
      if (!keyOf.has(id)) { out.push(`${label}: ${id} is not a part in the catalog`); ok = false; }
      if (seenIn.has(id) && seenIn.get(id) !== e) { out.push(`${label}: ${id} is already in another entry (${[...seenIn.get(id).ids].join(', ')}); a part belongs in one entry`); ok = false; }
      else seenIn.set(id, e);
    }
    if (!STATUSES.includes(raw.status)) out.push(`${label}: "status" must be "unchecked" or "different"`);
    if (typeof raw.reason !== 'string' || !raw.reason.trim()) out.push(`${label}: needs a "reason"`);
    e.sound = ok;
  }

  // Rule 1: one entry with exactly the set's ids.
  const unmet = new Set();
  for (const ids of nameSets) {
    if (entries.some((e) => sameSet(e.ids, ids))) continue;
    const near = entries.filter((e) => [...e.ids].some((id) => ids.has(id)));
    for (const e of near) unmet.add(e);
    const name = `${partOf.get([...ids][0]).brand} ${partOf.get([...ids][0]).name}`;
    out.push(`catalog (src/data): ${listed([...ids])} share the name "${name}" but are not one product; group them (sameAs) or list exactly these ids in one entry of ${FILE}${near.length ? ` (${near.map((e) => e.label.slice(FILE.length + 1)).join('; ')} ${near.length > 1 ? 'do' : 'does'} not match)` : ''}`);
  }
  // Rule 2: one entry holding every product the link is filed under.
  for (const { url, keys } of linkSets.values()) {
    if (entries.some((e) => [...keys].every((id) => e.ids.has(id)))) continue;
    for (const e of entries) if ([...e.ids].some((id) => keys.has(id))) unmet.add(e);
    out.push(`data/sources.json parts: ${listed([...keys])} track the same product link (${url}) but are not one product; group them (sameAs) or list them together in one entry of ${FILE}`);
  }

  // Nothing listed that no rule asks for. An entry a failing set above already points at is left to that message.
  for (const e of entries) {
    if (!e.sound || unmet.has(e)) continue;
    const wanted = new Set();
    for (const ids of nameSets) if (sameSet(e.ids, ids)) for (const id of ids) wanted.add(keyOf.get(id));
    for (const { keys } of linkSets.values()) if ([...keys].every((id) => e.ids.has(id))) for (const k of keys) wanted.add(k);
    if (!wanted.size) { out.push(`${e.label}: no longer needed; its parts are now one product, or share neither a name nor a product link. Remove the entry`); continue; }
    const extra = [...e.ids].filter((id) => !wanted.has(keyOf.get(id)));
    if (extra.length) out.push(`${e.label}: ${listed(extra)} ${extra.length > 1 ? 'share' : 'shares'} neither a name nor a product link with the rest; take ${extra.length > 1 ? 'them' : 'it'} out`);
  }
  return out;
}

/** How many entries the list holds under each status, for check-data's note. */
export function sameNameCounts(list) {
  const entries = isPlainObject(list) && Array.isArray(list.entries) ? list.entries.filter(isPlainObject) : [];
  return Object.fromEntries(STATUSES.map((s) => [s, entries.filter((e) => e.status === s).length]));
}
