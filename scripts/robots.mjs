// robots.txt for the scripts that fetch other sites (price job, weight reader, link check). parseRobots and
// isAllowed honor Allow/Disallow for our user agent or "*", using the longest matching rule (with * and $
// wildcards), as Google does. robotsGate fetches a page only where robots.txt allows, re-checking every redirect hop,
// and treats an unreadable robots.txt as "disallow" (robotsRules). Hops to local or private addresses, from https to
// http, or off the starting site are never requested (scripts/domains.mjs), and bodies are read up to a byte cap.

import { isPrivateHost, registrableDomain } from './domains.mjs';

export function parseRobots(text, agent) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const line of text.split(/\r?\n/)) {
    const [k, ...rest] = line.replace(/#.*/, '').split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      if (value) current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    } else if (key) {
      lastWasAgent = false;
    }
  }
  const name = agent.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && name.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

/**
 * Does a robots.txt path pattern match this path and query? `*` matches any run of characters and a final `$`
 * anchors the end (RFC 9309 2.2.3); everything else is literal. No regular expression and no backtracking: the
 * pattern's literal pieces are found left to right, each once, so a hostile pattern can't stall the job.
 */
export function patternMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const pieces = (anchored ? pattern.slice(0, -1) : pattern).split('*');
  if (!path.startsWith(pieces[0])) return false;
  let at = pieces[0].length;
  if (pieces.length === 1) return !anchored || path.length === at;
  // Leftmost matches leave the most room for what follows, so the first fit is always a right one.
  for (let i = 1; i < pieces.length - 1; i++) {
    const j = path.indexOf(pieces[i], at);
    if (j < 0) return false;
    at = j + pieces[i].length;
  }
  const last = pieces[pieces.length - 1];
  return anchored ? path.length - last.length >= at && path.endsWith(last) : path.indexOf(last, at) >= 0;
}

