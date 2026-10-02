/**
 * Store configuration — the operational settings of the shop, as the Settings
 * workspace edits them.
 *
 * Four separate dimensions, as the internationalisation rules ask: the store's
 * own identity and what customers are told, where it ships (zones and rates),
 * how it taxes (VAT), and which languages its content is published in. None of
 * them is derived from another — a German customer is not assumed to read
 * German, and shipping to Switzerland says nothing about the VAT regime there.
 *
 * The values live in Supabase (`lib/adminSettings.tsx`); this file only holds
 * their shapes and the fixed lists the screens choose from. Money is integer
 * cents in the shop currency; VAT rates are integer basis points (2000 = 20 %)
 * so no rate is ever held as a float; weights are grams.
 */

/* -------------------------------------------------------------------------- */
/* Store details                                                              */
/* -------------------------------------------------------------------------- */

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface OpeningSlot {
  open: boolean;
  /** "HH:MM", 24-hour. */
  from: string;
  to: string;
}

/** The single currency the shop sells in. Not configurable: every price, rate and order is in it. */
export const STORE_CURRENCY = "EUR";

export interface StoreDetails {
  /** Trading name, shown to customers. */
  storeName: string;
  legalName: string;
  legalForm: string;
  shareCapital: string;
  /** Registration number and register (RCS, SIREN…). */
  registrationNumber: string;
  vatNumber: string;

  businessEmail: string;
  supportEmail: string;
  phone: string;

  country: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  region: string;

  publicationDirector: string;
  publicationDirectorRole: string;
  hostName: string;
  hostAddress: string;
  hostContact: string;

  showEmail: boolean;
  showPhone: boolean;
  showAddress: boolean;
  hours: Record<Weekday, OpeningSlot>;
  /** Contact page response-time line, French (default language) and English. */
  supportMessage: { fr: string; en: string };
}

/* -------------------------------------------------------------------------- */
/* Shipping                                                                   */
/* -------------------------------------------------------------------------- */

export type RateKind = "standard" | "express" | "free" | "pickup";
export const RATE_KINDS: RateKind[] = ["standard", "express", "free", "pickup"];

export interface ShippingRate {
  id: string;
  kind: RateKind;
  name: string;
  /** Business days. */
  minDays: number;
  maxDays: number;
  priceCents: number;
  /** The rate becomes free from this basket amount; null = never. */
  freeOverCents: number | null;
  /** Offered only within this basket range; null = unbounded. */
  minOrderCents: number | null;
  maxOrderCents: number | null;
  /** Offered only within this parcel weight range; null = unbounded. */
  minWeightG: number | null;
  maxWeightG: number | null;
  active: boolean;
}

export interface ShippingZone {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 codes. Empty on the catch-all zone. */
  countries: string[];
  /** Catches every country no other zone lists. At most one per store. */
  restOfWorld: boolean;
  active: boolean;
  rates: ShippingRate[];
}

export const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

/** Countries offered in the pickers, grouped the way an operator thinks. */
export const COUNTRY_GROUPS: { id: string; countries: string[] }[] = [
  { id: "eu", countries: EU_COUNTRIES },
  { id: "europe", countries: ["GB", "CH", "LI", "NO", "IS", "MC", "AD"] },
  { id: "americas", countries: ["US", "CA", "MX", "BR"] },
  { id: "world", countries: ["AU", "NZ", "JP", "SG", "AE", "IL", "ZA"] },
];

/* -------------------------------------------------------------------------- */
/* Taxes & VAT                                                                */
/* -------------------------------------------------------------------------- */

export interface VatRate {
  /** The country is the key: one standard rate per country. */
  country: string;
  /** Standard rate, basis points. */
  standardBp: number;
  active: boolean;
}

/** Product tax categories that can carry a reduced rate (`products.tax_category`). */
export type ReducedCategory = "books" | "training" | "hygiene" | "digital";
export const REDUCED_CATEGORIES: ReducedCategory[] = ["training", "books", "hygiene", "digital"];

export interface ReducedRate {
  country: string;
  category: ReducedCategory;
  rateBp: number;
  active: boolean;
}

export interface TaxSettings {
  rates: VatRate[];
  reduced: ReducedRate[];
}

/* -------------------------------------------------------------------------- */
/* Languages                                                                  */
/* -------------------------------------------------------------------------- */

export interface ContentLanguage {
  /** Short code used in URLs and translation records. */
  code: string;
  /** BCP 47 formatting locale, e.g. "fr-FR". */
  locale: string;
  /** Name in the language itself. */
  native: string;
  /** The language content is written in (base columns). Never changes here. */
  isDefault: boolean;
  enabled: boolean;
}

export interface LanguageSettings {
  /** In the database's order. */
  languages: ContentLanguage[];
}

/**
 * The storefront is published in these languages (`lib/localeRoutes`): they
 * cannot be switched off, the database refuses it.
 */
export const STOREFRONT_LANGUAGES = ["fr", "en"];
