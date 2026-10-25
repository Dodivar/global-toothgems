import { scaleForSize, type StudioShape } from "../../data/studioEditor";
import type { GemSize } from "../gemOptions";

/**
 * How a piece is drawn at its real size, per axis (decision 107).
 *
 * Every shape's 3D template (`geometry.ts`) is normalised so that its longest
 * half-side is 1, in its own proportions. A size in SS, or one millimetre
 * value, gives the longest side only: the piece is scaled uniformly by half
 * of it (`scaleForSize`), exactly as before. A size typed as width × length
 * ("2x6") gives both: the outline's long axis is stretched to the length and
 * its short axis to the width, so a 2 × 6 mm baguette (outline 1:2) is drawn
 * 2 × 6, not 3 × 6.
 *
 * Depth (z) stays half the longest side, as for a uniform piece: thickness
 * and standoff from the enamel do not change with the width.
 *
 * Pure: no three.js — the 2D front view and the placement sheet use it too.
 */

/** A scale per axis of the piece's own frame: x and y across its face, z its depth. */
export interface ScaleAxes {
  x: number;
  y: number;
  z: number;
}

/**
 * Half extents (x, y) of each shape's normalised template, as `getJewelTemplate`
 * builds it (the longest is 1). Measured from the geometry; `geometry.test.ts`
 * fails if an outline changes without this table.
 */
export const SHAPE_HALF_EXTENTS: Record<StudioShape, readonly [x: number, y: number]> = {
  round: [1, 1],
  baguette: [0.5, 1],
  square: [1, 1],
  heart: [1, 0.8449],
  "open-heart": [1, 0.9223],
  kite: [0.6, 1],
  navette: [0.515, 1],
  raindrop: [0.2811, 1],
  triangle: [1, 0.9345],
  "rivoli-star": [1, 0.9545],
  starflower: [1, 0.9561],
  "halo-star": [1, 0.9612],
  bolt: [0.5652, 1],
  cherries: [0.8275, 1],
  snake: [0.5726, 1],
  dachshund: [1, 0.699],
};

/**
 * The axis along which a shape's outline is longest. A square outline (round,
 * square) takes its length along y, like the baguette, so a "2x4" square stone
 * stands upright before it is turned.
 */
export function longAxis(shape: StudioShape): "x" | "y" {
  const [hx, hy] = SHAPE_HALF_EXTENTS[shape] ?? SHAPE_HALF_EXTENTS.round;
  return hx > hy ? "x" : "y";
}

/** The width × length of a size, when it has two (else null: the piece is scaled uniformly). */
function widthLength(size: GemSize): [number, number] | null {
  return size.mm && size.mm.length === 2 ? [size.mm[0], size.mm[1]] : null;
}

/** The scale of a piece of this shape and size, per axis. Uniform sizes give `scale` on every axis, exactly. */
export function scaleAxes(shape: StudioShape, size: GemSize): ScaleAxes {
  const scale = scaleForSize(size);
  const wl = widthLength(size);
  if (!wl) return { x: scale, y: scale, z: scale };
  const [hx, hy] = SHAPE_HALF_EXTENTS[shape] ?? SHAPE_HALF_EXTENTS.round;
  const short = wl[0] / 2 / Math.min(hx, hy);
  return longAxis(shape) === "x" ? { x: scale, y: short, z: scale } : { x: short, y: scale, z: scale };
}

/** The largest stretch across the face: what a radius in template units must be multiplied by to stay a bound. */
export function maxFaceScale(axes: ScaleAxes): number {
  return Math.max(axes.x, axes.y);
}
