import { describe, expect, it } from "vitest";
import { FLICK_SPEED, FULL_GAP, HALF_SHARE, heightOf, settleSnap, sheetHeights, stageHeight, toggledSnap } from "./phoneSheet";

describe("the phone sheet's heights", () => {
  it("peeks with its header, opens near half the area, and leaves a strip of stage when full", () => {
    const h = sheetHeights(600, 76);
    expect(h.peek).toBe(76);
    expect(h.half).toBe(Math.round(600 * HALF_SHARE));
    expect(h.full).toBe(600 - FULL_GAP);
  });
  it("keeps half open taller than the header on a short area, and never above full", () => {
    const h = sheetHeights(220, 76);
    expect(h.half).toBeGreaterThan(h.peek);
    expect(h.half).toBeLessThanOrEqual(h.full);
  });
  it("never shrinks the stage past the half-open line: a full sheet covers it", () => {
    const h = sheetHeights(600, 76);
    expect(stageHeight(600, "peek", h)).toBe(524);
    expect(stageHeight(600, "half", h)).toBe(600 - h.half);
    expect(stageHeight(600, "full", h)).toBe(600 - h.half);
  });
});

describe("where a drag settles", () => {
  const h = sheetHeights(600, 76);
  it("goes to the nearest height when released slowly", () => {
    expect(settleSnap(100, 0, h)).toBe("peek");
    expect(settleSnap(h.half + 20, 0, h)).toBe("half");
    expect(settleSnap(h.full - 30, 0, h)).toBe("full");
  });
  it("goes on to the next height in the direction of a flick", () => {
    expect(settleSnap(120, FLICK_SPEED, h)).toBe("half");
    expect(settleSnap(h.half + 5, FLICK_SPEED, h)).toBe("full");
    expect(settleSnap(h.half - 5, -FLICK_SPEED, h)).toBe("peek");
    expect(settleSnap(h.full - 5, -FLICK_SPEED, h)).toBe("half");
  });
  it("stays at the ends when flicked past them", () => {
    expect(settleSnap(h.full, FLICK_SPEED * 2, h)).toBe("full");
    expect(settleSnap(h.peek, -FLICK_SPEED * 2, h)).toBe("peek");
  });
  it("opens a closed sheet halfway and closes an open one on a tap", () => {
    expect(toggledSnap("peek")).toBe("half");
    expect(toggledSnap("half")).toBe("peek");
    expect(toggledSnap("full")).toBe("peek");
    expect(heightOf("half", h)).toBe(h.half);
  });
});
