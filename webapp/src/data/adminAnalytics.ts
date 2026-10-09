import type { Localized } from "./types";
import type { StockState } from "./adminCatalog";

/**
 * Vocabulary and shapes of the Statistics screen.
 *
 * The figures come from the database: `analytics_snapshot()` for the shop
 * (definitions in `supabase/README.md`, "Statistics") and the Academy tables
 * for the training panel (`lib/adminAnalyticsTraining.ts`). This module only
 * declares what the screen reads; the persistence boundary is
 * `lib/adminAnalytics.ts`, the row → screen mapping `lib/adminAnalyticsMapping.ts`.
 *
 * Money is in integer minor units (cents) of `AnalyticsSnapshot.currency`
 * (`AGENTS.md` §8); the screen formats it with `formatMoney`.
 */

/* ------------------------------------------------------------------ vocabulary */

export type RangeId = "today" | "7d" | "30d" | "90d" | "year" | "custom";
export const RANGE_IDS: RangeId[] = ["today", "7d", "30d", "90d", "year", "custom"];

/** Longest period `analytics_snapshot()` accepts. */
export const MAX_RANGE_DAYS = 400;

/** The shop's reporting time zone and currency (the snapshot's defaults). */
export const SHOP_TIME_ZONE = "Europe/Paris";
export const SHOP_CURRENCY = "EUR";

/**
 * Revenue buckets (`categories.report_group`). Course lines are not part of
 * the shop's revenue (`analytics_sale_lines` joins products), so "training" is
 * never a slice of the breakdown nor a category filter: the Academy is read in
 * its own panel.
 */
export type RevenueCategoryId = "jewelry" | "aftercare" | "kits" | "training" | "other";
export const REVENUE_CATEGORIES: RevenueCategoryId[] = ["jewelry", "aftercare", "kits", "training", "other"];
export type ShopCategoryId = Exclude<RevenueCategoryId, "training">;
export const SHOP_CATEGORIES: ShopCategoryId[] = ["jewelry", "aftercare", "kits", "other"];

/**
 * Segment colour per revenue bucket, as brand tokens.
 *
 * The order of the buckets is the palette's safety mechanism, so it is fixed and
 * the colour belongs to the category, never to its rank: re-sorting the table
 * must not repaint the chart. The set was checked pairwise for protanopia and
 * deuteranopia separation in the order they are drawn. Every figure that wears
 * these colours is also written out next to its label: colour is never the only
 * channel here.
 */
export const CATEGORY_COLOR: Record<RevenueCategoryId, string> = {
  jewelry: "var(--gt-blue-700)",
  aftercare: "var(--gt-emerald-500)",
  kits: "var(--gt-blue-400)",
  training: "var(--gt-fuchsia-500)",
  other: "var(--gt-ink-400)",
};

export type OrderStatusId = "completed" | "pending" | "cancelled" | "refunded";
export const ORDER_STATUS_IDS: OrderStatusId[] = ["completed", "pending", "cancelled", "refunded"];

export type CustomerTypeId = "new" | "returning";

export interface AnalyticsFilters {
  range: RangeId;
  /** Only read when `range` is "custom". ISO days, inclusive; "" = the last 30 days. */
  customFrom: string;
  customTo: string;
  category: ShopCategoryId | "all";
  /** A product id (uuid). */
  product: string | "all";
  customerType: CustomerTypeId | "all";
  /** ISO 3166-1 alpha-2, upper case. */
  country: string | "all";
  orderStatus: OrderStatusId | "all";
}

export const DEFAULT_FILTERS: AnalyticsFilters = {
  range: "30d",
  customFrom: "",
  customTo: "",
  category: "all",
  product: "all",
  customerType: "all",
  country: "all",
  orderStatus: "all",
};

export const FILTER_KEYS = ["category", "product", "customerType", "country", "orderStatus"] as const;

/** The date range is a control of its own, so it is not counted as a filter. */
export function activeFilterCount(filters: AnalyticsFilters): number {
  return FILTER_KEYS.filter((key) => filters[key] !== "all").length;
}

/* --------------------------------------------------------------------- shapes */

