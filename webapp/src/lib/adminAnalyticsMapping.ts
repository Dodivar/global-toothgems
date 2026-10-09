import type { Localized } from "../data/types";
import type { StockState } from "../data/adminCatalog";
import {
  MAX_RANGE_DAYS,
  ORDER_STATUS_IDS,
  SHOP_CATEGORIES,
  type AnalyticsFilters,
  type AnalyticsSnapshot,
  type BucketStep,
  type CategoryDatum,
  type CrossDatum,
  type CustomerStats,
  type GeoDatum,
  type InsightDatum,
  type KpiDatum,
  type KpiId,
  type OrderStats,
  type OrderStatusId,
  type ProductDatum,
  type RevenueCategoryId,
  type TimePoint,
  type TrainingStats,
  type Trend,
} from "../data/adminAnalytics";
import { toMinorUnits } from "./catalog/money";

/**
 * Pure mapping of the Statistics screen: the period a filter set stands for,
 * the `analytics_snapshot()` JSON → `AnalyticsSnapshot`, the written insights
 * and the CSV export. No I/O here (see `adminAnalytics.ts`).
 */

/* ------------------------------------------------------------------- periods */

export interface Period {
  /** Inclusive ISO days in the shop's time zone. */
  from: string;
  to: string;
}

/** Today's calendar day in a time zone, `YYYY-MM-DD`. */
export function dayIn(now: Date, timeZone: string): string {
  // en-CA writes ISO-ordered dates.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The days a filter set reports on, or null when it cannot be asked of the
 * database (a custom period longer than `MAX_RANGE_DAYS`). An unset custom
 * bound falls back to the last 30 days; reversed bounds are put in order.
 */
export function periodOf(filters: Pick<AnalyticsFilters, "range" | "customFrom" | "customTo">, today: string): Period | null {
  switch (filters.range) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": {
      const a = ISO_DAY.test(filters.customFrom) ? filters.customFrom : addDays(today, -29);
      const b = ISO_DAY.test(filters.customTo) ? filters.customTo : today;
      const period = a <= b ? { from: a, to: b } : { from: b, to: a };
      return daysInclusive(period.from, period.to) > MAX_RANGE_DAYS ? null : period;
    }
    default:
      return { from: addDays(today, -29), to: today };
  }
}

/** The period of the same length immediately before (as the database compares). */
export function previousPeriod(period: Period): Period {
  const length = daysInclusive(period.from, period.to);
  return { from: addDays(period.from, -length), to: addDays(period.from, -1) };
}

