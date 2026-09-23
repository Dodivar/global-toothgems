import { useId, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { GLYPH_PATHS } from "../ui/ShapeGlyph";
import type { GemShape } from "../../data/products";

/**
 * The three editorial illustrations of the system pages.
 *
 * Each one is drawn from the catalogue's own gem cuts (`GLYPH_PATHS`), so the
 * error screens speak the same visual language as the shape selector and the
 * loyalty stamps instead of introducing a mascot. Pastel blue carries every
 * composition; each page then allows itself at most one accent, and only as a
 * detail: a fuchsia glint on the 404, nothing on the server error (calm first),
 * an emerald working arc on maintenance.
 *
 * All three share a 400×400 artboard and are purely decorative: the wrapper
 * hides them from assistive technology, and the page copy says everything they
 * suggest.
 */

const ARTBOARD = 400;
/** Circumference of the maintenance setting ring (r = 88). */
const RING_CIRCUMFERENCE = 2 * Math.PI * 88;

/** A four-point sparkle centred on the origin, one unit in radius. */
const SPARKLE_PATH = "M0-1C.12-.12.12-.12 1 0 .12.12.12.12 0 1-.12.12-.12.12-1 0-.12-.12-.12-.12 0-1Z";

function useGradientIds() {
  const id = useId().replace(/:/g, "");
  return { gem: `gt-gem-${id}`, wash: `gt-wash-${id}` };
}

function Defs({ ids }: { ids: ReturnType<typeof useGradientIds> }) {
  return (
    <defs>
      <radialGradient id={ids.wash} cx="50%" cy="46%" r="52%">
        <stop offset="0%" stopColor="var(--gt-blue-100)" />
        <stop offset="62%" stopColor="var(--gt-blue-50)" />
        <stop offset="100%" stopColor="var(--gt-blue-50)" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.gem} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--gt-white)" />
        <stop offset="42%" stopColor="var(--gt-blue-200)" />
        <stop offset="100%" stopColor="var(--gt-blue-400)" />
      </linearGradient>
    </defs>
  );
}

/** One faceted gem, centred on (x, y), drawn at `size` px on the artboard. */
function Gem({
  shape,
  x,
  y,
  size,
  rotate = 0,
  gradient,
  className,
  style,
}: {
  shape: GemShape;
  x: number;
  y: number;
  size: number;
  rotate?: number;
  gradient: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { outline, facets } = GLYPH_PATHS[shape];
  const scale = size / 32;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <g className={className} style={style}>
        <g transform={`scale(${scale}) translate(-16 -16)`}>
          <path
            d={outline}
            fill={`url(#${gradient})`}
            stroke="var(--gt-blue-600)"
            strokeWidth={1.25}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={facets}
            fill="none"
            stroke="var(--gt-white)"
            strokeWidth={1}
            strokeOpacity={0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={facets}
            fill="none"
            stroke="var(--gt-blue-600)"
            strokeWidth={0.6}
            strokeOpacity={0.35}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>
    </g>
  );
}

function Sparkle({
  x,
  y,
  size,
  color = "var(--gt-blue-500)",
  delay = 0,
}: {
  x: number;
  y: number;
  size: number;
  color?: string;
  delay?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={SPARKLE_PATH}
        transform={`scale(${size})`}
        fill={color}
        className="gt-sys-twinkle"
        style={{ "--gt-delay": `${delay}ms` } as CSSProperties}
      />
    </g>
  );
}

/** The shared stage: a soft pastel wash, the artwork, and an optional glass chip. */
function Stage({ children, chip }: { children: ReactNode; chip?: ReactNode }) {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[220px] sm:max-w-[320px] lg:max-w-[440px]">
      <svg viewBox={`0 0 ${ARTBOARD} ${ARTBOARD}`} className="block h-full w-full overflow-visible" focusable="false">
        {children}
      </svg>
      {chip}
    </div>
  );
}

