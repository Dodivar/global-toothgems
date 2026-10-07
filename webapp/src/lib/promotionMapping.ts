import {
  TIMEZONES,
  toLocalInput,
  type Campaign,
  type CampaignLifecycle,
  type CampaignTheme,
  type Collection,
  type CustomerEligibility,
  type EligibilityScope,
  type Promotion,
  type PromotionLifecycle,
  type PromotionType,
  type Segment,
  type Timezone,
} from "../data/adminPromotions";
import type { Json } from "./supabase/database.types";
import { toMinorUnits } from "./catalog/money";

/**
 * Row ↔ UI mapping of the Promotions workspace — pure, unit-tested.
 *
 * The reads are the Supabase rows `lib/adminPromotions.tsx` fetches (one
 * promotion with its children in a single embedded select, plus the derived
 * `promotion_overview` figures); the writes are the payloads of
 * `admin_save_promotion()` / `admin_save_campaign()`, which store a promotion
 * and everything around it in one transaction. Money is integer cents in the UI
 * and decimals in the database (converted digit by digit, never through floats).
 */

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export const PROMOTION_SELECT = `
  id, name, internal_description, title, description, type, percent_off, max_discount_amount, amount_off,
  buy_quantity, get_quantity, reward_percent, bundle_price, gift_product_id, gift_variant_id,
  applies_to, customer_eligibility, min_subtotal_amount, min_quantity, max_uses_total, max_uses_per_customer,
  combinable, exclude_discounted_products, activation, code_kind, starts_at, ends_at, timezone, lifecycle,
  campaign_id, created_at, updated_at,
  promotion_translations ( locale, title, description ),
  promotion_products ( product_id, role ),
  promotion_categories ( category_id ),
  promotion_collections ( collection_id ),
  promotion_segments ( segment_id ),
  promotion_codes ( code, is_active )
`;

export interface PromotionRow {
  id: string;
  name: string;
  internal_description: string | null;
  title: string;
  description: string | null;
  type: string;
  percent_off: number | null;
  max_discount_amount: number | string | null;
  amount_off: number | string | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  reward_percent: number | null;
  bundle_price: number | string | null;
  gift_product_id: string | null;
  gift_variant_id: string | null;
  applies_to: string;
  customer_eligibility: string;
  min_subtotal_amount: number | string | null;
  min_quantity: number | null;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  combinable: boolean;
  exclude_discounted_products: boolean;
  activation: string;
  code_kind: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  lifecycle: string;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
  promotion_translations: { locale: string; title: string; description: string | null }[];
  promotion_products: { product_id: string; role: string }[];
  promotion_categories: { category_id: string }[];
  promotion_collections: { collection_id: string }[];
  promotion_segments: { segment_id: string }[];
  promotion_codes: { code: string; is_active: boolean }[];
}

/** One row of `promotion_overview`: paid-order performance, per promotion. */
export interface PromotionOverviewRow {
  id: string | null;
  orders: number | null;
  revenue_amount: number | string | null;
  discount_amount: number | string | null;
}

export const CAMPAIGN_SELECT = `
  id, name, internal_description, title, description, starts_at, ends_at, timezone, theme, cover_path, lifecycle,
  created_at, updated_at,
  campaign_translations ( locale, title, description ),
  campaign_products ( product_id, position )
`;

export interface CampaignRow {
  id: string;
  name: string;
  internal_description: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  theme: string;
  cover_path: string | null;
  lifecycle: string;
  created_at: string;
  updated_at: string;
  campaign_translations: { locale: string; title: string; description: string | null }[];
  campaign_products: { product_id: string; position: number }[];
}

export const COLLECTION_SELECT = `
  id, name,
  collection_translations ( locale, name, status ),
  collection_products ( product_id, position )
`;

export interface CollectionRow {
  id: string;
  name: string;
  collection_translations: { locale: string; name: string; status: string }[];
  collection_products: { product_id: string; position: number }[];
}

export interface SegmentRow {
  id: string | null;
  name: string | null;
  size: number | null;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

const money = (value: number | string | null | undefined): number | null => (value == null ? null : toMinorUnits(value));
const timezoneOf = (value: string): Timezone => ((TIMEZONES as readonly string[]).includes(value) ? (value as Timezone) : "Europe/Paris");

const TYPE_FROM_DB: Record<string, PromotionType> = {
  percentage: "percentage",
  fixed_amount: "fixed",
  buy_x_get_y: "bxgy",
  free_shipping: "freeShipping",
  bundle: "bundle",
  gift: "gift",
};
const TYPE_TO_DB: Record<PromotionType, string> = {
  percentage: "percentage",
  fixed: "fixed_amount",
  bxgy: "buy_x_get_y",
  freeShipping: "free_shipping",
  bundle: "bundle",
  gift: "gift",
};

/** Uses per day over the 14 days ending today (oldest first), in the shop's day. */
export function dailySeries(rows: { day: string | null; uses: number | null }[], today: string, length = 14): number[] {
  const byDay = new Map(rows.filter((r) => r.day).map((r) => [r.day as string, r.uses ?? 0]));
  const end = new Date(`${today}T12:00:00Z`);
  return Array.from({ length }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (length - 1 - i));
    return byDay.get(d.toISOString().slice(0, 10)) ?? 0;
  });
}

