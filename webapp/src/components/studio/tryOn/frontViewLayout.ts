import { tryOnLayout, type TryOnSpot } from "../../../lib/studio3d/tryOnLayout";
import type { GemOverlayProps } from "./gemOverlay";

/**
 * The try-on's gems, drawn from the Studio's front view (`tryOnLayout`): the
 * same outline, colour and size as the front view and the placement sheet.
 * On screen, the front teeth are outlined faintly so the artist can lay them
 * over the client's teeth; the guide is never part of the exported image.
 */

export const GEM_EDGE = "rgba(38, 60, 82, .7)";
export const GUIDE = "rgba(255, 255, 255, .85)";
export const GUIDE_SHADOW = "rgba(17, 17, 17, .45)";

export const layoutOf = ({ creation, width, height }: GemOverlayProps) =>
  tryOnLayout(creation.scene.pieces, creation.scene.model, width, height);

export const edgeWidth = (s: TryOnSpot) => Math.max(0.6, s.r * 0.12);
