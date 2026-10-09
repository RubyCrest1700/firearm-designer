export interface Retailer {
  id: string;
  name: string;
  search: string;
}

/** Links go to each retailer's search results for the part name. */
export const RETAILERS: Record<string, Retailer> = {
  BRN: { id: 'BRN', name: 'Brownells', search: 'https://www.brownells.com/search/?k=' },
  PSA: { id: 'PSA', name: 'Palmetto State Armory', search: 'https://palmettostatearmory.com/catalogsearch/result/?q=' },
  PA: { id: 'PA', name: 'Primary Arms', search: 'https://www.primaryarms.com/search?keywords=' },
  MID: { id: 'MID', name: 'MidwayUSA', search: 'https://www.midwayusa.com/s?searchTerm=' },
  OP: { id: 'OP', name: 'OpticsPlanet', search: 'https://www.opticsplanet.com/s/' },
  GS: { id: 'GS', name: 'GlockStore', search: 'https://www.glockstore.com/search?q=' },
  SIG: { id: 'SIG', name: 'Sig Sauer', search: 'https://www.sigsauer.com/catalogsearch/result/?q=' },
  AERO: { id: 'AERO', name: 'Aero Precision', search: 'https://aeroprecisionusa.com/search?q=' },
  MAGPUL: { id: 'MAGPUL', name: 'Magpul', search: 'https://magpul.com/catalogsearch/result/?q=' },
  CF: { id: 'CF', name: 'Classic Firearms', search: 'https://www.classicfirearms.com/catalogsearch/result/?q=' },
  YM: { id: 'YM', name: 'Young Manufacturing', search: 'https://www.youngmanufacturing.net/search.aspx?searchterm=' },
  // Stores the nightly job can read (robots.txt allows it and pages carry a price), added 2026-10-05.
  ARD: { id: 'ARD', name: 'AR15Discounts', search: 'https://ar15discounts.com/search?q=' },
  AT3: { id: 'AT3', name: 'AT3 Tactical', search: 'https://www.at3tactical.com/search?q=' },
  BRD: { id: 'BRD', name: 'Black Rifle Depot', search: 'https://blackrifledepot.com/search.php?search_query=' },
  FAX: { id: 'FAX', name: 'Faxon Firearms', search: 'https://faxonfirearms.com/search.php?search_query=' },
  KYG: { id: 'KYG', name: 'KYGunCo', search: 'https://www.kygunco.com/search?q=' },
  LW: { id: 'LW', name: 'Lone Wolf Arms', search: 'https://lonewolfdist.com/?s=' },
  RA: { id: 'RA', name: 'Rainier Arms', search: 'https://www.rainierarms.com/search.php?search_query=' },
  RTB: { id: 'RTB', name: 'Right To Bear', search: 'https://www.righttobear.com/search.php?search_query=' },
  VED: { id: 'VED', name: 'Vedder Holsters', search: 'https://www.vedderholsters.com/search.php?search_query=' },
  WING: { id: 'WING', name: 'Wing Tactical', search: 'https://www.wingtactical.com/search.php?search_query=' },
  NF: { id: 'NF', name: 'Night Fision', search: 'https://www.nightfision.com/?post_type=product&s=' },
  SI: { id: 'SI', name: 'Strike Industries', search: 'https://www.strikeindustries.com/catalogsearch/result/?q=' },
  // More readable stores, added 2026-10-09 for the catalog price pass.
  AA: { id: 'AA', name: 'Aerospace Arms', search: 'https://aerospacearms.com/search.php?search_query=' },
  BUDS: { id: 'BUDS', name: "Bud's Gun Shop", search: 'https://www.budsgunshop.com/search.php?q=' },
  CMC: { id: 'CMC', name: 'CMC Triggers', search: 'https://cmctriggers.com/?post_type=product&s=' },
  CTD: { id: 'CTD', name: 'Cheaper Than Dirt', search: 'https://www.cheaperthandirt.com/search?q=' },
  EB: { id: 'EB', name: 'Ed Brown', search: 'https://www.edbrown.com/?post_type=product&s=' },
  GRITR: { id: 'GRITR', name: 'Gritr Sports', search: 'https://gritrsports.com/search.php?search_query=' },
  KAK: { id: 'KAK', name: 'KAK Industry', search: 'https://kakindustry.com/search.php?search_query=' },
  MI: { id: 'MI', name: 'Midwest Industries', search: 'https://midwestindustriesinc.com/search.php?search_query=' },
  SPW: { id: 'SPW', name: "Sportsman's Warehouse", search: 'https://www.sportsmans.com/search?text=' },
  WC: { id: 'WC', name: 'Wilson Combat', search: 'https://wilsoncombat.com/catalogsearch/result/?q=' },
  // Added in the second catalog pass (factory and odd parts).
  AG: { id: 'AG', name: 'AmeriGlo', search: 'https://www.ameriglo.com/products?search=' },
  BCM: { id: 'BCM', name: 'Bravo Company', search: 'https://bravocompanyusa.com/search.php?search_query=' },
  BPC: { id: 'BPC', name: 'Black Phoenix Customs', search: 'https://blackphoenixcustoms.com/search.php?search_query=' },
  CP: { id: 'CP', name: 'CopsPlus', search: 'https://copsplus.com/search.php?search_query=' },
  DK: { id: 'DK', name: 'DK Firearms', search: 'https://dkfirearms.com/?post_type=product&s=' },
  EO: { id: 'EO', name: 'EuroOptic', search: 'https://www.eurooptic.com/search?q=' },
  GGP: { id: 'GGP', name: 'Grey Ghost Precision', search: 'https://greyghostprecision.com/search.php?search_query=' },
  IMP: { id: 'IMP', name: 'Impact Guns', search: 'https://www.impactguns.com/search.php?search_query=' },
  NFA: { id: 'NFA', name: 'New Frontier Armory', search: 'https://www.newfrontierarmory.com/search.php?search_query=' },
  OW: { id: 'OW', name: 'Overwatch Precision', search: 'https://overwatchprecision.com/?post_type=product&s=' },
  RYG: { id: 'RYG', name: 'Rock Your Glock', search: 'https://rockyourglock.com/search.php?search_query=' },
  SA: { id: 'SA', name: 'Springfield Armory', search: 'https://store.springfield-armory.com/search.php?search_query=' },
  SAV: { id: 'SAV', name: 'Savior Equipment', search: 'https://www.saviorequipment.com/search?q=' },
  SW: { id: 'SW', name: 'Smith & Wesson', search: 'https://shop.smith-wesson.com/search.php?search_query=' },
  TGS: { id: 'TGS', name: 'Top Gun Supply', search: 'https://www.topgunsupply.com/search.php?mode=search&substring=' },
  TIM: { id: 'TIM', name: 'Timney Triggers', search: 'https://timneytriggers.com/?post_type=product&s=' },
  ABIDE: { id: 'ABIDE', name: 'Abide Armory', search: 'https://www.abidearmory.com/search.php?search_query=' },
  FORGE: { id: 'FORGE', name: 'Forged Armory', search: 'https://forged-armory.odoo.com/shop?search=' },
  RSUP: { id: 'RSUP', name: 'Rifle Supply', search: 'https://riflesupply.com/search.php?search_query=' },
};

export function offerUrl(retailerId: string, query: string): string {
  const r = RETAILERS[retailerId];
  return r.search + encodeURIComponent(query);
}

/**
 * Every link to a store carries our name (utm_source=dropinbuilds), so the store sees Drop-In Builds in its
 * own visitor stats. That's the proof merchants look for before inviting a site into their affiliate program.
 * Links we can't parse are left as they are.
 */
export function tagged(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', 'dropinbuilds');
    u.searchParams.set('utm_medium', 'referral');
    return u.toString();
  } catch {
    return url;
  }
}

/** Where a price links to: the product page we read the price from, or the store's search for the part. */
export const buyUrl = (o: { retailer: string; url?: string }, partName: string) => tagged(o.url ?? offerUrl(o.retailer, partName));
