import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPrice } from './extract-price.mjs';
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

test('returns null when there is no price', () => {
  assert.equal(extractPrice('<html><body>Hello</body></html>'), null);
});

test('robots.txt: longest rule wins, wildcards work', () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /catalogsearch/\nDisallow: /*?price=\nAllow: /media/\n\nUser-agent: BadBot\nDisallow: /`, 'FirearmDesignerPriceBot/0.1');
  assert.equal(isAllowed(rules, '/aero-precision-m4e1-stripped-lower.html'), true);
  assert.equal(isAllowed(rules, '/catalogsearch/result/?q=lower'), false);
  assert.equal(isAllowed(rules, '/rifles.html?price=100-200'), false);
});
