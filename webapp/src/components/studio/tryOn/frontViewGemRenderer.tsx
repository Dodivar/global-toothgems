import { pathToSvg } from "../../../lib/studio3d/frontView";
import { tryOnLayout, type TryOnSpot } from "../../../lib/studio3d/tryOnLayout";
import type { GemOverlayProps, TryOnGemRenderer } from "./gemOverlay";

/**
 * The try-on's gems, drawn from the Studio's front view (`tryOnLayout`): the
 * same outline, colour and size as the front view and the placement sheet.
 * On screen, the front teeth are outlined faintly so the artist can lay them
 * over the client's teeth; the guide is never part of the exported image.
 */

const GEM_EDGE = "rgba(38, 60, 82, .7)";
const GUIDE = "rgba(255, 255, 255, .85)";
const GUIDE_SHADOW = "rgba(17, 17, 17, .45)";

const layoutOf = ({ creation, placements, width, height }: GemOverlayProps) =>
  tryOnLayout(creation.scene.pieces, creation.scene.model, placements, width, height);

const edgeWidth = (s: TryOnSpot) => Math.max(0.6, s.r * 0.12);

function FrontViewOverlay(props: GemOverlayProps) {
  const { width, height } = props;
  const { spots, guide } = layoutOf(props);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" className="block overflow-visible">
      {guide.map((cmds, i) => {
        const d = pathToSvg(cmds);
        return (
          <g key={i} fill="none" strokeLinejoin="round">
            <path d={d} stroke={GUIDE_SHADOW} strokeWidth={2} />
            <path d={d} stroke={GUIDE} strokeWidth={1} strokeDasharray="4 3" />
          </g>
        );
      })}
      {spots.map((s) => (
        <g key={s.pieceId}>
          <path d={pathToSvg(s.outline)} fill={s.color} stroke={GEM_EDGE} strokeWidth={edgeWidth(s)} strokeLinejoin="round" />
          <circle cx={s.x - s.r * 0.3} cy={s.y - s.r * 0.3} r={s.r * 0.3} fill="rgba(255,255,255,.75)" />
        </g>
      ))}
    </svg>
  );
}

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
