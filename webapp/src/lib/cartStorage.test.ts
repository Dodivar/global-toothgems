import { describe, expect, it } from "vitest";
import { parseStoredCart } from "./cartStorage";

const line = { id: "a::", productId: "a", name: "Aurora", image: "/a.jpg", price: 49, qty: 2 };

describe("parseStoredCart", () => {
  it("reads back what was stored", () => {
    const lines = [line, { ...line, id: "b::x", productId: "b", variantId: "v1", variant: "2 mm", qty: 1 }];
    expect(parseStoredCart(JSON.stringify(lines))).toEqual(lines);
    expect(parseStoredCart("[]")).toEqual([]);
  });

  it("keeps nothing it cannot trust", () => {
    expect(parseStoredCart(null)).toBeNull();
    expect(parseStoredCart("not json")).toBeNull();
    expect(parseStoredCart(JSON.stringify({ lines: [line] }))).toBeNull();
    for (const bad of [{ qty: 0 }, { qty: 1.5 }, { price: -1 }, { price: "49" }, { id: "" }, { variant: 3 }]) {
      expect(parseStoredCart(JSON.stringify([line, { ...line, ...bad }])), JSON.stringify(bad)).toBeNull();
    }
  });

  it("drops unknown fields", () => {
    expect(parseStoredCart(JSON.stringify([{ ...line, total: 1 }]))).toEqual([line]);
  });
});