/** Small restrained glass label laid over the artwork. */
function GlassChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "gt-glass absolute hidden items-center gap-2 rounded-[var(--radius-pill)] px-3.5 py-2 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] sm:flex",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * 404 — the empty setting.
 *
 * A prong setting waits in the middle of its orbit while the gem that belongs
 * in it floats a little further on, joined by a dotted detour. The page is
 * missing, not broken: the piece exists, it just is not where you looked.
 */
export function MisplacedGemVisual() {
  const ids = useGradientIds();
  return (
    <Stage>
      <Defs ids={ids} />
      <circle cx="200" cy="200" r="178" fill={`url(#${ids.wash})`} />
      <ellipse
        cx="200"
        cy="214"
        rx="158"
        ry="58"
        transform="rotate(-12 200 214)"
        fill="none"
        stroke="var(--gt-blue-300)"
        strokeWidth="1.25"
        strokeDasharray="2 7"
        strokeLinecap="round"
      />

      {/* The setting, empty: dashed seat, four prongs, a soft contact shadow. */}
      <ellipse cx="168" cy="318" rx="46" ry="7" fill="var(--gt-blue-300)" opacity=".35" />
      <g transform="translate(168 250)">
        <circle r="52" fill="var(--gt-white)" fillOpacity=".75" stroke="var(--gt-blue-500)" strokeWidth="1.5" strokeDasharray="5 6" />
        <circle r="30" fill="none" stroke="var(--gt-blue-300)" strokeWidth="1" strokeDasharray="2 5" />
        {[0, 90, 180, 270].map((angle) => (
          <rect
            key={angle}
            x="-4"
            y="-60"
            width="8"
            height="15"
            rx="4"
            fill="var(--gt-blue-400)"
            transform={`rotate(${angle + 45})`}
          />
        ))}
      </g>

      {/* The detour. */}
      <path
        d="M210 222C250 214 238 166 276 158"
        fill="none"
        stroke="var(--gt-blue-400)"
        strokeWidth="1.75"
        strokeDasharray="1 8"
        strokeLinecap="round"
        className="gt-sys-trail"
      />

      {/* The gem that wandered off, and its faint shadow on the orbit. */}
      <ellipse cx="300" cy="206" rx="26" ry="4.5" fill="var(--gt-blue-400)" opacity=".22" />
      <Gem shape="round" x={300} y={118} size={98} rotate={16} gradient={ids.gem} className="gt-sys-float" />

      {/* The one fuchsia note on the page: a single glint on the runaway gem. */}
      <Sparkle x={346} y={70} size={11} color="var(--gt-fuchsia-400)" />
      <Sparkle x={96} y={132} size={8} delay={900} />
      <Sparkle x={338} y={268} size={6} delay={1600} />
      <Sparkle x={70} y={292} size={5} delay={2300} />
    </Stage>
  );
}

/** Points along the smile arc M70 170 Q200 300 330 170, at t = .1 .3 .5 .7 .9. */
const ARC_GEMS: { shape: GemShape; x: number; y: number; size: number }[] = [
  { shape: "round", x: 96, y: 193, size: 40 },
  { shape: "navette", x: 148, y: 225, size: 48 },
  { shape: "star", x: 200, y: 235, size: 60 },
  { shape: "navette", x: 252, y: 225, size: 48 },
  { shape: "round", x: 304, y: 193, size: 40 },
];

/**
 * 500 — one stone out of line.
 *
 * Five gems set along the curve of a smile, the way they would sit on teeth.
 * The centre stone has slipped from its seat and keeps easing back towards
 * it. Nothing is shattered; one thing is momentarily off.
 */
