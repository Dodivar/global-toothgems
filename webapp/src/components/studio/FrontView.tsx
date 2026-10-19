import { useId } from "react";
import clsx from "clsx";
import { GLYPH_SPAN, crownOutline, pathToSvg, type FrontViewProjection } from "../../lib/studio3d/frontView";
import { shapeGlyph } from "./editor/pieceGlyphs";

/**
 * The front view drawn in SVG: both arches flat, as seen facing the patient,
 * and every gem at its place on its tooth, in its outline, size, turn and
 * colour, with its number (`lib/studio3d/frontView.ts` does the projection).
 *
 * The drawing is in the projection's millimetres (`viewBox` = `box`), so a
 * gem keeps its true proportions. With `showTeeth={false}` it draws the gems
 * alone on a transparent background, in the same frame — for an overlay on a
 * photo, where `FrontViewGems` can also be placed inside another SVG.
 *
 * Colours are literal (like `ScenePreview`): the drawing is a schematic on a
 * light ground in both themes, and the same markup is rasterised elsewhere.
 * State is never colour alone: every gem carries its number, a gem on the
 * tongue side is dashed, a highlighted gem is ringed.
 */

const ENAMEL_TOP = "#fbf8f1";
const ENAMEL_BOTTOM = "#ece3d0";
const ENAMEL_EDGE = "rgba(120, 98, 70, .38)";
const GUM = "#f1c7cb";
const STAGE = "#eef3f9";
const GEM_EDGE = "rgba(38, 60, 82, .7)";
const INK = "#111111";
const FONT = 'Montserrat, "Helvetica Neue", Arial, sans-serif';
/** Number badge radius, mm of the drawing. */
const BADGE = 1.25;

export interface FrontViewGemsProps {
  projection: FrontViewProjection;
  /** Number badges beside the gems (default true). */
  numbered?: boolean;
  /** Gems to ring, e.g. the editor's selection. */
  highlightIds?: readonly string[];
}

/**
 * The gems alone, as an SVG group in the projection's millimetres (x right,
 * y down, origin of the world — `box.x`/`box.y` is the frame's corner). Put
 * it in any SVG whose coordinates map onto those of `projection.box`.
 */
export function FrontViewGems({ projection, numbered = true, highlightIds }: FrontViewGemsProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const highlighted = new Set(highlightIds ?? []);
  const drawn = projection.gems.filter((g) => g.at);
  return (
    <g>
      <defs>
        <radialGradient id={`${id}-shine`} cx="35%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {drawn.map((g) => {
        const at = g.at!;
        const color = g.piece.look.color;
        const back = at.facing === "back";
        return (
          <g key={g.id} data-gem={g.number} opacity={back ? 0.6 : 1}>
            {highlighted.has(g.id) && (
              <circle cx={at.x} cy={at.y} r={at.r + 0.7} fill="none" stroke="#2f6fb0" strokeWidth={0.35} />
            )}
            <g
              transform={`translate(${at.x} ${at.y}) rotate(${at.rotation}) scale(${(at.r * 2) / GLYPH_SPAN}) translate(-8 -8)`}
              fill={color}
              color={color}
              stroke={GEM_EDGE}
              strokeWidth={0.8}
              strokeLinejoin="round"
              strokeDasharray={back ? "1.6 1.1" : undefined}
            >
              {shapeGlyph(g.shape)}
              <circle cx="6" cy="5.5" r="2.6" fill={`url(#${id}-shine)`} stroke="none" />
            </g>
          </g>
        );
      })}
      {numbered &&
        drawn.map((g) => {
          const at = g.at!;
          const reach = at.r * 0.75 + BADGE * 0.75;
          const label = String(g.number);
          return (
            <g key={`n-${g.id}`} transform={`translate(${at.x + reach} ${at.y - reach})`}>
              <circle r={BADGE} fill="#ffffff" stroke={INK} strokeWidth={0.14} />
              <text
                y={0.05}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={FONT}
                fontWeight={800}
                fontSize={label.length > 2 ? 1.05 : 1.4}
                fill={INK}
              >
                {label}
              </text>
            </g>
          );
        })}
    </g>
  );
}

export interface FrontViewProps extends FrontViewGemsProps {
  /** Draw the teeth and gums (default true). Without them, gems alone on a transparent ground. */
  showTeeth?: boolean;
  /** Accessible name; omitted, the drawing is decorative (the list beside it says it all). */
  title?: string;
  /** Longer accessible description. */
  description?: string;
  /** Which side is which, written in the drawing's top corners. */
  sideLabels?: { patientRight: string; patientLeft: string };
  className?: string;
}

export function FrontView({ projection, showTeeth = true, numbered = true, highlightIds, title, description, sideLabels, className }: FrontViewProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { box } = projection;
  const upper = projection.teeth.filter((t) => !t.lower);
  const lower = projection.teeth.filter((t) => t.lower);
  const span = (teeth: typeof upper) => {
    const xs = teeth.flatMap((t) => [t.x0, t.x1]);
    return [Math.min(...xs) - 0.6, Math.max(...xs) + 0.6] as const;
  };
  const [ux0, ux1] = span(upper);
  const [lx0, lx1] = span(lower);
  const upperNeck = Math.max(...upper.map((t) => t.cervical));
  const lowerNeck = Math.min(...lower.map((t) => t.cervical));

  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={clsx("block h-auto w-full", className)}
      role={title ? "img" : undefined}
      aria-labelledby={title ? `${id}-title` : undefined}
      aria-describedby={title && description ? `${id}-desc` : undefined}
      aria-hidden={title ? undefined : true}
      style={{ aspectRatio: `${box.width} / ${box.height}` }}
    >
      {title && <title id={`${id}-title`}>{title}</title>}
      {title && description && <desc id={`${id}-desc`}>{description}</desc>}
      {showTeeth && (
        <>
          <defs>
            <linearGradient id={`${id}-enamel-up`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENAMEL_BOTTOM} />
              <stop offset="100%" stopColor={ENAMEL_TOP} />
            </linearGradient>
            <linearGradient id={`${id}-enamel-down`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENAMEL_TOP} />
              <stop offset="100%" stopColor={ENAMEL_BOTTOM} />
            </linearGradient>
          </defs>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} fill={STAGE} />
          <rect x={ux0} y={box.y} width={ux1 - ux0} height={upperNeck + 2.4 - box.y} fill={GUM} />
          <rect x={lx0} y={lowerNeck - 2.4} width={lx1 - lx0} height={box.y + box.height - lowerNeck + 2.4} fill={GUM} />
          {projection.teeth.map((t) => (
            <path
              key={t.fdi}
              d={pathToSvg(crownOutline(t))}
              fill={`url(#${id}-enamel-${t.lower ? "up" : "down"})`}
              stroke={ENAMEL_EDGE}
              strokeWidth={0.12}
            />
          ))}
          {sideLabels && (
            <g fontFamily={FONT} fontWeight={700} fontSize={1.3} fill="#5c5c5c">
              <text x={box.x + 1.2} y={box.y + 1.9}>
                {sideLabels.patientRight}
              </text>
              <text x={box.x + box.width - 1.2} y={box.y + 1.9} textAnchor="end">
                {sideLabels.patientLeft}
              </text>
            </g>
          )}
        </>
      )}
      <FrontViewGems projection={projection} numbered={numbered} highlightIds={highlightIds} />
    </svg>
  );
}
