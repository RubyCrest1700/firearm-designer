import { errorText, handle } from './api.js';
import { runAlerts } from './alerts.js';
import { runFeedback } from './feedback.js';
import { runRetention } from './retention.js';

/** Basic browser protections on every response: no content sniffing, no framing, no full URLs in referrers, a strict policy on pages. */
export async function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('x-frame-options', 'DENY');
  out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  out.headers.set('strict-transport-security', 'max-age=31536000');
  // Pages set their own policy (share.js, alerts.js); any other page gets one that allows nothing.
  if (out.headers.get('content-type')?.startsWith('text/html') && !out.headers.has('content-security-policy')) {
    out.headers.set('content-security-policy', "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  }
  return out;
}

export default {
  fetch: async (request, env, ctx) => withSecurityHeaders(await handle(request, env, Date.now(), ctx)),
  // Daily, after the nightly price refresh has rebuilt the site, as two cron runs (wrangler.toml), so the price
  // alert emails can't use up the D1 queries and subrequests that clearing out old personal data needs:
  //   11:00 UTC  price alert emails
  //   11:30 UTC  the feedback digest, and clearing out old personal data
  // A run with any other cron value, or none, does all three. Each logs only counts, or its error's name and message.
  // The run's promise is returned, because the runtime waits for what a scheduled handler returns (a cron run may
  // take up to 15 minutes) and waitUntil alone is only documented to keep a run going for up to 30 seconds.
  scheduled: (event, env, ctx) => {
    const run = runDaily(env, Date.now(), CRON_JOBS[event?.cron]);
    ctx.waitUntil(run);
    return run;
  },
};

const JOBS = { 'Price alerts': runAlerts, Feedback: runFeedback, Retention: runRetention };
/** Which jobs each cron in wrangler.toml runs. */
export const CRON_JOBS = { '0 11 * * *': ['Price alerts'], '30 11 * * *': ['Feedback', 'Retention'] };

/** Runs the named jobs, or all of them. */
export async function runDaily(env, now = Date.now(), names = Object.keys(JOBS)) {
  const results = await Promise.allSettled(names.map((name) => Promise.resolve().then(() => JOBS[name](env, now))));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(names[i], JSON.stringify(r.value));
    else console.error(`${names[i]} failed:`, errorText(r.reason));
  });
}
