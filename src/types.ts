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
  /** Maker's part number or SKU, when we have it. The "Parts I Own" search matches it. */
  mpn?: string;
  /** Serialized part: legally the firearm, ships to an FFL */
  serialized?: boolean;
  /** A complete factory pistol in a parts slot (a Glock V): the other slots it already fills with its own factory parts. */
  fills?: string[];
  /** Weight as sold, from data/weights.json. `published` is false when it's our typical-figure estimate. */
  weight?: { oz: number; published: boolean; src?: string };
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
  /** Maker group in the platform menu, e.g. 'AR Platform', 'Glock', 'Sig Sauer'. */
  maker: string;
  blurb: string;
  slots: Slot[];
  parts: Part[];
  rules: (b: Build, place?: Placement) => Issue[];
  presets: Record<Tier, string[]>;
  /**
   * Named starting points inside one builder, such as the Glock 17, 19 and 26 in the double-stack 9mm Glock builder. Each
   * gets its own starter builds and search page, and its id still opens old links and saved builds.
   */
  models?: PlatformModel[];
  /** For a builder with models: which model the chosen parts make (its id), or how they mix ("G17 slide on a G19 frame"). */
  modelOf?: (b: Build) => { id?: string; name: string } | undefined;
}

export interface PlatformModel {
  /** The id the model had as its own platform; old links and saved builds use it. */
  id: string;
  name: string;
  /** Short name for the model picker, such as "G19". */
  short: string;
  blurb: string;
  presets: Record<Tier, string[]>;
  /** The parts its own page lists (the builder still offers every part). */
  parts?: (p: Part) => boolean;
}
