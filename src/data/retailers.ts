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
};

export function offerUrl(retailerId: string, query: string): string {
  const r = RETAILERS[retailerId];
  return r.search + encodeURIComponent(query);
}
