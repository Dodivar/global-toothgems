import { describe, expect, it } from "vitest";
import { addPromotionCode, guestQuoteEmail, lineDiscount, MAX_PROMOTION_CODES, normalizePromotionCode, quoteItems, quoteKey, readQuote } from "./basketQuote";
import type { BasketQuote } from "./basketQuote";
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
    // who is buying: per-customer promotion limits depend on it
    expect(quoteKey(items, [], null, false, "EUR", "user:u1")).not.toBe(base);
    expect(quoteKey(items, [], null, false, "EUR", "a@b.fr")).not.toBe(quoteKey(items, [], null, false, "EUR", "c@d.fr"));
  });

  it("gives the quote a guest's e-mail only once it is complete, never a signed-in customer's", () => {
    expect(guestQuoteEmail(false, "  Cleo@Example.FR ")).toBe("cleo@example.fr");
    expect(guestQuoteEmail(false, "cleo@exam")).toBeNull();
    expect(guestQuoteEmail(false, "")).toBeNull();
    expect(guestQuoteEmail(true, "cleo@example.fr")).toBeNull();
  });
});

describe("reading the quote", () => {
  it("converts the decimals to minor units exactly", () => {
    const result = readQuote({
      ok: true,
      goods_discount: 7.6,
      shipping_discount: 4.9,
      discounts: [{ label: "Spring", code: "SPRING", type: "percentage", goods_amount: 7.6, shipping_amount: 0 }],
      lines: [{ product_id: "p1", variant_id: null, discount_amount: 7.6 }, { product_id: "p2", variant_id: "v2", discount_amount: 0 }],
      gift_lines: [{ product_name: "Pouch", variant_name: null }],
      used_up: [{ label: "Noël 2026", max_uses: 1 }, { label: 42 }],
    });
    expect(result).toEqual({
      ok: true,
      quote: {
        goodsDiscount: 760,
        shippingDiscount: 490,
        discounts: [{ label: "Spring", code: "SPRING", type: "percentage", goods: 760, shipping: 0 }],
        lines: [{ productId: "p1", variantId: null, amount: 760 }],
        gifts: [{ name: "Pouch", variant: null }],
        usedUp: [{ label: "Noël 2026", maxUses: 1 }],
      },
    });
  });

  it("reads an answer without `used_up` (an older function) as nothing used up", () => {
    const result = readQuote({ ok: true, goods_discount: 0, shipping_discount: 0, discounts: [], lines: [], gift_lines: [] });
    expect(result.ok && result.quote.usedUp).toEqual([]);
  });

  it("maps the refusals the function knows, and anything else to unavailable", () => {
    expect(readQuote({ ok: false, error: "promotion_code_invalid" })).toEqual({ ok: false, error: "promotion_code_invalid" });
    expect(readQuote({ ok: false, error: "too_many_attempts" })).toEqual({ ok: false, error: "too_many_attempts" });
    expect(readQuote({ ok: false, error: "boom" })).toEqual({ ok: false, error: "unavailable" });
    expect(readQuote(null)).toEqual({ ok: false, error: "unavailable" });
    expect(readQuote({ ok: true, discounts: [{ nope: 1 }] })).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("lineDiscount (promotion shown on a basket line)", () => {
  const promo: BasketQuote = {
    goodsDiscount: 899,
    shippingDiscount: 0,
    discounts: [{ label: "Noël", code: null, type: "percentage", goods: 899, shipping: 0 }],
    lines: [{ productId: "p1", variantId: "v1", amount: 899 }],
    gifts: [],
    usedUp: [],
  };
  const reward: BasketQuote = { ...promo, goodsDiscount: 450, lines: [{ productId: "p1", variantId: "v1", amount: 450 }] };

  it("shows the promotion with the reward off and the reward's cut with it on", () => {
    expect(lineDiscount({ status: "ready", quote: promo }, "p1", "v1")).toBe(899);
    expect(lineDiscount({ status: "ready", quote: reward }, "p1", "v1")).toBe(450);
  });

  it("keeps the previous answer on the line while the new one loads, so the promotion does not vanish", () => {
    expect(lineDiscount({ status: "loading", previous: promo }, "p1", "v1")).toBe(899);
  });

  it("shows nothing without an answer, on error, or for another line", () => {
    expect(lineDiscount({ status: "loading", previous: null }, "p1", "v1")).toBe(0);
    expect(lineDiscount({ status: "error" }, "p1", "v1")).toBe(0);
    expect(lineDiscount({ status: "idle" }, "p1", "v1")).toBe(0);
    expect(lineDiscount({ status: "ready", quote: promo }, "p2", "v1")).toBe(0);
    expect(lineDiscount({ status: "ready", quote: promo }, "p1", null)).toBe(0);
  });
});
