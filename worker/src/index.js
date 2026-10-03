import { handle } from './api.js';

export default {
  fetch: (request, env) => handle(request, env),
};
