import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { Localized } from "../data/types";
import {
  DEFAULT_FILTERS,
  ORDER_STATUS_IDS,
  RANGE_IDS,
  SHOP_CATEGORIES,
  SHOP_CURRENCY,
  SHOP_TIME_ZONE,
  type AnalyticsFilters,
  type AnalyticsSnapshot,
  type BucketStep,
  type CustomerTypeId,
  type OrderStatusId,
  type ProductDatum,
  type RangeId,
  type ShopCategoryId,
} from "../data/adminAnalytics";
import {
  assembleSnapshot,
  dayIn,
  mapShopSnapshot,
  periodInstants,
  periodOf,
  previousPeriod,
  rpcFilters,
  type Period,
} from "./adminAnalyticsMapping";
import {
  buildTraining,
  type ActivityRow,
  type CompletionRow,
  type CourseInfo,
  type CourseLineRow,
  type EntitlementRow,
} from "./adminAnalyticsTraining";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import { productMediaUrl } from "./supabase/storage";

/**
 * The Statistics screen's single persistence boundary (screens never call
 * Supabase) and its URL state.
 *
 * Reads, all under the signed-in staff member's JWT:
 * - `analytics_snapshot()` for the shop (needs `view_statistics`; the function
 *   refuses anyone else with 42501);
 * - the Academy rows staff read under RLS, aggregated by
 *   `adminAnalyticsTraining.ts` (the snapshot leaves training `null`);
 * - product and course names in both languages, the shipping countries (filter
 *   options).
 *
 * Filters travel in the URL: a filtered report is a link an administrator
 * sends to a colleague. Without Supabase (local mock mode) the screen says the
 * figures are unavailable: it never shows invented ones.
 */

/** URL parameter names, in French like every other route in the app. */
export const PARAM = {
  range: "periode",
  category: "categorie",
  product: "produit",
  customerType: "client",
  country: "pays",
  orderStatus: "statut",
  compare: "comparer",
  metric: "metrique",
  from: "du",
  to: "au",
} as const;

export type ChartMetric = "revenue" | "orders" | "both";
export const CHART_METRICS: ChartMetric[] = ["revenue", "orders", "both"];

