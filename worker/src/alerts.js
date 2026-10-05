// Email price alerts. A visitor gives an email address once and every build saved in that browser is
// watched; the site keeps the list up to date. After the nightly price refresh, the Worker's daily cron
// compares each part's best price with the one we last told them about and sends one email per address
// listing what went down and what went up. Signups are confirmed by email first (double opt-in), every
// email carries a one-click unsubscribe, and nothing is sent until Resend is set up:
//   RESEND_API_KEY   Resend API key (free plan: 3,000 emails a month, 100 a day)
//   MAILING_ADDRESS  postal address printed in every email, as US law (CAN-SPAM) requires
//   ALERTS_FROM      optional sender, default "Drop-In Builds <alerts@dropinbuilds.com>"

import { PLATFORM_IDS } from './api.js';
import { SITE } from './share.js';

export const API_BASE = 'https://share.dropinbuilds.com';
const DAY = 86_400_000;
const PART_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TOKEN = /^[a-f0-9]{32}$/;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_BUILDS = 50;
const MAX_PARTS = 40;
const MAX_SIGNUPS_PER_DAY = 5;
/** Resend's free plan sends 100 a day; confirmations need room too. */
const MAX_ALERT_EMAILS_PER_RUN = 80;

export const alertsEnabled = (env) => !!(env.RESEND_API_KEY && env.MAILING_ADDRESS);

/**
 * Bar for a part to make it into an email: at least $20 and 10% of the price. Higher than the site's
 * ↑/↓ tags ($1 and 3%) so only real savings (or real increases) send email.
 */
export const EMAIL_MIN_DOLLARS = 20;
export const EMAIL_MIN_SHARE = 0.1;
export const worthTelling = (was, now) => Math.abs(was - now) >= Math.max(EMAIL_MIN_DOLLARS, was * EMAIL_MIN_SHARE);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Builds as the site sends them, or null if anything is off. */
export function cleanBuilds(list) {
  if (!Array.isArray(list) || list.length > MAX_BUILDS) return null;
  const out = [];
  for (const b of list) {
    const parts = Array.isArray(b?.parts) ? [...new Set(b.parts)] : null;
    if (!PLATFORM_IDS.includes(b?.platform) || !parts || parts.length > MAX_PARTS || !parts.every((p) => typeof p === 'string' && PART_ID.test(p))) return null;
    out.push({ name: clean(b.name, 60) || 'Saved build', platform: b.platform, parts });
  }
  return out;
}

export const buildLink = (b) => `${SITE}/?b=${encodeURIComponent(`${b.platform}~${b.parts.join('.')}`)}`;

