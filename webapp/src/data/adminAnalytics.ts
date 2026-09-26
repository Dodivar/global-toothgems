import type { Localized } from "./types";
import { ADMIN_PRODUCTS, stockState, type CategoryId, type StockState } from "./adminCatalog";
import { COURSES } from "./courses";

/**
 * Mock reporting behind the Statistics screen.
 *
 * This file is the seam a real reporting backend replaces, exactly as
 * `adminCatalog.ts` is for the catalogue: the screen only ever reads the types
 * declared here and calls `buildSnapshot()`. Swapping this module for warehouse
 * queries should not require touching a single component.
 *
 * Nothing here is authoritative and nothing is random: every figure is derived
 * deterministically from the baseline below, so the same range and the same
 * filters always produce the same page. A dashboard whose numbers move when you
 * re-render it is the fastest way to lose an administrator's trust, prototype or
 * not.
 *
 * Money is a plain number of euros rather than integer minor units, for the
 * reason the catalogue file gives: the prototype never computes a total. Real
 * reporting must follow the money rules in `AGENTS.md` instead.
 */

/* ------------------------------------------------------------------ vocabulary */

export type RangeId = "today" | "7d" | "30d" | "90d" | "year" | "custom";
export const RANGE_IDS: RangeId[] = ["today", "7d", "30d", "90d", "year", "custom"];

/**
 * Revenue buckets. Deliberately coarser than the catalogue's categories: an
 * administrator asks "how much of this came from jewellery, and how much from
 * teaching", not "how much came from accessories". Tools and accessories fold
 * into the kit bucket, and training has no catalogue category at all.
 */
export type RevenueCategoryId = "jewelry" | "aftercare" | "kits" | "training" | "other";
export const REVENUE_CATEGORIES: RevenueCategoryId[] = ["jewelry", "aftercare", "kits", "training", "other"];

const CATALOG_BUCKET: Record<CategoryId, RevenueCategoryId> = {
  gems: "jewelry",
  aftercare: "aftercare",
  kits: "kits",
  tools: "kits",
  accessories: "kits",
};

/**
 * Segment colour per revenue bucket, as brand tokens.
 *
 * The order of the buckets is the palette's safety mechanism, so it is fixed and
 * the colour belongs to the category, never to its rank: re-sorting the table
 * must not repaint the chart. The set was checked pairwise for protanopia and
 * deuteranopia separation in the order they are drawn — the light blue sits
 * between the emerald and the fuchsia because those two collapse against the
 * dark blue under protanopia when they touch.
 *
 * Two of the brand's hues (the pastel blues, the neutral) sit below the chroma
 * floor a purely data-driven palette would demand, and the light blue clears
 * only 2.1:1 against white. That is the brand, so every figure that wears these
 * colours is also written out next to its label, and each section carries a
 * table of its own values: colour is never the only channel here.
 */
export const CATEGORY_COLOR: Record<RevenueCategoryId, string> = {
  jewelry: "var(--gt-blue-700)",
  aftercare: "var(--gt-emerald-500)",
  kits: "var(--gt-blue-400)",
  training: "var(--gt-fuchsia-500)",
  other: "var(--gt-ink-400)",
};

export type CountryId = "fr" | "be" | "ch" | "de" | "uk" | "other";
export const COUNTRY_IDS: CountryId[] = ["fr", "be", "ch", "de", "uk", "other"];

export type OrderStatusId = "completed" | "pending" | "cancelled" | "refunded";
export const ORDER_STATUS_IDS: OrderStatusId[] = ["completed", "pending", "cancelled", "refunded"];

export type CustomerTypeId = "new" | "returning";

export interface AnalyticsFilters {
  range: RangeId;
  /** Only read when `range` is "custom". ISO dates, inclusive. */
  customFrom: string;
  customTo: string;
  category: RevenueCategoryId | "all";
  product: string | "all";
  course: string | "all";
  customerType: CustomerTypeId | "all";
  country: CountryId | "all";
  orderStatus: OrderStatusId | "all";
}

export const DEFAULT_FILTERS: AnalyticsFilters = {
  range: "30d",
  customFrom: "2026-07-01",
  customTo: "2026-08-15",
  category: "all",
  product: "all",
  course: "all",
  customerType: "all",
  country: "all",
  orderStatus: "all",
};

/** The date range is a control of its own, so it is not counted as a filter. */
export function activeFilterCount(filters: AnalyticsFilters): number {
  return (["category", "product", "course", "customerType", "country", "orderStatus"] as const).filter(
    (key) => filters[key] !== "all",
  ).length;
}

