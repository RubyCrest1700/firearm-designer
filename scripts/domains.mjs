// Host checks shared by the fetching scripts (scripts/robots.mjs) and the paused and links-only filters (scripts/sources.mjs).
// No dependencies: the registrable domain is the last two labels of a host name, or the last three when the last
// two are a known two-part public suffix such as co.uk. That is enough for the US stores and makers we track; it is
// not the full Public Suffix List.

/** Two-part public suffixes where the registrable domain takes a third label. */
const TWO_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.za', 'com.br', 'com.mx', 'co.in', 'com.cn']);

/** A URL's hostname without IPv6 brackets, lower case, with no trailing dot. */
const bare = (host) => host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

const isIPv4 = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const isIPv6 = (h) => h.includes(':');

/** The registrable domain: "www.primaryarms.com" and "blog.primaryarms.com" both give "primaryarms.com". An IP gives itself. */
export function registrableDomain(host) {
  const h = bare(host);
  if (isIPv4(h) || isIPv6(h)) return h;
  const labels = h.split('.');
  const take = labels.length >= 3 && TWO_PART_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2;
  return labels.slice(-take).join('.');
}

const v4 = (h) => h.split('.').map(Number);
/** IPv4 loopback, private, link-local, CGNAT, "this network" and broadcast. */
function privateV4([a, b]) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * True for a host a script must never be sent to: localhost names, and IP literals in loopback, private,
 * link-local, CGNAT or unspecified ranges (IPv4 and IPv6, IPv4-mapped IPv6 included). Host names are not resolved,
 * so a public name that resolves to a private address is not caught here.
 */
export function isPrivateHost(host) {
  const h = bare(host);
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (isIPv4(h)) return privateV4(v4(h));
  if (!isIPv6(h)) return false;
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return privateV4(v4(mapped[1]));
  // URL() writes a mapped address in hex (::ffff:7f00:1); turn it back into dotted form.
  const hexMapped = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const [x, y] = [parseInt(hexMapped[1], 16), parseInt(hexMapped[2], 16)];
    return privateV4([x >> 8, x & 255, y >> 8, y & 255]);
  }
  if (h === '::' || h === '::1') return true;
  const first = parseInt(h.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 /* fc00::/7 unique local */ || (first & 0xffc0) === 0xfe80 /* fe80::/10 link-local */;
}
