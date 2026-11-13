// Email price alerts. A visitor gives an email address once and every build saved in that browser is
// watched; the site keeps the list up to date. After the nightly price refresh, the Worker's daily cron
// compares each part's best price with the one we last told them about and sends one email per address
// listing what went down and what went up. Signups are confirmed by email first (double opt-in), every
// email carries a one-click unsubscribe, and nothing is sent until Resend is set up. The confirmation email
// carries its own one-time code, stored only as a hash, so the token the site gets back can't confirm a
// signup. An address that unsubscribes from an email after confirming, or presses "Not you?" in a confirmation
// email, isn't emailed again for 90 days, even if someone signs it up again (the signup is saved but no
// confirmation email goes out). Needs:
//   RESEND_API_KEY   Resend API key (free plan: 3,000 emails a month, 100 a day; the worst case against both,
//                    and against Cloudflare's limits, is worked out at MAX_ALERT_EMAILS_PER_RUN)
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
 * The limits the daily alert run (runAlerts) has to stay inside, and its worst case against each.
 *
 * Resend's free plan sends 100 emails a day and 3,000 a month. Worst case in a day: 30 alert emails, 20
 * confirmations (the overall signup cap) and the one feedback digest (feedback.js) = 51. In a 31-day month:
 * 51 x 31 = 1,581. A retry repeats its Idempotency-Key, so Resend sends nothing new for it; even if every retry
 * counted, that is 55 a day and 1,705 a month. The overall signup cap keeps anyone signing up lots of addresses
 * from different networks from using up the alert emails.
 *
 * Cloudflare's free plan allows one Worker invocation 50 subrequests (fetch calls) and 50 D1 queries, where a
 * whole db.batch() counts as one query. Its pages don't say clearly whether D1 queries count as subrequests, so
 * the run is sized to fit all three readings: fetch calls within 50, D1 queries within 50, and the two added
 * together within 50. The alert run has an invocation to itself (index.js). Worst case:
 *   fetch calls  1 price index + 30 sends + 4 retries = 35
 *   D1 queries   3 at the start (the cleanup, the re-baseline mark, the read) + 3 claim batches + 3 revert
 *                batches (one per chunk, only for a chunk with an address to put back) + 1 quiet batch = 10
 *   together     45
 * A run with a cron value index.js doesn't know does all three daily jobs in one invocation. That adds the
 * feedback digest (2 queries and 1 fetch call, feedback.js) and retention (1 query, retention.js): 36 fetch calls
 * and 13 D1 queries, 49 together.
 * The cap counts addresses tried, not emails that went, so a refused send can't push the run past any limit.
 *
 * Time: Cloudflare allows a cron run 15 minutes. The ceiling here is 34 requests that each hang for the full
 * 10 seconds (SEND_TIMEOUT_MS), with 33 waits between them: 29 of 120 ms (SEND_GAP_MS) and 4 of 3 seconds (the
 * longest wait after a rate-limit answer, RATE_WAIT_MAX_MS). About 5 minutes 56 seconds. A normal full run adds
 * about 3.5 seconds of waits, which cost no CPU time.
 */
/** Sized for a shared limit of 50 (fetch calls and D1 queries counted together); see the arithmetic above. */
const MAX_ALERT_EMAILS_PER_RUN = 30;
/** Addresses claimed in one batch, then emailed, before the next batch is claimed. */
const CLAIM_CHUNK = 10;
/** Most second tries in one run, after an unclear outcome or a rate-limit answer. Sized for a shared limit of 50, as the cap above is. */
const MAX_SEND_RETRIES = 4;
/** The wait between one alert email request and the next, so a full run can't trip a per-second limit at Resend. */
const SEND_GAP_MS = 120;
/** The wait before retrying a send Resend's rate limit turned away: its retry-after answer, kept between these two. */
const RATE_WAIT_MIN_MS = 1000;
const RATE_WAIT_MAX_MS = 3000;
/** The error names Resend gives a 429 that means the day's or month's emails are used up, not its per-second rate limit. */
const QUOTA_ERRORS = ['daily_quota_exceeded', 'monthly_quota_exceeded'];
/** The most of a 429 answer's body that is read to find that error name. Resend's error bodies are a few dozen bytes. */
const MAX_429_BODY = 4096;
/** How long an alert email request may take before it is given up on. What happened to the email is then unclear. */
const SEND_TIMEOUT_MS = 10_000;
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
 * 2026-11-gritr-links-only: Gritr Sports went links only, so its live prices dropped, which raised some best prices
 * and moved some parts to estimates for no reason a subscriber cares about.
 */
