import { describe, expect, it } from "vitest";
import { reasonOfDbError, reasonOfFunctionError } from "./adminFulfillment";

describe("reasonOfDbError", () => {
  it("turns the SQLSTATE of a refused RPC into a reason, never a message", () => {
    expect(reasonOfDbError({ code: "42501" })).toBe("forbidden");
    expect(reasonOfDbError({ code: "22023" })).toBe("invalid");
    expect(reasonOfDbError({ code: "23514" })).toBe("refused");
    expect(reasonOfDbError({ code: "P0002" })).toBe("notFound");
    expect(reasonOfDbError({ code: "XX000" })).toBe("unavailable");
    expect(reasonOfDbError(null)).toBe("unavailable");
  });
});

describe("reasonOfFunctionError", () => {
  it("maps every code of refund-order, and anything else to unavailable", () => {
    const codes: Record<string, string> = {
      forbidden: "forbidden",
      unauthorized: "forbidden",
      invalid_request: "invalid",
      no_card_payment: "noCardPayment",
      amount_too_high: "amountTooHigh",
      gift_card_active: "giftCardActive",
      refund_refused: "refused",
      stripe_refused: "stripeRefused",
      stripe_unavailable: "stripeUnavailable",
      not_found: "notFound",
      already_sent: "alreadySent",
    };
    for (const [code, reason] of Object.entries(codes)) expect(reasonOfFunctionError(code)).toBe(reason);
    expect(reasonOfFunctionError("server_error")).toBe("unavailable");
    expect(reasonOfFunctionError(undefined)).toBe("unavailable");
    expect(reasonOfFunctionError("constructor")).toBe("unavailable");
  });
});
