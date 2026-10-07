import { describe, expect, it } from "vitest";
import { addPromotionCode, MAX_PROMOTION_CODES, normalizePromotionCode, quoteItems, quoteKey, readQuote } from "./basketQuote";
import type { CartLine } from "./cartLines";

const shop: CartLine = {
  id: "gel::",
  productId: "gel",
  dbProductId: "0b5e6a52-7d0c-4a55-9d7e-1f6f6b2c1a01",
  variantId: "9c1f0f9a-0c51-4a3a-8f0e-0d6a0c0e5a11",
  name: "Gel",
  image: "",
  unitPrice: 1900,
  currency: "EUR",
  qty: 2,
};

describe("promotion codes typed in the cart", () => {
  it("normalises to upper case and checks the shape the checkout function accepts", () => {
    expect(normalizePromotionCode(" welcome-15 ")).toBe("WELCOME-15");
    expect(normalizePromotionCode("bad code")).toBeNull();
    expect(normalizePromotionCode("")).toBeNull();
    expect(normalizePromotionCode("-LEADING")).toBeNull();
  });

  it("refuses duplicates and more than three codes", () => {
    expect(addPromotionCode([], "spring")).toEqual({ ok: true, codes: ["SPRING"] });
    expect(addPromotionCode(["SPRING"], "Spring")).toEqual({ ok: false, reason: "duplicate" });
    expect(addPromotionCode(["A1", "B2", "C3"].slice(0, MAX_PROMOTION_CODES), "D4")).toEqual({ ok: false, reason: "limit" });
    expect(addPromotionCode([], "no way!")).toEqual({ ok: false, reason: "format" });
  });
});

describe("quote items", () => {
  it("keeps shop goods only and sends identifiers and quantities", () => {
    const card: CartLine = { ...shop, id: "gc", giftCard: { recipientEmail: "a@b.fr", design: "x" } };
    const course: CartLine = { ...shop, id: "co", courseId: "c1" };
    expect(quoteItems([shop, card, course])).toEqual([{ product_id: shop.dbProductId, variant_id: shop.variantId, quantity: 2 }]);
  });

  it("gives no quote for a line the database does not know", () => {
    expect(quoteItems([{ ...shop, dbProductId: undefined }])).toBeNull();
  });

  it("changes key with anything the answer depends on", () => {
    const items = quoteItems([shop]) ?? [];
    const base = quoteKey(items, [], null, false, "EUR");
    expect(quoteKey(items, ["A1"], null, false, "EUR")).not.toBe(base);
    expect(quoteKey(items, [], "rate", false, "EUR")).not.toBe(base);
    expect(quoteKey(items, [], null, true, "EUR")).not.toBe(base);
  });
});

describe("reading the quote", () => {
  it("converts the decimals to minor units exactly", () => {
    const result = readQuote({
      ok: true,
      goods_discount: 7.6,
      shipping_discount: 4.9,
      discounts: [{ label: "Spring", code: "SPRING", type: "percentage", goods_amount: 7.6, shipping_amount: 0 }],
      gift_lines: [{ product_name: "Pouch", variant_name: null }],
    });
    expect(result).toEqual({
      ok: true,
      quote: {
        goodsDiscount: 760,
        shippingDiscount: 490,
        discounts: [{ label: "Spring", code: "SPRING", goods: 760, shipping: 0 }],
        gifts: [{ name: "Pouch", variant: null }],
      },
    });
  });

  it("maps the refusals the function knows, and anything else to unavailable", () => {
    expect(readQuote({ ok: false, error: "promotion_code_invalid" })).toEqual({ ok: false, error: "promotion_code_invalid" });
    expect(readQuote({ ok: false, error: "too_many_attempts" })).toEqual({ ok: false, error: "too_many_attempts" });
    expect(readQuote({ ok: false, error: "boom" })).toEqual({ ok: false, error: "unavailable" });
    expect(readQuote(null)).toEqual({ ok: false, error: "unavailable" });
    expect(readQuote({ ok: true, discounts: [{ nope: 1 }] })).toEqual({ ok: false, error: "unavailable" });
  });
});
