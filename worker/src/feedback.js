// Visitor feedback from the Send Feedback page (dropinbuilds.com/feedback/). Each message is kept in D1 and
// the Worker's daily cron emails the owner one digest of everything new, so feedback costs at most one of
// Resend's 100 emails a day. Needs:
//   RESEND_API_KEY   the same key price alerts use
//   FEEDBACK_EMAIL   where the digest goes. Until it's set, feedback is still saved and waits in D1.

import { cleanText } from './api.js';
import { SITE } from './share.js';

const DAY = 86_400_000;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const MIN_MESSAGE = 5;
export const MAX_MESSAGE = 2000;
const MAX_PER_VISITOR_PER_DAY = 5;
/** Caps the digest, so a flood from many networks can't bury real messages or bloat the email. */
const MAX_PER_DAY_TOTAL = 100;

export const feedbackEnabled = (env) => !!(env.RESEND_API_KEY && env.FEEDBACK_EMAIL);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Like cleanText, but keeps line breaks so longer messages stay readable. */
export function cleanMessage(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\r\n?/g, '\n').split('\n').map((line) => cleanText(line, MAX_MESSAGE)).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_MESSAGE);
}

/** Answers POST /api/feedback, or returns null for anything else. `json` and `who` come from api.js. */
export async function feedbackRoute(request, env, { path, json, who, now }) {
  if (request.method !== 'POST' || path !== '/api/feedback') return null;
  const db = env.DB;
  const body = await request.json().catch(() => null);
  // A field people never see. Bots fill it in; they get a normal answer and nothing is saved.
  if (body?.website) return json({ ok: true }, 201);
  const message = cleanMessage(body?.message);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const page = cleanText(body?.page, 200);
  if (message.length < MIN_MESSAGE) return json({ error: 'Write a few more words so we know what you mean.' }, 400);
  if (email && (!EMAIL.test(email) || email.length > 254)) return json({ error: 'That email address doesn\'t look right. You can also leave it blank.' }, 400);
  const hash = await who();
  const mine = await db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?').bind(hash, now - DAY).first();
  if (mine.n >= MAX_PER_VISITOR_PER_DAY) return json({ error: 'Thanks, we have plenty from you today. Try again tomorrow.' }, 429);
  const all = await db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE created_at > ?').bind(now - DAY).first();
  if (all.n >= MAX_PER_DAY_TOTAL) return json({ error: 'Feedback is busy today. Try again tomorrow.' }, 429);
  await db.prepare('INSERT INTO feedback (message, email, page, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)')
    .bind(message, email, page, now, hash).run();
  return json({ ok: true }, 201);
}

const when = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pageLink = (p) => (p.startsWith('/') ? `${SITE}${p}` : '');

export function feedbackDigest(rows) {
  const subject = `${rows.length} new feedback message${rows.length === 1 ? '' : 's'} on Drop-In Builds`;
  const html = `<!doctype html><html><body style="margin:0;background:#f2f1ee;font-family:Arial,Helvetica,sans-serif;color:#1c2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0e2a47;color:#fff;padding:16px 24px;font-size:18px;letter-spacing:.5px">DROP-IN <b style="color:#e8853a">BUILDS</b></td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 16px">New Feedback</h1>${rows.map((r) => `
<div style="border-top:1px solid #eee;padding:12px 0">
<p style="margin:0 0 6px;color:#6b7684;font-size:12px">${esc(when(r.created_at))} Eastern${r.page ? ` · from ${pageLink(r.page) ? `<a href="${esc(pageLink(r.page))}" style="color:#6b7684">${esc(r.page)}</a>` : esc(r.page)}` : ''}</p>
<p style="margin:0;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(r.message)}</p>
${r.email ? `<p style="margin:8px 0 0;font-size:13px"><a href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Your Drop-In Builds feedback')}" style="color:#d4691e;font-weight:bold">Reply to ${esc(r.email)}</a></p>` : '<p style="margin:8px 0 0;font-size:13px;color:#8a939e">No email left.</p>'}
</div>`).join('')}</td></tr>
<tr><td style="padding:16px 24px;background:#f7f6f3;color:#6b7684;font-size:12px;line-height:1.6">Sent once a day when visitors leave feedback on dropinbuilds.com/feedback/. Every message is also kept in the Cloudflare D1 database, table feedback.</td></tr>
</table></td></tr></table></body></html>`;
  const text = rows.map((r) => `${when(r.created_at)} Eastern${r.page ? ` (from ${r.page})` : ''}\n${r.message}\n${r.email ? `Reply to: ${r.email}` : 'No email left.'}`).join('\n\n---\n\n');
  return { subject, html, text: `New feedback on Drop-In Builds\n\n${text}\n` };
}

/** Runs from the daily cron: emails everything not sent yet in one message. */
export async function runFeedback(env, now = Date.now()) {
  if (!feedbackEnabled(env)) return { sent: 0, skipped: 'not set up' };
  const db = env.DB;
  const { results } = await db.prepare('SELECT * FROM feedback WHERE emailed_at IS NULL ORDER BY created_at LIMIT 200').all();
  if (!results.length) return { sent: 0, waiting: 0 };
  const message = { from: env.ALERTS_FROM || 'Drop-In Builds <alerts@dropinbuilds.com>', to: [env.FEEDBACK_EMAIL], ...feedbackDigest(results) };
  const single = results.filter((r) => r.email);
  if (single.length === 1 && results.length === 1) message.reply_to = single[0].email;
  if (env.sendEmail) await env.sendEmail(message); // tests
  else {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
  const last = results[results.length - 1].id;
  await db.prepare('UPDATE feedback SET emailed_at = ? WHERE emailed_at IS NULL AND id <= ?').bind(now, last).run();
  return { sent: 1, messages: results.length };
}
