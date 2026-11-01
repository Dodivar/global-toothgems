import { describe, expect, it } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
import type { Luma } from "./tryOnAlign";
import { driftReport, STRAY_LIMIT } from "./tryOnDrift";
import { guideMarks, placementGuideSvg } from "./tryOnGuide";
import type { RegisteredGem } from "./tryOnRegistration";

const gem = (id: string, over: Partial<RegisteredGem> = {}): RegisteredGem => ({
  id,
  number: 1,
  toothId: "11",
  shape: "round",
  x: 50,
  y: 40,
  r: 6,
  stretch: [1, 1],
  rotation: 0,
  tooth: "found",
  ...over,
});
const piece = (id: string, color: string) => ({ id, look: { shape: "round", material: "crystal", color, effect: "none" } }) as unknown as PlacedJewelry;

describe("guideMarks", () => {
  it("draws the gems of found teeth in their colour; the others are left out", () => {
    const { marks, leftOut } = guideMarks({ gems: [gem("a"), gem("b", { tooth: "fitted" }), gem("c")] }, [piece("a", "#ff0066"), piece("c", "red")]);
    expect(marks.map((m) => [m.id, m.color])).toEqual([
      ["a", "#ff0066"],
      ["c", "#ffffff"], // not a hex colour: drawn white
    ]);
    expect(leftOut).toBe(1);
  });
});

describe("placementGuideSvg", () => {
  it("is an SVG of the close-up's size with one cut and one shine per mark", () => {
    const { marks } = guideMarks({ gems: [gem("a"), gem("b", { x: 80 })] }, [piece("a", "#ff0066"), piece("b", "#00ff00")]);
    const svg = placementGuideSvg(marks, 120, 90);
    expect(svg).toMatch(/^<svg [^>]*width="120" height="90" viewBox="0 0 120 90">/);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg).toContain('fill="#ff0066"');
  });
});

/** A flat grey picture; `spots` painted brighter (centre, radius). */
function picture(width: number, height: number, spots: [number, number, number][] = [], level = 100): Luma {
  const data = new Float32Array(width * height).fill(level);
  for (const [cx, cy, r] of spots) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (Math.hypot(x - cx, y - cy) <= r) data[y * width + x] = 230;
  }
  return { width, height, data };
}

describe("driftReport", () => {
  const gems = [
    { id: "a", x: 30, y: 30, r: 5 },
    { id: "b", x: 70, y: 30, r: 5 },
  ];

  it("finds every gem where it was placed and nothing elsewhere", () => {
    const report = driftReport(picture(100, 60), picture(100, 60, [[30, 30, 5], [70, 30, 5]]), gems);
    expect(report).toEqual({ checked: 2, kept: 2, missing: [], stray: 0, ok: true });
  });

  it("names a gem the model moved, and sees the stray change where it went", () => {
    const report = driftReport(picture(100, 60), picture(100, 60, [[30, 30, 5], [50, 45, 5]]), gems);
    expect(report.missing).toEqual(["b"]);
    expect(report.stray).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
  });

  it("flags a photo changed beyond the gems", () => {
    const whole = picture(100, 60, [[30, 30, 5], [70, 30, 5]]);
    // The model brightened a band of the teeth.
    for (let y = 45; y < 55; y++) for (let x = 0; x < 100; x++) whole.data[y * 100 + x] = 200;
    const report = driftReport(picture(100, 60), whole, gems);
    expect(report.missing).toEqual([]);
    expect(report.stray).toBeGreaterThan(STRAY_LIMIT);
    expect(report.ok).toBe(false);
  });

  it("does not measure gems too small to tell", () => {
    expect(driftReport(picture(40, 40), picture(40, 40), [{ id: "tiny", x: 20, y: 20, r: 1 }]).checked).toBe(0);
  });
});
