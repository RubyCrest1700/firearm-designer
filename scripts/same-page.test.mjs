// samePage (scripts/same-page.mjs): did a redirect end on the page the price job asked for? Made-up addresses only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCT_PARAMS, TRACKING_PARAMS, TRACKING_PREFIXES, samePage } from './same-page.mjs';

const P = 'https://shop.example/p/upper-receiver';

/** [from, to, same?, both ways?]. "Both ways" rows are checked in each direction. */
const CASES = [
  // The same address.
  [P, P, true, true],

  // Trailing slashes.
  [P, `${P}/`, true, true],
  [P, `${P}//`, true, true],
  ['https://shop.example/p/upper-receiver/?sku=1', 'https://shop.example/p/upper-receiver?sku=1', true, true],

  // Letter case in the host and the path.
  [P, 'https://SHOP.Example/p/upper-receiver', true, true],
  [P, 'https://shop.example/P/Upper-Receiver', true, true],

  // http and https.
  [P, 'http://shop.example/p/upper-receiver', true, true],

  // www added or removed; only one leading www. is dropped.
  [P, 'https://www.shop.example/p/upper-receiver', true, true],
  ['http://shop.example/p/upper-receiver', 'https://www.shop.example/p/upper-receiver/', true, true],
  [P, 'https://www.www.shop.example/p/upper-receiver', false, true],

  // Another subdomain, another host, another port.
  [P, 'https://outlet.shop.example/p/upper-receiver', false, true],
  [P, 'https://m.shop.example/p/upper-receiver', false, true],
  [P, 'https://shop-two.example/p/upper-receiver', false, true],
  [P, 'https://shop.example:8443/p/upper-receiver', false, true],
  // Each scheme's own default port is no port at all.
  [P, 'https://shop.example:443/p/upper-receiver', true, true],
  [P, 'http://shop.example:80/p/upper-receiver', true, true],

  // The fragment.
  [P, `${P}#reviews`, true, true],
  [`${P}#specs`, `${P}#reviews`, true, true],

  // Tracking parameters, added or removed, in any letter case.
  [P, `${P}?utm_source=feed&utm_medium=cpc&utm_campaign=x`, true, true],
  [P, `${P}?gclid=abc`, true, true],
  [P, `${P}?fbclid=a&msclkid=b&mc_cid=c&mc_eid=d&srsltid=e&gad_source=1&gbraid=f&wbraid=g`, true, true],
  [P, `${P}?UTM_Source=feed&GCLID=abc`, true, true],
  [`${P}?sku=1&utm_source=feed`, `${P}?gclid=abc&sku=1`, true, true],
  // A name that only looks like tracking is an ordinary parameter.
  [`${P}?utmost=1`, P, false, false],

  // A product-selecting parameter: kept, dropped, changed, newly added.
  [`${P}?sku=123`, `${P}?sku=123`, true, true],
  [`${P}?sku=123`, `${P}/?sku=123&utm_source=feed`, true, true],
  [`${P}?sku=123`, P, false, true],
  [`${P}?sku=123`, `${P}?sku=124`, false, true],
  [`${P}?sku=123`, `${P}?sku=`, false, true],
  ...['sku', 'variant', 'id', 'product_id', 'pid', 'SKU', 'Variant'].map((name) => [P, `${P}?${name}=9`, false, true]),
  [`${P}?variant=1`, `${P}?variant=1&sku=9`, false, true],
  // Values and ordinary names are compared exactly.
  [`${P}?sku=abc`, `${P}?sku=ABC`, false, true],
  [`${P}?sku=1`, `${P}?SKU=1`, false, true],
  // A parameter given twice must come back the same.
  [`${P}?variant=1&variant=2`, `${P}?variant=1&variant=2`, true, true],
  [`${P}?variant=1&variant=2`, `${P}?variant=1`, false, true],
  [`${P}?variant=1&variant=2`, `${P}?variant=2&variant=1`, false, true],
  // Order between different parameters doesn't matter.
  [`${P}?sku=1&color=fde`, `${P}?color=fde&sku=1`, true, true],
  // An encoded value is the same value.
  [`${P}?color=flat%20dark`, `${P}?color=flat+dark`, true, true],

  // A parameter the site adds is fine; one of ours that goes missing or changes is not. One direction only.
  [P, `${P}?session=abc&locale=en-US`, true, false],
  [`${P}?session=abc&locale=en-US`, P, false, false],
  [`${P}?color=fde`, `${P}?color=black`, false, true],
  [`${P}?color=fde`, `${P}?color=fde&currency=USD`, true, false],

  // Another path: a category page, the home page, another product, a longer or shorter path.
  [P, 'https://shop.example/c/upper-receivers', false, true],
  [P, 'https://shop.example/', false, true],
  [P, 'https://shop.example/p/upper-receiver-gen2', false, true],
  [P, 'https://shop.example/p/upper-receiver/reviews', false, true],
  [P, 'https://shop.example/p', false, true],
  [P, 'https://shop.example/p//upper-receiver', false, true],
  [P, 'https://shop.example/discontinued?from=/p/upper-receiver', false, true],

  // Percent-encoding in the path.
  ['https://shop.example/p/upper receiver', 'https://shop.example/p/upper%20receiver', true, true],
  ['https://shop.example/p/upper-receiver', 'https://shop.example/p/upper%2Dreceiver', true, true],
  ['https://shop.example/p/upper%2dreceiver', 'https://shop.example/p/UPPER%2Dreceiver', true, true],
  ['https://shop.example/p/caf%C3%A9', 'https://shop.example/p/café', true, true],
  ['https://shop.example/p/caf%C3%A9', 'https://shop.example/p/CAF%C3%89', true, true],
  // An encoded slash is not a path separator.
  ['https://shop.example/p/a%2Fb', 'https://shop.example/p/a/b', false, true],
  ['https://shop.example/p/a%2Fb', 'https://shop.example/p/a%2fb', true, true],
  ['https://shop.example/p%2Fupper-receiver', P, false, true],
  // Decoded once only: %2541 is the text "%41", not "A".
  ['https://shop.example/p/%2541', 'https://shop.example/p/%41', false, true],
  ['https://shop.example/p/%2541', 'https://shop.example/p/A', false, true],
  // Escapes that aren't valid text stay as written, and still compare.
  ['https://shop.example/p/%E0%A4%A', 'https://shop.example/p/%e0%a4%a', true, true],
  ['https://shop.example/p/%FF', 'https://shop.example/p/%FF/', true, true],
  ['https://shop.example/p/%FF', 'https://shop.example/p/%FE', false, true],
  // A question mark or hash that is part of the path stays part of it.
  ['https://shop.example/p/a%3Fsku=1', 'https://shop.example/p/a?sku=1', false, true],
  // Dot segments are resolved before comparing.
  [P, 'https://shop.example/c/../p/./upper-receiver', true, true],

  // An empty path and "/".
  ['https://shop.example', 'https://shop.example/', true, true],
  ['https://shop.example', 'https://www.shop.example//', true, true],
  ['https://shop.example?sku=1', 'https://shop.example/?sku=1', true, true],

  // Input that can't be read as an address.
  [P, '', false, true],
  [P, 'not an address', false, true],
  [P, '/p/upper-receiver', false, true],
  [P, 'shop.example/p/upper-receiver', false, true],
  [P, 'https://', false, true],
  [P, undefined, false, true],
  [P, null, false, true],
  [P, 42, false, true],
  [P, new URL(P), false, true],
  ['', '', false, true],
  ['not an address', 'not an address', false, true],

  // Any scheme but http and https.
  [P, 'ftp://shop.example/p/upper-receiver', false, true],
  [P, 'file:///p/upper-receiver', false, true],
  [P, 'javascript:alert(1)', false, true],
  [P, 'data:text/html,x', false, true],
  ['ftp://shop.example/p/upper-receiver', 'ftp://shop.example/p/upper-receiver', false, true],
];