/* ------------------------------------------------------------------- baseline */

/**
 * The thirty-day window every other figure is derived from.
 *
 * The relationships between these numbers are the point, not the numbers
 * themselves: average order value is revenue over orders, the repeat rate is
 * returning orders over orders, and the category breakdown sums to the revenue
 * total. A reviewer who checks one of them should find it holds.
 */
const BASE = {
  revenue: 48620,
  orders: 684,
  units: 1426,
  newCustomers: 512,
  returningCustomers: 172,
  enrollments: 94,
  completionRate: 78,
  /** All-time, not in-period: the customer base the store has built. */
  totalCustomers: 2148,
  lifetimeValue: 143,
  lifetimeOrders: 2,
  activeLearners: 137,
  completedCourses: 73,
  averageScore: 87,
  daysToComplete: 12,
  processingHours: 34,
} as const;

/** Previous thirty-day window. Derived deltas, rather than authored ones. */
const BASE_PREVIOUS = {
  revenue: 43260,
  orders: 630,
  units: 1306,
  newCustomers: 446,
  returningCustomers: 176,
  enrollments: 77,
  completionRate: 76,
} as const;

interface RangeSpec {
  /** Revenue for the whole window. Orders follow; everything else scales. */
  revenue: number;
  orders: number;
  /** Multiplier on the previous-period figures, so each window has its own story. */
  compare: number;
  buckets: number;
  step: BucketStep;
  /** First bucket of the window. */
  start: string;
  /** Last day of the window, for the range caption. */
  end: string;
  /** Authored bucket weights, where the shape is part of the story. */
  weights?: number[];
  /** Days per bucket, for a day-step window too long to draw daily. */
  stride?: number;
}

/** "Today" across the whole file. A prototype must not drift with the clock. */
export const TODAY = "2026-09-18";

const RANGES: Record<RangeId, RangeSpec> = {
  today: {
    revenue: 1680, orders: 24, compare: 0.9, buckets: 12, step: "hour",
    start: "2026-09-18", end: "2026-09-18",
  },
  "7d": {
    revenue: 11940, orders: 168, compare: 0.93, buckets: 7, step: "day",
    start: "2026-09-12", end: "2026-09-18",
  },
  "30d": {
    revenue: 48620, orders: 684, compare: 1, buckets: 30, step: "day",
    start: "2026-08-20", end: "2026-09-18",
  },
  "90d": {
    revenue: 138450, orders: 1962, compare: 0.96, buckets: 13, step: "week",
    start: "2026-06-22", end: "2026-09-18",
  },
  year: {
    revenue: 332420, orders: 4764, compare: 0.79, buckets: 9, step: "month",
    start: "2026-01-01", end: "2026-09-18",
    // The monthly curve is authored: it is the store's actual year, and a
    // generated one would not show the spring plateau.
    weights: [28400, 31200, 35800, 33900, 39700, 42100, 46300, 48620, 26400],
  },
  custom: {
    // Replaced by `customSpec()` — kept so the record is total over RangeId.
    revenue: 71380, orders: 1004, compare: 0.92, buckets: 15, step: "day",
    start: "2026-07-01", end: "2026-08-15", stride: 3,
  },
};

/** What the store takes on an average day of the baseline window. */
const DAILY_REVENUE = BASE.revenue / 30;
const DAILY_ORDERS = BASE.orders / 30;

function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.min(400, Math.max(1, Math.round(ms / 86_400_000) + 1));
}

/**
 * A custom window is priced by its length rather than pinned to a fixture, so
 * moving either date visibly moves every figure on the page — which is the
 * whole point of offering the control.
 */
function customSpec(filters: AnalyticsFilters): RangeSpec {
  const from = filters.customFrom <= filters.customTo ? filters.customFrom : filters.customTo;
  const to = filters.customFrom <= filters.customTo ? filters.customTo : filters.customFrom;
  const days = daysBetween(from, to);
  const step: BucketStep = days <= 16 ? "day" : days <= 120 ? "week" : "month";
  const stride = step === "day" ? 1 : undefined;
  const buckets = step === "day" ? days : step === "week" ? Math.ceil(days / 7) : Math.ceil(days / 30);
  return {
    revenue: Math.round(days * DAILY_REVENUE * 0.98),
    orders: Math.round(days * DAILY_ORDERS * 0.98),
    compare: 0.92,
    buckets,
    step,
    start: from,
    end: to,
    stride,
  };
}

