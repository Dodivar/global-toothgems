import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { STUDIO_SHAPES, scaleForSize, type StudioShape } from "../../data/studioEditor";
import type { GemSize } from "../gemOptions";
import { gemOutline, glyphStretch } from "./frontView";
import { getJewelTemplate } from "./geometry";
import { SHAPE_HALF_EXTENTS, longAxis, maxFaceScale, scaleAxes } from "./pieceScale";

/** Width (x) and height (y) of a shape's footprint once stretched per axis, in mm. */
function footprintSpan(shape: StudioShape, size: GemSize): { x: number; y: number } {
  const { edge } = getJewelTemplate(shape).footprint;
  const a = scaleAxes(shape, size);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < edge.length; i += 2) {
    minX = Math.min(minX, edge[i] * a.x);
    maxX = Math.max(maxX, edge[i] * a.x);
    minY = Math.min(minY, edge[i + 1] * a.y);
    maxY = Math.max(maxY, edge[i + 1] * a.y);
  }
  return { x: maxX - minX, y: maxY - minY };
}

/** Bounding box of a drawn outline (control points included). */
function outlineSpan(shape: StudioShape, stretch: readonly [number, number], r: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const cmd of gemOutline(shape, { x: 0, y: 0, r, rotation: 0, stretch }))
    for (let i = 1; i + 1 < cmd.length; i += 2) xs.push(cmd[i] as number), ys.push(cmd[i + 1] as number);
  return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
}

describe("per-axis piece scale (decision 107)", () => {
  it("matches the templates' real proportions", () => {
    for (const shape of STUDIO_SHAPES) {
      const box = new THREE.Box3();
      for (const g of getJewelTemplate(shape).parts) box.union(g.boundingBox!);
      const size = box.getSize(new THREE.Vector3());
      const [hx, hy] = SHAPE_HALF_EXTENTS[shape];
      expect(Math.abs(size.x / 2 - hx), shape).toBeLessThan(1e-3);
      expect(Math.abs(size.y / 2 - hy), shape).toBeLessThan(1e-3);
    }
  });

  it("draws a 2 × 6 mm baguette 2 wide and 6 long", () => {
    const span = footprintSpan("baguette", { mm: [2, 6] });
    // Edge points are footprint cell centres: within a cell of the outline, at each axis's stretch.
    const cell = getJewelTemplate("baguette").footprint.cell;
    expect(Math.abs(span.x - 2)).toBeLessThan(cell * 2 * 2);
    expect(Math.abs(span.y - 6)).toBeLessThan(cell * 2 * 3);
    expect(scaleAxes("baguette", { mm: [2, 6] })).toEqual({ x: 2, y: 3, z: 3 });
  });

  it("stretches the short axis of a shape long across x", () => {
    expect(longAxis("dachshund")).toBe("x");
    const a = scaleAxes("dachshund", { mm: [3, 6] });
    expect(a.x).toBe(3);
    expect(a.y * SHAPE_HALF_EXTENTS.dachshund[1]).toBeCloseTo(1.5, 9);
  });

  it("bounds the outline by its larger stretch", () => {
    const a = scaleAxes("raindrop", { mm: [4, 5] });
    expect(a.x).toBeGreaterThan(a.y);
    expect(maxFaceScale(a)).toBe(a.x);
  });

  it.each(STUDIO_SHAPES)("keeps %s uniform for SS and single-value sizes", (shape) => {
    for (const size of [{ ss: 5 }, { ss: 16 }, { mm: [4] }, { mm: [2.5] }] as GemSize[]) {
      const s = scaleForSize(size);
      expect(scaleAxes(shape, size)).toEqual({ x: s, y: s, z: s });
      expect(glyphStretch(shape, size)).toEqual([1, 1]);
      const at = { x: 3, y: -2, r: s, rotation: 30 };
      expect(gemOutline(shape, { ...at, stretch: glyphStretch(shape, size) })).toEqual(gemOutline(shape, at));
    }
  });

  it("draws a 2 × 6 mm baguette 2 wide on the front view", () => {
    const size: GemSize = { mm: [2, 6] };
    const span = outlineSpan("baguette", glyphStretch("baguette", size), scaleForSize(size));
    expect(span.x).toBeCloseTo(2, 6);
    expect(span.y).toBeCloseTo(outlineSpan("baguette", [1, 1], 3).y, 9);
  });
});