export function mapPromotion(row: PromotionRow, overview: PromotionOverviewRow | undefined, daily: number[]): Promotion | null {
  const type = TYPE_FROM_DB[row.type];
  if (!type) return null;
  const en = row.promotion_translations.find((t) => t.locale === "en");
  const timezone = timezoneOf(row.timezone);
  const productsOf = (role: string) => row.promotion_products.filter((p) => p.role === role).map((p) => p.product_id);
  const activeCodes = row.promotion_codes.filter((c) => c.is_active).map((c) => c.code);
  const unique = row.code_kind === "unique";
  // Unique codes share a prefix before their first dash ("SPRING-K3M9…"); that prefix is what the form edits.
  const prefix = unique ? (activeCodes[0]?.includes("-") ? activeCodes[0].split("-")[0] : "") : "";
  const orders = overview?.orders ?? 0;
  return {
    id: row.id,
    name: row.name,
    internalDescription: row.internal_description ?? "",
    customerTitle: { fr: row.title, en: en?.title ?? "" },
    customerDescription: { fr: row.description ?? "", en: en?.description ?? "" },
    discount: {
      type,
      ...(type === "percentage" ? { percent: row.percent_off ?? 0, maxDiscountCents: money(row.max_discount_amount) } : {}),
      ...(type === "fixed" ? { amountCents: money(row.amount_off) ?? 0 } : {}),
      ...(type === "bxgy" ? { buyQty: row.buy_quantity ?? 0, getQty: row.get_quantity ?? 0, rewardPercent: row.reward_percent ?? 100 } : {}),
      ...(type === "bundle" ? { bundleProductIds: productsOf("bundle"), bundlePriceCents: money(row.bundle_price) ?? undefined } : {}),
      ...(type === "gift" ? { giftProductId: row.gift_product_id ?? undefined, giftVariantId: row.gift_variant_id } : {}),
    },
    eligibility: {
      scope: row.applies_to as EligibilityScope,
      productIds: productsOf("eligible"),
      categoryIds: row.promotion_categories.map((c) => c.category_id),
      collectionIds: row.promotion_collections.map((c) => c.collection_id),
      customers: row.customer_eligibility as CustomerEligibility,
      segmentIds: row.promotion_segments.map((s) => s.segment_id),
      minCartCents: money(row.min_subtotal_amount),
      minQuantity: row.min_quantity,
    },
    usage: {
      maxTotal: row.max_uses_total,
      maxPerCustomer: row.max_uses_per_customer,
      combinable: row.combinable,
      excludeDiscounted: row.exclude_discounted_products,
      excludedProductIds: productsOf("excluded"),
    },
    schedule: {
      startsAt: toLocalInput(row.starts_at, timezone),
      endsAt: row.ends_at ? toLocalInput(row.ends_at, timezone) : null,
      timezone,
    },
    code: {
      mode: row.activation === "code" ? "code" : "automatic",
      code: row.activation !== "code" ? "" : unique ? prefix : (activeCodes[0] ?? ""),
      kind: unique ? "unique" : "shared",
      uniqueCount: unique ? activeCodes.length : null,
    },
    campaignId: row.campaign_id,
    lifecycle: row.lifecycle as PromotionLifecycle,
    stats: {
      uses: orders,
      orders,
      revenueCents: money(overview?.revenue_amount) ?? 0,
      discountCents: money(overview?.discount_amount) ?? 0,
      daily,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCampaign(row: CampaignRow): Campaign {
  const en = row.campaign_translations.find((t) => t.locale === "en");
  const timezone = timezoneOf(row.timezone);
  return {
    id: row.id,
    name: row.name,
    internalDescription: row.internal_description ?? "",
    title: { fr: row.title, en: en?.title ?? "" },
    description: { fr: row.description ?? "", en: en?.description ?? "" },
    startsAt: toLocalInput(row.starts_at, timezone),
    endsAt: toLocalInput(row.ends_at, timezone),
    timezone,
    theme: row.theme as CampaignTheme,
    cover: row.cover_path,
    productIds: [...row.campaign_products].sort((a, b) => a.position - b.position).map((p) => p.product_id),
    lifecycle: row.lifecycle as CampaignLifecycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCollection(row: CollectionRow): Collection {
  const en = row.collection_translations.find((t) => t.locale === "en" && t.status === "published");
  return {
    id: row.id,
    name: { fr: row.name, en: en?.name ?? row.name },
    productIds: [...row.collection_products].sort((a, b) => a.position - b.position).map((p) => p.product_id),
  };
}

export function mapSegment(row: SegmentRow): Segment | null {
  return row.id && row.name ? { id: row.id, name: row.name, size: row.size ?? 0 } : null;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/** Cents → the decimal the function reads ("12.5"); two places at most, exact. */
export const decimal = (cents: number): number => Number((cents / 100).toFixed(2));
const decimalOrNull = (cents: number | null | undefined): number | null => (cents == null || cents <= 0 ? null : decimal(cents));
const textOrNull = (value: string | undefined | null): string | null => (value && value.trim() ? value.trim() : null);

/** The prefix of unique codes: the database accepts up to 12 letters or digits. */
export const uniqueCodePrefix = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** Payload of `admin_save_promotion()`. Each type carries only its own parameters (the table's CHECKs demand it). */
export function promotionPayload(p: Promotion): Json {
  const d = p.discount;
  const e = p.eligibility;
  const byCode = p.code.mode === "code";
  return {
    id: p.id || null,
    name: p.name.trim(),
    internal_description: p.internalDescription.trim(),
    title: { fr: p.customerTitle.fr.trim(), en: p.customerTitle.en.trim() },
    description: { fr: p.customerDescription.fr.trim(), en: p.customerDescription.en.trim() },
    type: TYPE_TO_DB[d.type],
    percent_off: d.type === "percentage" ? (d.percent ?? null) : null,
    max_discount_amount: d.type === "percentage" ? decimalOrNull(d.maxDiscountCents) : null,
    amount_off: d.type === "fixed" ? decimalOrNull(d.amountCents) : null,
    buy_quantity: d.type === "bxgy" ? (d.buyQty ?? null) : null,
    get_quantity: d.type === "bxgy" ? (d.getQty ?? null) : null,
    reward_percent: d.type === "bxgy" ? (d.rewardPercent ?? 100) : null,
    bundle_price: d.type === "bundle" && d.bundlePriceCents != null ? decimal(d.bundlePriceCents) : null,
    gift_product_id: d.type === "gift" ? (d.giftProductId ?? null) : null,
    gift_variant_id: d.type === "gift" ? (d.giftVariantId ?? null) : null,
    applies_to: d.type === "bundle" ? "all" : e.scope,
    product_ids: e.productIds,
    excluded_product_ids: p.usage.excludedProductIds,
    bundle_product_ids: d.type === "bundle" ? (d.bundleProductIds ?? []) : [],
    category_ids: e.categoryIds,
    collection_ids: e.collectionIds,
    customer_eligibility: e.customers,
    segment_ids: e.segmentIds,
    min_subtotal_amount: decimalOrNull(e.minCartCents),
    min_quantity: e.minQuantity,
    max_uses_total: p.usage.maxTotal,
    max_uses_per_customer: p.usage.maxPerCustomer,
    combinable: p.usage.combinable,
    exclude_discounted_products: p.usage.excludeDiscounted,
    activation: byCode ? "code" : "automatic",
    code_kind: byCode ? p.code.kind : null,
    code: byCode && p.code.kind === "shared" ? p.code.code.trim().toUpperCase() : "",
    unique_code_count: byCode && p.code.kind === "unique" ? (p.code.uniqueCount ?? 0) : 0,
    unique_code_prefix: byCode && p.code.kind === "unique" ? uniqueCodePrefix(p.code.code) : "",
    starts_at: p.schedule.startsAt,
    ends_at: p.schedule.endsAt,
    timezone: p.schedule.timezone,
    campaign_id: p.campaignId,
    lifecycle: p.lifecycle,
  };
}

/** Payload of `admin_save_campaign()`. */
export function campaignPayload(c: Campaign): Json {
  return {
    id: c.id || null,
    name: c.name.trim(),
    internal_description: c.internalDescription.trim(),
    title: { fr: c.title.fr.trim(), en: c.title.en.trim() },
    description: { fr: c.description.fr.trim(), en: c.description.en.trim() },
    starts_at: c.startsAt,
    ends_at: c.endsAt,
    timezone: c.timezone,
    theme: c.theme,
    cover_path: textOrNull(c.cover),
    product_ids: c.productIds,
    lifecycle: c.lifecycle,
  };
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

export type PromotionWriteError =
  | "unavailable" /* no Supabase (local mock mode) */
  | "notAllowed"
  | "codeTaken"
  | "incomplete"
  | "invalid"
  | "notFound"
  | "failed";

/** Classifies what Postgres refused, for the message the screen shows. */
export function classifyWriteError(error: { code?: string; message?: string; details?: string }): PromotionWriteError {
  switch (error.code) {
    case "42501":
      return "notAllowed";
    case "23505":
      return /promotion_codes/.test(`${error.message ?? ""} ${error.details ?? ""}`) ? "codeTaken" : "invalid";
    case "23514":
    case "23503":
      return "incomplete";
    case "22023":
    case "22P02":
    case "22007":
    case "22008":
      return "invalid";
    case "P0002":
      return "notFound";
    default:
      return "failed";
  }
}
