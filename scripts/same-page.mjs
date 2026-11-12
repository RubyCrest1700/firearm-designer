// Is the page a redirect ended on the same page the price job asked for? A store may send a tracked product link on to
// a different page of its own site (a discontinued part to its replacement, or to a category page), and the price job
// follows it (scripts/robots.mjs). samePage tells the harmless moves (a trailing slash, http to https, www, a tracking
// parameter) from a real change of page. Pure: no network, no files.

/** Query parameters that only track a visit. Ignored on both sides, names compared without case. */
export const TRACKING_PARAMS = Object.freeze(['gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'srsltid', 'gad_source', 'gbraid', 'wbraid']);
/** Any parameter whose name starts with one of these is tracking too (utm_source, utm_medium and so on). */
export const TRACKING_PREFIXES = Object.freeze(['utm_']);
/** Query parameters that pick a product. One of these showing up only after the redirect means a different page. Names compared without case. */
export const PRODUCT_PARAMS = Object.freeze(['sku', 'variant', 'id', 'product_id', 'pid']);

const isTracking = (name) => {
  const n = name.toLowerCase();
  return TRACKING_PARAMS.includes(n) || TRACKING_PREFIXES.some((p) => n.startsWith(p));
};
const isProduct = (name) => PRODUCT_PARAMS.includes(name.toLowerCase());

/** A web address, or null when it can't be parsed or isn't http or https. */
function web(address) {
  if (typeof address !== 'string') return null;
  let u;
  try { u = new URL(address); } catch { return null; }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
}

/** Host without case (URL lower-cases it) and without one leading `www.`. */
const host = (u) => u.hostname.replace(/^www\./, '');

/**
 * The path as a list of segments, ready to compare. Split on `/` first and decoded after, one pass, so an encoded
 * slash (%2F) stays inside its segment and never becomes a separator. A run of escapes that isn't valid UTF-8 stays as
 * written. Case is dropped, trailing slashes are dropped, and an empty path is the same as `/` (both give no segments).
 */
function pathSegments(u) {
  const segments = u.pathname.split('/').slice(1).map((s) =>
    s.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
      try { return decodeURIComponent(run); } catch { return run; }
    }).toLowerCase());
  while (segments.length && segments.at(-1) === '') segments.pop();
  return segments;
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * True when `to` is the same page as `from` for pricing. The rules:
 * - Unparseable input on either side: different.
 * - Scheme: http and https are the same; anything else is different.
 * - Host: case ignored, one leading `www.` ignored on either side; otherwise equal. Another subdomain is another page.
 * - Port: equal, once each scheme's default port is dropped (an explicit :8080 is a different server).
 * - Path: equal after trailing slashes, percent-encoding and case are evened out (pathSegments above).
 * - Fragment: ignored.
 * - Query: tracking parameters are ignored on both sides. Every other parameter in `from` must be in `to` with the same
 *   values (names and values exact, repeats in the same order). Parameters only `to` has don't matter (stores add
 *   session and locale parameters), unless one is a product-selecting name `from` doesn't have.
 */
export function samePage(from, to) {
  const a = web(from);
  const b = web(to);
  if (!a || !b) return false;
  if (host(a) !== host(b) || a.port !== b.port) return false;
  if (!sameList(pathSegments(a), pathSegments(b))) return false;
  for (const name of new Set(a.searchParams.keys())) {
    if (!isTracking(name) && !sameList(a.searchParams.getAll(name), b.searchParams.getAll(name))) return false;
  }
  for (const name of b.searchParams.keys()) {
    if (isProduct(name) && !a.searchParams.has(name)) return false;
  }
  return true;
}