export const REBASELINE = '2026-11-gritr-links-only';
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

/** Each platform's estimate ids, for the platforms that have an estimates list. Built once and passed in, not once per build. */
const estimateSets = (index) => new Map(Object.entries(index?.platforms ?? {}).filter(([, p]) => Array.isArray(p?.estimates)).map(([id, p]) => [id, estimateIds(p)]));
const NO_ESTIMATES = new Set();

/**
 * Today's best price for every part in the builds, keyed `<platform>/<part>`. A part with no live price today, because
 * it's an estimate (never a comparison price), or isn't in the index, or the index couldn't be read: its key stays
 * missing, or keeps the last live price if `held` has one. Only parts in the builds get a key.
 */
function pricesFor(index, builds, estimates, held = {}) {
  const out = {};
  for (const b of builds) {
    const platform = index?.platforms?.[b.platform];
    const listed = estimates.get(b.platform) ?? NO_ESTIMATES;
    for (const id of b.parts) {
      const p = indexPart(platform, id);
      const key = `${b.platform}/${id}`;
      if (p && !listed.has(id)) out[key] = p[1];
      else if (held[key] !== undefined) out[key] = held[key];
    }
  }
  return out;
}

/**
 * Live prices `seen` has no key for: a part that was an estimate, or wasn't priced, and is live now. An index with
 * no estimates list can't tell live prices from estimates, so nothing from it is added.
 */
