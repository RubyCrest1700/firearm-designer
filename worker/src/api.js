// Community builds API. Runs as a Cloudflare Worker with a D1 database bound as `DB`.
// Everything is anonymous: visitors are identified only by a salted hash of their IP address,
// which limits each person to one vote, one report and one counted buy click per build.
// Share links with picture cards (/c/<id> and /b/<code>) are answered by share.js.

import { sharePage } from './share.js';
import { alertsRoute } from './alerts.js';
import { feedbackRoute } from './feedback.js';

/** Keep in sync with the platform ids in src/data. */
export const PLATFORM_IDS = ['ar15', 'ar10', 'ar9', 'glock9', 'glock43x', 'glock20', 'p320', 'p365', 'mp2', 'hellcat'];
/**
 * Old platform ids that now open in another builder (src/data PLATFORM_ALIASES): the Glock 17, 19 and 26
 * became models of the Glock 17 / 19 / 26 builder. Builds and links made before then still carry them.
 */
export const PLATFORM_ALIASES = { glock17: 'glock9', glock19: 'glock9', glock26: 'glock9' };
export const canonical = (platform) => PLATFORM_ALIASES[platform] ?? platform;
export const isPlatform = (platform) => PLATFORM_IDS.includes(canonical(platform));
/** A platform's id and the old ids that now open in it, for database queries. */
const idsFor = (platform) => [platform, ...Object.keys(PLATFORM_ALIASES).filter((k) => PLATFORM_ALIASES[k] === platform)];
/**
 * SQL list of the live platforms, old ids included. Builds for a shelved platform stay in the database but
 * aren't listed or opened.
 */
export const LIVE_PLATFORMS = [...PLATFORM_IDS, ...Object.keys(PLATFORM_ALIASES)].map((p) => `'${p}'`).join(', ');

const ALLOWED_ORIGINS = ['https://rubycrest1700.github.io', 'https://dropinbuilds.com', 'https://www.dropinbuilds.com', 'http://localhost:5173', 'http://localhost:4173'];
const DAY = 86_400_000;
const WEEK = 7 * DAY;
const MAX_SHARES_PER_DAY = 10;
/**
 * A build is hidden once people on at least this many different networks report it, and at least as many
 * as voted for it. Reports from one network (a home, an office, a phone carrier's block) count once, so one
 * person switching between Wi-Fi and their phone can't hide builds, and a popular build needs more reports.
 */
const HIDE_AFTER_REPORTS = 5;
const PART_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const BUILD_ID = /^[a-z0-9]{10}$/;
/** Up to 32 parts plus a few `at-<slot>-<code>` accessory placement tokens, which match PART_ID too. */
const MAX_PARTS = 40;

const json = (data, status, origin) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...cors(origin),
    },
  });

function cors(origin) {
  return {
    'access-control-allow-origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

/** Plain text only: no control characters, collapsed whitespace, length-capped. */
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function visitorHash(request, salt) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The visitor's network: the first three parts of an IPv4 address, or the first 48 bits of an IPv6 one. */
export function networkOf(ip) {
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.');
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(Math.max(8 - h.length - t.length, 0)).fill('0'), ...t];
  return groups.slice(0, 3).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':');
}

async function networkHash(request, salt) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:net:${networkOf(ip)}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newBuildId() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

const toBuild = (row) => ({
  id: row.id,
  platform: canonical(row.platform),
  name: row.name,
  note: row.note,
  parts: JSON.parse(row.parts),
  createdAt: new Date(row.created_at).toISOString(),
  votes: row.votes,
  clicks: row.clicks,
});

const SORTS = {
  top: 'votes DESC, clicks DESC, created_at DESC',
  new: 'created_at DESC',
  bought: 'clicks DESC, votes DESC, created_at DESC',
};

