// How long the Worker keeps personal data. Runs from the daily cron, whether or not email is set up:
//   feedback            deleted 90 days after the daily digest sent it; never-sent messages after 180 days
//   feedback.email      blanked 30 days after the digest sent it (the message stays until it's deleted)
//   ip_hash             blanked after 30 days on alerts, feedback and builds (the daily limits only look back a day)
//   clicks              deleted after 30 days (the per-build click counts in builds stay)
//   suppressed          deleted 90 days after the unsubscribe, when it stops applying (alerts.js)
//   signups             deleted after 30 days (the signup limits only look back a day)
// Votes and reports are kept, so nobody can vote twice or re-report a build. Unconfirmed alert signups are
// deleted after 7 days by runAlerts, and confirmed ones are kept until the address unsubscribes.

import { SUPPRESS_FOR } from './alerts.js';

const DAY = 86_400_000;

/**
 * Live: the daily job deletes and blanks what the rules match and logs only the counts. `runRetention(env, now, false)`
 * is the dry run, which only counts. The Privacy Policy section 5 table (src/guides/legal.ts) states these periods and
 * a unit test ties it to this flag. Change them together.
 */
export const RETENTION_LIVE = true;

/** What gets deleted or blanked as of `now`. Blanking skips rows that are about to be deleted, so dry-run counts match a live run. */
function rules(now) {
  const month = now - 30 * DAY;
  const doomed = '((emailed_at IS NOT NULL AND emailed_at < ?) OR (emailed_at IS NULL AND created_at < ?))';
  const doomedArgs = [now - 90 * DAY, now - 180 * DAY];
  return [
    { name: 'feedbackDeleted', table: 'feedback', where: doomed, args: doomedArgs },
    { name: 'feedbackEmailsBlanked', table: 'feedback', set: "email = ''", where: `email != '' AND emailed_at IS NOT NULL AND emailed_at < ? AND NOT ${doomed}`, args: [month, ...doomedArgs] },
    { name: 'feedbackIpHashesBlanked', table: 'feedback', set: "ip_hash = ''", where: `ip_hash != '' AND created_at < ? AND NOT ${doomed}`, args: [month, ...doomedArgs] },
    { name: 'alertIpHashesBlanked', table: 'alerts', set: "ip_hash = ''", where: "ip_hash != '' AND created_at < ?", args: [month] },
    { name: 'buildIpHashesBlanked', table: 'builds', set: "ip_hash = ''", where: "ip_hash != '' AND created_at < ?", args: [month] },
    { name: 'clicksDeleted', table: 'clicks', where: 'day < ?', args: [Math.floor(now / DAY) - 30] },
    { name: 'suppressedDeleted', table: 'suppressed', where: 'created_at < ?', args: [now - SUPPRESS_FOR] },
    { name: 'signupsDeleted', table: 'signups', where: 'created_at < ?', args: [month] },
  ];
}

/** Returns how many rows each rule deleted or blanked (or, in a dry run, would have). Counts only, no row contents. */
export async function runRetention(env, now = Date.now(), live = RETENTION_LIVE) {
  const db = env.DB;
  const out = { live };
  for (const { name, table, set, where, args } of rules(now)) {
    if (!live) {
      out[name] = (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).bind(...args).first()).n;
      continue;
    }
    const sql = set ? `UPDATE ${table} SET ${set} WHERE ${where}` : `DELETE FROM ${table} WHERE ${where}`;
    out[name] = (await db.prepare(sql).bind(...args).run()).meta.changes;
  }
  return out;
}