export type ProductSortKey = "revenue" | "units" | "orders";
export const PRODUCT_SORT_KEYS: ProductSortKey[] = ["revenue", "units", "orders"];

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Guards the date inputs: anything that is not a plain ISO day is ignored. */
function isoDay(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readFilters(params: URLSearchParams): AnalyticsFilters {
  const product = params.get(PARAM.product)?.toLowerCase() ?? "";
  const country = params.get(PARAM.country)?.toUpperCase() ?? "";
  return {
    range: oneOf<RangeId>(params.get(PARAM.range), RANGE_IDS, DEFAULT_FILTERS.range),
    customFrom: isoDay(params.get(PARAM.from)),
    customTo: isoDay(params.get(PARAM.to)),
    category: oneOf<ShopCategoryId | "all">(params.get(PARAM.category), [...SHOP_CATEGORIES, "all"], "all"),
    product: UUID.test(product) ? product : "all",
    customerType: oneOf<CustomerTypeId | "all">(params.get(PARAM.customerType), ["new", "returning", "all"], "all"),
    country: /^[A-Z]{2}$/.test(country) ? country : "all",
    orderStatus: oneOf<OrderStatusId | "all">(params.get(PARAM.orderStatus), [...ORDER_STATUS_IDS, "all"], "all"),
  };
}

export function readCompare(params: URLSearchParams): boolean {
  return params.get(PARAM.compare) === "1";
}

export function readMetric(params: URLSearchParams): ChartMetric {
  return oneOf<ChartMetric>(params.get(PARAM.metric), CHART_METRICS, "revenue");
}

/** Today in the shop's time zone (the day the database reports in). */
export function shopToday(now: Date = new Date()): string {
  return dayIn(now, SHOP_TIME_ZONE);
}

/* ------------------------------------------------------------------ the reads */

/** PostgREST answers at most this many rows per request. */
const PAGE_ROWS = 1000;

type PageQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;

/** Every row of a read, page by page, so nothing is silently cut off. */
async function readAll<T>(query: PageQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await query(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}

interface TranslationRow {
  locale: string;
  name?: string;
  title?: string;
  status: string;
}

/** French base name + the published English one (French when there is none). */
function localized(base: string, translations: TranslationRow[] | null, field: "name" | "title"): Localized {
  const en = (translations ?? []).find((row) => row.locale === "en" && row.status === "published")?.[field];
  return { fr: base, en: en || base };
}

export interface AnalyticsOptions {
  products: { id: string; name: Localized }[];
  courses: CourseInfo[];
  /** ISO codes of the shipping zones' countries. */
  countries: string[];
}

const EMPTY_OPTIONS: AnalyticsOptions = { products: [], courses: [], countries: [] };

async function readOptions(signal: AbortSignal): Promise<AnalyticsOptions> {
  const client = requireSupabase();
  type ProductRow = { id: string; name: string; product_translations: TranslationRow[] | null };
  type CourseRow = { id: string; title: string; level: string; course_translations: TranslationRow[] | null };
  const [products, courses, countries] = await Promise.all([
    readAll<ProductRow>((from, to) =>
      client
        .from("products")
        .select("id, name, product_translations(locale, name, status)")
        .neq("product_type", "gift_card")
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal) as unknown as PromiseLike<{ data: ProductRow[] | null; error: unknown }>,
    ),
    readAll<CourseRow>((from, to) =>
      client
        .from("courses")
        .select("id, title, level, course_translations(locale, title, status)")
        .order("title", { ascending: true })
        .range(from, to)
        .abortSignal(signal) as unknown as PromiseLike<{ data: CourseRow[] | null; error: unknown }>,
    ),
    readAll<{ country_code: string }>((from, to) =>
      client.from("shipping_zone_countries").select("country_code").order("country_code").range(from, to).abortSignal(signal),
    ),
  ]);
  return {
    products: products.map((row) => ({ id: row.id, name: localized(row.name, row.product_translations, "name") })),
    courses: courses.map((row) => ({
      id: row.id,
      title: localized(row.title, row.course_translations, "title"),
      level: row.level,
    })),
    countries: [...new Set(countries.map((row) => row.country_code.toUpperCase()))],
  };
}

const PAID = ["paid", "partially_refunded", "refunded"];

async function readSnapshot(
  filters: AnalyticsFilters,
  period: Period,
  options: AnalyticsOptions,
  signal: AbortSignal,
): Promise<AnalyticsSnapshot> {
  const client = requireSupabase();
  const current = periodInstants(period, SHOP_TIME_ZONE);
  const previous = periodInstants(previousPeriod(period), SHOP_TIME_ZONE);
  const startIso = current.start.toISOString();
  const endIso = current.end.toISOString();

  const [snapshot, entitlements, completions, lessons, quizzes, courseLines] = await Promise.all([
    client
      .rpc("analytics_snapshot", {
        p_from: period.from,
        p_to: period.to,
        p_filters: rpcFilters(filters),
        p_currency: SHOP_CURRENCY,
        p_timezone: SHOP_TIME_ZONE,
      })
      .abortSignal(signal),
    readAll<EntitlementRow>((from, to) =>
      client
        .from("course_entitlements")
        .select("user_id, course_id, starts_at, revoked_at")
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll<CompletionRow>((from, to) =>
      client
        .from("course_completions")
        .select("user_id, course_id, completed_at, average_score")
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll<ActivityRow>((from, to) =>
      client
        .from("lesson_progress")
        .select("user_id")
        .gte("completed_at", startIso)
        .lt("completed_at", endIso)
        .order("completed_at", { ascending: true })
        .order("step_id", { ascending: true })
        .order("user_id", { ascending: true })
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll<ActivityRow>((from, to) =>
      client
        .from("quiz_attempts")
        .select("user_id")
        .gte("submitted_at", startIso)
        .lt("submitted_at", endIso)
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll<CourseLineRow>((from, to) =>
      client
        .from("order_items")
        .select("course_id, subtotal_amount, discount_amount, orders!inner(paid_at)")
        .not("course_id", "is", null)
        .gte("orders.paid_at", startIso)
        .lt("orders.paid_at", endIso)
        .in("orders.payment_status", PAID)
        .eq("orders.currency", SHOP_CURRENCY)
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal) as unknown as PromiseLike<{ data: CourseLineRow[] | null; error: unknown }>,
    ),
  ]);
  if (snapshot.error) throw snapshot.error;

  const productNames = new Map(options.products.map((product) => [product.id, product.name]));
  const shop = mapShopSnapshot({
    raw: snapshot.data,
    productNames,
    mediaUrl: (path) => productMediaUrl(path, client),
  });
  const { training, kpis } = buildTraining(
    { entitlements, completions, activity: [...lessons, ...quizzes], courseLines, courses: options.courses },
    current,
    previous,
  );
  return assembleSnapshot({ ...shop, hasData: shop.hasData || training.enrollments > 0 }, training, kpis);
}

/* ------------------------------------------------------------- the controller */

/**
 * - `loading`: the first read, or a new period / filter set, is on its way;
 * - `error`: the read failed (the last figures are not shown as current);
 * - `invalidRange`: a custom period longer than the database accepts;
 * - `unavailable`: no database (local mock mode).
 */
export type LoadState = "ready" | "loading" | "error" | "invalidRange" | "unavailable";

export interface AnalyticsController {
  snapshot: AnalyticsSnapshot | null;
  options: AnalyticsOptions;
  /** The days the filters stand for; null when the custom period is too long. */
  period: Period | null;
  state: LoadState;
  /** When the figures on screen were read; null before the first answer. */
  fetchedAt: Date | null;
  /** `done` fires once fresh figures are back, so the page can confirm it. */
  refresh: (done?: (ok: boolean) => void) => void;
}

export function useAnalytics(filters: AnalyticsFilters): AnalyticsController {
  const [options, setOptions] = useState<AnalyticsOptions | null>(null);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** The last request that answered, and how: the loading state is derived from it. */
  const [answered, setAnswered] = useState<{ request: string; ok: boolean } | null>(null);
  /** The pending refresh's confirmation, read when the answer lands. */
  const onDone = useRef<((ok: boolean) => void) | null>(null);

  // The reads key off the filter values, not the object: the page rebuilds
  // the filters on every URL write.
  const key = JSON.stringify(filters);
  // "Today" is read again on a refresh, so a page left open overnight moves on.
  const [today, setToday] = useState(() => shopToday());
  const period = useMemo(() => periodOf(JSON.parse(key) as AnalyticsFilters, today), [key, today]);
  const request = `${key}#${attempt}`;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const controller = new AbortController();
    readOptions(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setOptions(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[admin statistics] options failed", error);
        // Names and filter lists are a convenience: the figures still load.
        setOptions(EMPTY_OPTIONS);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !options || !period) return;
    const controller = new AbortController();
    const settle = (ok: boolean) => {
      setAnswered({ request, ok });
      onDone.current?.(ok);
      onDone.current = null;
    };
    readSnapshot(JSON.parse(key) as AnalyticsFilters, period, options, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setFetchedAt(new Date());
        settle(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[admin statistics] load failed", error);
        settle(false);
      });
    return () => controller.abort();
  }, [key, period, options, request]);

  const refresh = useCallback((done?: (ok: boolean) => void) => {
    onDone.current = done ?? null;
    setToday(shopToday());
    setAttempt((n) => n + 1);
  }, []);

  const state: LoadState = !isSupabaseConfigured
    ? "unavailable"
    : !period
      ? "invalidRange"
      : answered?.request !== request
        ? "loading"
        : answered.ok
          ? "ready"
          : "error";

  return { snapshot, options: options ?? EMPTY_OPTIONS, period, state, fetchedAt, refresh };
}

/** Minutes since a moment, ticking once a minute, for the freshness stamp. */
export function useMinutesSince(moment: Date | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, [moment]);
  return moment ? Math.max(0, Math.floor((now - moment.getTime()) / 60_000)) : null;
}

/* ------------------------------------------------------------- presentation */

/**
 * Formats a bucket key for an axis, a tooltip or a table cell. Keys are the
 * shop's wall clock written as UTC instants, hence `timeZone: "UTC"`.
 */
export function useBucketLabel(step: BucketStep) {
  const { i18n, t } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en-IE" : "fr-FR";

  return useCallback(
    (iso: string, long = false): string => {
      const date = new Date(iso);
      switch (step) {
        case "hour":
          return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
        case "month":
          return new Intl.DateTimeFormat(locale, { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" }).format(date);
        case "week": {
          const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
          return long ? t("admin.stats.chart.weekOf", { date: day }) : day;
        }
        default:
          return new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: long ? "long" : "short",
            timeZone: "UTC",
          }).format(date);
      }
    },
    [step, locale, t],
  );
}

/** A country code in the UI language: "FR" → "France"; "" → the "unknown" label. */
export function useCountryName() {
  const { i18n, t } = useTranslation();
  const language = i18n.language?.startsWith("en") ? "en" : "fr";
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([language], { type: "region" });
    } catch {
      return null;
    }
  }, [language]);
  return useCallback(
    (code: string): string => {
      if (!code) return t("admin.stats.geo.unknown");
      try {
        return names?.of(code) ?? code;
      } catch {
        return code;
      }
    },
    [names, t],
  );
}

