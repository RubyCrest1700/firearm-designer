export type Severity = 'error' | 'warn' | 'info';
export type Tier = 'budget' | 'value' | 'premium';

/** One retailer listing: [retailer id, price in USD, in stock (default true)] */
export type OfferTuple = [string, number, boolean?];

export interface Offer {
  retailer: string;
  price: number;
  inStock: boolean;
  /** Direct product page, when known */
  url?: string;
  /** ISO time the price was read by the nightly job; absent for sample prices */
  checkedAt?: string;
}

export interface Part {
  id: string;
  slot: string;
  brand: string;
  name: string;
  /** Short spec chips shown under the name */
  specs: string[];
  /** Machine-readable attributes the compatibility rules read */
  attrs: Record<string, string | number | boolean | string[]>;
  offers: Offer[];
  /** Editorial recommendation shown as a badge */
  pick?: { tier: Tier; note: string };
  /** Serialized part: legally the firearm, ships to an FFL */
  serialized?: boolean;
}

export interface Slot {
  id: string;
  name: string;
  group: string;
  required: boolean;
  hint: string;
}

export interface Issue {
  severity: Severity;
  slots: string[];
  message: string;
}

export type Build = Record<string, Part | undefined>;

/** Where an accessory sits on the handguard: which side, and inches from the receiver to its rear end. */
export type Side = 'top' | 'right' | 'left' | 'bottom';
export interface Mount { side: Side; at: number }
export type Placement = Record<string, Mount>;

export interface Platform {
  id: string;
  name: string;
  family: string;
  /** Maker group in the platform menu, e.g. 'AR platform', 'Glock', 'Sig Sauer'. */
  maker: string;
  blurb: string;
  slots: Slot[];
  parts: Part[];
  rules: (b: Build, place?: Placement) => Issue[];
  presets: Record<Tier, string[]>;
}