/** Part names and best prices, as published with the site. Fresh for the daily run. */
export async function loadIndex(fresh = false) {
  try {
    const res = await fetch(`${SITE}/og/index.json`, fresh ? { cf: { cacheTtl: 0 } } : { cf: { cacheTtl: 3600, cacheEverything: true } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Today's best price for every part in the builds, keyed `<platform>/<part>`. */
function pricesFor(index, builds) {
  const out = {};
  for (const b of builds) for (const id of b.parts) {
    const p = index?.platforms?.[b.platform]?.parts?.[id];
    if (p) out[`${b.platform}/${id}`] = p[1];
  }
  return out;
}

/* ------------------------------------------------------------------ sending */

async function send(env, { to, subject, html, text, token }) {
  const stop = `${API_BASE}/alerts/stop?t=${token}`;
  const message = {
    from: env.ALERTS_FROM || 'Drop-In Builds <alerts@dropinbuilds.com>',
    to: [to], subject, html, text,
    headers: { 'List-Unsubscribe': `<${stop}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
  if (env.sendEmail) return env.sendEmail(message); // tests
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

function layout(env, token, inner, why) {
  const stop = `${API_BASE}/alerts/stop?t=${token}`;
  return `<!doctype html><html><body style="margin:0;background:#f2f1ee;font-family:Arial,Helvetica,sans-serif;color:#1c2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0e2a47;color:#fff;padding:16px 24px;font-size:18px;letter-spacing:.5px">DROP-IN <b style="color:#e8853a">BUILDS</b></td></tr>
<tr><td style="padding:24px">${inner}</td></tr>
<tr><td style="padding:16px 24px;background:#f7f6f3;color:#6b7684;font-size:12px;line-height:1.6">${why}<br>
<a href="${stop}" style="color:#6b7684">Unsubscribe</a> from all Drop-In Builds emails.<br>${esc(env.MAILING_ADDRESS)}</td></tr>
</table></td></tr></table></body></html>`;
}

const footerText = (env, token, why) => `\n\n--\n${why}\nUnsubscribe: ${API_BASE}/alerts/stop?t=${token}\n${env.MAILING_ADDRESS}\n`;

async function sendConfirm(env, row) {
  const link = `${API_BASE}/alerts/confirm?t=${row.token}`;
  const why = 'You got this email because someone entered this address on dropinbuilds.com. If it wasn\'t you, ignore it and you won\'t hear from us again.';
  await send(env, {
    to: row.email, token: row.token,
    subject: 'Confirm your Drop-In Builds price alerts',
    html: layout(env, row.token, `<h1 style="font-size:20px;margin:0 0 12px">Confirm Your Price Alerts</h1>
<p style="font-size:15px;line-height:1.5">Press the button and we'll email you when parts in your saved builds get cheaper or more expensive. At most one email a day.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#d4691e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">Turn On Price Alerts</a></p>`, why),
    text: `Confirm your Drop-In Builds price alerts:\n${link}\n\nWe'll email you when parts in your saved builds get cheaper or more expensive. At most one email a day.${footerText(env, row.token, why)}`,
  });
}

/** Builds whose parts moved, each with its changes (biggest drop first) and today's total. */
export function changesFor(index, builds, seen) {
  const out = [];
  for (const b of builds) {
    const parts = index?.platforms?.[b.platform]?.parts ?? {};
    const changes = [];
    let total = 0;
    for (const id of b.parts) {
      const p = parts[id];
      if (!p) continue;
      total += p[1];
      const was = seen[`${b.platform}/${id}`];
      if (was !== undefined && worthTelling(was, p[1])) changes.push({ name: p[0], was, now: p[1] });
    }
    if (changes.length) out.push({ build: b, changes: changes.sort((x, y) => (y.was - y.now) - (x.was - x.now)), total });
  }
  return out;
}

function digest(env, token, moved) {
  const down = moved.flatMap((m) => m.changes).filter((c) => c.now < c.was).length;
  const up = moved.flatMap((m) => m.changes).filter((c) => c.now > c.was).length;
  const subject = down && !up ? `Price drop on ${moved.length === 1 ? `"${moved[0].build.name}"` : `${moved.length} of your builds`}`
    : up && !down ? `Price increase on ${moved.length === 1 ? `"${moved[0].build.name}"` : `${moved.length} of your builds`}`
    : `Prices changed on ${moved.length === 1 ? `"${moved[0].build.name}"` : `${moved.length} of your builds`}`;
  const why = 'You get these emails because you turned on price alerts on dropinbuilds.com. Prices are checked every night; always confirm the price at the retailer.';
  const html = moved.map(({ build, changes, total }) => `<h2 style="font-size:17px;margin:0 0 4px">${esc(build.name)}</h2>
<p style="margin:0 0 10px;color:#6b7684;font-size:13px">Now ${money(total)} at the best prices we found</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:12px">${changes.map((c) => `<tr>
<td style="padding:6px 0;border-top:1px solid #eee">${esc(c.name)}</td>
<td style="padding:6px 0 6px 8px;border-top:1px solid #eee;text-align:right;white-space:nowrap;color:#8a939e"><s>${money(c.was)}</s></td>
<td style="padding:6px 0 6px 8px;border-top:1px solid #eee;text-align:right;white-space:nowrap;font-weight:bold;color:${c.now < c.was ? '#2e7d4f' : '#b06d00'}">${c.now < c.was ? '↓' : '↑'} ${money(c.now)}</td></tr>`).join('')}</table>
<p style="margin:0 0 24px"><a href="${buildLink(build)}" style="color:#d4691e;font-weight:bold">Open This Build</a></p>`).join('');
  const text = moved.map(({ build, changes, total }) => `${build.name} (now ${money(total)})\n${changes.map((c) => `  ${c.name}: ${money(c.was)} -> ${money(c.now)}`).join('\n')}\n  ${buildLink(build)}`).join('\n\n');
  return { subject, html: layout(env, token, html, why), text: text + footerText(env, token, why) };
}

/* ------------------------------------------------------------------ requests */

const page = (title, body) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Drop-In Builds</title>
<style>body{margin:0;font-family:system-ui,Arial,sans-serif;background:#f2f1ee;color:#1c2430}header{background:#0e2a47;color:#fff;padding:16px 24px;font-size:18px}header b{color:#e8853a}main{max-width:520px;margin:32px auto;padding:0 16px}a.btn{display:inline-block;background:#d4691e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold}</style></head>
<body><header>DROP-IN <b>BUILDS</b></header><main><h1>${esc(title)}</h1>${body}<p><a class="btn" href="${SITE}/#saved">Go to My Builds</a></p></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

/** Answers alert requests, or returns null for anything else. `json` and `who` come from api.js. */
export async function alertsRoute(request, env, { path, url, json, who, now }) {
  const db = env.DB;

  if (request.method === 'GET' && path === '/api/alerts/status') return json({ enabled: alertsEnabled(env) }, 200);

  // POST /api/alerts { email, builds }: sign up; sends the confirmation email
  if (request.method === 'POST' && path === '/api/alerts') {
    if (!alertsEnabled(env)) return json({ error: 'Email alerts are not available yet.' }, 503);
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const builds = cleanBuilds(body?.builds ?? []);
    if (!EMAIL.test(email) || email.length > 254) return json({ error: 'That email address doesn\'t look right.' }, 400);
    if (!builds) return json({ error: 'That builds list is not valid.' }, 400);
    const hash = await who();
    const recent = await db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE (ip_hash = ? OR email = ?) AND created_at > ?').bind(hash, email, now - DAY).first();
    if (recent.n >= MAX_SIGNUPS_PER_DAY) return json({ error: 'Too many signups today. Try again tomorrow.' }, 429);
    const token = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const index = await loadIndex();
    const row = { token, email };
    await db.prepare('INSERT INTO alerts (token, email, builds, seen, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(token, email, JSON.stringify(builds), JSON.stringify(pricesFor(index, builds)), now, hash).run();
    await sendConfirm(env, row);
    return json({ token, email, confirmed: false }, 201);
  }

  const one = path.match(/^\/api\/alerts\/([a-f0-9]{32})$/);
  // GET /api/alerts/:token: is this signup still on, and confirmed?
  if (request.method === 'GET' && one) {
    const row = await db.prepare('SELECT email, confirmed FROM alerts WHERE token = ?').bind(one[1]).first();
    return row ? json({ email: row.email, confirmed: !!row.confirmed }, 200) : json({ error: 'Not found' }, 404);
  }
  // PUT /api/alerts/:token { builds }: the site keeps the watched builds in step with My builds.
  // Parts new to the list start from today's price; parts already watched keep their last reported price.
  if (request.method === 'PUT' && one) {
    const row = await db.prepare('SELECT seen FROM alerts WHERE token = ?').bind(one[1]).first();
    if (!row) return json({ error: 'Not found' }, 404);
    const body = await request.json().catch(() => null);
    const builds = cleanBuilds(body?.builds);
    if (!builds) return json({ error: 'That builds list is not valid.' }, 400);
    const old = JSON.parse(row.seen);
    const seen = { ...pricesFor(await loadIndex(), builds) };
    for (const k of Object.keys(seen)) if (old[k] !== undefined) seen[k] = old[k];
    await db.prepare('UPDATE alerts SET builds = ?, seen = ? WHERE token = ?').bind(JSON.stringify(builds), JSON.stringify(seen), one[1]).run();
    return json({ ok: true }, 200);
  }

  // GET /alerts/confirm?t=<token>: the link in the confirmation email
  if (request.method === 'GET' && path === '/alerts/confirm') {
    const token = url.searchParams.get('t') ?? '';
    const r = TOKEN.test(token) ? await db.prepare('UPDATE alerts SET confirmed = 1 WHERE token = ?').bind(token).run() : { meta: { changes: 0 } };
    return r.meta.changes
      ? page('Price Alerts Are On', '<p>We\'ll email you when parts in your saved builds change price, at most once a day. Builds you save later in the same browser are added automatically.</p>')
      : page('This Link Has Expired', '<p>Sign up again from My Builds on the site.</p>');
  }

  // GET or POST /alerts/stop?t=<token>: unsubscribe this address from everything (POST is the one-click header)
  if ((request.method === 'GET' || request.method === 'POST') && path === '/alerts/stop') {
    const token = url.searchParams.get('t') ?? '';
    const row = TOKEN.test(token) ? await db.prepare('SELECT email FROM alerts WHERE token = ?').bind(token).first() : null;
    if (row) await db.prepare('DELETE FROM alerts WHERE email = ?').bind(row.email).run();
    if (request.method === 'POST') return new Response(null, { status: 204 });
    return page('You\'re Unsubscribed', '<p>We won\'t email this address again. Your saved builds are still on the site.</p>');
  }

  return null;
}

/* ------------------------------------------------------------------ daily run */

/** Runs from the Worker's cron after the nightly price refresh. Returns counts, for the logs and tests. */
export async function runAlerts(env, now = Date.now()) {
  const db = env.DB;
  await db.prepare('DELETE FROM alerts WHERE confirmed = 0 AND created_at < ?').bind(now - 7 * DAY).run();
  if (!alertsEnabled(env)) return { sent: 0, skipped: 'not set up' };
  const index = await loadIndex(true);
  if (!index) return { sent: 0, skipped: 'price index unreachable' };

  const { results } = await db.prepare('SELECT * FROM alerts WHERE confirmed = 1 ORDER BY email').all();
  const byEmail = new Map();
  for (const row of results) (byEmail.get(row.email) ?? byEmail.set(row.email, []).get(row.email)).push(row);

  let sent = 0;
  for (const [email, rows] of byEmail) {
    const moved = [];
    const updates = [];
    for (const row of rows) {
      const builds = JSON.parse(row.builds);
      const seen = JSON.parse(row.seen);
      const m = changesFor(index, builds, seen);
      const next = { ...pricesFor(index, builds) };
      // Keep the last reported price for parts that only drifted, so small moves add up to a real one.
      for (const k of Object.keys(next)) if (seen[k] !== undefined && !worthTelling(seen[k], next[k])) next[k] = seen[k];
      moved.push(...m);
      updates.push([row.token, next]);
    }
    if (!moved.length) continue;
    if (sent >= MAX_ALERT_EMAILS_PER_RUN) { console.log(`Alert email cap reached; ${email} waits for tomorrow`); continue; }
    try {
      await send(env, { to: email, token: rows[0].token, ...digest(env, rows[0].token, moved) });
      sent++;
      for (const [token, seen] of updates) await db.prepare('UPDATE alerts SET seen = ?, last_sent_at = ? WHERE token = ?').bind(JSON.stringify(seen), now, token).run();
    } catch (err) {
      console.error(`Alert to ${email} failed: ${err.message}`);
    }
  }
  return { sent, watched: results.length };
}