export function isAllowed(rules, pathAndQuery) {
  let best = null;
  for (const r of rules) {
    if (patternMatches(r.path, pathAndQuery) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

/** Everything disallowed: what an unreadable robots.txt means. */
export const DISALLOW_ALL = Object.freeze([Object.freeze({ allow: false, path: '/' })]);
/** Redirects followed for one page, or for one robots.txt, before giving up. */
export const MAX_REDIRECTS = 5;
/** robots.txt is read up to this size and the rest ignored (RFC 9309 2.5 asks for at least 500 KiB). */
export const ROBOTS_MAX_BYTES = 500 * 1024;
/** A product page bigger than this counts as a failed read. */
export const PAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Reads at most `maxBytes` of a response body as UTF-8 and cancels the rest. `truncated` says whether there was
 * more. A response without a body reads as ''.
 */
export async function readCapped(res, maxBytes) {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - size));
      size = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return { text: new TextDecoder().decode(all), truncated };
}

/** A page's text, or an error when it is over PAGE_MAX_BYTES (that URL then counts as a failed read). */
export async function readPage(res, maxBytes = PAGE_MAX_BYTES) {
  const { text, truncated } = await readCapped(res, maxBytes);
  if (truncated) throw new Error(`page larger than ${maxBytes} bytes, not read`);
  return text;
}

/**
 * The rules a robots.txt answer gives. 2xx: the file's own rules. 404 and 410: there is no file, so nothing is
 * restricted (RFC 9309 2.3.1.3). Everything else disallows the whole host: 5xx (RFC 9309 2.3.1.4), and, stricter than
 * the RFC on purpose, 401, 403 and 429 (a site refusing robots.txt to bots doesn't want them) and any other 4xx or
 * an unfollowed 3xx. An unreachable file or a timeout is handled by robotsGate, also as disallow.
 */
export function robotsRules(status, text, agent) {
  if (status >= 200 && status < 300) return parseRobots(text ?? '', agent);
  if (status === 404 || status === 410) return [];
  return DISALLOW_ALL;
}

/**
 * Why a hop to `next` (from `from`, if any) must not be requested: a non-web address, a local or private address,
 * or a step down from https to http. Undefined when it's fine.
 */
export function hopRefusal(next, from) {
  const u = new URL(next);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return `non-web address (${u.protocol})`;
  if (isPrivateHost(u.hostname)) return `local or private address (${u.hostname})`;
  if (from && new URL(from).protocol === 'https:' && u.protocol === 'http:') return 'https to http';
  return undefined;
}

const cancel = (res) => res.body?.cancel().catch(() => {});
const redirectTarget = (res, from) => {
  const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
  return location ? new URL(location, from).href : null;
};

/**
 * Fetches pages only where robots.txt allows. `get(url, init)` is the caller's own polite fetch (its user agent,
 * per-host pace and timeout); the gate only adds `redirect: 'manual'` and follows redirects itself, so every request,
 * robots.txt and redirect hops included, goes through `get` and its pacing.
 *
 * robots.txt is read once per origin, at most ROBOTS_MAX_BYTES of it. Its own redirects are followed (RFC 9309
 * 2.3.1.2), to other hosts too, at most MAX_REDIRECTS; more than that, or a refused hop, counts as unreadable
 * (disallow). Pages are fetched with at most MAX_REDIRECTS redirects; each hop is checked against its host's
 * robots.txt before it is requested, and a hop that leaves the starting host's registrable domain isn't followed.
 *
 * safeGet(url) resolves to one of:
 *   { res, url }                          the final answer and its address
 *   { blocked, why, unreadable, error? }  the first address robots.txt kept us from; `unreadable` when robots.txt
 *                                         couldn't be read (status, error or refused redirect) rather than disallowing
 *   { offsite, from, why }                a redirect to another site: not followed, and nothing should be recorded
 * It rejects on too many redirects, a refused hop (hopRefusal) or a failed request.
 */
export function robotsGate({ get, agent, maxRedirects = MAX_REDIRECTS }) {
  const cache = new Map();
  const unreadable = (why, error) => ({ rules: DISALLOW_ALL, unreadable: true, why, ...(error ? { error } : {}) });
  async function readRobots(origin) {
    let url = `${origin}/robots.txt`;
    let from;
    for (let hops = 0; ; hops++) {
      const refused = hopRefusal(url, from);
      if (refused) return unreadable(`robots.txt redirect refused: ${refused}`);
      const res = await get(url, { redirect: 'manual' });
      const next = redirectTarget(res, url);
      if (next) {
        await cancel(res);
        if (hops >= maxRedirects) return unreadable(`robots.txt redirected more than ${maxRedirects} times`);
        from = url;
        url = next;
        continue;
      }
      const ok = res.status >= 200 && res.status < 300;
      const text = ok ? (await readCapped(res, ROBOTS_MAX_BYTES)).text : (await cancel(res), '');
      const rules = robotsRules(res.status, text, agent);
      return rules === DISALLOW_ALL ? unreadable(`robots.txt answered HTTP ${res.status}`) : { rules, unreadable: false, why: 'robots.txt disallows it' };
    }
  }
  const robotsFor = (origin) => {
    if (!cache.has(origin)) cache.set(origin, readRobots(origin).catch((error) => unreadable(`robots.txt unreachable (${error?.cause?.code ?? error?.name ?? 'error'})`, error)));
    return cache.get(origin);
  };
  const check = async (url) => {
    const u = new URL(url);
    const r = await robotsFor(u.origin);
    return { ok: isAllowed(r.rules, u.pathname + u.search), ...r };
  };
  const allowed = async (url) => (await check(url)).ok;

  async function safeGet(url, init = {}) {
    const site = registrableDomain(new URL(url).hostname);
    let current = url;
    let from;
    for (let redirects = 0; ; redirects++) {
      const refused = hopRefusal(current, from);
      if (refused) throw new Error(`${from ? 'redirect' : 'request'} refused: ${refused}`);
      if (registrableDomain(new URL(current).hostname) !== site) return { offsite: current, from, why: `redirected off-site to ${new URL(current).hostname}` };
      const c = await check(current);
      if (!c.ok) return { blocked: current, why: c.why, unreadable: c.unreadable, ...(c.error ? { error: c.error } : {}) };
      const res = await get(current, { ...init, redirect: 'manual' });
      const next = redirectTarget(res, current);
      if (!next) return { res, url: current };
      await cancel(res);
      if (redirects >= maxRedirects) throw new Error(`more than ${maxRedirects} redirects from ${url}`);
      from = current;
      current = next;
    }
  }
  return { allowed, safeGet };
}

/**
 * How the link check files a link the gate didn't fetch: a host that no longer exists is broken; a robots.txt that
 * couldn't be read (403, 5xx, timeout, refused redirect) is its own group; a robots.txt Disallow is a plain skip.
 */
export function blockedKind(got) {
  if (got.error?.cause?.code === 'ENOTFOUND') return 'broken';
  return got.unreadable ? 'unreadable' : 'skipped';
}
