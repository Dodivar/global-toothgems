import { useId } from "react";
import clsx from "clsx";
import { GLYPH_PATHS } from "../ui/ShapeGlyph";
import type { GemShape } from "../../data/products";

/**
 * One position on the loyalty card, drawn as an ink impression rather than a dot.
 *
 * The gem cuts come from `ShapeGlyph` — the same drawings the shop carousel uses —
 * so a stamped card reads as this brand's own jewellery rather than a generic
 * reward icon. A rubber stamp is never pressed twice the same way, so each
 * position gets a fixed rotation, a displaced (roughened) edge and a faint
 * offset second impression.
 *
 * The three states differ by *form*, not only colour: an earned stamp is an
 * inked glyph inside a double ring, an empty one is a dashed ring around a
 * single dot, and the next one to earn adds a solid halo. Progress therefore
 * survives greyscale, which colour alone would not.
 */

export type LoyaltyStampState = "filled" | "empty" | "next";

/** One cut per position, building to the star: a card is a set, not five copies. */
const SEQUENCE: GemShape[] = ["round", "heart", "flower", "navette", "star"];

/** Fixed, never random: a stamp that moved on every re-render would read as a glitch. */
const ROTATION = [-5.5, 3.5, -2.5, 6, -4];

interface LoyaltyStampProps {
  /** Zero-based position on the card. Drives the cut and the rotation. */
  index: number;
  state: LoyaltyStampState;
  /** Edge length in px. The drawing is a square 64-unit box, scaled. */
  size?: number;
  className?: string;
}

export function LoyaltyStamp({ index, state, size = 64, className }: LoyaltyStampProps) {
  // `useId` has emitted colons in past React versions, and a colon inside
  // `url(#...)` is not a safe fragment reference. Strip anything that is not,
  // so the ink filter cannot silently fail to resolve and leave clean edges.
  const filterId = `gt-stamp-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shape = SEQUENCE[index % SEQUENCE.length];
  const rotation = ROTATION[index % ROTATION.length];
  const { outline, facets } = GLYPH_PATHS[shape];

  // The glyphs are drawn in a 32-unit box; centre one inside the 64-unit stamp.
  const glyph = (
    <g transform="translate(16 16)">
      <path d={outline} fill="currentColor" fillOpacity={0.16} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d={facets} stroke="currentColor" strokeWidth={1} strokeOpacity={0.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );

  if (state === "filled") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className={clsx("flex-none overflow-visible", className)}
      >
        <defs>
          {/* Roughens every edge by a pixel or so — the ragged bite of rubber on paper. */}
          <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={index * 7 + 3} result="ink" />
            <feDisplacementMap in="SourceGraphic" in2="ink" scale={1.5} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g transform={`rotate(${rotation} 32 32)`}>
          {/* The ghost of a first press, slightly off-register. */}
          <g opacity={0.16} transform="translate(1.1 -0.8)">
            <circle cx={32} cy={32} r={28} stroke="currentColor" strokeWidth={1.1} />
            <circle cx={32} cy={32} r={24.2} stroke="currentColor" strokeWidth={2.4} />
            {glyph}
          </g>
          <g filter={`url(#${filterId})`} opacity={0.94}>
            <circle cx={32} cy={32} r={28} stroke="currentColor" strokeWidth={1.1} />
            <circle cx={32} cy={32} r={24.2} stroke="currentColor" strokeWidth={2.4} />
            {glyph}
          </g>
        </g>
      </svg>
    );
  }

  const next = state === "next";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={clsx("flex-none overflow-visible", next && "gt-stamp-next", className)}
    >
      {/* The halo is what makes the last empty slot read as "this one next" without
          relying on its colour. */}
      {next && <circle cx={32} cy={32} r={28.5} stroke="currentColor" strokeWidth={1.2} strokeOpacity={0.4} />}
      <circle
        cx={32}
        cy={32}
        r={24.2}
        stroke="currentColor"
        strokeWidth={next ? 2.2 : 1.6}
        strokeOpacity={next ? 0.9 : 0.5}
        strokeDasharray={next ? "6 5" : "2.5 6"}
        strokeLinecap="round"
      />
      <circle cx={32} cy={32} r={2.2} fill="currentColor" fillOpacity={next ? 0.7 : 0.35} />
    </svg>
  );
}
