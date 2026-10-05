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
};

export function offerUrl(retailerId: string, query: string): string {
  const r = RETAILERS[retailerId];
  return r.search + encodeURIComponent(query);
}