export async function handle(request, env, now = Date.now()) {
  const origin = request.headers.get('origin') ?? '';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const db = env.DB;
  const salt = env.SALT ?? 'firearm-designer';

  try {
    const shared = await sharePage(request, env);
    if (shared) return shared;

    // GET /health: lets the site check that share links work before handing them out
    if (request.method === 'GET' && path === '/health') return json({ ok: true }, 200, origin);

    // GET /api/builds?platform=glock19&sort=top|new|bought&limit=24
    if (request.method === 'GET' && path === '/api/builds') {
      const platform = url.searchParams.get('platform');
      const sort = SORTS[url.searchParams.get('sort') ?? 'top'] ?? SORTS.top;
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 60);
      const ids = platform && isPlatform(platform) ? idsFor(canonical(platform)) : null;
      const where = ids ? `WHERE hidden = 0 AND platform IN (${ids.map(() => '?').join(', ')})` : `WHERE hidden = 0 AND platform IN (${LIVE_PLATFORMS})`;
      const stmt = db.prepare(`SELECT * FROM builds ${where} ORDER BY ${sort} LIMIT ${limit}`);
      const { results } = await (ids ? stmt.bind(...ids) : stmt).all();
      return json({ builds: results.map(toBuild) }, 200, origin);
    }

    // GET /api/featured: the week's best, by votes plus half-weight buy clicks in the last 7 days
    if (request.method === 'GET' && path === '/api/featured') {
      const since = now - WEEK;
      const { results } = await db.prepare(
        `SELECT b.*,
           (SELECT COUNT(*) FROM votes v WHERE v.build_id = b.id AND v.created_at > ?1)
           + 0.5 * (SELECT COUNT(*) FROM clicks c WHERE c.build_id = b.id AND c.day > ?2) AS score
         FROM builds b WHERE b.hidden = 0 AND b.platform IN (${LIVE_PLATFORMS}) ORDER BY score DESC, b.votes DESC LIMIT 3`,
      ).bind(since, Math.floor(since / DAY)).all();
      return json({ builds: results.filter((r) => r.score > 0).map(toBuild) }, 200, origin);
    }

    // GET /api/builds/:id
    const one = path.match(/^\/api\/builds\/([a-z0-9]+)$/);
    if (request.method === 'GET' && one) {
      const row = await db.prepare(`SELECT * FROM builds WHERE id = ? AND hidden = 0 AND platform IN (${LIVE_PLATFORMS})`).bind(one[1]).first();
      return row ? json({ build: toBuild(row) }, 200, origin) : json({ error: 'Not found' }, 404, origin);
    }

    // POST /api/builds { platform, name, note, parts }
    if (request.method === 'POST' && path === '/api/builds') {
      const body = await request.json().catch(() => null);
      const platform = canonical(body?.platform);
      const name = cleanText(body?.name, 60);
      const note = cleanText(body?.note, 280);
      const parts = Array.isArray(body?.parts) ? body.parts : [];
      if (!PLATFORM_IDS.includes(platform)) return json({ error: 'Unknown platform' }, 400, origin);
      if (name.length < 3) return json({ error: 'Give the build a name of at least 3 characters.' }, 400, origin);
      if (parts.length < 3 || parts.length > MAX_PARTS || !parts.every((p) => typeof p === 'string' && PART_ID.test(p)))
        return json({ error: 'That parts list is not valid.' }, 400, origin);
      const who = await visitorHash(request, salt);
      const recent = await db.prepare('SELECT COUNT(*) AS n FROM builds WHERE ip_hash = ? AND created_at > ?').bind(who, now - DAY).first();
      if (recent.n >= MAX_SHARES_PER_DAY) return json({ error: 'You have shared a lot of builds today. Try again tomorrow.' }, 429, origin);
      const id = newBuildId();
      await db.prepare('INSERT INTO builds (id, platform, name, note, parts, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, platform, name, note, JSON.stringify([...new Set(parts)]), now, who).run();
      const row = await db.prepare('SELECT * FROM builds WHERE id = ?').bind(id).first();
      return json({ build: toBuild(row) }, 201, origin);
    }

    // POST /api/builds/:id/vote | /unvote | /click | /report
    const act = path.match(/^\/api\/builds\/([a-z0-9]+)\/(vote|unvote|click|report)$/);
    if (request.method === 'POST' && act) {
      const [, id, action] = act;
      if (!BUILD_ID.test(id)) return json({ error: 'Not found' }, 404, origin);
      const exists = await db.prepare('SELECT id FROM builds WHERE id = ? AND hidden = 0').bind(id).first();
      if (!exists) return json({ error: 'Not found' }, 404, origin);
      const who = await visitorHash(request, salt);
      if (action === 'vote') {
        const r = await db.prepare('INSERT OR IGNORE INTO votes (build_id, voter, created_at) VALUES (?, ?, ?)').bind(id, who, now).run();
        if (r.meta.changes) await db.prepare('UPDATE builds SET votes = votes + 1 WHERE id = ?').bind(id).run();
      } else if (action === 'unvote') {
        const r = await db.prepare('DELETE FROM votes WHERE build_id = ? AND voter = ?').bind(id, who).run();
        if (r.meta.changes) await db.prepare('UPDATE builds SET votes = MAX(votes - 1, 0) WHERE id = ?').bind(id).run();
      } else if (action === 'click') {
        const r = await db.prepare('INSERT OR IGNORE INTO clicks (build_id, voter, day) VALUES (?, ?, ?)').bind(id, who, Math.floor(now / DAY)).run();
        if (r.meta.changes) await db.prepare('UPDATE builds SET clicks = clicks + 1 WHERE id = ?').bind(id).run();
      } else {
        const net = await networkHash(request, salt);
        const r = await db.prepare('INSERT OR IGNORE INTO reports (build_id, voter) VALUES (?, ?)').bind(id, net).run();
        if (r.meta.changes) await db.prepare(`UPDATE builds SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AFTER_REPORTS} AND reports + 1 >= votes THEN 1 ELSE hidden END WHERE id = ?`).bind(id).run();
      }
      const row = await db.prepare('SELECT * FROM builds WHERE id = ?').bind(id).first();
      return json({ build: toBuild(row), hidden: !!row.hidden }, 200, origin);
    }

    const alerts = await alertsRoute(request, env, { path, url, now, json: (d, s) => json(d, s, origin), who: () => visitorHash(request, salt) });
    if (alerts) return alerts;

    // POST /api/feedback { message, email, page }
    const feedback = await feedbackRoute(request, env, { path, now, json: (d, s) => json(d, s, origin), who: () => visitorHash(request, salt) });
    if (feedback) return feedback;

    return json({ error: 'Not found' }, 404, origin);
  } catch (err) {
    console.error(err);
    return json({ error: 'Something went wrong. Please try again.' }, 500, origin);
  }
}
