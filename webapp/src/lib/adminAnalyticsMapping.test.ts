import { describe, expect, it } from "vitest";
import {
  addDays,
  assembleSnapshot,
  csvAmount,
  dayIn,
  daysInclusive,
  deriveInsights,
  mapShopSnapshot,
  periodInstants,
  periodOf,
  previousPeriod,
  rpcFilters,
  startOfDayIn,
  toCsv,
} from "./adminAnalyticsMapping";
import { DEFAULT_FILTERS, type AnalyticsFilters } from "../data/adminAnalytics";

/** Trimmed from a real `analytics_snapshot()` answer. */
const RAW = {
  start: "2026-09-10",
  end: "2026-10-09",
  step: "day",
  currency: "EUR",
  hasData: true,
  kpis: [
    { id: "revenue", lead: true, spark: [0, 582.8, 249.0, 348.85], trend: "up", value: 1180.65, change: 731.4, format: "currency", previous: 142.0, changeUnit: "percent" },
    { id: "orders", lead: true, spark: [0, 8, 1, 2], trend: "up", value: 11, change: 1000.0, format: "count", previous: 1, changeUnit: "percent" },
    { id: "newCustomers", spark: [0, 1], trend: "flat", value: 1, change: null, format: "count", previous: 0, changeUnit: "percent" },
    { id: "somethingElse", value: 3, format: "count" },
  ],
  series: [{ key: "2026-09-10T00:00:00", orders: 2, revenue: 19.99, previousOrders: 1, previousRevenue: 0.1 }],
  breakdown: [
    { id: "jewelry", share: 56.7, orders: 9, revenue: 669.7 },
    { id: "aftercare", share: 0, orders: 0, revenue: 0 },
    { id: "kits", share: 43.3, orders: 3, revenue: 510.95 },
    { id: "training", share: 0, orders: 0, revenue: 0 },
    { id: "other", share: 0, orders: 0, revenue: 0 },
  ],
  products: [
    { id: "p-kit", name: "Kit d’Application Premium", stock: "in_stock", units: 2, bucket: "kits", change: null, orders: 2, revenue: 498.0, thumbnail: "products/kit/01.jpg" },
    { id: "p-gem", name: "Eclair en Or 18ct", stock: null, units: 10, bucket: "jewelry", change: 12.5, orders: 7, revenue: 445.0, thumbnail: null },
    { id: "p-mirror", name: "Miroir", stock: "in_stock", units: 1, bucket: "kits", change: -79.8, orders: 1, revenue: 12.95 },
  ],
  customers: {
    new: 1, total: 3, returning: 0, repeatRate: 90.9, lifetimeValue: 842.33, lifetimeOrders: 7.0,
    growth: [{ key: "2026-09-10T00:00:00", added: 0, total: 1 }],
  },
  orders: {
    total: 32,
    statuses: [
      { id: "completed", share: 59.4, orders: 19 },
      { id: "cancelled", share: 40.6, orders: 13 },
    ],
    refundRate: 0.0,
    processingHours: null,
    cancellationRate: 40.6,
  },
  geo: [{ id: "FR", share: 100.0, orders: 11, revenue: 1180.65, customers: 3 }],
  cross: [{ id: "aftercareAttach", value: 25.0, format: "percent" }],
  training: null,
  insights: [],
};

const map = () =>
  mapShopSnapshot({
    raw: RAW,
    productNames: new Map([["p-gem", { fr: "Eclair en Or 18ct", en: "18ct gold lightning" }]]),
    mediaUrl: (path) => `https://cdn.test/${path}`,
  });

