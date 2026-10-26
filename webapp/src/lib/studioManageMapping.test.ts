import { describe, expect, it } from "vitest";
import { readCardStep, readChangePreview, readChargeAnswer, readManageOverview } from "./studioManageMapping";

describe("studio subscription management answers", () => {
  it("reads the overview: plan and card (the invoices are ours, read from the database)", () => {
    const answer = readManageOverview({
      subscription: {
        plan: "artist",
        interval: "month",
        status: "active",
        cancel_at_period_end: false,
        current_period_end: 1_790_000_000,
        amount: 1990,
        currency: "eur",
        pending_update: false,
      },
      card: { type: "card", brand: "visa", last4: "4242", exp_month: 12, exp_year: 2034 },
    });
    expect(answer.kind).toBe("ok");
    if (answer.kind !== "ok") return;
    expect(answer.value.subscription).toEqual({
      plan: "artist",
      interval: "month",
      status: "active",
      cancelAtPeriodEnd: false,
      periodEnd: 1_790_000_000_000,
      amountMinor: 1990,
      currency: "EUR",
      pendingUpdate: false,
    });
    expect(answer.value.card).toEqual({ type: "card", brand: "visa", last4: "4242", expMonth: 12, expYear: 2034 });
  });

  it("an empty overview and errors", () => {
    expect(readManageOverview({ subscription: null, card: null })).toEqual({
      kind: "ok",
      value: { subscription: null, card: null },
    });
    expect(readManageOverview({ error: "session_expired" })).toEqual({ kind: "error", error: "session_expired" });
    expect(readManageOverview({ error: "something_else" })).toEqual({ kind: "error", error: "unavailable" });
  });

  it("reads a preview in minor units", () => {
    expect(
      readChangePreview({ charged_now: true, due_now: 17910, next_amount: 19900, next_date: 1_820_000_000, credit: 0, currency: "EUR", proration_date: 1_789_000_000 }),
    ).toEqual({
      kind: "ok",
      value: { chargedNow: true, dueNowMinor: 17910, nextAmountMinor: 19900, nextDate: 1_820_000_000_000, creditMinor: 0, currency: "EUR", prorationDate: 1_789_000_000 },
    });
    expect(readChangePreview({ charged_now: true, due_now: 1.5, next_amount: 1, credit: 0, currency: "EUR", proration_date: 1 }).kind).toBe("error");
    expect(readChangePreview({ error: "cancel_scheduled" })).toEqual({ kind: "error", error: "cancel_scheduled" });
  });

  it("a charge is done, needs the bank's check, or failed", () => {
    expect(readChargeAnswer({ status: "updated" })).toEqual({ kind: "done" });
    expect(readChargeAnswer({ status: "canceled" })).toEqual({ kind: "done" });
    expect(readChargeAnswer({ status: "requires_action", client_secret: "pi_1_secret_2", publishable_key: "pk_test_1" })).toEqual({
      kind: "requires_action",
      clientSecret: "pi_1_secret_2",
      publishableKey: "pk_test_1",
    });
    expect(readChargeAnswer({ status: "requires_action", client_secret: "seti_1", publishable_key: "pk_test_1" })).toEqual({ kind: "error", error: "unavailable" });
    expect(readChargeAnswer({ error: "payment_failed" })).toEqual({ kind: "error", error: "payment_failed" });
  });

  it("reads the card step", () => {
    expect(readCardStep({ client_secret: "cs_test_1_secret_2", publishable_key: "pk_test_1", expires_at: 1_789_000_000 })).toEqual({
      kind: "ok",
      value: { clientSecret: "cs_test_1_secret_2", publishableKey: "pk_test_1", expiresAt: 1_789_000_000_000 },
    });
    expect(readCardStep({ error: "not_active" })).toEqual({ kind: "error", error: "not_active" });
  });
});
