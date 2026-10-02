import type {
  ContentLanguage,
  LanguageSettings,
  RateKind,
  ReducedCategory,
  ReducedRate,
  ShippingRate,
  ShippingZone,
  TaxSettings,
  VatRate,
} from "../data/adminSettings";
import { RATE_KINDS, REDUCED_CATEGORIES } from "../data/adminSettings";
import { toMinorUnits } from "./catalog/money";

/**
 * Row ↔ screen shapes for the Settings workspace (shipping, VAT, languages;
 * store details live in `storeDetails.ts`). Pure and unit-tested.
 *
 * Reads are normalised — zones and rates in their saved order, countries
 * alphabetical, VAT rates by country then category — so that reading back what
 * was just saved gives exactly the same value, and the screen's "unsaved
 * changes" comparison stays quiet after a save. Payloads are what the
 * `admin_save_*()` functions take; amounts travel as decimal strings built
 * from integer cents, never from a float.
 */

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/** 1290 → "12.90", by integer arithmetic. */
export function centsToAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid amount in cents: ${cents}`);
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const cents = (value: number | string | null): number | null => (value == null ? null : toMinorUnits(value));
const amount = (value: number | null): string | null => (value == null ? null : centsToAmount(value));

/* -------------------------------------------------------------------------- */
/* Shipping                                                                   */
/* -------------------------------------------------------------------------- */

export const SHIPPING_ZONES_SELECT =
  "id, name, is_rest_of_world, is_active, position, shipping_zone_countries(country_code), shipping_rates(id, kind, name, min_days, max_days, price, free_over_amount, min_order_amount, max_order_amount, min_weight_grams, max_weight_grams, is_active, position)";

export interface ShippingRateRow {
  id: string;
  kind: string;
  name: string;
  min_days: number;
  max_days: number;
  price: number | string;
  free_over_amount: number | string | null;
  min_order_amount: number | string | null;
  max_order_amount: number | string | null;
  min_weight_grams: number | null;
  max_weight_grams: number | null;
  is_active: boolean;
  position: number;
}

export interface ShippingZoneRow {
  id: string;
  name: string;
  is_rest_of_world: boolean;
  is_active: boolean;
  position: number;
  shipping_zone_countries: { country_code: string }[];
  shipping_rates: ShippingRateRow[];
}

const byPosition = <T extends { position: number; id: string }>(a: T, b: T) => a.position - b.position || a.id.localeCompare(b.id);

const rateKind = (kind: string): RateKind => ((RATE_KINDS as string[]).includes(kind) ? (kind as RateKind) : "standard");

export function mapShippingRate(row: ShippingRateRow): ShippingRate {
  return {
    id: row.id,
    kind: rateKind(row.kind),
    name: row.name,
    minDays: row.min_days,
    maxDays: row.max_days,
    priceCents: toMinorUnits(row.price),
    freeOverCents: cents(row.free_over_amount),
    minOrderCents: cents(row.min_order_amount),
    maxOrderCents: cents(row.max_order_amount),
    minWeightG: row.min_weight_grams,
    maxWeightG: row.max_weight_grams,
    active: row.is_active,
  };
}

export function mapShippingZones(rows: ShippingZoneRow[]): ShippingZone[] {
  return [...rows].sort(byPosition).map((z) => ({
    id: z.id,
    name: z.name,
    countries: z.shipping_zone_countries.map((c) => c.country_code.trim()).sort(),
    restOfWorld: z.is_rest_of_world,
    active: z.is_active,
    rates: [...z.shipping_rates].sort(byPosition).map(mapShippingRate),
  }));
}

/** The `admin_save_shipping()` argument: the whole configuration, in screen order. */
export function shippingPayload(zones: ShippingZone[]) {
  return zones.map((z) => ({
    id: z.id,
    name: z.name.trim(),
    is_rest_of_world: z.restOfWorld,
    is_active: z.active,
    countries: z.restOfWorld ? [] : [...z.countries].sort(),
    rates: z.rates.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name.trim(),
      min_days: r.minDays,
      max_days: r.maxDays,
      price: centsToAmount(r.priceCents),
      free_over_amount: amount(r.freeOverCents),
      min_order_amount: amount(r.minOrderCents),
      max_order_amount: amount(r.maxOrderCents),
      min_weight_grams: r.minWeightG,
      max_weight_grams: r.maxWeightG,
      is_active: r.active,
    })),
  }));
}

/* -------------------------------------------------------------------------- */
/* VAT                                                                        */
/* -------------------------------------------------------------------------- */

export interface TaxRateRow {
  country_code: string;
  tax_category: string;
  rate_bp: number;
  is_active: boolean;
}

const isReduced = (category: string): category is ReducedCategory => (REDUCED_CATEGORIES as string[]).includes(category);

export function mapTaxSettings(rows: TaxRateRow[]): TaxSettings {
  const rates: VatRate[] = [];
  const reduced: ReducedRate[] = [];
  for (const row of rows) {
    const country = row.country_code.trim();
    if (row.tax_category === "standard") rates.push({ country, standardBp: row.rate_bp, active: row.is_active });
    else if (isReduced(row.tax_category)) reduced.push({ country, category: row.tax_category, rateBp: row.rate_bp, active: row.is_active });
  }
  rates.sort((a, b) => a.country.localeCompare(b.country));
  reduced.sort((a, b) => a.country.localeCompare(b.country) || a.category.localeCompare(b.category));
  return { rates, reduced };
}

/** The `admin_save_tax_rates()` argument: every standard and reduced rate. */
export function taxPayload(t: TaxSettings): TaxRateRow[] {
  return [
    ...t.rates.map((r) => ({ country_code: r.country, tax_category: "standard", rate_bp: r.standardBp, is_active: r.active })),
    ...t.reduced.map((r) => ({ country_code: r.country, tax_category: r.category, rate_bp: r.rateBp, is_active: r.active })),
  ];
}

/* -------------------------------------------------------------------------- */
/* Languages                                                                  */
/* -------------------------------------------------------------------------- */

export interface LanguageRow {
  code: string;
  locale: string;
  native_name: string;
  is_default: boolean;
  is_enabled: boolean;
  position: number;
}

export function mapLanguages(rows: LanguageRow[]): LanguageSettings {
  const languages: ContentLanguage[] = [...rows]
    .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code))
    .map((l) => ({ code: l.code, locale: l.locale, native: l.native_name, isDefault: l.is_default, enabled: l.is_enabled }));
  return { languages };
}

/** The `admin_save_languages()` argument. */
export function languagesPayload(s: LanguageSettings) {
  return s.languages.map((l) => ({ code: l.code, is_enabled: l.enabled }));
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type SettingsWriteError = "forbidden" | "invalid" | "unavailable";

/** A refused save, as the screen words it. Never the database's message. */
export function settingsWriteErrorOf(error: { code?: string } | null | undefined): SettingsWriteError {
  const code = error?.code;
  if (code === "42501") return "forbidden";
  if (code === "22023" || code === "23514" || code === "23505" || code === "22P02" || code === "22001") return "invalid";
  return "unavailable";
}
