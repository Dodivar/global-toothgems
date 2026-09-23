import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  DEFAULT_FILTERS,
  RANGE_IDS,
  REVENUE_CATEGORIES,
  COUNTRY_IDS,
  ORDER_STATUS_IDS,
  buildSnapshot,
  type AnalyticsFilters,
  type AnalyticsSnapshot,
  type BucketStep,
  type CountryId,
  type CustomerTypeId,
  type OrderStatusId,
  type ProductDatum,
  type RangeId,
  type RevenueCategoryId,
} from "../data/adminAnalytics";

/**
 * State and formatting for the Statistics screen.
 *
 * Filters travel in the URL, for the reason `adminOrderFilters.ts` gives: a
 * filtered report is a link an administrator sends to a colleague, and the back
 * button should return to the view they were reading rather than to the default
 * one.
 *
 * The fetch is simulated rather than faked away. Every range or filter change
 * spends a short beat in a loading state, which is what the skeletons on this
 * page are for — a dashboard that redraws instantly on a filter change teaches
 * an administrator nothing about what the real one will feel like.
 */

/** URL parameter names, in French like every other route in the app. */
export const PARAM = {
  range: "periode",
  category: "categorie",
  product: "produit",
  course: "formation",
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

export type ProductSortKey = "revenue" | "units" | "orders" | "conversion";
export const PRODUCT_SORT_KEYS: ProductSortKey[] = ["revenue", "units", "orders", "conversion"];

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Guards the date inputs: anything that is not a plain ISO day is ignored. */
function isoDay(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export function readFilters(params: URLSearchParams): AnalyticsFilters {
  return {
    range: oneOf<RangeId>(params.get(PARAM.range), RANGE_IDS, DEFAULT_FILTERS.range),
    customFrom: isoDay(params.get(PARAM.from), DEFAULT_FILTERS.customFrom),
    customTo: isoDay(params.get(PARAM.to), DEFAULT_FILTERS.customTo),
    category: oneOf<RevenueCategoryId | "all">(params.get(PARAM.category), [...REVENUE_CATEGORIES, "all"], "all"),
    product: params.get(PARAM.product) ?? "all",
    course: params.get(PARAM.course) ?? "all",
    customerType: oneOf<CustomerTypeId | "all">(params.get(PARAM.customerType), ["new", "returning", "all"], "all"),
    country: oneOf<CountryId | "all">(params.get(PARAM.country), [...COUNTRY_IDS, "all"], "all"),
    orderStatus: oneOf<OrderStatusId | "all">(params.get(PARAM.orderStatus), [...ORDER_STATUS_IDS, "all"], "all"),
  };
}

export function readCompare(params: URLSearchParams): boolean {
  return params.get(PARAM.compare) === "1";
}

export function readMetric(params: URLSearchParams): ChartMetric {
  return oneOf<ChartMetric>(params.get(PARAM.metric), CHART_METRICS, "revenue");
}

/* ------------------------------------------------------------------ the data */

export type LoadState = "ready" | "loading" | "error";

export interface AnalyticsController {
  snapshot: AnalyticsSnapshot;
  state: LoadState;
  /** Minutes since the figures were last pulled, for the freshness stamp. */
  updatedMinutesAgo: number;
  /** `done` fires once the figures are back, so the page can confirm it. */
  refresh: (done?: () => void) => void;
  /** Mockup affordance: shows the error state the real screen would have. */
  breakConnection: () => void;
}

/** How long a range or filter change spends showing skeletons. */
const SETTLE_MS = 320;
const REFRESH_MS = 620;
/** Where the freshness stamp starts, so the page opens with a plausible age. */
const INITIAL_AGE_MIN = 12;

export function useAnalytics(filters: AnalyticsFilters): AnalyticsController {
  const [state, setState] = useState<LoadState>("loading");
  const [updatedMinutesAgo, setAge] = useState(INITIAL_AGE_MIN);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The snapshot itself is pure, so it is recomputed rather than stored: there
  // is no cache to invalidate and no way for the page to show two different
  // answers to the same question.
  const snapshot = useMemo(() => buildSnapshot(filters), [filters]);
  // The effects below key off the filter values, not the object: the page
  // rebuilds the filters object on every URL write, and re-running the loading
  // beat because an unchanged object was re-created would flash the skeletons
  // for nothing.
  const key = JSON.stringify(filters);

  useEffect(() => {
    setState("loading");
    timer.current = setTimeout(() => setState("ready"), SETTLE_MS);
    return () => clearTimeout(timer.current);
  }, [key]);

  // The stamp ages on its own, so "updated 12 minutes ago" does not sit frozen
  // on a screen an administrator leaves open all afternoon.
  useEffect(() => {
    const tick = setInterval(() => setAge((value) => value + 1), 60_000);
    return () => clearInterval(tick);
  }, []);

  const refresh = useCallback((done?: () => void) => {
    clearTimeout(timer.current);
    setState("loading");
    timer.current = setTimeout(() => {
      setState("ready");
      setAge(0);
      done?.();
    }, REFRESH_MS);
  }, []);

  const breakConnection = useCallback(() => {
    clearTimeout(timer.current);
    setState("error");
  }, []);

  return { snapshot, state, updatedMinutesAgo, refresh, breakConnection };
}

/* ------------------------------------------------------------- presentation */

/**
 * Formats a bucket key for an axis, a tooltip or a table cell.
 *
 * The data module stores ISO instants and nothing else: how a bucket is named
 * depends on the administrator's language, which is not a thing a reporting
 * fixture can know.
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
          return new Intl.DateTimeFormat(locale, { month: long ? "long" : "short", timeZone: "UTC" }).format(date);
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

/** Same locale map as `lib/format.ts`, so every number on the page agrees. */
function numberLocale(): string {
  return i18n.language?.startsWith("en") ? "en-IE" : "fr-FR";
}

/** "+12.4 %" / "-2.3 %", with the sign always spelled out. */
export function formatChange(value: number, unit: "percent" | "points" = "percent"): string {
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

/** The same, in euros, for a money axis. */
export function formatCompactMoney(value: number): string {
  return new Intl.NumberFormat(numberLocale(), {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function sortProducts(rows: ProductDatum[], key: ProductSortKey, ascending: boolean): ProductDatum[] {
  const value = (row: ProductDatum) => row[key];
  return [...rows].sort((a, b) => (ascending ? value(a) - value(b) : value(b) - value(a)));
}
