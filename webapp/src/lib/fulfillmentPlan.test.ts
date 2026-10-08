import { describe, expect, it } from "vitest";
import type { AdminOrder } from "../data/adminOrders";
import {
  canCreateParcel,
  canRefund,
  lineBalances,
  minorToField,
  parseAmountToMinor,
  refundableMinor,
  suggestedRefundMinor,
} from "./fulfillmentPlan";

const line = (id: string, qty: number, unit: number, discount = 0, extra: object = {}) => ({
  id,
  qty,
  unitAmount: unit,
  totalAmount: unit * qty,
  discountAmount: discount,
  name: { fr: id, en: id },
  image: "",
  ...extra,
});

function order(overrides: Record<string, unknown> = {}): AdminOrder {
  return {
    reference: "GT-1",
    status: "confirmed",
    shippingMethod: "standard",
    payment: { status: "paid", method: "card", captured: 4000, refunded: 0 },
    lines: [line("a", 3, 1000), line("b", 1, 1000)],
    parcels: [],
    refunds: [],
    ...overrides,
  } as unknown as AdminOrder;
}

describe("lineBalances", () => {
  it("counts units in live parcels and in pending or succeeded refunds, not in released ones", () => {
    const balances = lineBalances(
      order({
        parcels: [
          { id: "p1", status: "shipped", items: [{ lineId: "a", qty: 1 }] },
          { id: "p2", status: "preparing", items: [{ lineId: "a", qty: 1 }] },
          { id: "p3", status: "cancelled", items: [{ lineId: "a", qty: 1 }] },
          { id: "p4", status: "lost", items: [{ lineId: "b", qty: 1 }] },
        ],
        refunds: [
          { status: "failed", amount: 1, items: [{ lineId: "b", qty: 1 }] },
          { status: "pending", amount: 1, items: [{ lineId: "a", qty: 1 }] },
        ],
      }),
    );
    expect(balances[0]).toMatchObject({ lineId: "a", inParcels: 2, refunded: 1, toShip: 0, refundable: 2 });
    expect(balances[1]).toMatchObject({ lineId: "b", inParcels: 0, refunded: 0, toShip: 1, refundable: 1 });
  });

  it("never offers a course or a gift card for a parcel", () => {
    const balances = lineBalances(order({ lines: [line("c", 1, 5000, 0, { courseId: "x" }), line("g", 1, 2000, 0, { giftCardDesign: "noir" })] }));
    expect(balances.map((b) => b.toShip)).toEqual([0, 0]);
    expect(balances.map((b) => b.refundable)).toEqual([1, 1]);
  });
});

describe("canCreateParcel", () => {
  it("needs a paid, standing, physical order with a unit left", () => {
    expect(canCreateParcel(order())).toBe(true);
    expect(canCreateParcel(order({ payment: { status: "pending", captured: 0, refunded: 0 } }))).toBe(false);
    expect(canCreateParcel(order({ status: "cancelled" }))).toBe(false);
    expect(canCreateParcel(order({ status: "refunded" }))).toBe(false);
    expect(canCreateParcel(order({ shippingMethod: "digital" }))).toBe(false);
    expect(
      canCreateParcel(order({ parcels: [{ id: "p", status: "shipped", items: [{ lineId: "a", qty: 3 }, { lineId: "b", qty: 1 }] }] })),
    ).toBe(false);
  });
});

describe("refundableMinor", () => {
  it("is what was collected less what was refunded less what pending refunds claim", () => {
    expect(refundableMinor(order())).toBe(4000);
    expect(refundableMinor(order({ payment: { status: "partiallyRefunded", captured: 4000, refunded: 500 } }))).toBe(3500);
    expect(
      refundableMinor(order({ refunds: [{ status: "pending", amount: 1000, items: [] }, { status: "failed", amount: 700, items: [] }] })),
    ).toBe(3000);
    expect(refundableMinor(order({ payment: { status: "paid", captured: 0, refunded: 0 } }))).toBe(0);
  });

  it("gates the refund button", () => {
    expect(canRefund(order())).toBe(true);
    expect(canRefund(order({ payment: { status: "refunded", captured: 4000, refunded: 4000 } }))).toBe(false);
    expect(canRefund(order({ status: "cancelled" }))).toBe(false);
  });
});

describe("suggestedRefundMinor", () => {
  it("is the net price of the units picked, in integer minor units", () => {
    // line a: 3 × 10.00 with a 3.00 share of discount → net 27.00, 1 unit = 9.00
    const discounted = order({ lines: [line("a", 3, 1000, 300), line("b", 1, 1000)], payment: { status: "paid", captured: 3700, refunded: 0 } });
    expect(suggestedRefundMinor(discounted, [{ lineId: "a", qty: 1 }])).toBe(900);
    expect(suggestedRefundMinor(discounted, [{ lineId: "a", qty: 3 }, { lineId: "b", qty: 1 }])).toBe(3700);
  });

  it("rounds half up without floats and is capped at what the card can return", () => {
    const odd = order({ lines: [line("a", 3, 1000, 100)], payment: { status: "paid", captured: 2900, refunded: 0 } });
    expect(suggestedRefundMinor(odd, [{ lineId: "a", qty: 1 }])).toBe(967); // 2900 / 3 = 966.67
    const capped = order({ payment: { status: "paid", captured: 500, refunded: 0 } });
    expect(suggestedRefundMinor(capped, [{ lineId: "a", qty: 3 }])).toBe(500);
    expect(suggestedRefundMinor(capped, [])).toBe(0);
    expect(suggestedRefundMinor(capped, [{ lineId: "ghost", qty: 1 }, { lineId: "a", qty: 0 }])).toBe(0);
  });
});

describe("parseAmountToMinor / minorToField", () => {
  it("reads a typed amount with a comma or a point, at most two decimals", () => {
    expect(parseAmountToMinor("12,50")).toBe(1250);
    expect(parseAmountToMinor("12.5")).toBe(1250);
    expect(parseAmountToMinor(" 12 ")).toBe(1200);
    expect(parseAmountToMinor("0.05")).toBe(5);
  });

  it("refuses zero, negatives, three decimals, and text", () => {
    for (const bad of ["", "0", "0,00", "-5", "1.234", "12e3", "abc", "1 000"]) expect(parseAmountToMinor(bad)).toBeNull();
  });

  it("writes a field value back", () => {
    expect(minorToField(1250)).toBe("12.50");
    expect(minorToField(5)).toBe("0.05");
    expect(parseAmountToMinor(minorToField(98765))).toBe(98765);
  });
});
