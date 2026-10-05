/**
 * Share links that show a picture card on Reddit, Discord and in texts (worker/src/share.js).
 * The community builds Worker, on our own domain. Until it answers, Copy link falls back to plain ?b= links.
 */
export const SHARE_BASE = 'https://share.dropinbuilds.com';

/**
 * Address of the community builds and price alerts API (worker/). The same Worker as SHARE_BASE: our own
 * domain rather than its workers.dev address, which ad blockers and work networks sometimes block and which
 * carries the Cloudflare account name. Empty would run community features in preview mode.
 */
export const COMMUNITY_API = SHARE_BASE;

/**
 * Content Security Policy for every page (the builder and the FAQ pages). GitHub Pages can't send headers,
 * so it goes in a <meta> tag at build time. It lets pages load code only from this site and Cloudflare's
 * visit counter, and talk only to our own API, which stops injected scripts from running or sending data
 * anywhere. Add a host here before the site uses a new outside script or API.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${SHARE_BASE} https://cloudflareinsights.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
