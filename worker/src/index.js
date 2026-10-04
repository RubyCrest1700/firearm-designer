import { handle } from './api.js';
import { runAlerts } from './alerts.js';

export default {
  fetch: (request, env) => handle(request, env),
  // Daily, after the nightly price refresh has rebuilt the site: email price alerts.
  scheduled: (event, env, ctx) => ctx.waitUntil(runAlerts(env).then((r) => console.log('Price alerts', JSON.stringify(r)))),
};
