import type { KeyboardEvent } from "react";
import { GemBody, GemDefs } from "./Gem";
import { useSvgPrefix } from "./gemStyle";
import type { PlacedPiece } from "../../data/studio";

/**
 * The Studio's canvas: a front view of a smile, drawn in SVG, with the pieces
 * of a composition set on the teeth.
 *
 * Not a 3D renderer — shading gradients and a vignette give the teeth volume,
 * and the parent applies a CSS perspective for the "¾" view. Geometry is
 * computed once at module load; a piece is positioned as a fraction of its
 * tooth's box, so a composition stays on its tooth whatever the zoom.
 */

const W = 640;
const H = 360;
const CX = W / 2;
const GAP = 2;
/** The visible window onto the drawing: the smile, without the empty stage around it. */
const VIEW = { x: 64, y: 36, w: 512, h: 214 };

type ToothKind = "incisor" | "canine" | "premolar";

interface Tooth {
  x: number;
  top: number;
  w: number;
  h: number;
  kind: ToothKind;
  /** Distance from the midline in teeth, for depth shading. */
  depth: number;
}

function layoutRow(widths: number[], heights: number[], kinds: ToothKind[], topAt: (d: number) => number): Tooth[] {
  const total = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
  let x = CX - total / 2;
  const mid = (widths.length - 1) / 2;
  return widths.map((w, i) => {
    const depth = Math.abs(i - mid);
    const tooth = { x, top: topAt(depth), w, h: heights[i], kind: kinds[i], depth };
    x += w + GAP;
    return tooth;
  });
}

const UPPER = layoutRow(
  [34, 40, 45, 48, 60, 60, 48, 45, 40, 34],
  [54, 68, 84, 92, 104, 104, 92, 84, 68, 54],
  ["premolar", "premolar", "canine", "incisor", "incisor", "incisor", "incisor", "canine", "premolar", "premolar"],
  (d) => 70 + d * d * 1.3,
);

const LOWER = layoutRow(
  [34, 36, 34, 31, 31, 34, 36, 34],
  [58, 60, 62, 62, 62, 62, 60, 58],
  ["premolar", "canine", "incisor", "incisor", "incisor", "incisor", "canine", "premolar"],
  (d) => 150 + d * d * 1.5,
);

function upperToothPath({ x, top, w, h, kind }: Tooth) {
  const b = top + h;
  const r = kind === "incisor" ? 8 : 11;
  const tip = kind === "canine" ? 12 : kind === "premolar" ? 5 : 3;
  const root = top - 16;
  return `M${x} ${root}L${x + w} ${root}C${x + w + 1} ${top + h * 0.45} ${x + w} ${b - r} ${x + w - r} ${b - 1}Q${x + w / 2} ${b + tip} ${x + r} ${b - 1}C${x} ${b - r} ${x - 1} ${top + h * 0.45} ${x} ${root}Z`;
}

function lowerToothPath({ x, top, w, h }: Tooth) {
  const r = 7;
  const root = top + h + 16;
  return `M${x + 1} ${root}L${x} ${top + r}Q${x} ${top} ${x + r} ${top}L${x + w - r} ${top}Q${x + w} ${top} ${x + w} ${top + r}L${x + w - 1} ${root}Z`;
}

/** Gum over the upper row: papillae dip between teeth, the margin arches over each crown. */
function upperGumPath() {
  const first = UPPER[0];
  const last = UPPER[UPPER.length - 1];
  let d = `M${first.x - 40} 0L${last.x + last.w + 40} 0L${last.x + last.w + 40} ${last.top + 10}`;
  for (let i = UPPER.length - 1; i >= 0; i--) {
    const t = UPPER[i];
    d += `L${t.x + t.w + GAP / 2} ${t.top + 14}Q${t.x + t.w / 2} ${t.top - 12} ${t.x - GAP / 2} ${t.top + 14}`;
  }
  d += `L${first.x - 40} ${first.top + 10}Z`;
  return d;
}

function lowerGumPath() {
  const first = LOWER[0];
  const last = LOWER[LOWER.length - 1];
  const margin = (t: Tooth) => t.top + t.h - 8;
  let d = `M${first.x - 40} ${H}L${first.x - 40} ${margin(first) - 6}`;
  for (const t of LOWER) {
    d += `L${t.x - GAP / 2} ${margin(t) - 12}Q${t.x + t.w / 2} ${margin(t) + 14} ${t.x + t.w + GAP / 2} ${margin(t) - 12}`;
  }
  d += `L${last.x + last.w + 40} ${margin(last) - 6}L${last.x + last.w + 40} ${H}Z`;
  return d;
}

const UPPER_GUM = upperGumPath();
const LOWER_GUM = lowerGumPath();

function piecePosition(piece: PlacedPiece) {
  const row = piece.row === "upper" ? UPPER : LOWER;
  const t = row[Math.min(piece.tooth, row.length - 1)];
  return { x: t.x + t.w * piece.u, y: t.top + t.h * piece.v };
}

function ToothShape({ tooth, path, prefix }: { tooth: Tooth; path: string; prefix: string }) {
  return (
    <g>
      <path d={path} fill={`url(#${prefix}-enamel)`} />
      <path d={path} fill={`url(#${prefix}-round)`} />
      {tooth.depth > 1 && <path d={path} fill="#1a1210" opacity={Math.min(0.42, (tooth.depth - 1) * 0.11)} />}
      <ellipse
        cx={tooth.x + tooth.w * 0.36}
        cy={tooth.top + tooth.h * 0.4}
        rx={tooth.w * 0.13}
        ry={tooth.h * 0.24}
        fill={`url(#${prefix}-spec)`}
      />
    </g>
  );
}

