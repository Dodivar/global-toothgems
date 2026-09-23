import type {
  ShippingRate,
  ShippingZone,
  StoreDetails,
  TaxSettings,
  VatRate,
} from "../data/adminSettings";
import {
  CATALOGUE_FIELDS,
  TRACKED_LANGUAGES,
  type CoverageArea,
  type TrContentType,
  type TrFieldKind,
  type TrItem,
  type TrPriority,
} from "../data/adminTranslations";

/**
 * Pure rules behind the Settings workspace: validation, the plain-language
 * summaries of shipping and tax rules, and every translation-coverage number.
 * Kept out of the components so the numbers on the language cards, in the
 * coverage panel and in the missing list all come from the same functions and
 * cannot disagree.
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

export function addTax(netCents: number, rateBp: number): { gross: number; tax: number } {
  const tax = Math.round((netCents * rateBp) / 10000);
  return { gross: netCents + tax, tax };
}

/* -------------------------------------------------------------------------- */
/* Store details                                                              */
/* -------------------------------------------------------------------------- */

export type StoreErrors = Partial<Record<keyof StoreDetails, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ().-]{6,20}$/;
const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateStore(d: StoreDetails): StoreErrors {
  const e: StoreErrors = {};
  if (!d.storeName.trim()) e.storeName = "required";
  if (!d.legalName.trim()) e.legalName = "required";
  if (!d.businessEmail.trim()) e.businessEmail = "required";
  else if (!EMAIL.test(d.businessEmail.trim())) e.businessEmail = "email";
  if (!d.supportEmail.trim()) e.supportEmail = "required";
  else if (!EMAIL.test(d.supportEmail.trim())) e.supportEmail = "email";
  if (d.phone.trim() && !PHONE.test(d.phone.trim())) e.phone = "phone";
  if (d.website.trim() && !URL_RE.test(d.website.trim())) e.website = "url";
  if (!d.address1.trim()) e.address1 = "required";
  if (!d.postalCode.trim()) e.postalCode = "required";
  else if (d.country === "FR" && !/^\d{5}$/.test(d.postalCode.trim())) e.postalCode = "postalFr";
  if (!d.city.trim()) e.city = "required";
  if (!/^[A-Z0-9-]{0,6}$/i.test(d.orderPrefix)) e.orderPrefix = "orderAffix";
  if (!/^[A-Z0-9-]{0,6}$/i.test(d.orderSuffix)) e.orderSuffix = "orderAffix";
  if (!Number.isInteger(d.orderNextNumber) || d.orderNextNumber < 1) e.orderNextNumber = "positive";
  if (d.description.length > 200) e.description = "tooLong";
  if (d.supportMessage.length > 280) e.supportMessage = "tooLong";
  const badHours = Object.values(d.hours).some((h) => h.open && (!TIME.test(h.from) || !TIME.test(h.to) || h.from >= h.to));
  if (badHours) e.hours = "hours";
  return e;
}

