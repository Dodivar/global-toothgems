import { describe, expect, it } from "vitest";
import { displayPrice, mapPlanPriceRows, monthsFreeOf, readStudioCheckoutAnswer, readStudioPortalAnswer } from "./studioBillingMapping";

describe("mapPlanPriceRows", () => {
  it("maps numeric amounts to minor units without floats and drops malformed rows", () => {
    expect(
      mapPlanPriceRows([
        { plan: "artist", billing_interval: "month", amount: "19.90", currency: "EUR" },
        { plan: "artist", billing_interval: "year", amount: 199, currency: "EUR" },
        { plan: "gold", billing_interval: "month", amount: "1.00", currency: "EUR" },
        { plan: "atelier", billing_interval: "week", amount: "1.00", currency: "EUR" },
        { plan: "atelier", billing_interval: "month", amount: "abc", currency: "EUR" },
        null,
      ]),
    ).toEqual([
      { plan: "artist", interval: "month", amountMinor: 1990, currency: "EUR" },
      { plan: "artist", interval: "year", amountMinor: 19900, currency: "EUR" },
    ]);
    expect(mapPlanPriceRows(null)).toEqual([]);
  });
});

describe("displayPrice", () => {
  it("prefers the live price, falls back to the confirmed display values before it is read", () => {
    const live = [{ plan: "artist" as const, interval: "year" as const, amountMinor: 19900, currency: "EUR" }];
    expect(displayPrice("artist", "year", live)?.amountMinor).toBe(19900);
    // Live prices read but this one missing: not on sale, nothing invented.
    expect(displayPrice("artist", "month", live)).toBeNull();
    expect(displayPrice("essential", "month", null)).toEqual({ plan: "essential", interval: "month", amountMinor: 500, currency: "EUR" });
    expect(displayPrice("atelier", "year", [])?.amountMinor).toBe(39900);
  });
});

describe("monthsFreeOf", () => {
  it("counts the months a yearly price saves", () => {
    const m = { plan: "artist" as const, interval: "month" as const, amountMinor: 1990, currency: "EUR" };
    const y = { plan: "artist" as const, interval: "year" as const, amountMinor: 19900, currency: "EUR" };
    expect(monthsFreeOf(m, y)).toBe(2);
    expect(monthsFreeOf(m, { ...y, amountMinor: 23880 })).toBe(0);
    expect(monthsFreeOf(null, y)).toBe(0);
  });
});

describe("function answers", () => {
  it("follows only Stripe addresses", () => {
    expect(readStudioCheckoutAnswer({ status: "checkout", url: "https://checkout.stripe.com/c/pay/cs_test_1" })).toEqual({
      kind: "redirect",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect(readStudioCheckoutAnswer({ status: "checkout", url: "https://evil.example/pay" })).toEqual({ kind: "error", error: "payment_unavailable" });
    expect(readStudioCheckoutAnswer({ error: "already_subscribed" })).toEqual({ kind: "error", error: "already_subscribed" });
    expect(readStudioCheckoutAnswer({ error: "weird" })).toEqual({ kind: "error", error: "server_error" });
    expect(readStudioPortalAnswer({ url: "https://billing.stripe.com/p/session/x" }).kind).toBe("redirect");
    expect(readStudioPortalAnswer({ url: "http://billing.stripe.com/p/session/x" })).toEqual({ kind: "error", error: "unavailable" });
    expect(readStudioPortalAnswer({ error: "no_subscription" })).toEqual({ kind: "error", error: "no_subscription" });
  });
});
