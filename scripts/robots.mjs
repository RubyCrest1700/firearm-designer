// robots.txt for the scripts that fetch other sites (price job, weight reader, link check). parseRobots and
// isAllowed honor Allow/Disallow for our user agent or "*", using the longest matching rule (with * and $
// wildcards), as Google does. robotsGate fetches a page only where robots.txt allows, re-checking every redirect hop,
// and treats an unreadable robots.txt as "disallow" (robotsRules).

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

export function isAllowed(rules, pathAndQuery) {
  let best = null;
  for (const r of rules) {
    const re = new RegExp('^' + r.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(pathAndQuery) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

/** Everything disallowed: what an unreadable robots.txt means. */
export const DISALLOW_ALL = Object.freeze([Object.freeze({ allow: false, path: '/' })]);
/** Redirects followed for one page before giving up. */
export const MAX_REDIRECTS = 5;

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
 * Fetches pages only where robots.txt allows. `get(url, init)` is the caller's own polite fetch (its user agent,
 * per-host pace and timeout); the gate only adds `redirect`. robots.txt is read once per origin and may redirect
 * (RFC 9309). Pages are fetched with manual redirects, at most MAX_REDIRECTS, and each hop's host and path are
 * checked against that host's robots.txt before the hop is requested.
 *
 * safeGet(url) resolves to { res, url } (the final answer and its address) or { blocked, why, error } (the first
 * address robots.txt kept us from, why, and the error if robots.txt couldn't be read). It rejects on too many
 * redirects, a redirect to a non-web address, or a failed page request.
 */
export function robotsGate({ get, agent, maxRedirects = MAX_REDIRECTS }) {
  const cache = new Map();
  const robotsFor = (origin) => {
    if (!cache.has(origin)) {
      cache.set(origin, (async () => {
        try {
          const res = await get(`${origin}/robots.txt`, { redirect: 'follow' });
          const text = res.status >= 200 && res.status < 300 ? await res.text() : (await res.body?.cancel(), '');
          const rules = robotsRules(res.status, text, agent);
          return { rules, why: rules === DISALLOW_ALL ? `robots.txt answered HTTP ${res.status}` : 'robots.txt disallows it' };
        } catch (error) {
          return { rules: DISALLOW_ALL, why: `robots.txt unreachable (${error?.cause?.code ?? error?.name ?? 'error'})`, error };
        }
      })());
    }
    return cache.get(origin);
  };
  const check = async (url) => {
    const u = new URL(url);
    const r = await robotsFor(u.origin);
    return { ok: isAllowed(r.rules, u.pathname + u.search), ...r };
  };
  const allowed = async (url) => (await check(url)).ok;

  async function safeGet(url, init = {}) {
    let current = url;
    for (let redirects = 0; ; redirects++) {
      const { protocol } = new URL(current);
      if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`redirect to a non-web address (${protocol})`);
      const c = await check(current);
      if (!c.ok) return { blocked: current, why: c.why, ...(c.error ? { error: c.error } : {}) };
      const res = await get(current, { ...init, redirect: 'manual' });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!location) return { res, url: current };
      await res.body?.cancel().catch(() => {});
      if (redirects >= maxRedirects) throw new Error(`more than ${maxRedirects} redirects from ${url}`);
      current = new URL(location, current).href;
    }
  }
  return { allowed, safeGet };
}
