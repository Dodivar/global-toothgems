import { describe, expect, it } from "vitest";
import { backInStockResult } from "./backInStock";

describe("backInStockResult", () => {
  it("reads a success", () => {
    expect(backInStockResult({ ok: true })).toEqual({ ok: true });
  });

  it("keeps the refusals the form knows", () => {
    expect(backInStockResult({ ok: false, error: "invalid_email" })).toEqual({ ok: false, error: "invalid_email" });
    expect(backInStockResult({ ok: false, error: "in_stock" })).toEqual({ ok: false, error: "in_stock" });
    expect(backInStockResult({ ok: false, error: "too_many_requests" })).toEqual({ ok: false, error: "too_many_requests" });
  });

  it("turns anything unexpected into 'unavailable', never a success", () => {
    expect(backInStockResult(null)).toEqual({ ok: false, error: "unavailable" });
    expect(backInStockResult({ ok: "yes" })).toEqual({ ok: false, error: "unavailable" });
    expect(backInStockResult({ ok: false, error: "sql exploded" })).toEqual({ ok: false, error: "unavailable" });
  });
});