function rangeSpec(filters: AnalyticsFilters): RangeSpec {
  return filters.range === "custom" ? customSpec(filters) : RANGES[filters.range];
}

export function rangeBounds(filters: AnalyticsFilters): { start: string; end: string } {
  const spec = rangeSpec(filters);
  return { start: spec.start, end: spec.end };
}

/* ---------------------------------------------------------- authored fixtures */

/** Share of each revenue bucket, and the share of orders that contain it. */
const CATEGORY_MIX: Record<RevenueCategoryId, { revenue: number; orders: number; units: number }> = {
  // Order shares sum above 1 on purpose: an order can hold a gem and a gel.
  jewelry: { revenue: 27450, orders: 0.62, units: 0.7 },
  aftercare: { revenue: 7820, orders: 0.41, units: 0.24 },
  kits: { revenue: 5930, orders: 0.11, units: 0.05 },
  training: { revenue: 6240, orders: 0.07, units: 0.005 },
  other: { revenue: 1180, orders: 0.06, units: 0.005 },
};

interface ProductSeed {
  id: string;
  units: number;
  orders: number;
  /** Product-page sessions that ended in a sale, as a percentage. */
  conversion: number;
  change: number;
}

/** The eight sellers of the baseline window, as catalogue ids. */
const PRODUCT_SEEDS: ProductSeed[] = [
  { id: "swarovski-set", units: 62, orders: 58, conversion: 3.1, change: 9.4 },
  { id: "crystal-star", units: 214, orders: 196, conversion: 5.8, change: 18.2 },
  { id: "gold-star-charm", units: 54, orders: 51, conversion: 2.4, change: -4.6 },
  { id: "aftercare-gel", units: 284, orders: 261, conversion: 6.4, change: 12.7 },
  { id: "chrome-heart", units: 88, orders: 82, conversion: 3.6, change: 6.1 },
  { id: "application-kit-pro", units: 14, orders: 14, conversion: 4.2, change: 22.5 },
  { id: "mini-crystal-collection", units: 47, orders: 44, conversion: 2.9, change: -1.8 },
  { id: "starter-kit", units: 7, orders: 7, conversion: 1.8, change: 3.2 },
];

interface CourseSeed {
  id: string;
  enrollments: number;
  completionRate: number;
  averageScore: number;
  revenue: number;
  days: number;
}

/**
 * Enrolments exceed paid seats because professional kits ship with a seat, so
 * the revenue column is the paid part and never `enrolments x price`.
 */
const COURSE_SEEDS: CourseSeed[] = [
  { id: "fondation", enrollments: 44, completionRate: 82, averageScore: 88, revenue: 3490, days: 9 },
  { id: "avance", enrollments: 29, completionRate: 71, averageScore: 84, revenue: 1674, days: 16 },
  { id: "business", enrollments: 21, completionRate: 79, averageScore: 91, revenue: 1076, days: 7 },
];

const ORDER_MIX: Record<OrderStatusId, { orders: number; revenue: number }> = {
  completed: { orders: 612, revenue: 0.909 },
  pending: { orders: 41, revenue: 0.055 },
  cancelled: { orders: 18, revenue: 0.021 },
  refunded: { orders: 13, revenue: 0.015 },
};

/**
 * Revenue and orders are in-period; the customer count is the market's whole
 * base. Mixing the two would be a bug, so the column says which it is.
 */
const GEO_SEEDS: Record<CountryId, { revenue: number; orders: number; customers: number }> = {
  fr: { revenue: 26140, orders: 371, customers: 1204 },
  be: { revenue: 7980, orders: 112, customers: 338 },
  ch: { revenue: 5420, orders: 63, customers: 186 },
  de: { revenue: 4310, orders: 68, customers: 221 },
  uk: { revenue: 3290, orders: 45, customers: 132 },
  other: { revenue: 1480, orders: 25, customers: 67 },
};

/* --------------------------------------------------------------- derived types */

export type Trend = "up" | "down" | "flat";

export type KpiId =
  | "revenue" | "orders" | "aov" | "units"
  | "newCustomers" | "returningCustomers" | "enrollments" | "completionRate";

export interface KpiDatum {
  id: KpiId;
  value: number;
  previous: number;
  /** Percent, or points when the KPI is itself a rate. */
  change: number;
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
  /** ISO instant of the bucket start. Labels are formatted in the UI, in the
      administrator's language — a data module has no business knowing that. */
  key: string;
  revenue: number;
  orders: number;
  previousRevenue: number;
  previousOrders: number;
}

