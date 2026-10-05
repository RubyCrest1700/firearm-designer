import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPrice, extractWeight, implausiblePrice } from './extract-price.mjs';
import { parseRobots, isAllowed } from './robots.mjs';

test('reads a JSON-LD Product offer', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"M4E1 Lower",
    "offers":{"@type":"Offer","price":"109.99","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>`;
  assert.deepEqual(extractPrice(html), { price: 109.99, inStock: true });
});

test('reads Product inside @graph with AggregateOffer and out-of-stock', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["Product"],
    "offers":{"@type":"AggregateOffer","lowPrice":"64.99","availability":"http://schema.org/OutOfStock"}}]}</script>`;
  assert.deepEqual(extractPrice(html), { price: 64.99, inStock: false });
});

test('prefers the cheapest in-stock offer', () => {
  const html = `<script type="application/ld+json">{"@type":"Product","offers":[
    {"price":"50","availability":"OutOfStock"},{"price":"60","availability":"InStock"},{"price":"55","availability":"InStock"}]}</script>`;
  assert.deepEqual(extractPrice(html), { price: 55, inStock: true });
});

test('falls back to price meta tags', () => {
  const html = `<meta property="product:price:amount" content="$1,249.00">`;
  assert.deepEqual(extractPrice(html), { price: 1249, inStock: true });
});

test('falls back to a Twitter card price label', () => {
  const html = `<meta property="twitter:data1" content="$124.99 USD"><meta property="twitter:label1" content="PRICE"><meta property="twitter:data2" content="OutOfStock"><meta property="twitter:label2" content="AVAILABILITY">`;
  assert.deepEqual(extractPrice(html), { price: 124.99, inStock: false });
  const range = `<meta name="twitter:label1" content="Price" /><meta name="twitter:data1" content="&#036;432.18 - &#036;457.66" />`;
  assert.equal(extractPrice(range), null);
});

test('returns null when there is no price', () => {
  assert.equal(extractPrice('<html><body>Hello</body></html>'), null);
});

test('robots.txt: longest rule wins, wildcards work', () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /catalogsearch/\nDisallow: /*?price=\nAllow: /media/\n\nUser-agent: BadBot\nDisallow: /`, 'FirearmDesignerPriceBot/0.1');
  assert.equal(isAllowed(rules, '/aero-precision-m4e1-stripped-lower.html'), true);
  assert.equal(isAllowed(rules, '/catalogsearch/result/?q=lower'), false);
  assert.equal(isAllowed(rules, '/rifles.html?price=100-200'), false);
});

test('reads a listed weight from JSON-LD and spec tables', () => {
  assert.equal(extractWeight('<script type="application/ld+json">{"@type":"Product","weight":{"@type":"QuantitativeValue","value":"8.6","unitCode":"ONZ"}}</script>'), 8.6);
  assert.equal(extractWeight('<script type="application/ld+json">{"@type":"Product","additionalProperty":[{"name":"Weight","value":"1.25 lbs"}]}</script>'), 20);
  assert.equal(extractWeight('<table><tr><th>Weight</th><td>1 lb 10 oz</td></tr></table>'), 26);
  assert.equal(extractWeight('<dl><dt>Weight:</dt><dd><span>312 g</span></dd></dl>'), 11);
  assert.equal(extractWeight('<table><tr><th>Shipping Weight</th><td>3 lbs</td></tr></table>'), null);
});

test('flags prices that are probably misreads', () => {
  assert.equal(implausiblePrice(129.99, { last: 139.99 }), null);
  assert.equal(implausiblePrice(69.99, { last: 139.99 }), null); // a real half-price sale gets through
  assert.match(implausiblePrice(12.99, { last: 139.99 }), /too far/);
  assert.match(implausiblePrice(899, { last: 139.99 }), /too far/);
  assert.match(implausiblePrice(0, {}), /under \$1/);
  assert.match(implausiblePrice(15, { others: [140, 150, 160] }), /too far/); // new store, compared with the rest
  assert.equal(implausiblePrice(15, {}), null); // nothing to compare with
});
