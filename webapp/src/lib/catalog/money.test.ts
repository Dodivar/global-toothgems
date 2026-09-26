import { describe, expect, it } from "vitest";
import { toMajorUnits, toMinorUnits } from "./money";

describe("toMinorUnits", () => {
  it("converts numbers without float drift", () => {
    expect(toMinorUnits(19.99)).toBe(1999);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    expect(toMinorUnits(32)).toBe(3200);
    expect(toMinorUnits(0)).toBe(0);
  });

  it("converts numeric strings as sent by PostgREST", () => {
    expect(toMinorUnits("249.00")).toBe(24900);
    expect(toMinorUnits("34.5")).toBe(3450);
    expect(toMinorUnits("7")).toBe(700);
  });

  it("rejects values that are not amounts", () => {
    expect(() => toMinorUnits("abc")).toThrow();
    expect(() => toMinorUnits("1.234")).toThrow();
  });

  it("round-trips to major units for display", () => {
    expect(toMajorUnits(toMinorUnits("109.00"))).toBe(109);
    expect(toMajorUnits(1999)).toBe(19.99);
  });
});
