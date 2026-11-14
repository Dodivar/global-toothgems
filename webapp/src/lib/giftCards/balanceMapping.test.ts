import { describe, expect, it } from "vitest";
import { normaliseBalanceCode, readMemberAnswer, readVisitorAnswer, readVisitorError } from "./balanceMapping";

const CARD = { status: "active", balance: 32.5, currency: "EUR", expires_at: "2027-11-13T10:00:00Z", last4: "WXYZ" };

describe("normaliseBalanceCode", () => {
  it("accepts the code in any case, with or without dashes and spaces", () => {
    expect(normaliseBalanceCode(" gt-abcd-efgh-wxyz ")).toBe("GT-ABCD-EFGH-WXYZ");
    expect(normaliseBalanceCode("GT ABCD EFGH WXYZ")).toBe("GTABCDEFGHWXYZ");
    expect(normaliseBalanceCode("gtabcdefghwxyz")).toBe("GTABCDEFGHWXYZ");
  });
  it("refuses what cannot be a code (ambiguous characters, wrong length)", () => {
    expect(normaliseBalanceCode("GT-ABCD-EFGH-WXY")).toBeNull();
    expect(normaliseBalanceCode("GT-0OI1-EFGH-WXYZ")).toBeNull();
    expect(normaliseBalanceCode("")).toBeNull();
    expect(normaliseBalanceCode("PROMO10")).toBeNull();
  });
});

describe("readMemberAnswer", () => {
  it("reads a card in minor units, last 4 only", () => {
    expect(readMemberAnswer({ ok: true, found: true, card: CARD })).toEqual({
      kind: "found",
      card: { status: "active", balanceMinor: 3250, currency: "EUR", expiresAt: "2027-11-13T10:00:00Z", last4: "WXYZ" },
    });
    expect(readMemberAnswer({ ok: true, found: true, card: { ...CARD, balance: "19.99", expires_at: null } })).toMatchObject({
      card: { balanceMinor: 1999, expiresAt: null },
    });
  });
  it("reads every status", () => {
    for (const status of ["used_up", "expired", "cancelled"]) {
      expect(readMemberAnswer({ ok: true, found: true, card: { ...CARD, status, balance: 0 } })).toMatchObject({ card: { status } });
    }
  });
  it("found=false is not found; throttle and failures are errors", () => {
    expect(readMemberAnswer({ ok: true, found: false })).toEqual({ kind: "not_found" });
    expect(readMemberAnswer({ ok: false, error: "too_many_attempts" })).toEqual({ kind: "error", error: "rate_limited" });
    expect(readMemberAnswer({ ok: false, error: "unavailable" })).toEqual({ kind: "error", error: "unavailable" });
    expect(readMemberAnswer(null)).toEqual({ kind: "error", error: "unavailable" });
  });
  it("an unexpected card shape is an error, never a made-up balance", () => {
    expect(readMemberAnswer({ ok: true, found: true, card: { ...CARD, status: "weird" } })).toEqual({ kind: "error", error: "unavailable" });
    expect(readMemberAnswer({ ok: true, found: true, card: { ...CARD, balance: "abc" } })).toEqual({ kind: "error", error: "unavailable" });
    expect(readMemberAnswer({ ok: true, found: true })).toEqual({ kind: "error", error: "unavailable" });
  });
});

describe("visitor answers", () => {
  it("reads the function's 200 answer", () => {
    expect(readVisitorAnswer({ found: true, card: CARD })).toMatchObject({ kind: "found", card: { balanceMinor: 3250 } });
    expect(readVisitorAnswer({ found: false })).toEqual({ kind: "not_found" });
    expect(readVisitorAnswer({})).toEqual({ kind: "error", error: "unavailable" });
  });
  it("maps the function's error codes", () => {
    expect(readVisitorError("rate_limited")).toBe("rate_limited");
    expect(readVisitorError("captcha_required")).toBe("captcha_required");
    expect(readVisitorError("captcha_failed")).toBe("captcha_failed");
    expect(readVisitorError("invalid_request")).toBe("invalid");
    expect(readVisitorError("server_error")).toBe("unavailable");
    expect(readVisitorError(undefined)).toBe("unavailable");
  });
});
