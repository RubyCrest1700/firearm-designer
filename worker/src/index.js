import { handle } from './api.js';
import { runAlerts } from './alerts.js';

/** Basic browser protections on every response: no content sniffing, no framing, no full URLs in referrers. */
export async function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('x-frame-options', 'DENY');
  out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  out.headers.set('strict-transport-security', 'max-age=31536000');
  return out;
}

export default {
  fetch: async (request, env) => withSecurityHeaders(await handle(request, env)),
  // Daily, after the nightly price refresh has rebuilt the site: email price alerts.
  scheduled: (event, env, ctx) => ctx.waitUntil(runAlerts(env).then((r) => console.log('Price alerts', JSON.stringify(r)))),
};
