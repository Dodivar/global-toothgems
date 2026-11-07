import { describe, expect, it } from "vitest";
import type { Order, OrderStatus } from "../data/orders";
import { earnedCertificates, ordersOnTheirWay, showsStudioCard, summarizeFavorites } from "./memberDashboard";

const order = (reference: string, status: OrderStatus, ships = true): Order =>
  ({ reference, status, ships, payment: "paid", fulfilment: "unfulfilled" }) as Order;

describe("ordersOnTheirWay", () => {
  it("keeps the physical orders still to be delivered, in their order", () => {
    const orders = [
      order("A", "shipped"),
      order("B", "delivered"),
      order("C", "processing"),
      order("D", "confirmed", false),
      order("E", "cancelled"),
      order("F", "refunded"),
      order("G", "processing", false),
    ];
    expect(ordersOnTheirWay(orders).map((o) => o.reference)).toEqual(["A", "C"]);
  });

  it("is empty without orders", () => {
    expect(ordersOnTheirWay([])).toEqual([]);
  });
});

describe("summarizeFavorites", () => {
  it("counts the favourites on sale (still buyable) and nearly gone", () => {
    expect(
      summarizeFavorites([
        { price: 10, compareAtPrice: 12 },
        { price: 10, compareAtPrice: 12, stock: "out" },
        { price: 10, compareAtPrice: 10 },
        { price: 10, stock: "low" },
        { price: 10 },
      ]),
    ).toEqual({ total: 5, onSale: 1, lowStock: 1 });
  });
});

describe("earnedCertificates", () => {
  const entry = (id: string, issuesCertificate: boolean, completed: boolean, completedOn: string | null) => ({
    course: { id, issuesCertificate },
    progress: { completed, completedOn },
  });

  it("lists completed courses that issue a certificate, latest first, undated last", () => {
    const earned = earnedCertificates([
      entry("old", true, true, "2026-03-01"),
      entry("open", true, false, null),
      entry("noCert", false, true, "2026-09-01"),
      entry("undated", true, true, null),
      entry("new", true, true, "2026-10-01"),
    ]);
    expect(earned.map((e) => e.course.id)).toEqual(["new", "old", "undated"]);
  });
});

describe("showsStudioCard", () => {
  it("shows the card to members using the Studio or waiting for their plan, never as a pitch", () => {
    expect(showsStudioCard("trial_active")).toBe(true);
    expect(showsStudioCard("subscribed")).toBe(true);
    expect(showsStudioCard("staff")).toBe(true);
    expect(showsStudioCard("subscription_pending")).toBe(true);
    expect(showsStudioCard("not_started")).toBe(false);
    expect(showsStudioCard("trial_expired")).toBe(false);
    expect(showsStudioCard("subscription_ended")).toBe(false);
  });
});
