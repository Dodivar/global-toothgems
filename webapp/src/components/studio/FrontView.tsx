import { useId } from "react";
import clsx from "clsx";
import dentitionRender from "../../assets/studio/dentition-front.webp";
import { crownDetails, crownOutline } from "../../lib/studio3d/flatView";
import { GLYPH_SPAN, pathToSvg, type FrontViewProjection } from "../../lib/studio3d/frontView";
import { shapeGlyph } from "./editor/pieceGlyphs";

/**
 * The front view drawn in SVG: both arches, and every gem at its place on its
 * tooth, in its outline, size, turn and colour, with its number. The teeth
 * are the brand's front render (`projection.backdrop === "render"`,
 * `lib/studio3d/renderView.ts`) or, laid flat without perspective, vector
 * crowns in the silhouette of their type and the render's style — pale blue
 * glossy enamel, no gum (`lib/studio3d/flatView.ts`).
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

// The front render's enamel: pale blue, lighter at the heart of the crown, a gloss on its upper side.
const ENAMEL_LIGHT = "#eef4fa";
const ENAMEL = "#d9e4ef";
const ENAMEL_SHADE = "#b4c5d8";
const ENAMEL_EDGE = "rgba(92, 120, 152, .45)";
const ENAMEL_LINE = "rgba(92, 120, 152, .35)";
const STAGE = "#f4f8fc";
const GEM_EDGE = "rgba(38, 60, 82, .7)";
const INK = "#111111";
const FONT = 'Montserrat, "Helvetica Neue", Arial, sans-serif';
/** Number badge radius, mm of the drawing. */
const BADGE = 1.25;

/** The gloss: the crown's own outline, shrunk toward its upper middle, so the light stays inside the enamel. */
function glossTransform(t: FrontViewProjection["teeth"][number]): string {
  const cx = (t.x0 + t.x1) / 2;
  const top = Math.min(t.cervical, t.incisal);
  return `translate(${cx} ${top + 0.6}) scale(0.72 0.62) translate(${-cx} ${-top})`;
}

interface FrontViewGemsProps {
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
function FrontViewGems({ projection, numbered = true, highlightIds }: FrontViewGemsProps) {
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
              transform={`translate(${at.x} ${at.y}) rotate(${at.rotation}) scale(${(at.r * 2 * at.stretch[0]) / GLYPH_SPAN} ${(at.r * 2 * at.stretch[1]) / GLYPH_SPAN}) translate(-8 -8)`}
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

interface FrontViewProps extends FrontViewGemsProps {
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
          <rect x={box.x} y={box.y} width={box.width} height={box.height} fill={STAGE} />
          {projection.backdrop === "render" ? (
            <image href={dentitionRender.src} x={box.x} y={box.y} width={box.width} height={box.height} preserveAspectRatio="none" />
          ) : (
            <>
              <defs>
                <radialGradient id={`${id}-enamel`} cx="42%" cy="40%" r="70%">
                  <stop offset="0%" stopColor={ENAMEL_LIGHT} />
                  <stop offset="60%" stopColor={ENAMEL} />
                  <stop offset="100%" stopColor={ENAMEL_SHADE} />
                </radialGradient>
                <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0.7" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity=".85" />
                  <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {projection.teeth.map((t) => {
                const d = pathToSvg(crownOutline(t));
                return (
                  <g key={t.fdi}>
                    <path d={d} fill={`url(#${id}-enamel)`} stroke={ENAMEL_EDGE} strokeWidth={0.14} strokeLinejoin="round" />
                    <path d={d} fill={`url(#${id}-gloss)`} transform={glossTransform(t)} />
                    {crownDetails(t).map((line, i) => (
                      <path key={i} d={pathToSvg(line)} fill="none" stroke={ENAMEL_LINE} strokeWidth={0.14} strokeLinecap="round" />
                    ))}
                  </g>
                );
              })}
            </>
          )}
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
