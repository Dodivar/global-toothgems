import { describe, expect, it } from "vitest";
import { applicableRates, freeShippingThreshold, pickRate, type ShippingRateRow } from "./shippingRates";

const row = (patch: Partial<ShippingRateRow>): ShippingRateRow => ({
  id: "r",
  kind: "standard",
  min_days: 2,
  max_days: 4,
  price: "4.90",
  currency: "EUR",
  free_over_amount: null,
  min_order_amount: null,
  max_order_amount: null,
  position: 1,
  ...patch,
});

// The seeded France zone.
const FRANCE = [
  row({ id: "std", price: "4.90", position: 1 }),
  row({ id: "exp", kind: "express", price: 9.9, min_days: 1, max_days: 2, position: 2 }),
  row({ id: "free", kind: "free", price: "0.00", min_order_amount: "75.00", position: 3 }),
  row({ id: "pickup", kind: "pickup", price: "0.00", min_days: 1, max_days: 1, position: 4 }),
];

describe("delivery options", () => {
  it("keeps the rates whose order bounds fit the basket, cheapest first", () => {
    expect(applicableRates(FRANCE, 5000, "EUR").map((o) => [o.id, o.price])).toEqual([
      ["pickup", 0],
      ["std", 490],
      ["exp", 990],
    ]);
    expect(applicableRates(FRANCE, 7500, "EUR").map((o) => o.id)).toEqual(["free", "pickup", "std", "exp"]);
  });

  it("applies free_over_amount and ignores other currencies and unknown kinds", () => {
    const eu = [row({ id: "eu", price: "8.90", free_over_amount: "120.00" }), row({ id: "gbp", currency: "GBP" }), row({ id: "x", kind: "drone" })];
    expect(applicableRates(eu, 11999, "EUR")).toMatchObject([{ id: "eu", price: 890, freeOver: 12000 }]);
    expect(applicableRates(eu, 12000, "EUR")).toMatchObject([{ id: "eu", price: 0 }]);
  });

  it("keeps the customer's choice while it applies", () => {
    const options = applicableRates(FRANCE, 5000, "EUR");
    expect(pickRate(options, "exp")).toBe("exp");
    expect(pickRate(options, "free")).toBe("pickup");
    expect(pickRate([], "exp")).toBeNull();
  });

  it("finds the lowest free-delivery threshold of the zone", () => {
    expect(freeShippingThreshold(FRANCE, "EUR")).toBe(7500);
    expect(freeShippingThreshold([row({ free_over_amount: "120.00" })], "EUR")).toBe(12000);
    expect(freeShippingThreshold([row({})], "EUR")).toBeNull();
  });
});
