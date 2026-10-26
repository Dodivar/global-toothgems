import { describe, expect, it } from "vitest";
import { displayPrice, mapPlanPriceRows, monthsFreeOf, readStudioCheckoutAnswer, readStudioConsentAnswer } from "./studioBillingMapping";

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
  const STEP = {
    status: "payment",
    client_secret: "cs_test_a1B2c3D4e5F6g7H8_secret_Zz9Yy8Xx7Ww6",
    publishable_key: "pk_test_abc",
    amount: 19900,
    currency: "eur",
    expires_at: "2026-10-18T13:00:00.000Z",
  };

  it("opens a payment step only from a well-formed answer", () => {
    expect(readStudioCheckoutAnswer(STEP)).toEqual({
      kind: "payment",
      payment: {
        clientSecret: STEP.client_secret,
        publishableKey: "pk_test_abc",
        amountMinor: 19900,
        currency: "EUR",
        expiresAt: Date.parse("2026-10-18T13:00:00.000Z"),
      },
    });
    for (const broken of [
      { client_secret: "pi_123_secret_abc" },
      { publishable_key: "sk_test_abc" },
      { amount: 199.5 },
      { amount: 0 },
      { currency: "euro" },
      { expires_at: "soon" },
    ]) {
      expect(readStudioCheckoutAnswer({ ...STEP, ...broken })).toEqual({ kind: "error", error: "payment_unavailable" });
    }
    // The former hosted page is never followed.
    expect(readStudioCheckoutAnswer({ status: "checkout", url: "https://checkout.stripe.com/c/pay/cs_test_1" })).toEqual({ kind: "error", error: "server_error" });
    expect(readStudioCheckoutAnswer({ error: "already_subscribed" })).toEqual({ kind: "error", error: "already_subscribed" });
    expect(readStudioCheckoutAnswer({ error: "weird" })).toEqual({ kind: "error", error: "server_error" });
  });

  it("confirms the payment only once the request is recorded", () => {
    expect(readStudioConsentAnswer({ status: "consented" })).toEqual({ kind: "consented" });
    expect(readStudioConsentAnswer({ error: "checkout_closed" })).toEqual({ kind: "error", error: "checkout_closed" });
    expect(readStudioConsentAnswer({})).toEqual({ kind: "error", error: "server_error" });
  });

});
