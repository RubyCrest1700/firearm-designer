// Pulls a product's price and stock status out of a retailer's product page HTML.
// Most retailers publish schema.org Product data (JSON-LD) for search engines; we read
// that first and fall back to common price meta tags.

/** @returns {{ price: number, inStock: boolean } | null} */
export function extractPrice(html) {
  return fromJsonLd(html) ?? fromMeta(html) ?? fromTwitterCard(html);
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

/** Some stores (Primary Arms) list the price only as a Twitter card pair: label1 "PRICE", data1 "$124.99 USD". */
function fromTwitterCard(html) {
  const meta = {};
  for (const [, k, v] of html.matchAll(/<meta[^>]+(?:name|property)=["']twitter:(label\d|data\d)["'][^>]+content=["']([^"']*)["']/gi)) meta[k.toLowerCase()] = v;
  for (const n of ['1', '2', '3', '4']) {
    if (!/^price$/i.test(meta[`label${n}`] ?? '')) continue;
    const value = meta[`data${n}`] ?? '';
    if (/[-–]/.test(value)) return null; // a price range covers several variants
    const price = toNumber(value);
    if (price == null) return null;
    const avail = Object.keys(meta).find((k) => k.startsWith('label') && /^availability$/i.test(meta[k]));
    const oos = avail && /out ?of ?stock|soldout|backorder/i.test(meta[`data${avail.slice(5)}`] ?? '');
    return { price, inStock: !oos };
  }
  return null;
}

function toNumber(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Pulls a product's listed weight, in ounces, from schema.org Product data (`weight` or an `additionalProperty`
 * named Weight) or a spec-table row labeled exactly "Weight". Shipping weights are ignored.
 * @returns {number | null}
 */
export function extractWeight(html) {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    for (const node of walk(data)) {
      if (![].concat(node['@type'] ?? []).includes('Product')) continue;
      const w = node.weight ?? [].concat(node.additionalProperty ?? []).find((p) => /^(product |item )?weight$/i.test(String(p?.name ?? '')));
      const oz = w && (typeof w === 'object' ? toOunces(w.value, w.unitCode ?? w.unitText) : toOunces(w));
      if (oz) return oz;
    }
  }
  const row = html.match(/>\s*(?:Product |Item )?Weight:?\s*<\/(?:th|td|dt|span|strong|b|div)>\s*(?:<[^>]+>\s*)*([\d.,]+\s*(?:oz|ounces?|lbs?|pounds?|g|grams?|kg)\b[^<]{0,30})/i);
  return row ? toOunces(row[1]) : null;
}

/** "1 lb 4 oz", "7.5 lbs", "312 g", value + unit code (LBR, ONZ, GRM, KGM). */
function toOunces(value, unit) {
  const text = `${value ?? ''} ${unit ?? ''}`.toLowerCase().replace(/,/g, '');
  const lbOz = text.match(/([\d.]+)\s*(?:lbs?|pounds?)\s*([\d.]+)\s*(?:oz|ounces?)/);
  let oz = null;
  if (lbOz) oz = Number(lbOz[1]) * 16 + Number(lbOz[2]);
  else {
    const m = text.match(/([\d.]+)\s*(oz|ounces?|onz|lbs?|pounds?|lbr|kgm|kg|kilograms?|grm|g|grams?)?\b/);
    if (!m) return null;
    const n = Number(m[1]);
    const u = m[2] ?? '';
    oz = /^(lb|pound|lbr)/.test(u) ? n * 16 : /^(kg|kgm|kilogram)/.test(u) ? n * 35.274 : /^(g|grm|gram)/.test(u) ? n / 28.3495 : /^(oz|ounce|onz)/.test(u) ? n : null;
  }
  return oz && oz > 0 && oz < 1000 ? Math.round(oz * 10) / 10 : null;
}
