/**
 * Store configuration — the operational settings of the shop.
 *
 * Fictional seed data for the Settings workspace. Four separate dimensions, as
 * the internationalisation rules ask: the store's own identity and
 * preferences, where it ships (zones and rates), how it taxes (VAT), and which
 * languages its content is published in. None of them is derived from another
 * — a German customer is not assumed to read German, and shipping to Switzerland
 * says nothing about the VAT regime there.
 *
 * Money is integer cents plus the store currency; VAT rates are integer basis
 * points (2000 = 20 %) so no rate is ever held as a float; weights are grams.
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

export type MeasurementSystem = "metric" | "imperial";
export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "D MMM YYYY";

export interface StoreDetails {
  storeName: string;
  legalName: string;
  businessEmail: string;
  supportEmail: string;
  phone: string;
  website: string;

  country: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  region: string;

  currency: string;
  timezone: string;
  dateFormat: DateFormat;
  measurement: MeasurementSystem;
  orderPrefix: string;
  orderSuffix: string;
  orderNextNumber: number;
  orderPadding: number;

  showEmail: boolean;
  showPhone: boolean;
  showAddress: boolean;
  hours: Record<Weekday, OpeningSlot>;
  description: string;
  supportMessage: string;
}

export const STORE_DETAILS: StoreDetails = {
  storeName: "Global Toothgems",
  legalName: "Global Toothgems SAS",
  businessEmail: "hello@globaltoothgems.com",
  supportEmail: "support@globaltoothgems.com",
  phone: "+33 1 84 60 27 15",
  website: "https://www.globaltoothgems.com",

  country: "FR",
  address1: "18 rue de Turenne",
  address2: "Studio 3, 2nd floor",
  postalCode: "75004",
  city: "Paris",
  region: "Île-de-France",

  currency: "EUR",
  timezone: "Europe/Paris",
  dateFormat: "DD/MM/YYYY",
  measurement: "metric",
  orderPrefix: "GT-",
  orderSuffix: "",
  orderNextNumber: 10482,
  orderPadding: 5,

  showEmail: true,
  showPhone: true,
  showAddress: false,
  hours: {
    mon: { open: true, from: "09:30", to: "18:00" },
    tue: { open: true, from: "09:30", to: "18:00" },
    wed: { open: true, from: "09:30", to: "18:00" },
    thu: { open: true, from: "09:30", to: "18:00" },
    fri: { open: true, from: "09:30", to: "17:00" },
    sat: { open: true, from: "10:00", to: "13:00" },
    sun: { open: false, from: "10:00", to: "13:00" },
  },
  description:
    "Premium tooth gems, professional supplies and certified training for tooth gem artists — designed in Paris, shipped worldwide.",
  supportMessage:
    "Questions about an order, a product or a training? Our team answers within one business day, in English, French or Italian.",
};

export const CURRENCIES = ["EUR", "GBP", "CHF", "USD"] as const;
export const TIMEZONES = [
  "Europe/Paris",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Zurich",
  "America/New_York",
  "America/Montreal",
] as const;
export const DATE_FORMATS: DateFormat[] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY"];

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

/** Countries offered in the zone picker, grouped the way an operator thinks. */
export const COUNTRY_GROUPS: { id: string; countries: string[] }[] = [
  { id: "eu", countries: EU_COUNTRIES },
  { id: "europe", countries: ["GB", "CH", "LI", "NO", "IS", "MC", "AD"] },
  { id: "americas", countries: ["US", "CA", "MX", "BR"] },
  { id: "world", countries: ["AU", "NZ", "JP", "SG", "AE", "IL", "ZA"] },
];

function rate(id: string, kind: RateKind, name: string, days: [number, number], priceCents: number, extra: Partial<ShippingRate> = {}): ShippingRate {
  return {
    id,
    kind,
    name,
    minDays: days[0],
    maxDays: days[1],
    priceCents,
    freeOverCents: null,
    minOrderCents: null,
    maxOrderCents: null,
    minWeightG: null,
    maxWeightG: null,
    active: true,
    ...extra,
  };
}