test('samePage follows every rule, in both directions where the rule has no direction', () => {
  for (const [from, to, same, bothWays] of CASES) {
    assert.equal(samePage(from, to), same, `${String(from)} -> ${String(to)}`);
    if (bothWays) assert.equal(samePage(to, from), same, `${String(to)} -> ${String(from)} (reversed)`);
  }
});

test('the table covers both answers for every kind of rule', () => {
  assert.ok(CASES.filter(([, , same]) => same).length >= 30);
  assert.ok(CASES.filter(([, , same]) => !same).length >= 40);
  assert.ok(CASES.some(([, , , bothWays]) => !bothWays));
});

test('the tracking and product-selecting lists are the agreed ones, and no name is in both', () => {
  assert.deepEqual([...TRACKING_PARAMS], ['gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'srsltid', 'gad_source', 'gbraid', 'wbraid']);
  assert.deepEqual([...TRACKING_PREFIXES], ['utm_']);
  assert.deepEqual([...PRODUCT_PARAMS], ['sku', 'variant', 'id', 'product_id', 'pid']);
  for (const name of PRODUCT_PARAMS) assert.ok(!TRACKING_PARAMS.includes(name) && !TRACKING_PREFIXES.some((p) => name.startsWith(p)), name);
  for (const list of [TRACKING_PARAMS, TRACKING_PREFIXES, PRODUCT_PARAMS]) assert.ok(Object.isFrozen(list));
});

test('same-page.mjs is pure: it imports nothing and never fetches or reads a file', () => {
  const text = readFileSync(new URL('same-page.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /^\s*import\b|\bfetch\(|readFileSync|writeFileSync|process\./m);
});
