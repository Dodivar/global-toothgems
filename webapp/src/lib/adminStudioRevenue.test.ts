import { describe, expect, it } from "vitest";
import { buildStudioRevenueFigures, withdrawalDeadline, type StudioInvoiceRow } from "./adminStudioRevenue";

const invoice = (over: Partial<StudioInvoiceRow>): StudioInvoiceRow => ({
  stripe_invoice_id: "in_1",
  billing_reason: "subscription_create",
  status: "paid",
  amount: 19.9,
  currency: "EUR",
  occurred_at: "2026-10-05T10:00:00Z",
  ...over,
});

const range = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-01T00:00:00Z") };

describe("withdrawalDeadline", () => {
  it("is midnight Paris after the 14th day, in summer and winter time", () => {
    // Paid 5 Oct (Paris, UTC+2): last day 19 Oct, deadline 20 Oct 00:00 Paris = 19 Oct 22:00 UTC.
    expect(new Date(withdrawalDeadline("2026-10-05T10:00:00Z")).toISOString()).toBe("2026-10-19T22:00:00.000Z");
    // Paid 20 Nov (UTC+1): deadline 5 Dec 00:00 Paris = 4 Dec 23:00 UTC.
    expect(new Date(withdrawalDeadline("2026-11-20T10:00:00Z")).toISOString()).toBe("2026-12-04T23:00:00.000Z");
    // 23:30 UTC on 5 Oct is already 6 Oct in Paris.
    expect(new Date(withdrawalDeadline("2026-10-05T23:30:00Z")).toISOString()).toBe("2026-10-20T22:00:00.000Z");
  });
});

describe("buildStudioRevenueFigures", () => {
  it("splits the period's money into settled, still withdrawable and refunded", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const figures = buildStudioRevenueFigures(
      [
        invoice({ stripe_invoice_id: "in_old", occurred_at: "2026-10-01T10:00:00Z" }), // past its deadline: settled
        invoice({ stripe_invoice_id: "in_new", occurred_at: "2026-10-12T10:00:00Z", amount: 199 }), // still open
        invoice({ stripe_invoice_id: "in_cycle", billing_reason: "subscription_cycle", occurred_at: "2026-10-16T10:00:00Z" }), // renewal
        invoice({ stripe_invoice_id: "in_back", occurred_at: "2026-10-14T10:00:00Z" }), // withdrawn
        invoice({ stripe_invoice_id: "in_failed", status: "payment_failed" }),
      ],
      [{ stripe_invoice_id: "in_back", status: "refunded", refund_amount: "17.91", currency: "EUR" }],
      range,
      now,
    );
    expect(figures.received).toBe(1990 + 19900 + 1990 + 1990);
    expect(figures.withdrawable).toBe(19900);
    expect(figures.refunded).toBe(1791);
    expect(figures.settled).toBe(1990 + 1990 + 199);
    expect(figures.withdrawableNow).toBe(19900);
    expect(figures.nextSettlement).toBe("2026-10-26T23:00:00.000Z");
    expect(figures.weeks.map((w) => w.week)).toEqual(["2026-09-28", "2026-10-12"]);
    expect(figures.weeks[1]).toEqual({ week: "2026-10-12", settled: 1990 + 199, withdrawable: 19900, refunded: 1791 });
  });

  it("counts money still withdrawable today even outside the period, and leaves other currencies out", () => {
    const figures = buildStudioRevenueFigures(
      [invoice({ occurred_at: "2026-10-12T10:00:00Z" }), invoice({ stripe_invoice_id: "in_usd", currency: "USD" })],
      [],
      { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") },
      new Date("2026-10-18T12:00:00Z"),
    );
    expect(figures.received).toBe(0);
    expect(figures.withdrawableNow).toBe(1990);
    expect(figures.skipped).toBe(1);
  });

  it("a failed refund gives nothing back: the payment counts as settled once its period is over", () => {
    const figures = buildStudioRevenueFigures(
      [invoice({ occurred_at: "2026-10-01T10:00:00Z" })],
      [{ stripe_invoice_id: "in_1", status: "refund_failed", refund_amount: 10, currency: "EUR" }],
      range,
      new Date("2026-10-30T00:00:00Z"),
    );
    expect(figures.refunded).toBe(0);
    expect(figures.settled).toBe(1990);
  });
});