function missingPrices(index, builds, seen, estimates) {
  const listed = builds.filter((b) => estimates.has(b.platform));
  return Object.fromEntries(Object.entries(pricesFor(index, listed, estimates)).filter(([k]) => seen[k] === undefined));
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

/**
 * Sends one email. `key`, when given, goes to Resend as the Idempotency-Key request header: a second request with
 * the same key within 24 hours sends nothing new. Throws when the email wasn't accepted. The error carries
 * `status` when Resend answered, and `unclear: true` when the request itself failed (network error, timeout), in
 * which case the email may or may not have gone. A 429 also carries `quota` (true when Resend's error name says
 * the day's or month's emails are used up; otherwise it is the per-second rate limit) and `retryAfter` (the
 * seconds Resend asked for, or NaN). Anything else thrown here happened before the request was made.
 */
async function send(env, { to, subject, html, text, token, key }) {
  const stop = `${API_BASE}/alerts/stop?t=${token}`;
  const message = {
    from: env.ALERTS_FROM || 'Drop-In Builds <alerts@dropinbuilds.com>',
    to: [to], subject, html, text,
    headers: { 'List-Unsubscribe': `<${stop}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
  const once = key ? { 'Idempotency-Key': key } : {};
  if (env.sendEmail) return env.sendEmail(message, once); // tests
  // Only a send with a key (an alert email) is given up on after SEND_TIMEOUT_MS; other emails are sent as before.
  // A runtime without AbortSignal.timeout sends with no limit, as src/community.ts does.
  const signal = key && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(SEND_TIMEOUT_MS) : undefined;
  const body = JSON.stringify(message);
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', ...once },
      body,
      ...(signal ? { signal } : {}),
    });
  } catch {
    // A network error or the timeout. No detail kept: the email may have gone, and the logs get only this.
    throw Object.assign(new Error('Resend unreachable'), { unclear: true });
  }
  if (res.status === 429) {
    // Resend answers 429 for its per-second rate limit and for a used-up daily or monthly quota alike; only the
    // error's name in the body tells them apart. The name is read and nothing of the body is kept or logged. At
    // most MAX_429_BODY bytes are read: a longer body, or one that can't be read or parsed as JSON, counts as the
    // rate limit.
    const bytes = await bodyUpTo(res, MAX_429_BODY);
    let name;
    try { name = bytes ? JSON.parse(new TextDecoder().decode(bytes))?.name : undefined; } catch { name = undefined; }
    throw Object.assign(new Error('Resend 429'), { status: 429, quota: QUOTA_ERRORS.includes(name), retryAfter: Number(res.headers.get('retry-after') ?? NaN) });
  }
  // Only the status: Resend's error text can repeat the address, and errors end up in the logs.
  if (!res.ok) throw Object.assign(new Error(`Resend ${res.status}`), { status: res.status });
}

/**
 * What a failed send means for the alert run. The email did not go: 'limited' (a 429 naming a used-up daily or
 * monthly quota: every further send would be turned away too), 'rate' (any other 429: Resend's per-second rate
 * limit turned the request away before sending, so a retry after a short wait is safe), 'refused' (any other 4xx:
 * Resend looked at this email and turned it down) and 'unsent' (an error with no status, from before the request
 * was made). 'unclear' (the request failed or timed out, or Resend answered 5xx): it may have gone, and a retry
 * with the same Idempotency-Key is safe. 'conflict' (409): taken to mean Resend has already had a request with this
 * key today, one still running or with a different body, so the email may have gone and a retry can't help.
 */
function sendFailure(err) {
  const status = err?.status;
  if (status === 429) return err.quota ? 'limited' : 'rate';
  if (status === 409) return 'conflict';
  if (err?.unclear || status >= 500) return 'unclear';
  return status >= 400 ? 'refused' : 'unsent';
}

/** How long to wait before retrying a send the rate limit turned away: `retryAfter` seconds, never under 1 or over 3. */
const rateWait = (retryAfter) => Math.min(RATE_WAIT_MAX_MS, Math.max(RATE_WAIT_MIN_MS, (Number.isFinite(retryAfter) ? retryAfter : 0) * 1000));

/**
 * The Idempotency-Key for an address's alert email on the UTC day of `now`: `alert-<hash>-<YYYY-MM-DD>`. The hash
 * is the first 32 hex characters of the SHA-256 of one of the address's tokens. The key itself is only that hash
 * and the day, and reveals nothing more.
 */
export const alertKey = async (token, now) => `alert-${(await sha256(token)).slice(0, 32)}-${new Date(now).toISOString().slice(0, 10)}`;

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
export function changesFor(index, builds, seen, sets = estimateSets(index)) {
  const out = [];
  for (const b of builds) {
    const platform = index?.platforms?.[b.platform];
    const estimates = sets.get(b.platform) ?? NO_ESTIMATES;
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

/** The most of an unsubscribe request's body that is read. The bodies that mean anything are a few dozen bytes. */
const MAX_STOP_BODY = 4096;

/** A request's (or response's) body as bytes, read once, or null if there is none, it is longer than `max`, or it can't be read. Stops reading at `max`. */
async function bodyUpTo(request, max) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return bytes;
}

/**
 * The fields of an unsubscribe POST (/alerts/stop). Mail apps send the one-click body either urlencoded or as
 * multipart/form-data. Anything else, or a body that doesn't parse as its type says, is read as urlencoded text.
 * A body over MAX_STOP_BODY is not parsed: by its content-length it isn't read at all, and without one the
 * reading stops at the limit. The request then counts as having no body, which still unsubscribes.
 */
async function stopForm(request) {
  const none = new URLSearchParams();
  const declared = request.headers.get('content-length');
  if (declared !== null && !(Number(declared) <= MAX_STOP_BODY)) return none;
  const bytes = await bodyUpTo(request, MAX_STOP_BODY);
  if (!bytes) return none;
  const type = request.headers.get('content-type') ?? '';
  const typed = /^\s*(multipart\/form-data|application\/x-www-form-urlencoded)\b/i.test(type);
  const form = typed ? await new Response(bytes, { headers: { 'content-type': type } }).formData().catch(() => null) : null;
  return form ?? new URLSearchParams(new TextDecoder().decode(bytes));
}

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
      .bind(token, email, JSON.stringify(builds), JSON.stringify(pricesFor(index, builds, estimateSets(index))), now, hash, await sha256(code)).run();
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
  // for a part that is an estimate today, or not in the index, is the last live one. If the index can't be read,
  // parts still in the builds keep theirs and new ones get a price from the daily run.
  if (request.method === 'PUT' && one) {
    const row = await db.prepare('SELECT seen FROM alerts WHERE token = ?').bind(one[1]).first();
    if (!row) return json({ error: 'Not found' }, 404);
    const body = await request.json().catch(() => null);
    const builds = cleanBuilds(body?.builds);
    if (!builds) return json({ error: 'That builds list is not valid.' }, 400);
    const old = currentSeen(JSON.parse(row.seen));
    const index = await loadIndex();
    const seen = pricesFor(index, builds, estimateSets(index), old);
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
    // The token's shape first: nothing is read from the request for a token that can't be one. For a well-formed
    // token the body is read (at most MAX_STOP_BODY of it) whether or not it still has a signup, so a second press
    // of the Unsubscribe page's button gets the same page as the first.
    const shaped = TOKEN.test(token);
    const form = shaped ? await stopForm(request) : new URLSearchParams();
    const fromPage = form.get('from') === 'page';
    const fromEmail = fromPage || form.get('List-Unsubscribe') === 'One-Click';
    const row = shaped ? await db.prepare('SELECT email, confirmed FROM alerts WHERE token = ?').bind(token).first() : null;
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

/** A chunk's claim needs at least this many rows before "none of them was claimed" is taken as a bad answer (claimProblem). */
const MIN_ROWS_TO_JUDGE = 3;

/**
 * What is wrong with the database's answer to a claim batch, in words (never a token or an address), or '' when
 * it can be read. `claims` are the batch's statements, each with the `token` it was bound to.
 *
 * Whether a row was claimed is read from that statement's own returned rows (UPDATE ... RETURNING token), never
 * from `meta.changes`. Cloudflare's D1 documentation says batch() returns "an array of D1Result objects", each "in
 * the array position corresponding to the array position of the initial statement", and that a D1Result holds "the
 * results (if applicable) as an array". It describes `meta.changes` only as "the number of changes made to the
 * database", without saying it is per statement inside a batch. So the answer must be an array with one result per
 * statement, each with a `results` array that is empty (not claimed) or holds exactly one row carrying the token
 * that statement was bound to (claimed). Anything else is a bad answer.
 *
 * One more check, on the chunk as a whole: every row in it was read from the database moments before, so if none
 * of them comes back claimed, that is far more likely a misread answer than that many people unsubscribing at
 * once. The one real way it happens is two runs claiming the same chunk at the same moment, and stopping the second
 * run is right then too. Under MIN_ROWS_TO_JUDGE rows that can't be told apart from two or so unsubscribes, so a
 * small chunk is not judged this way.
 */
function claimProblem(done, claims) {
  if (!Array.isArray(done)) return 'the batch answer is not a list';
  if (done.length !== claims.length) return `${done.length} results for ${claims.length} statements`;
  for (const [j, result] of done.entries()) {
    const rows = result?.results;
    if (!Array.isArray(rows)) return 'a statement came back without its rows';
    if (rows.length > 1 || (rows.length === 1 && rows[0]?.token !== claims[j].token)) return 'a statement returned a row it was not bound to';
  }
  if (claims.length >= MIN_ROWS_TO_JUDGE && done.every((result) => result.results.length === 0)) return `none of ${claims.length} rows came back claimed`;
  return '';
}

/**
 * Runs from the Worker's cron after the nightly price refresh. Returns counts, for the logs and tests: emails
 * sent (Resend accepted them), addresses put off to tomorrow (by the daily cap, or because the run stopped
 * early), and sends Resend refused (or, on a re-baseline run, how many signups were re-baselined). Two more are
 * there only when they aren't 0. `unconfirmed`: addresses that keep their claim without a confirmed email (a send
 * whose outcome stayed unclear, or a put-back that failed), which are not tried again. `claimMissed`: addresses
 * left alone because a row of theirs changed after it was read. Addresses are never logged.
 *
 * Nobody is emailed twice about one change. Each address's rows are first claimed: `seen` and `last_sent_at`
 * are written as if the email had gone. Only then is the email sent. A claim only takes a row that is still as it
 * was read: if any of an address's rows has gone (the person unsubscribed) or been claimed by another run in the
 * meantime, the address is left alone and whatever was claimed for it is put back. If the database's answer to a
 * claim can't be read (see claimProblem), nobody in that chunk is emailed, its claims are put back and the run
 * stops, with one line in the log. An email that did not go has its
 * `seen` put back, so the change is still waiting to be told. If it was never really tried (Resend's limit was
 * reached, or the run stopped first) `last_sent_at` is put back too and the address keeps its place for tomorrow.
 * If Resend turned that email down, `last_sent_at` stays, so the address goes to the back of the line and is tried
 * again when its turn comes: an address Resend always refuses can't hold up everyone behind it. A send whose
 * outcome is unclear is retried once with the same Idempotency-Key and, if still unclear, keeps its claim: that
 * person gets the email at most once, possibly not at all. A send Resend's per-second rate limit turned away is
 * retried once after a short wait; if that is turned away too, the address is put back whole and the run stops.
 * The budget for all of this is worked out at MAX_ALERT_EMAILS_PER_RUN. `env.pause(ms)` replaces the waits
 * between sends in tests.
 */
export async function runAlerts(env, now = Date.now()) {
  const db = env.DB;
  await db.prepare('DELETE FROM alerts WHERE confirmed = 0 AND created_at < ?').bind(now - CONFIRM_FOR).run();
  if (!alertsEnabled(env)) return { sent: 0, skipped: 'not set up' };
  const index = await loadIndex(true);
  if (!index) return { sent: 0, skipped: 'price index unreachable' };
  const estimates = estimateSets(index);

  // One-time quiet re-baseline (REBASELINE): today's prices become the last reported ones, nobody is emailed.
  // Pending signups too, so one confirmed later doesn't report the same move. D1 allows 50 queries per Worker
  // invocation on the free plan, shared with the other daily jobs, so the rows are updated SEEN_ROWS at a
  // time (3 bound parameters a row, within D1's 100 a query). The updates and the mark go in one batch, which
  // D1 runs as a single transaction: if any part fails nothing changes and tomorrow's run re-baselines again.
  const mark = await db.prepare("SELECT value FROM meta WHERE key = 'rebaseline'").first();
  if (mark?.value !== REBASELINE) {
    const { results: all } = await db.prepare('SELECT token, builds FROM alerts').all();
    // No `held` prices here, so later bumps clear them too. This one must, since old `seen` values may be estimates.
    const statements = seenStatements(db, all.map((row) => [row.token, JSON.stringify(pricesFor(index, currentBuilds(JSON.parse(row.builds)), estimates))]));
    statements.push(db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('rebaseline', ?)").bind(REBASELINE));
    await db.batch(statements);
    return { sent: 0, rebaselined: all.length };
  }

  // Longest-waiting first: a row's place is the time of its last email, or of its signup if it has had none. The
  // Map keeps addresses in the order their first row turns up, so an address stands where its longest-waiting row
  // does, with that row's token settling ties. An address put off today keeps its place and goes first tomorrow.
  // Never by the address itself: that would serve the same early-sorting addresses every day.
  const { results } = await db.prepare('SELECT * FROM alerts WHERE confirmed = 1 ORDER BY COALESCE(last_sent_at, created_at), token').all();
  const byEmail = new Map();
  for (const row of results) (byEmail.get(row.email) ?? byEmail.set(row.email, []).get(row.email)).push(row);

  const counts = { sent: 0, deferred: 0, failed: 0, unconfirmed: 0, claimMissed: 0 };
  const quiet = []; // [token, prices to add] for signups with nothing to tell
  const due = []; // addresses to email in this run, in order
  for (const [email, rows] of byEmail) {
    const moved = [];
    const updates = [];
    const missing = [];
    for (const row of rows) {
      const builds = currentBuilds(JSON.parse(row.builds));
      const seen = currentSeen(JSON.parse(row.seen));
      const m = changesFor(index, builds, seen, estimates);
      const next = pricesFor(index, builds, estimates, seen);
      // Keep the last reported price for parts that only drifted, so small moves add up to a real one.
      for (const k of Object.keys(next)) if (seen[k] !== undefined && !worthTelling(seen[k], next[k])) next[k] = seen[k];
      moved.push(...m);
      updates.push([row.token, next]);
      const add = missingPrices(index, builds, seen, estimates);
      if (Object.keys(add).length) missing.push([row.token, JSON.stringify(add)]);
    }
    // No email means `seen` isn't rewritten, so a part that turned live gets its first price here. Addresses put
    // off or failed below stay out of this: they're rewritten whole once their email goes.
    if (!moved.length) { quiet.push(...missing); continue; }
    if (due.length >= MAX_ALERT_EMAILS_PER_RUN) { counts.deferred++; continue; } // waits for tomorrow
    due.push({ email, rows, moved, updates });
  }

  let retries = 0;
  let stopped = false; // nothing more is claimed or sent in this run
  let requests = 0;
  const pause = env.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  // One email request, after a wait if another went before it. `a` is an entry of `due`.
  const attempt = async (a, wait = SEND_GAP_MS) => {
    try {
      const token = a.rows[0].token;
      // The key uses the smallest token, so it is the same whatever order the rows came in.
      a.mail ??= { to: a.email, token, key: await alertKey(a.rows.map((row) => row.token).sort()[0], now), ...digest(env, token, a.moved) };
      if (requests++) await pause(wait);
      await send(env, a.mail);
      return 'sent';
    } catch (err) {
      a.retryAfter = err?.retryAfter;
      return sendFailure(err);
    }
  };
  for (let i = 0; i < due.length; i += CLAIM_CHUNK) {
    const chunk = due.slice(i, i + CLAIM_CHUNK);
    if (stopped) { counts.deferred += chunk.length; continue; }
    // Claim: one statement per row (a `seen` can be large, so no CASE over many rows), the chunk as one batch,
    // which is one transaction and one D1 query. If it fails nothing was claimed, so nothing is sent. Each
    // statement takes its row only if `last_sent_at` is still what this run read (IS, so NULL matches NULL): a row
    // deleted since, or claimed by another run, is not touched and returns no row. RETURNING adds no query.
    const claims = chunk.flatMap((a) => a.updates.map(([token, seen], j) => ({
      a,
      token,
      row: a.rows[j],
      statement: db.prepare('UPDATE alerts SET seen = ?, last_sent_at = ? WHERE token = ? AND last_sent_at IS ? RETURNING token').bind(JSON.stringify(seen), now, token, a.rows[j].last_sent_at),
    })));
    let done;
    try {
      done = await db.batch(claims.map((c) => c.statement));
    } catch (err) {
      console.error(`Alert claim failed: ${errorText(err)}`);
      counts.deferred += chunk.length;
      stopped = true;
      continue;
    }
    const undo = []; // { as, rows: [row, the last_sent_at to leave it with] } for each address with rows to put back
    const putBack = (as, rows) => {
      counts[as]++;
      if (rows.length) undo.push({ as, rows });
    };
    const problem = claimProblem(done, claims);
    if (problem) {
      // The answer can't be trusted, so nobody in this chunk is emailed and the run stops here: at most one chunk
      // is lost, and the log says so. The claims may have been written, so every row is put back whole by the
      // guarded put-back below, which touches only rows still holding this run's `now`. If that works, the
      // addresses are put off to tomorrow; if it fails, they count as unconfirmed, as any failed put-back does.
      console.error(`Alert claim result unreadable: ${errorText(new Error(problem))}`);
      stopped = true;
      for (const a of chunk) putBack('deferred', a.rows.map((row) => [row, row.last_sent_at]));
    } else claims.forEach((c, j) => { c.took = done[j].results.length === 1; });
    for (const a of problem ? [] : chunk) {
      const mine = claims.filter((c) => c.a === a);
      // Not every row was claimed: the person unsubscribed, or another run has the address. No email; the rows
      // this run did claim are put back whole.
      if (!mine.every((c) => c.took)) { putBack('claimMissed', mine.filter((c) => c.took).map((c) => [c.row, c.row.last_sent_at])); continue; }
      // Claimed, but the run stopped before its turn: put back whole, to go tomorrow.
      if (stopped) { putBack('deferred', a.rows.map((row) => [row, row.last_sent_at])); continue; }
      let outcome = await attempt(a);
      if ((outcome === 'unclear' || outcome === 'rate') && retries < MAX_SEND_RETRIES) {
        retries++;
        if (outcome === 'rate') {
          // The rate limit turned the first request away before sending, so the second one's answer stands on its own.
          outcome = await attempt(a, rateWait(a.retryAfter));
        } else {
          const again = await attempt(a);
          // After an unclear first try only "accepted" settles it: a refusal now says nothing about the first.
          if (again === 'limited' || again === 'rate') stopped = true;
          outcome = again === 'sent' ? 'sent' : 'unclear';
        }
      }
      if (outcome === 'sent') counts.sent++;
      else if (outcome === 'unclear' || outcome === 'conflict') counts.unconfirmed++; // keeps its claim
      else {
        // Turned down by Resend: it was tried, so it keeps this run's last_sent_at and goes to the back of the line.
        putBack('failed', a.rows.map((row) => [row, outcome === 'refused' ? now : row.last_sent_at]));
        // Resend's quota is used up, or its rate limit turned the send away twice (or with no retry left): every
        // further send in this run would be turned away the same way.
        if (outcome === 'limited' || outcome === 'rate') stopped = true;
      }
    }
    // Put back: one batch per chunk, so a run that dies later has already undone these. Only rows still holding
    // this run's claim, so a row another run has claimed since is left alone.
    if (undo.length) {
      try {
        await db.batch(undo.flatMap((u) => u.rows).map(([row, lastSent]) => db.prepare('UPDATE alerts SET seen = ?, last_sent_at = ? WHERE token = ? AND last_sent_at = ?').bind(row.seen, lastSent, row.token, now)));
      } catch (err) {
        // These rows keep their claim: this change is never emailed to them, rather than risk emailing it twice.
        // So their addresses are counted as unconfirmed, not as failed, put off or left alone.
        console.error(`Alert undo failed: ${errorText(err)}`);
        for (const u of undo) { counts[u.as]--; counts.unconfirmed++; }
        stopped = true;
      }
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
  const { sent, deferred, failed, unconfirmed, claimMissed } = counts;
  return { sent, deferred, failed, ...(unconfirmed ? { unconfirmed } : {}), ...(claimMissed ? { claimMissed } : {}), watched: results.length };
}
