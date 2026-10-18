import { pathToSvg } from "../../../lib/studio3d/frontView";
import type { GemOverlayProps } from "./gemOverlay";
import { GEM_EDGE, GUIDE, GUIDE_SHADOW, edgeWidth, layoutOf } from "./frontViewLayout";

/** The live half of `frontViewGemRenderer`: the gems, and the faint guide of the front teeth. */
export function FrontViewOverlay(props: GemOverlayProps) {
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