export interface CategoryDatum {
  id: RevenueCategoryId;
  revenue: number;
  orders: number;
  /** Percent of the period's revenue, one decimal. */
  share: number;
}

export interface ProductDatum {
  id: string;
  name: Localized;
  bucket: RevenueCategoryId;
  category: CategoryId;
  thumbnail?: string;
  alt: Localized;
  units: number;
  revenue: number;
  orders: number;
  conversion: number;
  change: number;
  stock: StockState;
}

export interface CustomerStats {
  total: number;
  new: number;
  returning: number;
  /** Share of the period's orders placed by an existing customer. */
  repeatRate: number;
  lifetimeValue: number;
  lifetimeOrders: number;
  /** Cumulative customer base across the window. */
  growth: { key: string; total: number; added: number }[];
}

export interface CourseDatum {
  id: string;
  title: Localized;
  level: Localized;
  enrollments: number;
  completionRate: number;
  averageScore: number;
  revenue: number;
  days: number;
}

export interface TrainingStats {
  enrollments: number;
  activeLearners: number;
  completed: number;
  completionRate: number;
  averageScore: number;
  daysToComplete: number;
  courses: CourseDatum[];
}

export interface OrderStats {
  total: number;
  statuses: { id: OrderStatusId; orders: number; share: number }[];
  processingHours: number;
  refundRate: number;
  cancellationRate: number;
}

export interface GeoDatum {
  id: CountryId;
  revenue: number;
  orders: number;
  customers: number;
  share: number;
}

export interface InsightDatum {
  id: string;
  tone: "positive" | "neutral" | "attention";
  /** Interpolation values for the insight's sentence. */
  values: Record<string, string | number>;
}

export interface CrossDatum {
  id: string;
  value: number;
  format: "percent" | "currency";
  /** The store-wide figure this one should be read against. */
  benchmark?: number;
}

export interface AnalyticsSnapshot {
  range: RangeId;
  start: string;
  end: string;
  step: BucketStep;
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

/* ------------------------------------------------------------------- utilities */

/** Deterministic 0..1 jitter. Same index, same value, every render. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Splits a total across weights as whole numbers that still add up to it.
 * Largest remainders take the rounding slack, so a column of figures never
 * disagrees with the total printed above it.
 */
function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const out = exact.map((v) => Math.floor(v));
  let rest = Math.round(total) - out.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0; k++, rest--) out[byRemainder[k % byRemainder.length].i] += 1;
  return out;
}

function pct(value: number, previous: number): number {
  if (previous <= 0) return 0;
  return Math.round(((value - previous) / previous) * 1000) / 10;
}

function trendOf(change: number): Trend {
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "flat";
}

function addDays(iso: string, days: number): Date {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/* --------------------------------------------------------------- bucket shapes */

/** Trading rhythm of the store, Monday first. Sundays are quiet. */
const WEEKDAY_SHAPE = [1.05, 1.08, 1.02, 1.06, 1.12, 0.86, 0.74];
/** 08:00 to 19:00. Lunch and after-work are when studios order. */
const HOUR_SHAPE = [0.35, 0.6, 0.9, 1.15, 1.05, 0.8, 0.9, 1.2, 1.35, 1.25, 0.95, 0.6];

interface Bucket {
  key: string;
  date: Date;
  weight: number;
}

function buckets(spec: RangeSpec): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < spec.buckets; i++) {
    let date: Date;
    let shape: number;
    switch (spec.step) {
      case "hour": {
        date = new Date(`${spec.start}T00:00:00Z`);
        date.setUTCHours(8 + i);
        shape = HOUR_SHAPE[i] ?? 1;
        break;
      }
      case "week": {
        date = addDays(spec.start, i * 7);
        shape = 1;
        break;
      }
      case "month": {
        const first = new Date(`${spec.start}T00:00:00Z`);
        date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1));
        shape = 1;
        break;
      }
      default: {
        date = addDays(spec.start, i * (spec.stride ?? 1));
        shape = WEEKDAY_SHAPE[(date.getUTCDay() + 6) % 7];
      }
    }
    // A gentle rise across the window, so the curve agrees with the growth the
    // KPI cards report, plus a fixed jitter so it does not read as a template.
    const drift = 0.88 + (i / Math.max(1, spec.buckets - 1)) * 0.24;
    const jitter = 0.88 + noise(i + 1) * 0.24;
    out.push({ key: date.toISOString(), date, weight: (spec.weights?.[i] ?? shape * drift) * jitter });
  }
  return out;
}

