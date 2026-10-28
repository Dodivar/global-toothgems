import { describe, expect, it } from "vitest";
import { TRY_ON_PACE, tryOnLine, tryOnProgress } from "./tryOnProgress";

describe("tryOnProgress", () => {
  it("starts each stage where its pace says and never reaches its ceiling", () => {
    expect(tryOnProgress("checking", 0)).toBe(TRY_ON_PACE.checking.from);
    expect(tryOnProgress("rendering", 0)).toBe(TRY_ON_PACE.rendering.from);
    expect(tryOnProgress("rendering", 10 * 60_000)).toBeLessThanOrEqual(TRY_ON_PACE.rendering.to);
    expect(tryOnProgress("checking", -500)).toBe(TRY_ON_PACE.checking.from);
  });

  it("only moves forward, and the render starts beyond where the check can go", () => {
    let last = 0;
    for (let ms = 0; ms <= 120_000; ms += 1_000) {
      const p = tryOnProgress("rendering", ms);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(TRY_ON_PACE.rendering.from).toBeGreaterThan(TRY_ON_PACE.checking.to);
  });
});

describe("tryOnLine", () => {
  it("shows the lines in order, then keeps the last one", () => {
    const { every, lines } = TRY_ON_PACE.rendering;
    expect(tryOnLine("rendering", 0)).toBe(0);
    expect(tryOnLine("rendering", every)).toBe(1);
    expect(tryOnLine("rendering", every * 100)).toBe(lines - 1);
  });
});
