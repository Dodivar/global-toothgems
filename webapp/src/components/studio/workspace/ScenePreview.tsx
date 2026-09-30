import { useId, useMemo } from "react";
import clsx from "clsx";
import { ARCH_FRAMES } from "../../../lib/studio3d/archLayout";
import { pieceSwatchColor, type PreviewPiece } from "../../../lib/studioWorkspace/gemGroup";
import { TYPE_ICONS } from "../editor/pieceGlyphs";

/**
 * A drawn front view of a saved design: the Studio's own arch, from the same
 * numbers the 3D engine builds it with, and every piece at its saved
 * position, size, spin and finish.
 *
 * Used where a live WebGL render is not available — the seeded designs, a
 * design saved without a capture, the Gem Groups — so a card always shows the
 * real composition, never a generic placeholder. Decorative: the card around
 * it names the design and counts its pieces.
 */

const ENAMEL_TOP = "#fbf8f1";
const ENAMEL_BOTTOM = "#ece3d0";

/** Crown outline of one tooth in the front view, in SVG units (y down). */
function crownPath(cx: number, top: number, w: number, h: number, pointed: boolean): string {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const b = top + h;
  const rb = Math.min(w * 0.32, 1.6);
  const tip = pointed ? h * 0.1 : 0;
  return [
    `M${l + w * 0.12} ${top}`,
    `L${r - w * 0.12} ${top}`,
    `Q${r} ${top} ${r} ${top + h * 0.3}`,
    `L${r} ${b - rb}`,
    `Q${r} ${b} ${r - rb} ${b}`,
    pointed ? `L${cx} ${b + tip}` : "",
    `L${l + rb} ${b}`,
    `Q${l} ${b} ${l} ${b - rb}`,
    `L${l} ${top + h * 0.3}`,
    `Q${l} ${top} ${l + w * 0.12} ${top}`,
    "Z",
  ].join(" ");
}

const TEETH = [...ARCH_FRAMES].sort((a, b) => Math.abs(b.center.x) - Math.abs(a.center.x));

/** Gum band: its lower edge just under each crown's top, its upper edge a few millimetres above. */
const GUM_PATH = (() => {
  const byX = [...ARCH_FRAMES].sort((a, b) => a.center.x - b.center.x);
  const top = (t: (typeof byX)[number]) => -t.center.y - t.spec.hHalf;
  const lower = byX.map((t) => `${t.center.x.toFixed(2)} ${(top(t) + 0.9).toFixed(2)}`);
  const upper = [...byX].reverse().map((t) => `${t.center.x.toFixed(2)} ${(top(t) - 3.4).toFixed(2)}`);
  const first = byX[0];
  const last = byX[byX.length - 1];
  return `M${(first.center.x - 6).toFixed(2)} ${(top(first) + 0.9).toFixed(2)} L${lower.join(" L")} L${(last.center.x + 6).toFixed(2)} ${(top(last) + 0.9).toFixed(2)} L${(last.center.x + 6).toFixed(2)} ${(top(last) - 3.4).toFixed(2)} L${upper.join(" L")} L${(first.center.x - 6).toFixed(2)} ${(top(first) - 3.4).toFixed(2)} Z`;
})();

export function ScenePreview({
  pieces,
  className,
  minWidth = 26,
  label,
}: {
  pieces: PreviewPiece[];
  className?: string;
  /** Narrowest slice of the arch shown, in millimetres (a single gem still shows its neighbours). */
  minWidth?: number;
  /** Accessible name when the preview stands alone; omitted, it is decorative. */
  label?: string;
}) {
  const id = useId().replace(/:/g, "");

  // Frame the pieces: centre on them, at least `minWidth` wide, 4:3.
  const view = useMemo(() => {
    const xs = pieces.map((p) => p.position.x);
    const ys = pieces.map((p) => p.position.y);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    const w = Math.min(Math.max(minWidth, span + 9), 68);
    const h = w * 0.75;
    // Keep the teeth in frame even when all the pieces sit near an edge.
    const x = Math.max(-34, Math.min(34 - w, cx - w / 2));
    // Crowns in the middle, a little gum above: the teeth are what the eye reads.
    const y = -Math.max(Math.min(cy, 2), -2) - h * 0.56;
    return { x, y, w, h };
  }, [pieces, minWidth]);

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid slice"
      className={clsx("block h-full w-full", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <radialGradient id={`${id}-stage`} cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor="var(--gt-blue-50)" />
          <stop offset="62%" stopColor="var(--gt-blue-200)" />
          <stop offset="100%" stopColor="var(--gt-blue-300)" />
        </radialGradient>
        <linearGradient id={`${id}-enamel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ENAMEL_TOP} />
          <stop offset="100%" stopColor={ENAMEL_BOTTOM} />
        </linearGradient>
        <linearGradient id={`${id}-gum`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eeb4b9" stopOpacity="0" />
          <stop offset="45%" stopColor="#eeb4b9" stopOpacity=".85" />
          <stop offset="100%" stopColor="#e39aa2" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="35%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={view.x - 1} y={view.y - 1} width={view.w + 2} height={view.h + 2} fill={`url(#${id}-stage)`} />
      {/* A slim gum band along the crowns' tops, fading upward. */}
      <path d={GUM_PATH} fill={`url(#${id}-gum)`} />
      {TEETH.map((t) => {
        const w = t.width * t.outward.z * 0.94;
        const h = t.spec.hHalf * 2;
        const top = -t.center.y - t.spec.hHalf;
        const shade = 1 - Math.min(Math.abs(t.center.x) / 40, 0.5) * 0.25;
        return (
          <path
            key={t.fdi}
            d={crownPath(t.center.x, top, w, h, t.spec.tip !== undefined)}
            fill={`url(#${id}-enamel)`}
            stroke="rgba(120, 98, 70, .22)"
            strokeWidth={0.14}
            opacity={shade}
          />
        );
      })}
      {pieces.map((p, i) => {
        // A touch larger than life (×1.1) so a petite crystal still reads on a small card.
        const size = (p.scale * 2 * 1.1) / 12.8;
        const color = pieceSwatchColor(p);
        return (
          <g
            key={i}
            transform={`translate(${p.position.x} ${-p.position.y}) rotate(${-p.rotation}) scale(${size}) translate(-8 -8)`}
            fill={color}
            color={color}
            stroke="rgba(38, 60, 82, .62)"
            strokeWidth={0.8}
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0.25px 0.35px rgba(17,17,17,.35))" }}
          >
            {TYPE_ICONS[p.jewelryTypeId] ?? TYPE_ICONS["crystal-round"]}
            <circle cx="6" cy="5.5" r="2.6" fill={`url(#${id}-shine)`} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}