export type Trend = "up" | "down" | "flat";

export type KpiId =
  | "revenue" | "orders" | "aov" | "units"
  | "newCustomers" | "returningCustomers" | "enrollments" | "completionRate";

export interface KpiDatum {
  id: KpiId;
  /** Minor units for "currency", a percentage for "percent", else a count. */
  value: number;
  previous: number;
  /** Percent, or points when the KPI is itself a rate; null without a previous figure. */
  change: number | null;
  changeUnit: "percent" | "points";
  format: "currency" | "count" | "percent";
  trend: Trend;
  /** Twelve points, oldest first, for the card's sparkline. */
  spark: number[];
  /** The two figures the business leads with are drawn larger. */
  lead?: boolean;
}

/** Granularity of one bucket, which is what the UI formats its label from. */
export type BucketStep = "hour" | "day" | "week" | "month";

export interface TimePoint {
  /** Wall-clock start of the bucket in the shop's time zone, written as a UTC
      ISO instant: labels are formatted with `timeZone: "UTC"`. */
  key: string;
  /** Minor units. */
  revenue: number;
  orders: number;
  previousRevenue: number;
  previousOrders: number;
}

export interface CategoryDatum {
  id: RevenueCategoryId;
  /** Minor units. */
  revenue: number;
  orders: number;
  /** Percent of the period's revenue, one decimal. */
  share: number;
}

export interface ProductDatum {
  id: string;
  name: Localized;
  bucket: RevenueCategoryId;
  thumbnail?: string;
  units: number;
  /** Minor units. */
  revenue: number;
  orders: number;
  /** Revenue change against the previous period, percent; null when it sold nothing then. */
  change: number | null;
  stock: StockState | null;
}

export interface CustomerStats {
  total: number;
  new: number;
  returning: number;
  /** Share of the period's orders placed by an existing customer. */
  repeatRate: number;
  /** Minor units. */
  lifetimeValue: number;
  lifetimeOrders: number;
  /** Cumulative customer base across the window. */
  growth: { key: string; total: number; added: number }[];
}

export interface CourseDatum {
  id: string;
  title: Localized;
  /** `courses.level`: beginner, intermediate, advanced, all. */
  level: string;
  enrollments: number;
  completionRate: number;
  averageScore: number | null;
  /** Minor units: course lines paid in the period. */
  revenue: number;
}

export interface TrainingStats {
  enrollments: number;
  activeLearners: number;
  completed: number;
  completionRate: number;
  averageScore: number | null;
  daysToComplete: number | null;
  courses: CourseDatum[];
}

export interface OrderStats {
  total: number;
  statuses: { id: OrderStatusId; orders: number; share: number }[];
  processingHours: number | null;
  refundRate: number;
  cancellationRate: number;
}

export interface GeoDatum {
  /** ISO 3166-1 alpha-2, or "" when the order carries no address. */
  id: string;
  /** Minor units. */
  revenue: number;
  orders: number;
  customers: number;
  share: number;
}

export type InsightId = "topProduct" | "returning" | "bundle" | "kit" | "courses" | "slowing";

export interface InsightDatum {
  id: InsightId;
  tone: "positive" | "neutral" | "attention";
  /** The product the sentence is about, if any. */
  name?: Localized;
  /** Percent or points. */
  change?: number;
  share?: number;
  /** Minor units. */
  revenue?: number;
}

export interface CrossDatum {
  id: string;
  value: number;
  format: "percent" | "currency";
  /** The store-wide figure this one should be read against. */
  benchmark?: number;
}

export interface AnalyticsSnapshot {
  /** Inclusive ISO days. */
  start: string;
  end: string;
  step: BucketStep;
  currency: string;
  /** False when the filters leave nothing to report on. */
  hasData: boolean;
  kpis: KpiDatum[];
  series: TimePoint[];
  breakdown: CategoryDatum[];
  products: ProductDatum[];
  customers: CustomerStats;
  training: TrainingStats;
  orders: OrderStats;
  geo: GeoDatum[];
  insights: InsightDatum[];
  cross: CrossDatum[];
}
