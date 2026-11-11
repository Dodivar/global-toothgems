import { describe, expect, it } from "vitest";
import { mapAdminPriceReference, type AdminPriceReferenceRow } from "./adminPriceReference";

const row = (over: Partial<AdminPriceReferenceRow> = {}): AdminPriceReferenceRow => ({
  variant_id: null,
  currency: "EUR",
  list_price: "20.00",
  price: "15.00",
  reference_price: "20.00",
  discount_percent: 25,
  reduction_started_at: "2026-11-01T00:00:00Z",
  state: "reduced",
  ...over,
});

describe("mapAdminPriceReference", () => {
  it("maps a reduction to minor units", () => {
    expect(mapAdminPriceReference(row())).toEqual({
      variantId: null,
      currency: "EUR",
      listCents: 2000,
      priceCents: 1500,
      referenceCents: 2000,
      percent: 25,
      startedAt: "2026-11-01T00:00:00Z",
      state: "reduced",
    });
  });
  it("keeps the reference without a reduction, with no percentage", () => {
    expect(mapAdminPriceReference(row({ state: "no_reduction", price: "20.00", reference_price: "18.00", discount_percent: null, reduction_started_at: null }))).toMatchObject({
      referenceCents: 1800,
      percent: null,
      state: "no_reduction",
    });
    expect(mapAdminPriceReference(row({ state: "not_lower", discount_percent: 3 }))?.percent).toBeNull();
  });
  it("reads an unknown state as no reduction to announce, and drops unreadable rows", () => {
    expect(mapAdminPriceReference(row({ state: "oops" }))?.state).toBe("not_lower");
    expect(mapAdminPriceReference(row({ price: "x" }))).toBeNull();
  });
});
