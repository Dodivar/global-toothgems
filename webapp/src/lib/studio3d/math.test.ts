import { describe, expect, it } from "vitest";
import { pointInPolygon } from "./math";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
/** A "C" shape: its mouth, between the two arms, is outside. */
const cShape = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 3 },
  { x: 3, y: 3 },
  { x: 3, y: 7 },
  { x: 10, y: 7 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("pointInPolygon (lasso hit test)", () => {
  it("finds points inside and outside a simple loop", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
  });

  it("follows a concave outline", () => {
    expect(pointInPolygon({ x: 1.5, y: 5 }, cShape)).toBe(true);
    expect(pointInPolygon({ x: 6, y: 5 }, cShape)).toBe(false);
    expect(pointInPolygon({ x: 6, y: 1.5 }, cShape)).toBe(true);
  });

  it("closes an open path from its last point back to the first", () => {
    const open = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(pointInPolygon({ x: 8, y: 2 }, open)).toBe(true);
    expect(pointInPolygon({ x: 2, y: 8 }, open)).toBe(false);
  });

  it("needs at least three points to enclose anything", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(pointInPolygon({ x: 5, y: 0 }, square.slice(0, 2))).toBe(false);
  });
});
