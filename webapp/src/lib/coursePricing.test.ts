import { describe, expect, it } from "vitest";
import {
  currentPrice,
  discountedPrice,
  minorToDecimalString,
  parsePriceInput,
  promotionProblems,
  promotionState,
  type CoursePromotion,
} from "./coursePricing";

const promo = (patch: Partial<CoursePromotion>): CoursePromotion => ({
  id: "p1",
  courseId: "c1",
  label: "Rentrée",
  discountType: "percentage",
  value: 20,
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-09-30T00:00:00.000Z",
  active: true,
  ...patch,
});

describe("discountedPrice", () => {
  it("applies a percentage, rounded half away from zero like the database", () => {
    expect(discountedPrice(34900, "percentage", 20)).toBe(27920);
    // 33 % of 9.99 € = 3.2967 → 6.6933 → 6.69 €
    expect(discountedPrice(999, "percentage", 33)).toBe(669);
    // 15 % of 0.10 € = 0.015 → 0.085 → 0.09 € (half up)
    expect(discountedPrice(10, "percentage", 15)).toBe(9);
  });

  it("takes an amount off without going below zero", () => {
    expect(discountedPrice(34900, "amount", 4999)).toBe(29901);
    expect(discountedPrice(1000, "amount", 5000)).toBe(0);
  });
});

describe("currentPrice and promotionState", () => {
  const at = new Date("2026-09-15T12:00:00.000Z");

  it("uses the running promotion only", () => {
    expect(currentPrice(34900, [promo({})], at)).toEqual({ priceMinor: 27920, promotion: promo({}) });
    expect(currentPrice(34900, [promo({ active: false })], at).priceMinor).toBe(34900);
    expect(currentPrice(34900, [promo({ startsAt: "2026-10-01T00:00:00.000Z", endsAt: null })], at).priceMinor).toBe(34900);
  });

  it("names each state", () => {
    expect(promotionState(promo({}), at)).toBe("running");
    expect(promotionState(promo({ startsAt: "2026-09-20T00:00:00.000Z" }), at)).toBe("scheduled");
    expect(promotionState(promo({ endsAt: "2026-09-10T00:00:00.000Z" }), at)).toBe("ended");
    expect(promotionState(promo({ active: false }), at)).toBe("inactive");
  });
});

describe("promotionProblems", () => {
  it("accepts a valid promotion", () => {
    expect(promotionProblems(promo({}), 34900, [])).toEqual([]);
  });

  it("mirrors the database guard", () => {
    expect(promotionProblems(promo({ label: " " }), 34900, [])).toContain("label");
    expect(promotionProblems(promo({ value: 100 }), 34900, [])).toContain("percentRange");
    expect(promotionProblems(promo({ discountType: "amount", value: 34900 }), 34900, [])).toContain("amountTooHigh");
    expect(promotionProblems(promo({ endsAt: "2026-08-01T00:00:00.000Z" }), 34900, [])).toContain("period");
  });

  it("refuses overlapping active promotions, not back-to-back ones", () => {
    const other = promo({ id: "p2", startsAt: "2026-09-30T00:00:00.000Z", endsAt: null });
    expect(promotionProblems(promo({}), 34900, [other])).toEqual([]);
    expect(promotionProblems(promo({ endsAt: "2026-10-02T00:00:00.000Z" }), 34900, [other])).toContain("overlap");
    expect(promotionProblems(promo({ endsAt: null }), 34900, [{ ...other, active: false }])).toEqual([]);
  });
});

describe("money text", () => {
  it("formats minor units as the decimal string the database reads", () => {
    expect(minorToDecimalString(34900)).toBe("349.00");
    expect(minorToDecimalString(5)).toBe("0.05");
  });

  it("parses typed prices without floating point", () => {
    expect(parsePriceInput("349")).toBe(34900);
    expect(parsePriceInput("349,9")).toBe(34990);
    expect(parsePriceInput(" 1 299.95 ")).toBe(129995);
    expect(parsePriceInput("12.345")).toBeNull();
    expect(parsePriceInput("-3")).toBeNull();
    expect(parsePriceInput("")).toBeNull();
  });
});