export function orderNumberPreview(d: Pick<StoreDetails, "orderPrefix" | "orderSuffix" | "orderNextNumber" | "orderPadding">): string {
  const n = Number.isFinite(d.orderNextNumber) ? Math.max(0, Math.floor(d.orderNextNumber)) : 0;
  return `${d.orderPrefix}${String(n).padStart(d.orderPadding, "0")}${d.orderSuffix}`;
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

export type TaxErrors = Partial<Record<"defaultRate" | "defaultCountry", string>>;

export function validateTaxes(t: TaxSettings): TaxErrors {
  const e: TaxErrors = {};
  if (t.enabled && (t.defaultRateBp < 0 || t.defaultRateBp > 10000)) e.defaultRate = "percent";
  if (t.enabled && !t.defaultCountry) e.defaultCountry = "required";
  return e;
}

export function validateVatRate(r: VatRate, all: VatRate[]): Partial<Record<"country" | "rate", string>> {
  const e: Partial<Record<"country" | "rate", string>> = {};
  if (!r.country) e.country = "required";
  else if (all.some((o) => o.id !== r.id && o.country === r.country)) e.country = "vatCountryTaken";
  if (r.standardBp < 0 || r.standardBp > 10000) e.rate = "percent";
  return e;
}

/** The rate that applies to a destination: its own active row, else the store default. */
export function effectiveRate(code: string, t: TaxSettings): { bp: number; source: "country" | "default" } {
  const row = t.rates.find((r) => r.country === code && r.active);
  return row ? { bp: row.standardBp, source: "country" } : { bp: t.defaultRateBp, source: "default" };
}

/* -------------------------------------------------------------------------- */
/* Translations                                                               */
/* -------------------------------------------------------------------------- */

export type TrFieldState = "missing" | "outdated" | "translated";
export type TrItemStatus = "missing" | "partial" | "outdated" | "complete";

export function fieldState(item: TrItem, lang: string, key: TrFieldKind): TrFieldState {
  const rec = item.translations[lang];
  if (rec === "complete") return "translated";
  const v = rec?.[key];
  if (!v || !v.value.trim()) return "missing";
  return v.outdated ? "outdated" : "translated";
}

export interface LangProgress {
  total: number;
  missing: number;
  outdated: number;
  done: number;
  status: TrItemStatus;
  percent: number;
}

export function itemProgress(item: TrItem, lang: string): LangProgress {
  let missing = 0;
  let outdated = 0;
  for (const f of item.fields) {
    const s = fieldState(item, lang, f.key);
    if (s === "missing") missing++;
    else if (s === "outdated") outdated++;
  }
  const total = item.fields.length;
  const done = total - missing - outdated;
  const status: TrItemStatus =
    missing === total ? "missing" : missing > 0 ? "partial" : outdated > 0 ? "outdated" : "complete";
  return { total, missing, outdated, done, status, percent: Math.round((done / total) * 100) };
}

/** Languages an item still needs work in, among `langs`. */
export function languagesNeedingWork(item: TrItem, langs: string[]): string[] {
  return langs.filter((l) => itemProgress(item, l).status !== "complete");
}

export interface LanguageCoverage {
  missing: number;
  outdated: number;
  /** Floored: a language one field short of complete never reads 100 %. */
  percent: number;
}

const CATALOGUE_TOTAL = Object.values(CATALOGUE_FIELDS).reduce((a, b) => a + b, 0);

export function languageCoverage(items: TrItem[], lang: string, isSource: boolean): LanguageCoverage {
  if (isSource) return { missing: 0, outdated: 0, percent: 100 };
  if (!TRACKED_LANGUAGES.includes(lang)) return { missing: CATALOGUE_TOTAL, outdated: 0, percent: 0 };
  let missing = 0;
  let outdated = 0;
  for (const it of items) {
    const p = itemProgress(it, lang);
    missing += p.missing;
    outdated += p.outdated;
  }
  const percent = Math.floor(((CATALOGUE_TOTAL - missing - outdated) / CATALOGUE_TOTAL) * 100);
  return { missing, outdated, percent };
}

/** Coverage of one content area across the target languages. */
export function areaCoverage(items: TrItem[], area: CoverageArea, langs: string[]): number {
  if (langs.length === 0) return 100;
  const total = CATALOGUE_FIELDS[area] * langs.length;
  let gaps = CATALOGUE_FIELDS[area] * langs.filter((l) => !TRACKED_LANGUAGES.includes(l)).length;
  for (const it of items) {
    if (it.type !== area) continue;
    for (const l of langs.filter((x) => TRACKED_LANGUAGES.includes(x))) {
      const p = itemProgress(it, l);
      gaps += p.missing + p.outdated;
    }
  }
  return Math.floor(((total - gaps) / total) * 100);
}

export type TrSort = "priority" | "recent" | "incomplete" | "name";
export const TR_SORTS: TrSort[] = ["priority", "recent", "incomplete", "name"];
export type TrStatusFilter = "all" | "missing" | "partial" | "outdated";

export interface TrFilters {
  query: string;
  lang: string;
  type: TrContentType | "all";
  status: TrStatusFilter;
  sort: TrSort;
}

export const EMPTY_TR_FILTERS: TrFilters = { query: "", lang: "all", type: "all", status: "all", sort: "priority" };

export interface TrRow {
  item: TrItem;
  /** Languages this row lists as needing work — narrowed by the language filter. */
  langs: string[];
  /** Worst status among `langs`. */
  status: Exclude<TrItemStatus, "complete">;
  /** Completion across `langs`, 0–100. */
  percent: number;
  gaps: number;
}

const PRIORITY_RANK: Record<TrPriority, number> = { high: 0, normal: 1, low: 2 };
const STATUS_RANK = { missing: 0, partial: 1, outdated: 2 } as const;

export function missingRows(items: TrItem[], targetLangs: string[], f: TrFilters): TrRow[] {
  const q = f.query.trim().toLowerCase();
  const langs = f.lang === "all" ? targetLangs : targetLangs.filter((l) => l === f.lang);
  const rows: TrRow[] = [];

  for (const item of items) {
    if (f.type !== "all" && item.type !== f.type) continue;
    if (q && !`${item.name} ${item.context}`.toLowerCase().includes(q)) continue;

    const needs = languagesNeedingWork(item, langs);
    if (needs.length === 0) continue;

    const progress = needs.map((l) => itemProgress(item, l));
    if (f.status !== "all" && !progress.some((p) => p.status === f.status)) continue;

    const status = progress
      .map((p) => p.status as Exclude<TrItemStatus, "complete">)
      .sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0];
    const total = item.fields.length * needs.length;
    const done = progress.reduce((a, p) => a + p.done, 0);
    rows.push({
      item,
      langs: needs,
      status,
      percent: Math.round((done / total) * 100),
      gaps: total - done,
    });
  }

  const byName = (a: TrRow, b: TrRow) => a.item.name.localeCompare(b.item.name);
  const sorters: Record<TrSort, (a: TrRow, b: TrRow) => number> = {
    priority: (a, b) => PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] || b.gaps - a.gaps || byName(a, b),
    recent: (a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt) || byName(a, b),
    incomplete: (a, b) => a.percent - b.percent || b.gaps - a.gaps || byName(a, b),
    name: byName,
  };
  return rows.sort(sorters[f.sort]);
}
