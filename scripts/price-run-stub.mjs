// Test stand-in, loaded with --import ahead of update-prices.mjs by scripts/price-run.test.mjs. Nothing else uses it.
// Fake store pages replace fetch, real sockets and DNS are refused, and a virtual clock (FAKE_NOW) makes the 5-second
// host pace take no real time. Every fetch, socket attempt and file write goes to STUB_LOG for the test to read.
// STUB_PAGES: a JSON file of { url: { price, inStock } }. STUB_UNWRITABLE: a path whose write throws, on any OS or user.

import fs, { readFileSync } from 'node:fs';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

const write = fs.writeFileSync;
const note = (line) => write(process.env.STUB_LOG, `${line}\n`, { flag: 'a' });

fs.writeFileSync = (file, data, options) => {
  if (options?.flag === 'a') return write(file, data, options); // appendFileSync comes through here too
  note(`WRITE ${file}`);
  if (String(file) === process.env.STUB_UNWRITABLE) throw new Error('stub refused');
  return write(file, data, options);
};

const refuse = (what) => () => {
  note(`SOCKET ${what}`);
  throw new Error(`network blocked: ${what}`);
};
net.Socket.prototype.connect = refuse('net.connect');
tls.connect = refuse('tls.connect');
dns.lookup = refuse('dns.lookup');
dns.promises.lookup = refuse('dns.promises.lookup');
syncBuiltinESMExports();

const RealDate = Date;
let clock = new RealDate(process.env.FAKE_NOW).getTime();
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(clock);
  }
  static now() {
    return clock;
  }
};
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms = 0, ...rest) => {
  clock += ms;
  return realTimeout(fn, 0, ...rest);
};

const pages = JSON.parse(readFileSync(process.env.STUB_PAGES, 'utf8'));
const html = ({ price, inStock }) => `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'x',
  offers: { '@type': 'Offer', price: price.toFixed(2), priceCurrency: 'USD', availability: `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}` },
})}</script></head><body></body></html>`;

globalThis.fetch = async (url) => {
  const href = String(url);
  note(`FETCH ${href}`);
  if (href.endsWith('/robots.txt')) return new Response('', { status: 404 });
  if (!pages[href]) throw new Error(`stub has no page for ${href}`);
  return new Response(html(pages[href]), { status: 200, headers: { 'content-type': 'text/html' } });
};
