import { describe, expect, it } from "vitest";
import { GOOGLE_TERMS_TTL_MS, isFreshGoogleTerms } from "./googleTerms";

describe("isFreshGoogleTerms", () => {
  const now = 1_000_000_000;

  it("accepts a note made a moment ago", () => {
    expect(isFreshGoogleTerms(now - 60_000, now)).toBe(true);
    expect(isFreshGoogleTerms(now - GOOGLE_TERMS_TTL_MS, now)).toBe(true);
  });

  it("refuses an old note, a future one and garbage", () => {
    expect(isFreshGoogleTerms(now - GOOGLE_TERMS_TTL_MS - 1, now)).toBe(false);
    expect(isFreshGoogleTerms(now + 1, now)).toBe(false);
    expect(isFreshGoogleTerms(Number.NaN, now)).toBe(false);
  });
});
