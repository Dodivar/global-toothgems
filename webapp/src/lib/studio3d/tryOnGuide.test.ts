import { describe, expect, it } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
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
    const { marks, leftOut } = guideMarks({ gems: [gem("a"), gem("b", { tooth: "fitted" }), gem("c"), gem("d", { tooth: "hidden" })] }, [piece("a", "#ff0066"), piece("c", "red")]);
    expect(marks.map((m) => [m.id, m.color])).toEqual([
      ["a", "#ff0066"],
      ["c", "#ffffff"], // not a hex colour: drawn white
    ]);
    expect(leftOut).toBe(2);
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
