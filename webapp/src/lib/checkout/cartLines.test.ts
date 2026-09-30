import { describe, expect, it } from "vitest";
import { addToLines, cartCount, cartSubtotal, checkoutItems, MAX_LINE_QTY, setLineQty, type CartLine } from "./cartLines";

const gel: Omit<CartLine, "id"> = {
  productId: "gel-de-suivi",
  dbProductId: "0b5e6a52-7d0c-4a55-9d7e-1f6f6b2c1a01",
  name: "Gel",
  image: "/g.jpg",
  unitPrice: 1990,
  currency: "EUR",
  qty: 1,
};
const strass = { ...gel, productId: "strass", dbProductId: "p2", variantId: "v-ss6", variant: "SS6 · 20", unitPrice: 1250 };

describe("cart lines", () => {
  it("merges the same product and variant, keeps variants apart", () => {
    let lines = addToLines([], gel);
    lines = addToLines(lines, { ...gel, qty: 2 });
    lines = addToLines(lines, strass);
    lines = addToLines(lines, { ...strass, variantId: "v-ss10", variant: "SS10 · 20" });
    expect(lines.map((l) => [l.id, l.qty])).toEqual([
      ["gel-de-suivi::", 3],
      ["strass::v-ss6", 1],
      ["strass::v-ss10", 1],
    ]);
  });

  it("adds up in integer minor units (no float drift)", () => {
    const lines = addToLines(addToLines([], { ...gel, unitPrice: 10, qty: 3 }), { ...strass, unitPrice: 20, qty: 1 });
    expect(cartSubtotal(lines)).toBe(50);
    expect(cartCount(lines)).toBe(4);
    const many = Array.from({ length: 10 }, (_, i) => ({ ...gel, id: `x${i}`, unitPrice: 10, qty: 1 }));
    expect(cartSubtotal(many)).toBe(100); // 0.1 × 10 in floats would not be exactly 1
  });

  it("caps quantities to what the checkout accepts and removes at zero", () => {
    let lines = addToLines([], { ...gel, qty: MAX_LINE_QTY });
    lines = addToLines(lines, gel);
    expect(lines[0].qty).toBe(MAX_LINE_QTY);
    expect(setLineQty(lines, lines[0].id, 0)).toEqual([]);
  });

  it("sends identifiers and quantities only, or nothing for a line outside the database catalogue", () => {
    const lines = addToLines(addToLines([], { ...gel, qty: 2 }), strass);
    expect(checkoutItems(lines)).toEqual([
      { product_id: gel.dbProductId, variant_id: null, quantity: 2 },
      { product_id: "p2", variant_id: "v-ss6", quantity: 1 },
    ]);
    const { dbProductId: _db, ...mockLine } = gel;
    expect(checkoutItems(addToLines(lines, { ...mockLine, productId: "aurora-heart" }))).toBeNull();
  });
});
