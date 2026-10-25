import type { ComponentType } from "react";
import type { TryOnCreation } from "../../../lib/studio3d/tryOn";

/**
 * The slot that draws a creation's gems inside the try-on overlay box.
 *
 * Two halves that must draw the same thing: `Overlay`, the live view on the
 * photo, and `paint`, the same gems on the exported image's canvas. The box
 * is the overlay's own, unrotated frame: (0, 0) its top-left corner, `width`
 * × `height` pixels — the caller has already moved and rotated it onto the
 * photo, and applies the opacity. The renderer lays the gems out from the
 * creation's scene, as a front view.
 */
export interface GemOverlayProps {
  creation: TryOnCreation;
  width: number;
  height: number;
}

export interface TryOnGemRenderer {
  Overlay: ComponentType<GemOverlayProps>;
  paint(ctx: CanvasRenderingContext2D, props: GemOverlayProps): void | Promise<void>;
}