interface SmileCanvasProps {
  pieces: PlacedPiece[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Accessible name of each selectable piece. */
  pieceLabel?: (piece: PlacedPiece) => string;
  /** Dashed midline, shown while the symmetry guide is on. */
  guide?: boolean;
  /** Required when the canvas is not interactive: it is then a single image. */
  label?: string;
  className?: string;
}

export function SmileCanvas({ pieces, selectedId, onSelect, pieceLabel, guide, label, className }: SmileCanvasProps) {
  const prefix = useSvgPrefix();
  const interactive = Boolean(onSelect);

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
    }
  };

  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      className={className}
      role={interactive ? "group" : "img"}
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <GemDefs prefix={prefix} />
        <linearGradient id={`${prefix}-enamel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ecdfc9" />
          <stop offset=".35" stopColor="#faf7f0" />
          <stop offset=".82" stopColor="#f4f5f5" />
          <stop offset="1" stopColor="#d9e2ec" />
        </linearGradient>
        <linearGradient id={`${prefix}-round`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6b5a45" stopOpacity=".45" />
          <stop offset=".22" stopColor="#6b5a45" stopOpacity="0" />
          <stop offset=".78" stopColor="#6b5a45" stopOpacity="0" />
          <stop offset="1" stopColor="#6b5a45" stopOpacity=".5" />
        </linearGradient>
        <radialGradient id={`${prefix}-spec`}>
          <stop offset="0" stopColor="#fff" stopOpacity=".85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${prefix}-gum`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8646f" />
          <stop offset=".75" stopColor="#dc8f98" />
          <stop offset="1" stopColor="#eab0b6" />
        </linearGradient>
        <linearGradient id={`${prefix}-gum-low`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#b8646f" />
          <stop offset=".75" stopColor="#d88a94" />
          <stop offset="1" stopColor="#e7aab1" />
        </linearGradient>
        <radialGradient id={`${prefix}-mouth`} cx=".5" cy=".5" r=".6">
          <stop offset="0" stopColor="#2a1216" />
          <stop offset="1" stopColor="#0d0708" />
        </radialGradient>
        {/* Fades the drawing out towards the edges of the visible window, so the
            smile floats on whatever stage it is placed on. */}
        <radialGradient id={`${prefix}-vignette`} cx=".5" cy=".5" r=".5">
          <stop offset=".58" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={`${prefix}-mask`}>
          <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill={`url(#${prefix}-vignette)`} />
        </mask>
      </defs>

      <g mask={`url(#${prefix}-mask)`}>
        <rect width={W} height={H} fill={`url(#${prefix}-mouth)`} />
        {LOWER.map((t, i) => (
          <ToothShape key={`l${i}`} tooth={t} path={lowerToothPath(t)} prefix={prefix} />
        ))}
        <path d={LOWER_GUM} fill={`url(#${prefix}-gum-low)`} />
        {UPPER.map((t, i) => (
          <ToothShape key={`u${i}`} tooth={t} path={upperToothPath(t)} prefix={prefix} />
        ))}
        <path d={UPPER_GUM} fill={`url(#${prefix}-gum)`} />
      </g>

      {guide && (
        <line x1={CX} y1={VIEW.y + 8} x2={CX} y2={VIEW.y + VIEW.h - 8} stroke="#b9cde5" strokeOpacity=".7" strokeWidth="1" strokeDasharray="4 5" />
      )}

      {pieces.map((piece) => {
        const { x, y } = piecePosition(piece);
        const s = piece.size;
        const selected = piece.id === selectedId;
        const body = (
          <g transform={`translate(${x - s / 2} ${y - s / 2}) scale(${s / 32})`}>
            <GemBody shape={piece.shape} material={piece.material} prefix={prefix} glint={s >= 12} />
          </g>
        );
        if (!interactive) return <g key={piece.id}>{body}</g>;
        const ring = s * 0.78 + 4;
        return (
          <g
            key={piece.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={pieceLabel?.(piece)}
            onClick={() => onSelect?.(piece.id)}
            onKeyDown={(e) => onKey(e, piece.id)}
            className="gt-studio-piece cursor-pointer outline-none"
          >
            {/* Generous invisible hit area: a 2 mm crystal is a hard target. */}
            <circle cx={x} cy={y} r={Math.max(ring, 14)} fill="transparent" />
            {body}
            <circle
              className="gt-studio-piece-ring"
              cx={x}
              cy={y}
              r={ring}
              fill="none"
              stroke="#b9cde5"
              strokeWidth="1.4"
              strokeDasharray={selected ? "none" : "3 3"}
              opacity={selected ? 1 : 0}
            />
            {selected &&
              [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
              ].map(([dx, dy]) => (
                <rect
                  key={`${dx}${dy}`}
                  x={x + dx * ring * 0.72 - 2.5}
                  y={y + dy * ring * 0.72 - 2.5}
                  width="5"
                  height="5"
                  rx="1"
                  fill="#fff"
                  stroke="#5a7796"
                  strokeWidth="1"
                />
              ))}
          </g>
        );
      })}
    </svg>
  );
}