describe("periods", () => {
  const filters = (patch: Partial<AnalyticsFilters>) => ({ ...DEFAULT_FILTERS, ...patch });

  it("reads the shop's calendar day in its time zone", () => {
    // 23:30 UTC on 9 October is already 10 October in Paris (UTC+2).
    expect(dayIn(new Date("2026-10-09T23:30:00Z"), "Europe/Paris")).toBe("2026-10-10");
  });

  it("turns each preset into inclusive days ending today", () => {
    expect(periodOf(filters({ range: "today" }), "2026-10-09")).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(periodOf(filters({ range: "7d" }), "2026-10-09")).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(periodOf(filters({ range: "30d" }), "2026-10-09")).toEqual({ from: "2026-09-10", to: "2026-10-09" });
    expect(periodOf(filters({ range: "90d" }), "2026-10-09")).toEqual({ from: "2026-07-12", to: "2026-10-09" });
    expect(periodOf(filters({ range: "year" }), "2026-10-09")).toEqual({ from: "2026-01-01", to: "2026-10-09" });
  });

  it("orders, defaults and bounds a custom period", () => {
    expect(periodOf(filters({ range: "custom", customFrom: "2026-08-15", customTo: "2026-07-01" }), "2026-10-09"))
      .toEqual({ from: "2026-07-01", to: "2026-08-15" });
    expect(periodOf(filters({ range: "custom" }), "2026-10-09")).toEqual({ from: "2026-09-10", to: "2026-10-09" });
    expect(periodOf(filters({ range: "custom", customFrom: "2025-01-01", customTo: "2026-10-09" }), "2026-10-09")).toBeNull();
    expect(daysInclusive("2026-01-01", "2026-02-04")).toBe(35);
  });

  it("compares with the same length immediately before", () => {
    expect(previousPeriod({ from: "2026-09-10", to: "2026-10-09" })).toEqual({ from: "2026-08-11", to: "2026-09-09" });
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("starts a day at the shop's midnight, across a DST change", () => {
    expect(startOfDayIn("2026-07-01", "Europe/Paris").toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(startOfDayIn("2026-12-01", "Europe/Paris").toISOString()).toBe("2026-11-30T23:00:00.000Z");
    const { start, end } = periodInstants({ from: "2026-10-25", to: "2026-10-25" }, "Europe/Paris");
    // The day the clocks go back lasts 25 hours.
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });
});

describe("mapShopSnapshot", () => {
  it("keeps money in minor units, exactly", () => {
    const snapshot = map();
    const revenue = snapshot.kpis.find((kpi) => kpi.id === "revenue");
    expect(revenue).toMatchObject({ value: 118065, previous: 14200, change: 731.4, trend: "up", lead: true });
    expect(revenue?.spark).toEqual([0, 58280, 24900, 34885]);
    expect(snapshot.series[0]).toEqual({ key: "2026-09-10T00:00:00Z", revenue: 1999, orders: 2, previousRevenue: 10, previousOrders: 1 });
    expect(snapshot.customers.lifetimeValue).toBe(84233);
    expect(snapshot.geo[0]).toEqual({ id: "FR", revenue: 118065, orders: 11, customers: 3, share: 100 });
  });

  it("drops unknown KPIs and keeps a missing reference as null", () => {
    const snapshot = map();
    expect(snapshot.kpis.map((kpi) => kpi.id)).toEqual(["revenue", "orders", "newCustomers"]);
    expect(snapshot.kpis[2]).toMatchObject({ change: null, trend: "flat" });
  });

  it("leaves the always-empty training slice out of the breakdown", () => {
    expect(map().breakdown.map((slice) => slice.id)).toEqual(["jewelry", "aftercare", "kits", "other"]);
  });

  it("names products in both languages and resolves their pictures", () => {
    const [kit, gem] = map().products;
    expect(kit).toMatchObject({ name: { fr: "Kit d’Application Premium", en: "Kit d’Application Premium" }, thumbnail: "https://cdn.test/products/kit/01.jpg", revenue: 49800, change: null, stock: "in_stock" });
    expect(gem).toMatchObject({ name: { fr: "Eclair en Or 18ct", en: "18ct gold lightning" }, stock: null });
    expect(gem.thumbnail).toBeUndefined();
  });

  it("lists every order status, in order, even when absent", () => {
    const orders = map().orders;
    expect(orders.statuses.map((status) => [status.id, status.orders])).toEqual([
      ["completed", 19],
      ["pending", 0],
      ["cancelled", 13],
      ["refunded", 0],
    ]);
    expect(orders.processingHours).toBeNull();
  });
});

describe("deriveInsights", () => {
  const training = { enrollments: 0, activeLearners: 0, completed: 0, completionRate: 0, averageScore: null, daysToComplete: null, courses: [] };

  it("derives the sentences from the figures on the page", () => {
    const snapshot = assembleSnapshot(map(), training, []);
    expect(snapshot.insights.map((insight) => insight.id)).toEqual(["topProduct", "returning", "bundle", "kit", "slowing"]);
    expect(snapshot.insights[0]).toMatchObject({ name: { en: "18ct gold lightning" }, change: 12.5 });
    expect(snapshot.insights[3]).toMatchObject({ revenue: 49800 });
    expect(snapshot.insights[4]).toMatchObject({ change: 79.8, tone: "attention" });
  });

  it("says nothing it cannot support", () => {
    const shop = map();
    expect(
      deriveInsights({ ...shop, products: [], kpis: [], cross: [], breakdown: [] }),
    ).toEqual([]);
  });
});

describe("export and parameters", () => {
  it("writes amounts as plain decimals and quotes what needs it", () => {
    expect(csvAmount(118065)).toBe("1180.65");
    expect(csvAmount(-5)).toBe("-0.05");
    expect(toCsv([["a;b", 'say "hi"', 3]])).toBe('﻿"a;b";"say ""hi""";3\r\n');
  });

  it("sends only the narrowing filters", () => {
    expect(rpcFilters(DEFAULT_FILTERS)).toEqual({});
    expect(rpcFilters({ ...DEFAULT_FILTERS, range: "7d", country: "BE", orderStatus: "refunded" })).toEqual({
      country: "BE",
      orderStatus: "refunded",
    });
  });
});
