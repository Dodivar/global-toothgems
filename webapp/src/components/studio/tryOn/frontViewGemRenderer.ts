import { pathToSvg } from "../../../lib/studio3d/frontView";
import type { TryOnGemRenderer } from "./gemOverlay";
import { FrontViewOverlay } from "./FrontViewOverlay";
import { GEM_EDGE, edgeWidth, layoutOf } from "./frontViewLayout";

/** The try-on's gems drawn from the Studio's front view: live overlay and exported canvas (`frontViewLayout.ts`). */
export const frontViewGemRenderer: TryOnGemRenderer = {
  Overlay: FrontViewOverlay,
  paint(ctx, props) {
    for (const s of layoutOf(props).spots) {
      const path = new Path2D(pathToSvg(s.outline));
      ctx.fillStyle = s.color;
      ctx.fill(path);
      ctx.lineWidth = edgeWidth(s);
      ctx.lineJoin = "round";
      ctx.strokeStyle = GEM_EDGE;
      ctx.stroke(path);
      ctx.beginPath();
      ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fill();
    }
  },
};
