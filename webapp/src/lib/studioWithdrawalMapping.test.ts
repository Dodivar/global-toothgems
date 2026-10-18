import { describe, expect, it } from "vitest";
import { readWithdrawAnswer, readWithdrawalQuote } from "./studioWithdrawalMapping";

describe("readWithdrawalQuote", () => {
  it("reads an open withdrawal in minor units", () => {
    expect(
      readWithdrawalQuote({
        eligible: true,
        deadline: "2026-11-01T23:00:00+00:00",
        paid_amount: 19.9,
        used_amount: "1.99",
        refund_amount: 17.91,
        currency: "EUR",
        used_days: 3,
        period_days: 30,
      }),
    ).toEqual({
      kind: "open",
      deadline: "2026-11-01T23:00:00+00:00",
      figures: { usedDays: 3, periodDays: 30, paid: 1990, used: 199, refund: 1791, currency: "EUR" },
    });
  });

  it("reads a withdrawal already made, the team's cases and nothing to offer", () => {
    expect(
      readWithdrawalQuote({
        eligible: false,
        reason: "withdrawn",
        withdrawal: { status: "refund_pending", requested_at: "2026-10-21T09:00:00Z", refund_amount: 17.91, currency: "EUR" },
      }),
    ).toEqual({ kind: "withdrawn", status: "refund_pending", requestedAt: "2026-10-21T09:00:00Z", refund: 1791, currency: "EUR" });
    expect(readWithdrawalQuote({ eligible: false, reason: "manual_review", deadline: "2026-11-01T23:00:00Z" })).toEqual({
      kind: "contact",
      deadline: "2026-11-01T23:00:00Z",
    });
    expect(readWithdrawalQuote({ eligible: false, reason: "deadline_passed" })).toEqual({ kind: "none" });
    expect(readWithdrawalQuote(null)).toEqual({ kind: "none" });
  });

  it("refuses malformed amounts rather than guessing", () => {
    expect(readWithdrawalQuote({ eligible: true, deadline: "2026-11-01", paid_amount: "abc", used_amount: 0, refund_amount: 0, currency: "EUR", used_days: 1, period_days: 30 })).toEqual({ kind: "none" });
    expect(readWithdrawalQuote({ eligible: true, deadline: "2026-11-01", paid_amount: 1.234, used_amount: 0, refund_amount: 0, currency: "EUR", used_days: 1, period_days: 30 })).toEqual({ kind: "none" });
  });
});

describe("readWithdrawAnswer", () => {
  it("reads the function's answers", () => {
    expect(readWithdrawAnswer(200, { status: "refund_pending", used_days: 3, period_days: 30, used_amount: 199, refund_amount: 1791, currency: "EUR" })).toEqual({
      kind: "done",
      status: "refund_pending",
      figures: { usedDays: 3, periodDays: 30, used: 199, refund: 1791, currency: "EUR" },
    });
    expect(readWithdrawAnswer(409, { error: "deadline_passed" })).toEqual({ kind: "refused", reason: "deadline_passed" });
    expect(readWithdrawAnswer(502, { error: "withdrawal_incomplete", step: "refund" })).toEqual({ kind: "incomplete" });
    expect(readWithdrawAnswer(500, { error: "server_error" })).toEqual({ kind: "error" });
    expect(readWithdrawAnswer(200, { status: "refunded", used_amount: 1.5 })).toEqual({ kind: "error" });
  });
});