/** Offset of a time zone from UTC at an instant, in milliseconds. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return wall - Math.floor(instant / 1000) * 1000;
}

/** The instant a calendar day starts in a time zone (as `day::timestamp at time zone tz`). */
export function startOfDayIn(day: string, timeZone: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`);
  const first = wall - zoneOffset(wall, timeZone);
  return new Date(wall - zoneOffset(first, timeZone));
}

/** `[start, end)` instants of a period in a time zone. */
export function periodInstants(period: Period, timeZone: string): { start: Date; end: Date } {
  return { start: startOfDayIn(period.from, timeZone), end: startOfDayIn(addDays(period.to, 1), timeZone) };
}

/* --------------------------------------------------------------- JSON reading */

type Json = unknown;
type JsonObject = Record<string, Json>;

function object(value: Json): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function list(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

function number(value: Json): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function numberOrNull(value: Json): number | null {
  return value === null || value === undefined ? null : number(value);
}

function text(value: Json): string {
  return typeof value === "string" ? value : "";
}

/** A `numeric` amount of the snapshot, in minor units. */
function minor(value: Json): number {
  if (value === null || value === undefined || value === "") return 0;
  return toMinorUnits(typeof value === "string" ? value : number(value));
}

/** `2026-10-01T00:00:00` (shop wall clock) → `2026-10-01T00:00:00Z`, read with `timeZone: "UTC"`. */
function bucketKey(value: Json): string {
  const key = text(value);
  return /Z$|[+-]\d{2}:?\d{2}$/.test(key) ? key : `${key}Z`;
}

const STEPS: BucketStep[] = ["hour", "day", "week", "month"];
const STOCK: StockState[] = ["in_stock", "low_stock", "out_of_stock", "preorder"];
const BUCKETS: RevenueCategoryId[] = ["jewelry", "aftercare", "kits", "training", "other"];

function bucketOf(value: Json): RevenueCategoryId {
  const id = text(value) as RevenueCategoryId;
  return BUCKETS.includes(id) ? id : "other";
}

/* ------------------------------------------------------------------- KPIs */

/** Same rule as `private.analytics_kpi()`: under half a percent (or point) is flat. */
export function trendOf(change: number | null): Trend {
  if (change === null || Math.abs(change) < 0.5) return "flat";
  return change > 0 ? "up" : "down";
}

export function changeOf(value: number, previous: number, format: KpiDatum["format"]): number | null {
  if (format === "percent") return Math.round((value - previous) * 10) / 10;
  if (previous === 0) return null;
  return Math.round(((value - previous) / previous) * 1000) / 10;
}

export function kpiOf(
  id: KpiId,
  value: number,
  previous: number,
  format: KpiDatum["format"],
  spark: number[],
  lead = false,
): KpiDatum {
  const change = changeOf(value, previous, format);
  return {
    id,
    value,
    previous,
    change,
    changeUnit: format === "percent" ? "points" : "percent",
    format,
    trend: trendOf(change),
    spark,
    ...(lead ? { lead: true } : {}),
  };
}

const SHOP_KPIS: KpiId[] = ["revenue", "orders", "aov", "units", "newCustomers", "returningCustomers"];

function mapKpi(raw: Json): KpiDatum | null {
  const row = object(raw);
  const id = text(row.id) as KpiId;
  if (!SHOP_KPIS.includes(id)) return null;
  const format = row.format === "currency" || row.format === "percent" ? row.format : "count";
  const read = format === "currency" ? minor : number;
  const change = numberOrNull(row.change);
  return {
    id,
    value: read(row.value),
    previous: read(row.previous),
    change,
    changeUnit: row.changeUnit === "points" ? "points" : "percent",
    format,
    trend: trendOf(change),
    spark: list(row.spark).map(read),
    ...(row.lead === true ? { lead: true } : {}),
  };
}

/* ------------------------------------------------------------- the snapshot */

export interface ShopSnapshotSources {
  /** The JSON `analytics_snapshot()` returned. */
  raw: Json;
  /** Names of the best sellers in both languages; the snapshot carries the French one. */
  productNames: ReadonlyMap<string, Localized>;
  /** Public URL of a `product-media` path. */
  mediaUrl: (path: string) => string;
}

/** Everything of the snapshot the shop's figures make (training and insights are added after). */
export type ShopSnapshot = Omit<AnalyticsSnapshot, "training" | "insights">;

export function mapShopSnapshot({ raw, productNames, mediaUrl }: ShopSnapshotSources): ShopSnapshot {
  const root = object(raw);

  const kpis = list(root.kpis).flatMap((kpi) => {
    const mapped = mapKpi(kpi);
    return mapped ? [mapped] : [];
  });

  const series: TimePoint[] = list(root.series).map((point) => {
    const row = object(point);
    return {
      key: bucketKey(row.key),
      revenue: minor(row.revenue),
      orders: number(row.orders),
      previousRevenue: minor(row.previousRevenue),
      previousOrders: number(row.previousOrders),
    };
  });

  // Course lines never reach the shop's revenue: the training slice is always
  // empty, so it is left out rather than drawn as a misleading zero.
  const breakdown: CategoryDatum[] = list(root.breakdown)
    .map((slice) => {
      const row = object(slice);
      return { id: bucketOf(row.id), revenue: minor(row.revenue), orders: number(row.orders), share: number(row.share) };
    })
    .filter((slice) => (SHOP_CATEGORIES as RevenueCategoryId[]).includes(slice.id));

  const products: ProductDatum[] = list(root.products).map((product) => {
    const row = object(product);
    const id = text(row.id);
    const name = text(row.name);
    const thumbnail = text(row.thumbnail);
    const stock = text(row.stock) as StockState;
    return {
      id,
      name: productNames.get(id) ?? { fr: name, en: name },
      bucket: bucketOf(row.bucket),
      ...(thumbnail ? { thumbnail: mediaUrl(thumbnail) } : {}),
      units: number(row.units),
      revenue: minor(row.revenue),
      orders: number(row.orders),
      change: numberOrNull(row.change),
      stock: STOCK.includes(stock) ? stock : null,
    };
  });

  const c = object(root.customers);
  const customers: CustomerStats = {
    total: number(c.total),
    new: number(c.new),
    returning: number(c.returning),
    repeatRate: number(c.repeatRate),
    lifetimeValue: minor(c.lifetimeValue),
    lifetimeOrders: number(c.lifetimeOrders),
    growth: list(c.growth).map((point) => {
      const row = object(point);
      return { key: bucketKey(row.key), total: number(row.total), added: number(row.added) };
    }),
  };

  const o = object(root.orders);
  const statuses = new Map(
    list(o.statuses).map((status) => {
      const row = object(status);
      return [text(row.id), row] as const;
    }),
  );
  const orders: OrderStats = {
    total: number(o.total),
    statuses: ORDER_STATUS_IDS.map((id: OrderStatusId) => {
      const row = object(statuses.get(id));
      return { id, orders: number(row.orders), share: number(row.share) };
    }),
    processingHours: numberOrNull(o.processingHours),
    refundRate: number(o.refundRate),
    cancellationRate: number(o.cancellationRate),
  };

  const geo: GeoDatum[] = list(root.geo).map((country) => {
    const row = object(country);
    return {
      id: text(row.id),
      revenue: minor(row.revenue),
      orders: number(row.orders),
      customers: number(row.customers),
      share: number(row.share),
    };
  });

  const cross: CrossDatum[] = list(root.cross).map((figure) => {
    const row = object(figure);
    return { id: text(row.id), value: number(row.value), format: row.format === "currency" ? "currency" : "percent" };
  });

  const step = text(root.step) as BucketStep;
  return {
    start: text(root.start),
    end: text(root.end),
    step: STEPS.includes(step) ? step : "day",
    currency: text(root.currency) || "EUR",
    hasData: root.hasData === true,
    kpis,
    series,
    breakdown,
    products,
    customers,
    orders,
    geo,
    cross,
  };
}

/* ------------------------------------------------------------------ insights */

/**
 * What the figures add up to, in sentences. Every card is derived from the
 * snapshot the rest of the page is drawn from, so an insight cannot contradict
 * the chart beside it, and it disappears rather than lies when a filter
 * removes what it was about. At most five.
 */
export function deriveInsights(snapshot: Pick<AnalyticsSnapshot, "products" | "customers" | "kpis" | "cross" | "breakdown" | "orders">): InsightDatum[] {
  const insights: InsightDatum[] = [];
  const orders = snapshot.kpis.find((kpi) => kpi.id === "orders")?.value ?? 0;
  const products = snapshot.products;

  const kit = products.find((product) => product.bucket === "kits");
  // Two cards about the same product is a shorter report, not a richer one.
  const best = [...products]
    .filter((product) => product.id !== kit?.id && product.change !== null)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];
  if (best && (best.change ?? 0) > 0) {
    insights.push({ id: "topProduct", tone: "positive", name: best.name, change: best.change ?? 0 });
  }

  if (orders > 0) insights.push({ id: "returning", tone: "neutral", share: snapshot.customers.repeatRate });

  const jewelryOrders = snapshot.breakdown.find((slice) => slice.id === "jewelry")?.orders ?? 0;
  const attach = snapshot.cross.find((figure) => figure.id === "aftercareAttach");
  if (attach && jewelryOrders > 0 && attach.value > 0) {
    insights.push({ id: "bundle", tone: "neutral", share: attach.value });
  }

  if (kit && kit.revenue > 0) insights.push({ id: "kit", tone: "positive", name: kit.name, revenue: kit.revenue });

  const enrollments = snapshot.kpis.find((kpi) => kpi.id === "enrollments");
  if (enrollments && enrollments.value > 0 && enrollments.change !== null) {
    insights.push({
      id: "courses",
      tone: enrollments.change >= 0 ? "positive" : "attention",
      change: Math.abs(enrollments.change),
    });
  }

  const laggard = [...products]
    .filter((product) => product.change !== null && product.id !== best?.id)
    .sort((a, b) => (a.change ?? 0) - (b.change ?? 0))[0];
  if (laggard && (laggard.change ?? 0) < 0) {
    insights.push({ id: "slowing", tone: "attention", name: laggard.name, change: Math.abs(laggard.change ?? 0) });
  }

  return insights.slice(0, 5);
}

/* ------------------------------------------------------------------ assembly */

export function assembleSnapshot(shop: ShopSnapshot, training: TrainingStats, trainingKpis: KpiDatum[]): AnalyticsSnapshot {
  const kpis = [...shop.kpis, ...trainingKpis];
  const partial = { ...shop, kpis, training };
  return { ...partial, insights: deriveInsights(partial) };
}

/* -------------------------------------------------------------------- export */

/** One CSV cell: quoted when it holds the separator, a quote or a line break. */
function cell(value: string | number): string {
  const raw = String(value);
  return /[";\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/**
 * Rows as CSV for a spreadsheet: `;`-separated (French Excel reads it as
 * columns), CRLF line ends, with a BOM so accents survive the opening.
 */
export function toCsv(rows: (string | number)[][]): string {
  return `﻿${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}

/** Minor units as a plain decimal ("1234.50"), which every spreadsheet parses. */
export function csvAmount(minorUnits: number): string {
  const sign = minorUnits < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minorUnits));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** The parameters the snapshot takes (`p_filters`): only the narrowing filters, as the function validates them. */
export function rpcFilters(filters: AnalyticsFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.category !== "all") out.category = filters.category;
  if (filters.product !== "all") out.product = filters.product;
  if (filters.customerType !== "all") out.customerType = filters.customerType;
  if (filters.country !== "all") out.country = filters.country;
  if (filters.orderStatus !== "all") out.orderStatus = filters.orderStatus;
  return out;
}

/** A snapshot with nothing in it: what the skeletons are laid out over before the first answer. */
export function emptySnapshot(): AnalyticsSnapshot {
  return {
    start: "",
    end: "",
    step: "day",
    currency: "EUR",
    hasData: false,
    kpis: [],
    series: [],
    breakdown: [],
    products: [],
    customers: { total: 0, new: 0, returning: 0, repeatRate: 0, lifetimeValue: 0, lifetimeOrders: 0, growth: [] },
    training: { enrollments: 0, activeLearners: 0, completed: 0, completionRate: 0, averageScore: null, daysToComplete: null, courses: [] },
    orders: { total: 0, statuses: [], processingHours: null, refundRate: 0, cancellationRate: 0 },
    geo: [],
    insights: [],
    cross: [],
  };
}
