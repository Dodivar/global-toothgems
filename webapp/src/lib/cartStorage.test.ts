import { describe, expect, it } from "vitest";
import { parseStoredCart } from "./cartStorage";

const line = { id: "a::", productId: "a", name: "Aurora", image: "/a.jpg", unitPrice: 4900, currency: "EUR", qty: 2 };

describe("parseStoredCart", () => {
  it("reads back what was stored", () => {
    const lines = [line, { ...line, id: "b::x", productId: "b", dbProductId: "p-uuid", variantId: "v1", variant: "2 mm", qty: 1 }];
    expect(parseStoredCart(JSON.stringify(lines))).toEqual(lines);
    expect(parseStoredCart("[]")).toEqual([]);
  });

  it("keeps nothing it cannot trust", () => {
    expect(parseStoredCart(null)).toBeNull();
    expect(parseStoredCart("not json")).toBeNull();
    expect(parseStoredCart(JSON.stringify({ lines: [line] }))).toBeNull();
    for (const bad of [{ qty: 0 }, { qty: 1.5 }, { qty: 1001 }, { unitPrice: -1 }, { unitPrice: 49.5 }, { unitPrice: "4900" }, { currency: "eur" }, { id: "" }, { variant: 3 }, { dbProductId: 1 }]) {
      expect(parseStoredCart(JSON.stringify([line, { ...line, ...bad }])), JSON.stringify(bad)).toBeNull();
    }
  });

  it("discards a cart stored before prices moved to minor units", () => {
    const { unitPrice: _unitPrice, currency: _currency, ...old } = line;
    expect(parseStoredCart(JSON.stringify([{ ...old, price: 49 }]))).toBeNull();
  });

  it("drops unknown fields", () => {
    expect(parseStoredCart(JSON.stringify([{ ...line, total: 1 }]))).toEqual([line]);
  });
});
