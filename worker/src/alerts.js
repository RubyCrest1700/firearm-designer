// Email price alerts. A visitor gives an email address once and every build saved in that browser is
// watched; the site keeps the list up to date. After the nightly price refresh, the Worker's daily cron
// compares each part's best price with the one we last told them about and sends one email per address
// listing what went down and what went up. Signups are confirmed by email first (double opt-in), every
// email carries a one-click unsubscribe, and nothing is sent until Resend is set up. The confirmation email
// carries its own one-time code, stored only as a hash, so the token the site gets back can't confirm a
// signup. An address that unsubscribes from an email after confirming, or presses "Not you?" in a confirmation
// email, isn't emailed again for 90 days, even if someone signs it up again (the signup is saved but no
// confirmation email goes out). Needs:
//   RESEND_API_KEY   Resend API key (free plan: 3,000 emails a month, 100 a day)
//   MAILING_ADDRESS  postal address printed in every email, as US law (CAN-SPAM) requires
//   ALERTS_FROM      optional sender, default "Drop-In Builds <alerts@dropinbuilds.com>"

import { canonical, errorText, isPlatform } from './api.js';
import { SITE, estimateIds, includingEstimates, indexPart, nfaNoticeFor } from './share.js';

export const API_BASE = 'https://share.dropinbuilds.com';
const DAY = 86_400_000;
const PART_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const TOKEN = /^[a-f0-9]{32}$/;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_BUILDS = 50;
const MAX_PARTS = 40;
const MAX_SIGNUPS_PER_DAY = 5;
/**
 * Resend's free plan sends 100 a day: up to 79 alert emails, 20 confirmations and the one feedback digest
 * (feedback.js). The overall signup cap keeps anyone signing up lots of addresses from different networks
 * from using up the alert emails.
 */
const MAX_ALERT_EMAILS_PER_RUN = 79;
const MAX_SIGNUPS_PER_DAY_TOTAL = 20;
/** Confirmation links work this long; unconfirmed signups are deleted after the same time (runAlerts). */
const CONFIRM_FOR = 7 * DAY;
/** How long an address that unsubscribed gets no confirmation emails. */
export const SUPPRESS_FOR = 90 * DAY;
/**
 * The current one-time quiet re-baseline. When the value stored in meta differs, the next daily run sets every
 * signup's last reported prices to today's without emailing anyone, then stores this. 2026-10-pause: three
 * retailers were paused, which raised some best prices for no reason a subscriber cares about. 2026-10-26-pause:
 * three more (AT3 Tactical, Rainier Arms, MidwayUSA), whose robots.txt refuses the price bot. 2026-11-estimate-moves:
 * estimates stopped being comparison prices, so any already stored have to go, or one turning live reads as a move.
 */
export const REBASELINE = '2026-11-estimate-moves';
/** Signups updated per `seen` statement: 3 bound parameters each keeps a statement within D1's 100. */
const SEEN_ROWS = 33;
/** Most statements the daily run spends on quiet writes; rows past the cap wait for the next day. Counts towards D1's query limit. */
const MAX_QUIET_STATEMENTS = 5;

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
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
/** How an address is kept on the suppression list: salted, so the list holds no addresses. */
export const emailHash = (salt, email) => sha256(`${salt}:email:${email}`);

