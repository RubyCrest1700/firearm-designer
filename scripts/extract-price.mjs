// Pulls a product's price and stock status out of a retailer's product page HTML.
// Most retailers publish schema.org Product data (JSON-LD) for search engines; we read
// that first and fall back to common price meta tags.

/** @returns {{ price: number, inStock: boolean } | null} */
export function extractPrice(html) {
  return fromJsonLd(html) ?? fromMeta(html);
}

function fromJsonLd(html) {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      const type = [].concat(node['@type'] ?? []);
      if (!type.includes('Product')) continue;
      const result = readOffers(node.offers);
      if (result) return result;
    }
  }
  return null;
}

function* walk(node) {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
  } else if (node && typeof node === 'object') {
    yield node;
    if (node['@graph']) yield* walk(node['@graph']);
  }
}

function readOffers(offers) {
  if (!offers) return null;
  const list = [].concat(offers).flatMap((o) => (o?.['@type'] === 'AggregateOffer' && o.offers ? [].concat(o.offers) : [o]));
  let best = null;
  for (const o of list) {
    const price = toNumber(o?.price ?? o?.lowPrice ?? o?.priceSpecification?.price);
    if (price == null) continue;
    const inStock = /InStock|LimitedAvailability|OnlineOnly/i.test(String(o.availability ?? 'InStock'));
    if (!best || (inStock && !best.inStock) || (inStock === best.inStock && price < best.price)) best = { price, inStock };
  }
  return best;
}

function fromMeta(html) {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
    /itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const price = m && toNumber(m[1]);
    if (price != null) {
      const oos = /itemprop=["']availability["'][^>]+(?:OutOfStock|SoldOut)/i.test(html) || /product:availability["'][^>]+content=["']out of stock/i.test(html);
      return { price, inStock: !oos };
    }
  }
  return null;
}

function toNumber(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
