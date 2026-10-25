import { describe, expect, it } from "vitest";
import type { AdminOrder } from "../data/adminOrders";
import { ORDER_EXPORT_COLUMNS, orderExportRows, ordersCsv, type OrderExportColumn } from "./adminOrderExport";

const headers = Object.fromEntries(ORDER_EXPORT_COLUMNS.map((c) => [c, c])) as Record<OrderExportColumn, string>;

const order = {
  reference: "GT-2026-0001",
  placedAt: "2026-09-30T09:58:00.000+00:00",
  status: "confirmed",
  payment: { status: "paid" },
  fulfillment: "unfulfilled",
  customer: { firstName: "Nora", lastName: "Lopez", email: "nora@example.com" },
  lines: [{ qty: 2 }, { qty: 1 }],
  currency: "EUR",
  amounts: { subtotal: 7480, discount: 500, shipping: 690, tax: 1150, total: 7670, giftCard: 1000, charged: 6670, refunded: 0 },
} as unknown as AdminOrder;

describe("orderExportRows", () => {
  it("starts with the headers and writes one row per order, amounts as decimals", () => {
    const rows = orderExportRows([order], headers);
    expect(rows[0]).toEqual([...ORDER_EXPORT_COLUMNS]);
    expect(rows[1]).toEqual([
      "GT-2026-0001",
      "2026-09-30",
      "confirmed",
      "paid",
      "unfulfilled",
      "Nora Lopez",
      "nora@example.com",
      3,
      "EUR",
      "74.80",
      "5.00",
      "6.90",
      "11.50",
      "76.70",
      "10.00",
      "66.70",
      "0.00",
    ]);
  });

  it("is a semicolon-separated CSV with a header line and a trailing line end", () => {
    const csv = ordersCsv([order], headers);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain("\r\nGT-2026-0001;2026-09-30;");
  });

  it("neutralises customer text a spreadsheet would run as a formula", () => {
    const hostile = { ...order, customer: { firstName: "=HYPERLINK(1)", lastName: "", email: "x@example.com" } } as unknown as AdminOrder;
    expect(orderExportRows([hostile], headers)[1][5]).toBe("'=HYPERLINK(1)");
  });
});