export function MisalignedGemsVisual({ pauseLabel }: { pauseLabel: string }) {
  const ids = useGradientIds();
  const centre = ARC_GEMS[2];
  return (
    <Stage
      chip={
        <GlassChip className="bottom-[9%] left-1/2 -translate-x-1/2">
          <span className="flex gap-[3px]" aria-hidden="true">
            <span className="h-2.5 w-[3px] rounded-full bg-[var(--gt-ink-900)]" />
            <span className="h-2.5 w-[3px] rounded-full bg-[var(--gt-ink-900)]" />
          </span>
          {pauseLabel}
        </GlassChip>
      }
    >
      <Defs ids={ids} />
      <circle cx="200" cy="200" r="178" fill={`url(#${ids.wash})`} />
      <path d="M70 170Q200 300 330 170" fill="none" stroke="var(--gt-blue-300)" strokeWidth="1.5" strokeLinecap="round" />

      {ARC_GEMS.filter((gem) => gem !== centre).map((gem) => (
        <Gem key={gem.x} {...gem} gradient={ids.gem} />
      ))}

      {/* The empty seat: occludes the line so the gap reads as a gap. */}
      <circle
        cx={centre.x}
        cy={centre.y}
        r="24"
        fill="var(--gt-blue-50)"
        stroke="var(--gt-blue-500)"
        strokeWidth="1.25"
        strokeDasharray="4 5"
      />

      <Gem
        shape={centre.shape}
        x={centre.x + 22}
        y={centre.y + 50}
        size={centre.size}
        rotate={22}
        gradient={ids.gem}
        className="gt-sys-wobble"
      />

      <Sparkle x={112} y={112} size={8} />
      <Sparkle x={300} y={104} size={6} delay={1200} />
      <Sparkle x={82} y={262} size={5} delay={2100} />
    </Stage>
  );
}

/** Three small stones on the outer orbit, placed at 20°, 140° and 260°. */
const ORBIT_GEMS: { shape: GemShape; x: number; y: number; size: number }[] = [
  { shape: "heart", x: 331.6, y: 247.9, size: 32 },
  { shape: "drop", x: 92.8, y: 290, size: 28 },
  { shape: "star", x: 175.7, y: 62.1, size: 34 },
];

/**
 * Maintenance — a stone being set.
 *
 * A centre gem inside its setting ring, with a short emerald arc travelling
 * around the ring as the work in hand, and a few smaller stones orbiting at a
 * distance, waiting their turn. Planned, careful, nearly done.
 */
export function SettingInProgressVisual({ statusLabel }: { statusLabel: string }) {
  const ids = useGradientIds();
  return (
    <Stage
      chip={
        <GlassChip className="left-[4%] top-[8%]">
          <span aria-hidden="true" className="gt-sys-pulse h-2 w-2 rounded-full bg-[var(--gt-emerald-500)]" />
          {statusLabel}
        </GlassChip>
      }
    >
      <Defs ids={ids} />
      <circle cx="200" cy="200" r="178" fill={`url(#${ids.wash})`} />

      <circle cx="200" cy="200" r="140" fill="none" stroke="var(--gt-blue-300)" strokeWidth="1.25" strokeDasharray="2 7" strokeLinecap="round" />
      <g className="gt-sys-orbit">
        {ORBIT_GEMS.map((gem) => (
          <Gem key={gem.shape} {...gem} gradient={ids.gem} />
        ))}
      </g>

      {/* The setting ring and the arc of work travelling around it. */}
      <circle cx="200" cy="200" r="88" fill="var(--gt-white)" fillOpacity=".7" stroke="var(--gt-blue-200)" strokeWidth="4" />
      <g className="gt-sys-spin">
        <circle
          cx="200"
          cy="200"
          r="88"
          fill="none"
          stroke="var(--gt-emerald-500)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE * 0.18} ${RING_CIRCUMFERENCE}`}
          transform="rotate(-90 200 200)"
        />
      </g>

      <Gem shape="round" x={200} y={200} size={112} gradient={ids.gem} className="gt-sys-float" />

      <Sparkle x={292} y={112} size={9} />
      <Sparkle x={104} y={150} size={6} delay={1100} />
      <Sparkle x={280} y={318} size={7} delay={2000} />
    </Stage>
  );
}
