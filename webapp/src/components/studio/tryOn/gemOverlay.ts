import type { ComponentType } from "react";
import type { Creation } from "../../../lib/studioWorkspace/types";
import type { BoxPlacement } from "../../../lib/studio3d/tryOnTransform";

/**
 * The slot that draws a creation's gems inside the try-on overlay box.
 *
 * Two halves that must draw the same thing: `Overlay`, the live view on the
 * photo, and `paint`, the same gems on the exported image's canvas. The box
 * is the overlay's own, unrotated frame: (0, 0) its top-left corner, `width`
 * × `height` pixels — the caller has already moved and rotated it onto the
 * photo, and applies the opacity. `placements` is null for a manual
 * placement (the renderer lays the gems out from the creation's scene, as a
 * front view) or, after an automatic placement, where the service put each
 * gem, normalised to the box.
 */
export interface GemOverlayProps {
  creation: Creation;
  placements: BoxPlacement[] | null;
  width: number;
  height: number;
}

export interface TryOnGemRenderer {
  Overlay: ComponentType<GemOverlayProps>;
  paint(ctx: CanvasRenderingContext2D, props: GemOverlayProps): void | Promise<void>;
}
