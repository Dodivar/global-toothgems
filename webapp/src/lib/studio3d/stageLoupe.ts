/**
 * The loupe of the 3D Studio on a phone: while a finger drags a piece or a gem
 * from the library, a magnified circle above it shows what the finger hides.
 * Where it stands and which part of the canvas it copies. Pure, tested.
 */

/** The loupe's diameter, in CSS pixels. */
export const LOUPE_SIZE = 108;
/** How much it magnifies. */
export const LOUPE_ZOOM = 2;
/** Between the finger's point and the loupe's centre: clear of a fingertip. */
export const LOUPE_LIFT = 92;
const MARGIN = 6;

export interface LoupeBox {
  /** Top-left corner in the stage, in CSS pixels. */
  left: number;
  top: number;
}

/**
 * Above the finger; too close to the top of the stage, beside it (on the side
 * with more room), always inside the stage.
 */
export function placeLoupe(x: number, y: number, stageWidth: number, stageHeight: number): LoupeBox {
  const half = LOUPE_SIZE / 2;
  let cx = x;
  let cy = y - LOUPE_LIFT;
  if (cy - half < MARGIN) {
    cy = y;
    cx = x + (x < stageWidth / 2 ? LOUPE_LIFT : -LOUPE_LIFT);
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  return {
    left: Math.round(clamp(cx - half, MARGIN, stageWidth - MARGIN - LOUPE_SIZE)),
    top: Math.round(clamp(cy - half, MARGIN, stageHeight - MARGIN - LOUPE_SIZE)),
  };
}

/** The square of the canvas the loupe shows, in canvas (device) pixels, centred on the finger. */
export function loupeSource(x: number, y: number, pixelRatio: number) {
  const side = (LOUPE_SIZE / LOUPE_ZOOM) * pixelRatio;
  return { sx: x * pixelRatio - side / 2, sy: y * pixelRatio - side / 2, side };
}