export const SHIPPING_ZONES: ShippingZone[] = [
  {
    id: "zone-fr",
    name: "France",
    countries: ["FR", "MC"],
    restOfWorld: false,
    active: true,
    rates: [
      rate("r-fr-std", "standard", "Standard Shipping", [2, 4], 490),
      rate("r-fr-exp", "express", "Express Shipping", [1, 2], 990),
      rate("r-fr-free", "free", "Free Shipping", [2, 4], 0, { minOrderCents: 7500 }),
      rate("r-fr-pick", "pickup", "Studio pickup — Paris 4e", [1, 1], 0),
    ],
  },
  {
    id: "zone-eu",
    name: "European Union",
    countries: EU_COUNTRIES.filter((c) => c !== "FR"),
    restOfWorld: false,
    active: true,
    rates: [
      rate("r-eu-std", "standard", "Standard Shipping", [3, 6], 890, { freeOverCents: 12000 }),
      rate("r-eu-exp", "express", "Express Shipping", [2, 3], 1690, { maxWeightG: 2000 }),
    ],
  },
  {
    id: "zone-uk",
    name: "United Kingdom",
    countries: ["GB"],
    restOfWorld: false,
    active: true,
    rates: [
      rate("r-uk-std", "standard", "Standard Shipping", [4, 7], 1290, { maxWeightG: 2000 }),
      rate("r-uk-exp", "express", "Express Shipping", [2, 3], 2490),
      rate("r-uk-free", "free", "Free Shipping", [4, 7], 0, { minOrderCents: 15000, active: false }),
    ],
  },
  {
    id: "zone-ch",
    name: "Switzerland",
    countries: ["CH", "LI"],
    restOfWorld: false,
    active: true,
    rates: [
      rate("r-ch-std", "standard", "Standard Shipping", [4, 8], 1490),
      rate("r-ch-exp", "express", "Express Shipping", [2, 4], 2990),
    ],
  },
  {
    id: "zone-na",
    name: "United States & Canada",
    countries: ["US", "CA"],
    restOfWorld: false,
    active: true,
    rates: [
      rate("r-na-std", "standard", "Standard Shipping", [6, 10], 1990, { maxWeightG: 2000 }),
      rate("r-na-heavy", "standard", "Heavy parcel", [6, 10], 3490, { minWeightG: 2000 }),
      rate("r-na-exp", "express", "Express Shipping", [3, 5], 3990),
    ],
  },
  {
    id: "zone-row",
    name: "Rest of World",
    countries: [],
    restOfWorld: true,
    active: false,
    rates: [rate("r-row-std", "standard", "International Tracked", [8, 15], 2490)],
  },
];

/* -------------------------------------------------------------------------- */
/* Taxes & VAT                                                                */
/* -------------------------------------------------------------------------- */

export type TaxBasis = "shipping" | "billing" | "store";
export type TaxRounding = "line" | "order";
export type PriceDisplay = "included" | "excluded";

export interface VatRate {
  id: string;
  country: string;
  /** Standard rate, basis points. */
  standardBp: number;
  active: boolean;
}

export type ReducedCategory = "books" | "training" | "hygiene" | "digital";
export const REDUCED_CATEGORIES: ReducedCategory[] = ["training", "books", "hygiene", "digital"];

export interface ReducedRate {
  id: string;
  country: string;
  category: ReducedCategory;
  rateBp: number;
  active: boolean;
}

export type ExemptGroup = "reverseCharge" | "export" | "trainingBodies";