/** Same locale map as `lib/format.ts`, so every number on the page agrees. */
function numberLocale(): string {
  return i18n.language?.startsWith("en") ? "en-IE" : "fr-FR";
}

/** "+12.4 %" / "-2.3 %", with the sign always spelled out; "—" without a reference. */
export function formatChange(value: number | null, unit: "percent" | "points" = "percent"): string {
  if (value === null) return "—";
  const number = new Intl.NumberFormat(numberLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value);
  return unit === "points" ? `${number} pts` : `${number} %`;
}

/** A share or a rate, at one decimal: "25.1 %". */
export function formatPercent(value: number, decimals = 1): string {
  return `${new Intl.NumberFormat(numberLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)} %`;
}

/** Compact form for a chart axis, where "48 620" would collide: "48,6 k". */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(numberLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** The same for an amount in minor units, for a money axis. */
export function formatCompactMoney(minor: number, currency: string = SHOP_CURRENCY): string {
  return new Intl.NumberFormat(numberLocale(), {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(minor / 100);
}

export function sortProducts(rows: ProductDatum[], key: ProductSortKey, ascending: boolean): ProductDatum[] {
  const value = (row: ProductDatum) => row[key];
  return [...rows].sort((a, b) => (ascending ? value(a) - value(b) : value(b) - value(a)));
}
