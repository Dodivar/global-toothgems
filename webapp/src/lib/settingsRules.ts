import {
  EU_COUNTRIES,
  type ShippingRate,
  type ShippingZone,
  type StoreDetails,
  type TaxSettings,
  type VatRate,
} from "../data/adminSettings";

/**
 * Pure rules behind the Settings workspace: validation (mirroring the
 * database's checks, so the screen catches mistakes before a save is refused)
 * and the plain-language answers to "what does a customer in X get?" for
 * shipping and VAT, computed exactly as the database computes them.
 *
 * Validation returns i18n keys (under `settings.errors`), never sentences.
 */

/* -------------------------------------------------------------------------- */
/* Countries                                                                  */
/* -------------------------------------------------------------------------- */

const displayNames = new Map<string, Intl.DisplayNames>();

/** Country name in the UI language — from the platform, not a hand-kept list. */
export function countryName(code: string, lang: string): string {
  const key = lang.slice(0, 2);
  let dn = displayNames.get(key);
  if (!dn) {
    dn = new Intl.DisplayNames([key], { type: "region" });
    displayNames.set(key, dn);
  }
  return dn.of(code) ?? code;
}

/** Regional-indicator flag. Decorative only: always shown beside the name or code. */
export function flagOf(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

/* -------------------------------------------------------------------------- */
/* Numbers                                                                    */
/* -------------------------------------------------------------------------- */

/** "20", "5,5" or "5.5" → basis points. Null when not a percentage in 0–100. */
export function parsePercent(value: string): number | null {
  const cleaned = value.replace(/\s|%/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

export function bpToInput(bp: number): string {
  return String(bp / 100);
}

export function formatPercent(bp: number, lang: string): string {
  return new Intl.NumberFormat(lang.startsWith("fr") ? "fr-FR" : "en-GB", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(bp / 10000);
}

/** "1,5" or "1.5" kg → grams. */
export function parseKg(value: string): number | null {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

export function gramsToInput(g: number | null): string {
  return g == null ? "" : String(g / 1000);
}

/**
 * Splits a VAT-inclusive price into net and tax, in cents, rounding the tax
 * once. Integer arithmetic throughout: the preview must never show a cent the
 * real calculation would not.
 */
export function splitGross(grossCents: number, rateBp: number): { net: number; tax: number } {
  const net = Math.round((grossCents * 10000) / (10000 + rateBp));
  return { net, tax: grossCents - net };
}


/* -------------------------------------------------------------------------- */
/* Store details                                                              */
/* -------------------------------------------------------------------------- */

export type StoreErrors = Partial<Record<keyof StoreDetails | "supportMessageEn", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ().-]{6,20}$/;
const VAT_NUMBER = /^[A-Z]{2}[0-9A-Z+*.]{2,13}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same limits as the `store_settings` columns. */
const MAX_LENGTH: Partial<Record<keyof StoreDetails, number>> = {
  storeName: 120,
  legalName: 200,
  legalForm: 120,
  shareCapital: 60,
  registrationNumber: 120,
  address1: 200,
  address2: 200,
  postalCode: 20,
  city: 120,
  region: 120,
  publicationDirector: 120,
  publicationDirectorRole: 120,
  hostName: 200,
  hostAddress: 300,
  hostContact: 200,
};

export const SUPPORT_MESSAGE_MAX = 280;

export function validateStore(d: StoreDetails): StoreErrors {
  const e: StoreErrors = {};
  for (const [key, max] of Object.entries(MAX_LENGTH) as [keyof StoreDetails, number][]) {
    const value = d[key];
    if (typeof value === "string" && value.trim().length > max) e[key] = "tooLong";
  }
  if (!d.storeName.trim()) e.storeName = "required";
  if (!d.legalName.trim()) e.legalName = "required";
  if (!d.supportEmail.trim()) e.supportEmail = "required";
  else if (!EMAIL.test(d.supportEmail.trim())) e.supportEmail = "email";
  if (d.businessEmail.trim() && !EMAIL.test(d.businessEmail.trim())) e.businessEmail = "email";
  if (d.phone.trim() && !PHONE.test(d.phone.trim())) e.phone = "phone";
  if (d.vatNumber.trim() && !VAT_NUMBER.test(d.vatNumber.replace(/\s/g, "").toUpperCase())) e.vatNumber = "vatNumber";
  if (d.country === "FR" && d.postalCode.trim() && !/^\d{5}$/.test(d.postalCode.trim())) e.postalCode = "postalFr";
  if (d.showAddress && !d.address1.trim()) e.address1 = "requiredShown";
  if (d.showPhone && !d.phone.trim()) e.phone = "requiredShown";
  if (d.supportMessage.fr.trim().length > SUPPORT_MESSAGE_MAX) e.supportMessage = "tooLong";
  if (d.supportMessage.en.trim().length > SUPPORT_MESSAGE_MAX) e.supportMessageEn = "tooLong";
  const badHours = Object.values(d.hours).some((h) => h.open && (!TIME.test(h.from) || !TIME.test(h.to) || h.from >= h.to));
  if (badHours) e.hours = "hours";
  return e;
}

/* -------------------------------------------------------------------------- */
/* Shipping                                                                   */
/* -------------------------------------------------------------------------- */

export type RateErrors = Partial<Record<"name" | "days" | "price" | "freeOver" | "orderRange" | "weightRange", string>>;

export function validateRate(r: ShippingRate): RateErrors {
  const e: RateErrors = {};
  if (!r.name.trim()) e.name = "required";
  if (!Number.isInteger(r.minDays) || !Number.isInteger(r.maxDays) || r.minDays < 0 || r.maxDays < r.minDays) e.days = "days";
  if (r.kind !== "free" && r.kind !== "pickup" && r.priceCents <= 0) e.price = "pricePositive";
  if (r.kind === "free" && r.minOrderCents == null) e.freeOver = "freeNeedsThreshold";
  if (r.freeOverCents != null && r.freeOverCents <= 0) e.freeOver = "positive";
  if (r.minOrderCents != null && r.maxOrderCents != null && r.maxOrderCents <= r.minOrderCents) e.orderRange = "range";
  if (r.minWeightG != null && r.maxWeightG != null && r.maxWeightG <= r.minWeightG) e.weightRange = "range";
  return e;
}

export type ZoneErrors = Partial<Record<"name" | "countries", string>>;

export function validateZone(z: ShippingZone, all: ShippingZone[]): ZoneErrors {
  const e: ZoneErrors = {};
  if (!z.name.trim()) e.name = "required";
  else if (all.some((o) => o.id !== z.id && o.name.trim().toLowerCase() === z.name.trim().toLowerCase())) e.name = "zoneNameTaken";
  if (!z.restOfWorld && z.countries.length === 0) e.countries = "zoneNoCountry";
  return e;
}

/** The zone that owns a country, other than `exceptZoneId`. */
export function zoneOwning(code: string, zones: ShippingZone[], exceptZoneId?: string): ShippingZone | undefined {
  return zones.find((z) => z.id !== exceptZoneId && z.countries.includes(code));
}

/**
 * Where an order to `code` is shipped from the customer's point of view: the
 * zone listing the country, else the catch-all. An inactive zone ships nothing
 * — it does not fall through to the catch-all, which would quietly charge
 * worldwide prices for a zone the operator only paused.
 */
export function resolveZone(code: string, zones: ShippingZone[]): { zone: ShippingZone | undefined; reason: "listed" | "catchAll" | "none" } {
  const listed = zones.find((z) => z.countries.includes(code));
  if (listed) return { zone: listed, reason: "listed" };
  const row = zones.find((z) => z.restOfWorld);
  if (row) return { zone: row, reason: "catchAll" };
  return { zone: undefined, reason: "none" };
}

export interface ShippingIssue {
  zoneId: string;
  key: "noActiveRate" | "noRates";
}

export function shippingIssues(zones: ShippingZone[]): ShippingIssue[] {
  const out: ShippingIssue[] = [];
  for (const z of zones) {
    if (!z.active) continue;
    if (z.rates.length === 0) out.push({ zoneId: z.id, key: "noRates" });
    else if (!z.rates.some((r) => r.active)) out.push({ zoneId: z.id, key: "noActiveRate" });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Taxes                                                                      */
/* -------------------------------------------------------------------------- */

export function validateVatRate(r: VatRate, all: VatRate[], isNew: boolean): Partial<Record<"country" | "rate", string>> {
  const e: Partial<Record<"country" | "rate", string>> = {};
  if (!r.country) e.country = "required";
  else if (isNew && all.some((o) => o.country === r.country)) e.country = "vatCountryTaken";
  if (r.standardBp < 0 || r.standardBp > 10000) e.rate = "percent";
  return e;
}

/**
 * The standard rate an order to `code` pays, as `vat_rate_bp()` decides it:
 * the country's active rate, else 0 % (no VAT charged).
 */
export function vatRateFor(code: string, t: TaxSettings): { bp: number; source: "country" | "none" } {
  const row = t.rates.find((r) => r.country === code && r.active);
  return row ? { bp: row.standardBp, source: "country" } : { bp: 0, source: "none" };
}

/** Countries inside the EU VAT area (and Monaco, French VAT territory). Elsewhere 0 % is an export. */
export function inVatArea(code: string): boolean {
  return code === "MC" || EU_COUNTRIES.includes(code);
}

/**
 * Countries an active zone ships to, inside the EU VAT area, with no active
 * standard rate: orders there would be charged 0 %. Sorted.
 */
export function servedWithoutVat(zones: ShippingZone[], t: TaxSettings): string[] {
  const served = zones.filter((z) => z.active && z.rates.some((r) => r.active)).flatMap((z) => z.countries);
  return Array.from(new Set(served))
    .filter((c) => inVatArea(c) && vatRateFor(c, t).source === "none")
    .sort();
}
