import { describe, expect, it } from "vitest";
import type { CartLine } from "./cartLines";
import { giftCardPayable, readGiftCardQuote, refusedGiftCodes } from "./giftCardQuote";

const gel: CartLine = { id: "gel::", productId: "gel", name: "Gel", image: "", unitPrice: 1900, currency: "EUR", qty: 2 };
const card: CartLine = {
  id: "gc::1",
  productId: "carte-cadeau",
  name: "Carte cadeau",
  image: "",
  unitPrice: 5000,
  currency: "EUR",
  qty: 1,
  giftCard: { recipientEmail: "bob@example.invalid", design: "classic" },
};

describe("gift card preview in the cart", () => {
  it("never lets the cards pay for gift cards bought in the same order", () => {
    expect(giftCardPayable([gel], 4290)).toBe(4290);
    expect(giftCardPayable([gel, card], 9290)).toBe(4290);
    expect(giftCardPayable([card], 5000)).toBe(0);
    expect(giftCardPayable([card], 0)).toBe(0);
  });

  it("reads the amount in minor units and the refused codes", () => {
    expect(readGiftCardQuote({ ok: true, applied: 40.5, refused: ["GT-AAAA-BBBB-CCCC"] })).toEqual({
      ok: true,
      quote: { applied: 4050, refused: ["GT-AAAA-BBBB-CCCC"] },
    });
    expect(readGiftCardQuote({ ok: true, applied: "12.30", refused: [] })).toEqual({ ok: true, quote: { applied: 1230, refused: [] } });
  });

  it("turns anything unexpected into 'unavailable', never a made-up deduction", () => {
    expect(readGiftCardQuote(null)).toEqual({ ok: false, error: "unavailable" });
    expect(readGiftCardQuote({ ok: true })).toEqual({ ok: false, error: "unavailable" });
    expect(readGiftCardQuote({ ok: true, applied: -1 })).toEqual({ ok: false, error: "unavailable" });
    expect(readGiftCardQuote({ ok: true, applied: "abc" })).toEqual({ ok: false, error: "unavailable" });
    expect(readGiftCardQuote({ ok: false, error: "too_many_attempts" })).toEqual({ ok: false, error: "too_many_attempts" });
    expect(readGiftCardQuote({ ok: false, error: "boom" })).toEqual({ ok: false, error: "unavailable" });
  });

  it("matches the refused codes whatever their case or spaces", () => {
    expect(refusedGiftCodes(["GT-AAAA-BBBB-CCCC", "gt-dddd-eeee-ffff"], ["GT-DDDD-EEEE-FFFF"])).toEqual(["gt-dddd-eeee-ffff"]);
    expect(refusedGiftCodes(["GT-AAAA-BBBB-CCCC"], [])).toEqual([]);
  });
});