/* ----------------------------------------------------------------- filter maths */

interface Scale {
  revenue: number;
  orders: number;
  units: number;
  customers: number;
  training: number;
}

const NEUTRAL: Scale = { revenue: 1, orders: 1, units: 1, customers: 1, training: 1 };

function multiply(a: Scale, b: Partial<Scale>): Scale {
  return {
    revenue: a.revenue * (b.revenue ?? 1),
    orders: a.orders * (b.orders ?? 1),
    units: a.units * (b.units ?? 1),
    customers: a.customers * (b.customers ?? 1),
    training: a.training * (b.training ?? 1),
  };
}

/**
 * How much of the store each filter selects.
 *
 * Every filter narrows the same four quantities, and every figure on the page is
 * derived from them — which is what keeps a filtered page internally consistent
 * instead of nine panels disagreeing with each other.
 */
function filterScale(filters: AnalyticsFilters): Scale {
  let scale = NEUTRAL;

  if (filters.category !== "all") {
    const mix = CATEGORY_MIX[filters.category];
    scale = multiply(scale, {
      revenue: mix.revenue / BASE.revenue,
      orders: mix.orders,
      units: mix.units,
      customers: mix.orders,
      training: filters.category === "training" ? 1 : 0,
    });
  }

  if (filters.product !== "all") {
    const seed = PRODUCT_SEEDS.find((p) => p.id === filters.product);
    const price = ADMIN_PRODUCTS.find((p) => p.id === filters.product)?.price ?? 0;
    const revenue = seed ? seed.units * price : 0;
    scale = multiply(scale, {
      revenue: revenue / BASE.revenue,
      orders: (seed?.orders ?? 0) / BASE.orders,
      units: (seed?.units ?? 0) / BASE.units,
      customers: (seed?.orders ?? 0) / BASE.orders,
      training: 0,
    });
  }

  if (filters.course !== "all") {
    const seed = COURSE_SEEDS.find((c) => c.id === filters.course);
    scale = multiply(scale, {
      revenue: (seed?.revenue ?? 0) / BASE.revenue,
      orders: (seed?.enrollments ?? 0) / BASE.orders,
      units: 0,
      customers: (seed?.enrollments ?? 0) / BASE.orders,
      training: (seed?.enrollments ?? 0) / BASE.enrollments,
    });
  }

  if (filters.customerType !== "all") {
    const isNew = filters.customerType === "new";
    scale = multiply(scale, {
      revenue: isNew ? 0.72 : 0.28,
      orders: isNew ? 0.749 : 0.251,
      units: isNew ? 0.73 : 0.27,
      customers: isNew ? 0.749 : 0.251,
      training: isNew ? 0.61 : 0.39,
    });
  }

  if (filters.country !== "all") {
    const geo = GEO_SEEDS[filters.country];
    scale = multiply(scale, {
      revenue: geo.revenue / BASE.revenue,
      orders: geo.orders / BASE.orders,
      units: geo.orders / BASE.orders,
      customers: geo.customers / BASE.totalCustomers,
      training: geo.orders / BASE.orders,
    });
  }

  if (filters.orderStatus !== "all") {
    const mix = ORDER_MIX[filters.orderStatus];
    scale = multiply(scale, {
      revenue: mix.revenue,
      orders: mix.orders / BASE.orders,
      units: mix.orders / BASE.orders,
      customers: mix.orders / BASE.orders,
      training: mix.orders / BASE.orders,
    });
  }

  return scale;
}

/* --------------------------------------------------------------------- builder */