/** Builds as the site sends them, or null if anything is off. */
export function cleanBuilds(list) {
  if (!Array.isArray(list) || list.length > MAX_BUILDS) return null;
  const out = [];
  for (const b of list) {
    const parts = Array.isArray(b?.parts) ? [...new Set(b.parts)] : null;
    if (!isPlatform(b?.platform) || !parts || parts.length > MAX_PARTS || !parts.every((p) => typeof p === 'string' && PART_ID.test(p))) return null;
    out.push({ name: clean(b.name, 60) || 'Saved build', platform: canonical(b.platform), parts });
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

/** Stored builds and prices from before the Glock 17, 19 and 26 became one builder carry the old platform ids. */
const currentBuilds = (builds) => builds.map((b) => ({ ...b, platform: canonical(b.platform) }));
const currentSeen = (seen) => Object.fromEntries(Object.entries(seen).map(([k, v]) => {
  const i = k.indexOf('/');
  return [`${canonical(k.slice(0, i))}${k.slice(i)}`, v];
}));

/**
 * Today's best price for every part in the builds, keyed `<platform>/<part>`. An estimate is never a comparison
 * price: its key stays missing, or keeps the last live price if `held` has one.
 */
function pricesFor(index, builds, held = {}) {
  const out = {};
  for (const b of builds) {
    const platform = index?.platforms?.[b.platform];
    const estimates = estimateIds(platform);
    for (const id of b.parts) {
      const p = indexPart(platform, id);
      const key = `${b.platform}/${id}`;
      if (!p) continue;
      if (!estimates.has(id)) out[key] = p[1];
      else if (held[key] !== undefined) out[key] = held[key];
    }
  }
  return out;
}

/**
 * Live prices `seen` has no key for: a part that was an estimate, or wasn't priced, and is live now. An index with
 * no estimates list can't tell live prices from estimates, so nothing from it is added.
 */
function missingPrices(index, builds, seen) {
  const listed = builds.filter((b) => Array.isArray(index?.platforms?.[b.platform]?.estimates));
  return Object.fromEntries(Object.entries(pricesFor(index, listed)).filter(([k]) => seen[k] === undefined));
}

/** UPDATEs setting `seen` from [token, value] rows, SEEN_ROWS at a time. `value` is the SQL for the new `seen`, given the SQL for the row's value. */
function seenStatements(db, rows, value = (given) => given) {
  const statements = [];
  for (let i = 0; i < rows.length; i += SEEN_ROWS) {
    const chunk = rows.slice(i, i + SEEN_ROWS);
    const cases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
    const marks = chunk.map(() => '?').join(', ');
    statements.push(db.prepare(`UPDATE alerts SET seen = ${value(`CASE token ${cases} END`)} WHERE token IN (${marks})`).bind(...chunk.flat(), ...chunk.map(([token]) => token)));
  }
  return statements;
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
  // Only the status: Resend's error text can repeat the address, and errors end up in the logs.
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

function layout(env, token, inner, why) {
  const stop = `${API_BASE}/alerts/stop?t=${token}`;
  return `<!doctype html><html><body style="margin:0;background:#f2f1ee;font-family:Arial,Helvetica,sans-serif;color:#1c2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0e2a47;color:#fff;padding:16px 24px;font-size:18px;letter-spacing:.5px">DROP-IN <b style="color:#e8853a">BUILDS</b></td></tr>
<tr><td style="padding:24px">${inner}</td></tr>
<tr><td style="padding:16px 24px;background:#f7f6f3;color:#6b7684;font-size:12px;line-height:1.6">${why}<br>
<a href="${stop}" style="color:#6b7684">Unsubscribe</a> from all Drop-In Builds emails.<br><a href="${SITE}/privacy/" style="color:#6b7684">Privacy Policy</a><br>${esc(env.MAILING_ADDRESS)}</td></tr>
</table></td></tr></table></body></html>`;
}

const footerText = (env, token, why) => `\n\n--\n${why}\nUnsubscribe: ${API_BASE}/alerts/stop?t=${token}\nPrivacy Policy: ${SITE}/privacy/\n${env.MAILING_ADDRESS}\n`;

/** `code` is the one-time confirmation code; it appears only in this email, in the confirm and "Not you?" links. */
async function sendConfirm(env, row, code) {
  const link = `${API_BASE}/alerts/confirm?c=${code}`;
  const block = `${API_BASE}/alerts/block?c=${code}`;
  const why = `You got this email because someone entered this address on dropinbuilds.com. If it wasn't you, ignore it and you won't hear from us again, or <a href="${block}" style="color:#6b7684">Not you? Don't email me again</a>.`;
  const whyText = `You got this email because someone entered this address on dropinbuilds.com. If it wasn't you, ignore it and you won't hear from us again.\nNot you? Don't email me again: ${block}`;
  await send(env, {
    to: row.email, token: row.token,
    subject: 'Confirm your Drop-In Builds price alerts',
    html: layout(env, row.token, `<h1 style="font-size:20px;margin:0 0 12px">Confirm Your Price Alerts</h1>
<p style="font-size:15px;line-height:1.5">Press the button and we'll email you when parts in your saved builds get cheaper or more expensive. At most one email a day.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#d4691e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">Turn On Price Alerts</a></p>`, why),
    text: `Confirm your Drop-In Builds price alerts:\n${link}\n\nWe'll email you when parts in your saved builds get cheaper or more expensive. At most one email a day.${footerText(env, row.token, whyText)}`,
  });
}

/** Builds whose live prices moved, each with its changes (biggest drop first), today's total and how many of the prices in it are estimates. */
export function changesFor(index, builds, seen) {
  const out = [];
  for (const b of builds) {
    const platform = index?.platforms?.[b.platform];
    const estimates = estimateIds(platform);
    const changes = [];
    let total = 0;
    let estimated = 0;
    for (const id of b.parts) {
      const p = indexPart(platform, id);
      if (!p) continue;
      total += p[1];
      if (estimates.has(id)) estimated++;
      const was = seen[`${b.platform}/${id}`];
      if (was !== undefined && !estimates.has(id) && worthTelling(was, p[1])) changes.push({ name: p[0], was, now: p[1] });
    }
    if (changes.length) out.push({ build: b, changes: changes.sort((x, y) => (y.was - y.now) - (x.was - x.now)), total, estimated });
  }
  return out;
}

function digest(env, token, moved) {
  const down = moved.flatMap((m) => m.changes).filter((c) => c.now < c.was).length;
  const up = moved.flatMap((m) => m.changes).filter((c) => c.now > c.was).length;
  const subject = down && !up ? `Price drop on ${moved.length === 1 ? `"${moved[0].build.name}"` : `${moved.length} of your builds`}`
    : up && !down ? `Price increase on ${moved.length === 1 ? `"${moved[0].build.name}"` : `${moved.length} of your builds`}`
    : `Prices changed on ${moved.length === 1 ? `"${moved[0].build.name}"` : `${moved.length} of your builds`}`;
  const why = 'You get these emails because you turned on price alerts on dropinbuilds.com. Prices are checked every night at the stores we track; always confirm the price at the retailer.';
  const html = moved.map(({ build, changes, total, estimated }) => `<h2 style="font-size:17px;margin:0 0 4px">${esc(build.name)}</h2>
<p style="margin:0 0 10px;color:#6b7684;font-size:13px">Now ${money(total)} at the best prices we found${includingEstimates(estimated)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:12px">${changes.map((c) => `<tr>
<td style="padding:6px 0;border-top:1px solid #eee">${esc(c.name)}</td>
<td style="padding:6px 0 6px 8px;border-top:1px solid #eee;text-align:right;white-space:nowrap;color:#8a939e"><s>${money(c.was)}</s></td>
<td style="padding:6px 0 6px 8px;border-top:1px solid #eee;text-align:right;white-space:nowrap;font-weight:bold;color:${c.now < c.was ? '#2e7d4f' : '#b06d00'}">${c.now < c.was ? '↓' : '↑'} ${money(c.now)}</td></tr>`).join('')}</table>
<p style="margin:0 0 24px"><a href="${buildLink(build)}" style="color:#d4691e;font-weight:bold">Open This Build</a></p>`).join('');
  const text = moved.map(({ build, changes, total, estimated }) => `${build.name} (now ${money(total)}${estimated ? ` at the best prices we found${includingEstimates(estimated)}` : ''})\n${changes.map((c) => `  ${c.name}: ${money(c.was)} -> ${money(c.now)}`).join('\n')}\n  ${buildLink(build)}`).join('\n\n');
  // Once per email, when any build in it is an AR (the short NFA notice).
  const notice = moved.map((m) => nfaNoticeFor(m.build.platform)).find(Boolean) ?? '';
  const noticeHtml = notice ? `<p style="margin:0 0 16px;color:#6b7684;font-size:13px">${esc(notice)}</p>` : '';
  return { subject, html: layout(env, token, html + noticeHtml, why), text: text + (notice ? `\n\n${notice}` : '') + footerText(env, token, why) };
}

/* ------------------------------------------------------------------ requests */

// The unsubscribe result page's first sentence.
/** Owner-approved wording (2026-10-26). */
const UNSUBSCRIBED = "We won't send price alerts to this address unless it signs up again.";

/** No scripts or outside files; the one form posts back here. */
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const page = (title, body, homeButton = true) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Drop-In Builds</title>
<style>body{margin:0;font-family:system-ui,Arial,sans-serif;background:#f2f1ee;color:#1c2430}header{background:#0e2a47;color:#fff;padding:16px 24px;font-size:18px}header b{color:#e8853a}main{max-width:520px;margin:32px auto;padding:0 16px}a.btn,button.btn{display:inline-block;background:#d4691e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;font-size:16px;border:0;cursor:pointer}</style></head>
<body><header>DROP-IN <b>BUILDS</b></header><main><h1>${esc(title)}</h1>${body}${homeButton ? `<p><a class="btn" href="${SITE}/#saved">Go to My Builds</a></p>` : ''}<p><a href="${SITE}/privacy/">Privacy Policy</a></p></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': PAGE_CSP } });

/** Puts an address on the suppression list. Unsubscribing must always work, so a missing salt only skips this. */
const suppress = async (db, salt, email, now) => {
  if (salt) await db.prepare('INSERT OR REPLACE INTO suppressed (email_hash, created_at) VALUES (?, ?)').bind(await emailHash(salt, email), now).run();
};

/**
 * Answers alert requests, or returns null for anything else. `json`, `noContent` and `who` come from api.js,
 * so every answer the site reads carries its CORS headers. `wait` hands work that can finish after the answer
 * (the confirmation email) to the Worker's waitUntil.
 */
export async function alertsRoute(request, env, { path, url, json, noContent, who, now, salt, wait = (p) => p }) {
  const db = env.DB;

  if (request.method === 'GET' && path === '/api/alerts/status') return json({ enabled: alertsEnabled(env) }, 200);

  // POST /api/alerts { email, builds }: sign up; sends the confirmation email. The token in the answer
  // manages the signup from the site; only the code in the email confirms it. The answer is always the
  // same 201, sent before the email: an address on the suppression list gets no email, and a failed send
  // is only logged, so the answer can't tell anyone which addresses unsubscribed.
  if (request.method === 'POST' && path === '/api/alerts') {
    if (!alertsEnabled(env)) return json({ error: 'Email alerts are not available yet.' }, 503);
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const builds = cleanBuilds(body?.builds ?? []);
    if (!EMAIL.test(email) || email.length > 254) return json({ error: 'That email address doesn\'t look right.' }, 400);
    if (!builds) return json({ error: 'That builds list is not valid.' }, 400);
    const hash = await who();
    const addressHash = await emailHash(salt, email);
    // The limits count the signups table, which unsubscribing doesn't touch.
    const recent = await db.prepare('SELECT COUNT(*) AS n FROM signups WHERE (ip_hash = ? OR email_hash = ?) AND created_at > ?').bind(hash, addressHash, now - DAY).first();
    if (recent.n >= MAX_SIGNUPS_PER_DAY) return json({ error: 'Too many signups today. Try again tomorrow.' }, 429);
    const today = await db.prepare('SELECT COUNT(*) AS n FROM signups WHERE created_at > ?').bind(now - DAY).first();
    if (today.n >= MAX_SIGNUPS_PER_DAY_TOTAL) return json({ error: 'Email signups are busy today. Try again tomorrow.' }, 429);
    const token = randomHex();
    const code = randomHex();
    const index = await loadIndex();
    await db.prepare('INSERT INTO signups (ip_hash, email_hash, created_at) VALUES (?, ?, ?)').bind(hash, addressHash, now).run();
    await db.prepare('INSERT INTO alerts (token, email, builds, seen, created_at, ip_hash, confirm_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(token, email, JSON.stringify(builds), JSON.stringify(pricesFor(index, builds)), now, hash, await sha256(code)).run();
    const confirmLater = async () => {
      try {
        const suppressed = await db.prepare('SELECT 1 AS n FROM suppressed WHERE email_hash = ? AND created_at > ?').bind(addressHash, now - SUPPRESS_FOR).first();
        if (!suppressed) await sendConfirm(env, { token, email }, code);
      } catch (err) {
        console.error(`Confirmation email failed: ${errorText(err)}`);
      }
    };
    await wait(confirmLater());
    return json({ token, email, confirmed: false }, 201);
  }

  const one = path.match(/^\/api\/alerts\/([a-f0-9]{32})$/);
  // GET /api/alerts/:token: is this signup still on, and confirmed?
  if (request.method === 'GET' && one) {
    const row = await db.prepare('SELECT email, confirmed FROM alerts WHERE token = ?').bind(one[1]).first();
    return row ? json({ email: row.email, confirmed: !!row.confirmed }, 200) : json({ error: 'Not found' }, 404);
  }
  // PUT /api/alerts/:token { builds }: the site keeps the watched builds in step with My builds.
  // Parts new to the list start from today's price; parts already watched keep their last reported price, which
  // for a part that is an estimate today is the last live one.
  if (request.method === 'PUT' && one) {
    const row = await db.prepare('SELECT seen FROM alerts WHERE token = ?').bind(one[1]).first();
    if (!row) return json({ error: 'Not found' }, 404);
    const body = await request.json().catch(() => null);
    const builds = cleanBuilds(body?.builds);
    if (!builds) return json({ error: 'That builds list is not valid.' }, 400);
    const old = currentSeen(JSON.parse(row.seen));
    const seen = pricesFor(await loadIndex(), builds, old);
    for (const k of Object.keys(seen)) if (old[k] !== undefined) seen[k] = old[k];
    await db.prepare('UPDATE alerts SET builds = ?, seen = ? WHERE token = ?').bind(JSON.stringify(builds), JSON.stringify(seen), one[1]).run();
    return json({ ok: true }, 200);
  }

  // GET /alerts/confirm?c=<code>: the link in the confirmation email. Like Unsubscribe, it only asks,
  // because email security scanners open links on their own.
  // POST /alerts/confirm (form field c=<code>): that page's button turns the alerts on. Each code works
  // once, for 7 days. Links from before codes (?t=<token>) have expired.
  if (path === '/alerts/confirm' && (request.method === 'GET' || request.method === 'POST')) {
    const expired = () => page('This Link Has Expired', '<p>Sign up again from My Builds on the site.</p>');
    const code = request.method === 'GET' ? url.searchParams.get('c') ?? '' : new URLSearchParams(await request.text().catch(() => '')).get('c') ?? '';
    if (!TOKEN.test(code)) return expired();
    const codeHash = await sha256(code);
    if (request.method === 'GET') {
      const row = await db.prepare('SELECT builds FROM alerts WHERE confirm_hash = ? AND confirmed = 0 AND created_at > ?').bind(codeHash, now - CONFIRM_FOR).first();
      if (!row) return expired();
      // The builds it will watch, so the person sees what they're turning on.
      const names = JSON.parse(row.builds).map((b) => `<li>${esc(b.name)}</li>`).join('');
      return page('Turn On Price Alerts?', `<p>Press the button and we'll email you when parts in your saved builds get cheaper or more expensive. At most one email a day.</p>
${names ? `<p>Builds you'll get alerts for:</p><ul>${names}</ul>` : ''}
<form method="post" action="/alerts/confirm"><input type="hidden" name="c" value="${code}"><p><button class="btn" type="submit">Turn On Price Alerts</button></p></form>`, false);
    }
    const r = await db.prepare('UPDATE alerts SET confirmed = 1, confirm_hash = NULL WHERE confirm_hash = ? AND confirmed = 0 AND created_at > ?').bind(codeHash, now - CONFIRM_FOR).run();
    return r.meta.changes
      ? page('Price Alerts Are On', '<p>We\'ll email you when parts in your saved builds change price, at most once a day. Builds you save later in the same browser are added automatically.</p>')
      : expired();
  }

  // GET /alerts/block?c=<code>: the "Not you? Don't email me again" link in the confirmation email. Like
  // confirm, it only asks. POST /alerts/block (form field c=<code>): that page's button deletes the pending
  // signup and puts the address on the suppression list for 90 days. Only the code from the email works,
  // and only while it could still confirm the signup.
  if (path === '/alerts/block' && (request.method === 'GET' || request.method === 'POST')) {
    const expired = () => page('This Link Has Expired', '<p>This signup was already confirmed, cancelled or has expired. Every email we send has an Unsubscribe link.</p>', false);
    const code = request.method === 'GET' ? url.searchParams.get('c') ?? '' : new URLSearchParams(await request.text().catch(() => '')).get('c') ?? '';
    if (!TOKEN.test(code)) return expired();
    const codeHash = await sha256(code);
    const row = await db.prepare('SELECT token, email FROM alerts WHERE confirm_hash = ? AND confirmed = 0 AND created_at > ?').bind(codeHash, now - CONFIRM_FOR).first();
    if (!row) return expired();
    if (request.method === 'GET') {
      return page('Stop These Emails?', `<p>If you didn't sign up for price alerts, press the button and we won't email ${esc(row.email)} again for 90 days.</p>
<form method="post" action="/alerts/block"><input type="hidden" name="c" value="${code}"><p><button class="btn" type="submit">Don't Email Me Again</button></p></form>`, false);
    }
    await suppress(db, salt, row.email, now);
    await db.prepare('DELETE FROM alerts WHERE token = ?').bind(row.token).run();
    return page('We Won\'t Email You Again', '<p>The signup is cancelled, and this address won\'t get price alert emails from us for 90 days.</p>', false);
  }

  // GET /alerts/stop?t=<token>: the Unsubscribe link in every email. It asks first, because email security
  // scanners open links in emails on their own and would otherwise unsubscribe people who never clicked.
  // POST /alerts/stop?t=<token>: unsubscribe. Sent by that page's button (from=page), by the one-click
  // List-Unsubscribe header in Gmail and Apple Mail (List-Unsubscribe=One-Click), and by Turn Off on the site
  // (no body). The site's token is handed out before the address is confirmed, so a token for a signup nobody
  // confirmed only cancels that one signup. A confirmed signup's token removes every signup for the address,
  // and when the unsubscribe came from an email the address also goes on the suppression list. Turn Off on
  // the site doesn't suppress, so turning alerts back on there works straight away.
  if (request.method === 'GET' && path === '/alerts/stop') {
    const token = url.searchParams.get('t') ?? '';
    const row = TOKEN.test(token) ? await db.prepare('SELECT email FROM alerts WHERE token = ?').bind(token).first() : null;
    if (!row) return page('You\'re Unsubscribed', '<p>This address isn\'t getting price alerts. Your saved builds are still on the site.</p>');
    return page('Stop Price Alerts?', `<p>We'll stop emailing ${esc(row.email)} about price changes.</p>
<form method="post" action="/alerts/stop?t=${token}"><input type="hidden" name="from" value="page"><p><button class="btn" type="submit">Unsubscribe</button></p></form>`, false);
  }
  if (request.method === 'POST' && path === '/alerts/stop') {
    const token = url.searchParams.get('t') ?? '';
    const form = new URLSearchParams(await request.text().catch(() => ''));
    const fromPage = form.get('from') === 'page';
    const fromEmail = fromPage || form.get('List-Unsubscribe') === 'One-Click';
    const row = TOKEN.test(token) ? await db.prepare('SELECT email, confirmed FROM alerts WHERE token = ?').bind(token).first() : null;
    if (row && !row.confirmed) {
      await db.prepare('DELETE FROM alerts WHERE token = ?').bind(token).run();
    } else if (row) {
      if (fromEmail) await suppress(db, salt, row.email, now);
      await db.prepare('DELETE FROM alerts WHERE email = ?').bind(row.email).run();
    }
    // Turn Off on the site reads this answer cross-origin, so it needs the CORS headers.
    if (!fromPage) return noContent();
    return page('You\'re Unsubscribed', `<p>${UNSUBSCRIBED} Your saved builds are still on the site.</p>`);
  }

  return null;
}

/* ------------------------------------------------------------------ daily run */

/**
 * Runs from the Worker's cron after the nightly price refresh. Returns counts, for the logs and tests: emails
 * sent, addresses put off to tomorrow by the daily cap, and sends that failed (or, on a re-baseline run, how
 * many signups were re-baselined). Addresses are never logged.
 */
export async function runAlerts(env, now = Date.now()) {
  const db = env.DB;
  await db.prepare('DELETE FROM alerts WHERE confirmed = 0 AND created_at < ?').bind(now - CONFIRM_FOR).run();
  if (!alertsEnabled(env)) return { sent: 0, skipped: 'not set up' };
  const index = await loadIndex(true);
  if (!index) return { sent: 0, skipped: 'price index unreachable' };

  // One-time quiet re-baseline (REBASELINE): today's prices become the last reported ones, nobody is emailed.
  // Pending signups too, so one confirmed later doesn't report the same move. D1 allows 50 queries per Worker
  // invocation on the free plan, shared with the other daily jobs, so the rows are updated SEEN_ROWS at a
  // time (3 bound parameters a row, within D1's 100 a query). The updates and the mark go in one batch, which
  // D1 runs as a single transaction: if any part fails nothing changes and tomorrow's run re-baselines again.
  const mark = await db.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first();
  if (mark?.value !== REBASELINE) {
    const { results: all } = await db.prepare('SELECT token, builds FROM alerts').all();
    const statements = seenStatements(db, all.map((row) => [row.token, JSON.stringify(pricesFor(index, currentBuilds(JSON.parse(row.builds))))]));
    statements.push(db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('rebaseline', ?)").bind(REBASELINE));
    await db.batch(statements);
    return { sent: 0, rebaselined: all.length };
  }

  const { results } = await db.prepare('SELECT * FROM alerts WHERE confirmed = 1 ORDER BY email').all();
  const byEmail = new Map();
  for (const row of results) (byEmail.get(row.email) ?? byEmail.set(row.email, []).get(row.email)).push(row);

  let sent = 0;
  let deferred = 0;
  let failed = 0;
  const quiet = []; // [token, prices to add] for signups with nothing to tell
  for (const [email, rows] of byEmail) {
    const moved = [];
    const updates = [];
    const missing = [];
    for (const row of rows) {
      const builds = currentBuilds(JSON.parse(row.builds));
      const seen = currentSeen(JSON.parse(row.seen));
      const m = changesFor(index, builds, seen);
      const next = pricesFor(index, builds, seen);
      // Keep the last reported price for parts that only drifted, so small moves add up to a real one.
      for (const k of Object.keys(next)) if (seen[k] !== undefined && !worthTelling(seen[k], next[k])) next[k] = seen[k];
      moved.push(...m);
      updates.push([row.token, next]);
      const add = missingPrices(index, builds, seen);
      if (Object.keys(add).length) missing.push([row.token, JSON.stringify(add)]);
    }
    // No email means `seen` isn't rewritten, so a part that turned live gets its first price here. Addresses put
    // off or failed below stay out of this: they're rewritten whole once their email goes.
    if (!moved.length) { quiet.push(...missing); continue; }
    if (sent >= MAX_ALERT_EMAILS_PER_RUN) { deferred++; continue; } // waits for tomorrow
    try {
      await send(env, { to: email, token: rows[0].token, ...digest(env, rows[0].token, moved) });
      sent++;
      for (const [token, seen] of updates) await db.prepare('UPDATE alerts SET seen = ?, last_sent_at = ? WHERE token = ?').bind(JSON.stringify(seen), now, token).run();
    } catch {
      failed++;
    }
  }

  // After the emails, so it can't use up their queries. json_patch lets the stored `seen` win: this only ever adds
  // keys, even if a PUT changed the row during the run. One transaction: on a failure every row waits for tomorrow.
  if (quiet.length) {
    try {
      await db.batch(seenStatements(db, quiet.slice(0, MAX_QUIET_STATEMENTS * SEEN_ROWS), (given) => `json_patch(${given}, seen)`));
    } catch (err) {
      console.error(`Quiet price write failed: ${errorText(err)}`);
    }
  }
  return { sent, deferred, failed, watched: results.length };
}
