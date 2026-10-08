import { describe, expect, it } from "vitest";
import type { AdminOrder } from "../data/adminOrders";
import { buildSalesSeries, lineKind, ordersToShip, readDashboardWindow, splinePath } from "./adminDashboard";

const NOW = new Date(2026, 9, 8, 15, 0); // 8 Oct 2026, local

function order(over: {
  at: string;
  total?: number;
  refunded?: number;
  payment?: AdminOrder["payment"]["status"];
  currency?: string;
  status?: AdminOrder["status"];
  fulfillment?: AdminOrder["fulfillment"];
  shippingMethod?: AdminOrder["shippingMethod"];
  lines?: Partial<AdminOrder["lines"][number]>[];
}): AdminOrder {
  return {
    reference: "GT-1",
    placedAt: over.at,
    status: over.status ?? "confirmed",
    fulfillment: over.fulfillment ?? "unfulfilled",
    shippingMethod: over.shippingMethod ?? "standard",
    currency: over.currency ?? "EUR",
    amounts: { total: over.total ?? 10_000 },
    payment: { status: over.payment ?? "paid", refunded: over.refunded ?? 0, captured: 0 },
    lines: (over.lines ?? [{ qty: 1 }]).map((l) => ({ qty: 1, ...l })),
  } as unknown as AdminOrder;
}

describe("buildSalesSeries", () => {
  it("makes one bucket per day, ending today", () => {
    const series = buildSalesSeries([], 7, NOW);
    expect(series.days).toHaveLength(7);
    expect(series.days[0].day).toBe("2026-10-02");
    expect(series.days[6].day).toBe("2026-10-08");
    expect(series.totals.averageBasket).toBeNull();
    expect(series.days.every((d) => d.averageBasket === null)).toBe(true);
  });

  it("sums revenue net of refunds and counts only orders holding money", () => {
    const series = buildSalesSeries(
      [
        order({ at: "2026-10-08T09:00:00+00:00", total: 10_000 }),
        order({ at: "2026-10-08T11:00:00+00:00", total: 5_000, refunded: 1_000, payment: "partiallyRefunded" }),
        order({ at: "2026-10-08T12:00:00+00:00", total: 9_999, payment: "pending" }),
        order({ at: "2026-10-08T12:00:00+00:00", total: 9_999, payment: "failed" }),
        order({ at: "2026-10-08T12:00:00+00:00", total: 9_999, payment: "refunded" }),
      ].map((o) => ({ ...o, placedAt: o.placedAt.replace("+00:00", "") })),
      7,
      NOW,
    );
    const today = series.days[6];
    expect(today.orders).toBe(2);
    expect(today.revenue).toBe(14_000);
    expect(today.averageBasket).toBe(7_000);
    expect(series.totals.revenue).toBe(14_000);
  });

  it("ignores other currencies and orders outside the window", () => {
    const series = buildSalesSeries(
      [
        order({ at: "2026-10-08T09:00:00", total: 1_000 }),
        order({ at: "2026-10-07T09:00:00", total: 2_000 }),
        order({ at: "2026-10-06T09:00:00", total: 700, currency: "USD" }),
        order({ at: "2026-09-01T09:00:00", total: 500 }),
      ],
      7,
      NOW,
    );
    expect(series.currency).toBe("EUR");
    expect(series.totals.revenue).toBe(3_000);
    expect(series.totals.orders).toBe(2);
  });

  it("splits products from courses and leaves gift cards out", () => {
    const series = buildSalesSeries(
      [
        order({
          at: "2026-10-08T09:00:00",
          lines: [{ qty: 2 }, { qty: 1, productId: "p" }, { qty: 1, courseId: "c" }, { qty: 3, giftCardDesign: "gold" }],
        }),
      ],
      14,
      NOW,
    );
    expect(series.totals.products).toBe(3);
    expect(series.totals.courses).toBe(1);
  });
});

describe("lineKind", () => {
  it("does not depend on the product still being in the shop", () => {
    expect(lineKind({})).toBe("product");
    expect(lineKind({ courseId: "c" })).toBe("course");
    expect(lineKind({ giftCardDesign: "x" })).toBe("giftCard");
  });
});

describe("ordersToShip", () => {
  it("keeps paid physical orders that are not shipped", () => {
    const todo = order({ at: "2026-10-08T09:00:00" });
    const result = ordersToShip([
      todo,
      order({ at: "2026-10-08T09:00:00", payment: "pending" }),
      order({ at: "2026-10-08T09:00:00", shippingMethod: "digital" }),
      order({ at: "2026-10-08T09:00:00", status: "shipped", fulfillment: "fulfilled" }),
      order({ at: "2026-10-08T09:00:00", status: "cancelled" }),
    ]);
    expect(result).toEqual([todo]);
  });
});

describe("readDashboardWindow", () => {
  it("accepts 7, 14 and 30 and falls back to 7", () => {
    expect(readDashboardWindow("14")).toBe(14);
    expect(readDashboardWindow("30")).toBe(30);
    expect(readDashboardWindow("9")).toBe(7);
    expect(readDashboardWindow(null)).toBe(7);
  });
});

describe("splinePath", () => {
  it("stays within the data's range (no overshoot)", () => {
    const d = splinePath([
      { x: 0, y: 100 },
      { x: 10, y: 100 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]);
    const ys = [...d.matchAll(/[MC ]?-?\d+\.\d+,(-?\d+\.\d+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it("breaks the line at a gap", () => {
    const d = splinePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, null, { x: 3, y: 2 }, { x: 4, y: 1 }]);
    expect(d.match(/M/g)).toHaveLength(2);
  });
});