export function buildSnapshot(filters: AnalyticsFilters): AnalyticsSnapshot {
  const spec = rangeSpec(filters);
  const scale = filterScale(filters);
  const windowFactor = spec.orders / BASE.orders;

  const revenue = Math.round(spec.revenue * scale.revenue);
  const orders = Math.round(spec.orders * scale.orders);
  const units = Math.round(BASE.units * windowFactor * scale.units);
  const hasData = orders > 0 && revenue > 0;

  const previousRevenue = Math.round(BASE_PREVIOUS.revenue * windowFactor * spec.compare * scale.revenue);
  const previousOrders = Math.round(BASE_PREVIOUS.orders * windowFactor * spec.compare * scale.orders);
  const previousUnits = Math.round(BASE_PREVIOUS.units * windowFactor * spec.compare * scale.units);

  /* --- time series ------------------------------------------------------- */
  const shape = buckets(spec);
  const revenueByBucket = distribute(revenue, shape.map((b) => b.weight));
  const ordersByBucket = distribute(orders, shape.map((b) => b.weight));
  const previousRevenueByBucket = distribute(
    previousRevenue,
    shape.map((b, i) => b.weight * (0.9 + noise(i + 40) * 0.2)),
  );
  const previousOrdersByBucket = distribute(
    previousOrders,
    shape.map((b, i) => b.weight * (0.9 + noise(i + 70) * 0.2)),
  );

  const series: TimePoint[] = shape.map((bucket, i) => ({
    key: bucket.key,
    revenue: revenueByBucket[i],
    orders: ordersByBucket[i],
    previousRevenue: previousRevenueByBucket[i],
    previousOrders: previousOrdersByBucket[i],
  }));

  /* --- key figures ------------------------------------------------------- */
  const newCustomers = Math.round(BASE.newCustomers * windowFactor * scale.customers);
  const returningCustomers = Math.round(BASE.returningCustomers * windowFactor * scale.customers);
  const previousNew = Math.round(BASE_PREVIOUS.newCustomers * windowFactor * spec.compare * scale.customers);
  const previousReturning = Math.round(BASE_PREVIOUS.returningCustomers * windowFactor * spec.compare * scale.customers);

  const enrollments = Math.round(BASE.enrollments * windowFactor * scale.training);
  const previousEnrollments = Math.round(BASE_PREVIOUS.enrollments * windowFactor * spec.compare * scale.training);

  // Rates do not scale with the window; they drift a little with it, the way a
  // real completion rate does — except on the baseline window, which is the one
  // the fixture is authored against and therefore reports it exactly.
  const completionRate = enrollments === 0
    ? 0
    : filters.range === "30d"
      ? BASE.completionRate
      : Math.round((BASE.completionRate + (noise(RANGE_IDS.indexOf(filters.range) + 3) - 0.5) * 6) * 10) / 10;
  const previousCompletion = BASE_PREVIOUS.completionRate;

  const aov = orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0;
  const previousAov = previousOrders > 0 ? Math.round((previousRevenue / previousOrders) * 100) / 100 : 0;

  /** Twelve points ending on the current value, shaped like the main curve. */
  const sparkOf = (total: number, seed: number): number[] => {
    const weights = Array.from({ length: 12 }, (_, i) => 0.82 + (i / 11) * 0.3 + (noise(i + seed) - 0.5) * 0.22);
    return distribute(Math.max(total, 12), weights);
  };

  type KpiSeed = Omit<KpiDatum, "change" | "changeUnit" | "trend">;
  const kpis: KpiDatum[] = ([
    { id: "revenue", value: revenue, previous: previousRevenue, format: "currency", lead: true, spark: sparkOf(revenue, 11) },
    { id: "orders", value: orders, previous: previousOrders, format: "count", lead: true, spark: sparkOf(orders, 23) },
    { id: "aov", value: aov, previous: previousAov, format: "currency", spark: sparkOf(Math.round(aov * 12), 31) },
    { id: "units", value: units, previous: previousUnits, format: "count", spark: sparkOf(units, 43) },
    { id: "newCustomers", value: newCustomers, previous: previousNew, format: "count", spark: sparkOf(newCustomers, 57) },
    { id: "returningCustomers", value: returningCustomers, previous: previousReturning, format: "count", spark: sparkOf(returningCustomers, 67) },
    { id: "enrollments", value: enrollments, previous: previousEnrollments, format: "count", spark: sparkOf(enrollments, 79) },
    { id: "completionRate", value: completionRate, previous: previousCompletion, format: "percent", spark: sparkOf(Math.round(completionRate), 91) },
  ] as KpiSeed[]).map((kpi) => {
    const points = kpi.format === "percent";
    const change = points
      ? Math.round((kpi.value - kpi.previous) * 10) / 10
      : pct(kpi.value, kpi.previous);
    return {
      ...kpi,
      change,
      changeUnit: points ? "points" : ("percent" as const),
      trend: trendOf(change),
    };
  });

  /* --- revenue breakdown -------------------------------------------------- */
  const visibleCategories = REVENUE_CATEGORIES.filter((id) => {
    if (filters.category !== "all") return id === filters.category;
    if (filters.course !== "all") return id === "training";
    if (filters.product !== "all") {
      const product = ADMIN_PRODUCTS.find((p) => p.id === filters.product);
      return product ? CATALOG_BUCKET[product.categoryId] === id : false;
    }
    return true;
  });
  const categoryRevenue = distribute(revenue, visibleCategories.map((id) => CATEGORY_MIX[id].revenue));
  const breakdown: CategoryDatum[] = visibleCategories.map((id, i) => ({
    id,
    revenue: categoryRevenue[i],
    orders: Math.round(orders * (visibleCategories.length === 1 ? 1 : CATEGORY_MIX[id].orders)),
    share: revenue > 0 ? Math.round((categoryRevenue[i] / revenue) * 1000) / 10 : 0,
  }));

  /* --- products ----------------------------------------------------------- */
  const products: ProductDatum[] = PRODUCT_SEEDS.flatMap((seed) => {
    const product = ADMIN_PRODUCTS.find((p) => p.id === seed.id);
    if (!product) return [];
    const bucket = CATALOG_BUCKET[product.categoryId];
    if (filters.category !== "all" && filters.category !== bucket) return [];
    if (filters.product !== "all" && filters.product !== seed.id) return [];
    if (filters.course !== "all") return [];
    const productUnits = Math.max(0, Math.round(seed.units * windowFactor * scale.units));
    if (productUnits === 0) return [];
    return [{
      id: seed.id,
      name: product.name,
      bucket,
      category: product.categoryId,
      thumbnail: product.media[0]?.src,
      alt: product.media[0]?.alt ?? { fr: "", en: "" },
      units: productUnits,
      revenue: Math.round(productUnits * (product.promoPrice ?? product.price)),
      orders: Math.max(1, Math.round(seed.orders * windowFactor * scale.orders)),
      conversion: seed.conversion,
      change: seed.change,
      stock: stockState(product),
    }];
  });

  /* --- customers ---------------------------------------------------------- */
  const totalCustomers = filters.country === "all" ? BASE.totalCustomers : GEO_SEEDS[filters.country].customers;
  const growthAdded = distribute(newCustomers, shape.map((b) => b.weight));
  let running = Math.max(0, totalCustomers - newCustomers);
  const growth = shape.map((bucket, i) => {
    running += growthAdded[i];
    return { key: bucket.key, total: running, added: growthAdded[i] };
  });

  const customers: CustomerStats = {
    total: totalCustomers,
    new: newCustomers,
    returning: returningCustomers,
    repeatRate: orders > 0 ? Math.round((returningCustomers / orders) * 1000) / 10 : 0,
    lifetimeValue: Math.round(BASE.lifetimeValue * (aov > 0 ? aov / 71.08 : 1)),
    lifetimeOrders: BASE.lifetimeOrders,
    growth,
  };

  /* --- training ----------------------------------------------------------- */
  const courseRows: CourseDatum[] = COURSE_SEEDS.flatMap((seed) => {
    if (filters.course !== "all" && filters.course !== seed.id) return [];
    if (filters.category !== "all" && filters.category !== "training") return [];
    if (filters.product !== "all") return [];
    const course = COURSES.find((c) => c.id === seed.id);
    if (!course) return [];
    const seats = Math.round(seed.enrollments * windowFactor * scale.training);
    if (seats === 0) return [];
    return [{
      id: seed.id,
      title: course.title,
      level: course.level,
      enrollments: seats,
      completionRate: seed.completionRate,
      averageScore: seed.averageScore,
      revenue: Math.round(seed.revenue * windowFactor * scale.training),
      days: seed.days,
    }];
  });

  const training: TrainingStats = {
    enrollments,
    activeLearners: Math.round(BASE.activeLearners * windowFactor * scale.training),
    completed: Math.round(BASE.completedCourses * windowFactor * scale.training),
    completionRate,
    averageScore: courseRows.length
      ? Math.round(courseRows.reduce((sum, c) => sum + c.averageScore * c.enrollments, 0) / Math.max(1, courseRows.reduce((sum, c) => sum + c.enrollments, 0)))
      : BASE.averageScore,
    daysToComplete: BASE.daysToComplete,
    courses: courseRows,
  };

  /* --- orders ------------------------------------------------------------- */
  const statusIds = filters.orderStatus === "all" ? ORDER_STATUS_IDS : [filters.orderStatus];
  const statusOrders = distribute(orders, statusIds.map((id) => ORDER_MIX[id].orders));
  const orderStats: OrderStats = {
    total: orders,
    statuses: statusIds.map((id, i) => ({
      id,
      orders: statusOrders[i],
      share: orders > 0 ? Math.round((statusOrders[i] / orders) * 1000) / 10 : 0,
    })),
    processingHours: BASE.processingHours,
    refundRate: orders > 0
      ? Math.round(((statusIds.includes("refunded") ? statusOrders[statusIds.indexOf("refunded")] : 0) / orders) * 1000) / 10
      : 0,
    cancellationRate: orders > 0
      ? Math.round(((statusIds.includes("cancelled") ? statusOrders[statusIds.indexOf("cancelled")] : 0) / orders) * 1000) / 10
      : 0,
  };

  /* --- geography ---------------------------------------------------------- */
  const geoIds = filters.country === "all" ? COUNTRY_IDS : [filters.country];
  const geoRevenue = distribute(revenue, geoIds.map((id) => GEO_SEEDS[id].revenue));
  const geoOrders = distribute(orders, geoIds.map((id) => GEO_SEEDS[id].orders));
  const geo: GeoDatum[] = geoIds.map((id, i) => ({
    id,
    revenue: geoRevenue[i],
    orders: geoOrders[i],
    customers: GEO_SEEDS[id].customers,
    share: revenue > 0 ? Math.round((geoRevenue[i] / revenue) * 1000) / 10 : 0,
  }));

  /* --- insights ----------------------------------------------------------- */
  const kit = products.find((p) => p.bucket === "kits");
  // Two cards about the same product is a shorter report, not a richer one.
  const best = [...products]
    .filter((product) => product.id !== kit?.id)
    .sort((a, b) => b.change - a.change)[0];
  const enrollmentChange = kpis.find((k) => k.id === "enrollments")?.change ?? 0;
  const insights: InsightDatum[] = [];
  if (best && best.change > 0) {
    insights.push({ id: "topProduct", tone: "positive", values: { name: best.id, change: best.change } });
  }
  if (orders > 0) {
    insights.push({ id: "returning", tone: "neutral", values: { share: customers.repeatRate } });
  }
  if (products.some((p) => p.bucket === "aftercare") && products.some((p) => p.bucket === "jewelry")) {
    insights.push({ id: "bundle", tone: "neutral", values: { share: 38 } });
  }
  if (kit) {
    insights.push({ id: "kit", tone: "positive", values: { name: kit.id, revenue: kit.revenue } });
  }
  if (enrollments > 0) {
    insights.push({
      id: "courses",
      tone: enrollmentChange >= 0 ? "positive" : "attention",
      values: { change: Math.abs(enrollmentChange) },
    });
  }
  const laggard = [...products].sort((a, b) => a.change - b.change)[0];
  if (laggard && laggard.change < 0) {
    insights.push({ id: "slowing", tone: "attention", values: { name: laggard.id, change: Math.abs(laggard.change) } });
  }

  /* --- ecosystem ---------------------------------------------------------- */
  // The ecosystem figures are ratios the store has measured over time rather
  // than sums of the window, so they hold their shape as the window changes —
  // only the benchmarks they are read against move with it.
  const cross: CrossDatum[] = [
    { id: "aftercareFollowUp", value: 38, format: "percent" },
    { id: "trainedBuyers", value: 11, format: "percent" },
    { id: "graduateAov", value: Math.round(aov * 1.66), format: "currency", benchmark: Math.round(aov) },
    { id: "graduateRepeat", value: 47, format: "percent", benchmark: customers.repeatRate },
  ];

  return {
    range: filters.range,
    start: spec.start,
    end: spec.end,
    step: spec.step,
    hasData,
    kpis,
    series,
    breakdown,
    products,
    customers,
    training,
    orders: orderStats,
    geo,
    insights: insights.slice(0, 5),
    cross,
  };
}

/** Options for the product filter, in catalogue order. */
export function analyticsProductOptions(): { id: string; name: Localized }[] {
  return PRODUCT_SEEDS.flatMap((seed) => {
    const product = ADMIN_PRODUCTS.find((p) => p.id === seed.id);
    return product ? [{ id: product.id, name: product.name }] : [];
  });
}

/** Options for the course filter. */
export function analyticsCourseOptions(): { id: string; title: Localized }[] {
  return COURSE_SEEDS.flatMap((seed) => {
    const course = COURSES.find((c) => c.id === seed.id);
    return course ? [{ id: course.id, title: course.title }] : [];
  });
}