export interface TaxSettings {
  enabled: boolean;
  defaultCountry: string;
  defaultRateBp: number;
  pricesIncludeVat: boolean;
  showOnProduct: boolean;
  showOnCheckout: boolean;
  display: PriceDisplay;
  basis: TaxBasis;
  rounding: TaxRounding;
  taxShipping: boolean;
  rates: VatRate[];
  reducedEnabled: boolean;
  reduced: ReducedRate[];
  collectVatNumber: boolean;
  validateVatNumber: boolean;
  exemptEnabled: boolean;
  exemptGroups: Record<ExemptGroup, boolean>;
}

/**
 * Illustrative standard rates. Real rates change and some depend on the
 * product category — they must be confirmed by the accountant before launch,
 * which the section says on screen.
 */
export const TAX_SETTINGS: TaxSettings = {
  enabled: true,
  defaultCountry: "FR",
  defaultRateBp: 2000,
  pricesIncludeVat: true,
  showOnProduct: true,
  showOnCheckout: true,
  display: "included",
  basis: "shipping",
  rounding: "line",
  taxShipping: true,
  rates: [
    { id: "vat-fr", country: "FR", standardBp: 2000, active: true },
    { id: "vat-de", country: "DE", standardBp: 1900, active: true },
    { id: "vat-it", country: "IT", standardBp: 2200, active: true },
    { id: "vat-es", country: "ES", standardBp: 2100, active: true },
    { id: "vat-be", country: "BE", standardBp: 2100, active: true },
    { id: "vat-nl", country: "NL", standardBp: 2100, active: true },
    { id: "vat-pt", country: "PT", standardBp: 2300, active: true },
    { id: "vat-ie", country: "IE", standardBp: 2300, active: false },
  ],
  reducedEnabled: true,
  reduced: [
    { id: "red-fr-books", country: "FR", category: "books", rateBp: 550, active: true },
    { id: "red-de-books", country: "DE", category: "books", rateBp: 700, active: true },
    { id: "red-it-digital", country: "IT", category: "digital", rateBp: 400, active: false },
  ],
  collectVatNumber: true,
  validateVatNumber: true,
  exemptEnabled: true,
  exemptGroups: { reverseCharge: true, export: true, trainingBodies: false },
};

/* -------------------------------------------------------------------------- */
/* Languages                                                                  */
/* -------------------------------------------------------------------------- */

export interface ContentLanguage {
  /** Short code used in URLs and translation records. */
  code: string;
  locale: string;
  name: string;
  native: string;
  flag: string;
  enabled: boolean;
}

export interface LanguageSettings {
  /** Enabled first, in storefront order; then the disabled ones. */
  languages: ContentLanguage[];
  defaultCode: string;
  /** Show the customer's browser language first when it is enabled. */
  detectBrowser: boolean;
  /** Fall back to the default language for untranslated fields. */
  fallbackToDefault: boolean;
}

/**
 * The language content is written in. Translations are measured against it;
 * changing the storefront's default language does not change it.
 */
export const SOURCE_LANGUAGE = "en";

export const LANGUAGE_SETTINGS: LanguageSettings = {
  languages: [
    { code: "en", locale: "en-GB", name: "English", native: "English", flag: "🇬🇧", enabled: true },
    { code: "fr", locale: "fr-FR", name: "French", native: "Français", flag: "🇫🇷", enabled: true },
    { code: "it", locale: "it-IT", name: "Italian", native: "Italiano", flag: "🇮🇹", enabled: true },
    { code: "de", locale: "de-DE", name: "German", native: "Deutsch", flag: "🇩🇪", enabled: true },
    { code: "es", locale: "es-ES", name: "Spanish", native: "Español", flag: "🇪🇸", enabled: true },
    { code: "pt", locale: "pt-PT", name: "Portuguese", native: "Português", flag: "🇵🇹", enabled: false },
    { code: "nl", locale: "nl-NL", name: "Dutch", native: "Nederlands", flag: "🇳🇱", enabled: false },
  ],
  defaultCode: "en",
  detectBrowser: true,
  fallbackToDefault: true,
};
