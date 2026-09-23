import { GLYPH_PATHS } from "../ui/ShapeGlyph";
import type { GemShape } from "../../data/products";
import type { StudioMaterial } from "../../data/studio";
import { STOPS, useSvgPrefix } from "./gemStyle";

/**
 * Rendered jewellery pieces for the Studio mockups.
 *
 * The cuts reuse the shop's `GLYPH_PATHS`, so a heart in the Studio is the same
 * heart as in the shape carousel. What this file adds is the material: a
 * gradient body, facet highlights and a small specular glint, which is what
 * makes a 2 mm crystal read as jewellery rather than as an icon.
 */

/** Gradients for every material, once per SVG. */
export function GemDefs({ prefix }: { prefix: string }) {
  return (
    <>
      {(Object.keys(STOPS) as StudioMaterial[]).map((m) => {
        const [light, mid, dark] = STOPS[m];
        return m === "gold" ? (
          <linearGradient key={m} id={`${prefix}-${m}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset=".45" stopColor={mid} />
            <stop offset=".7" stopColor={dark} />
            <stop offset="1" stopColor="#f5d98e" />
          </linearGradient>
        ) : (
          <radialGradient key={m} id={`${prefix}-${m}`} cx=".36" cy=".3" r=".85">
            <stop offset="0" stopColor={light} />
            <stop offset=".5" stopColor={mid} />
            <stop offset="1" stopColor={dark} />
          </radialGradient>
        );
      })}
      <filter id={`${prefix}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#1c1410" floodOpacity=".45" />
      </filter>
    </>
  );
}

/** One piece drawn in the shared 32×32 glyph box. */
export function GemBody({
  shape,
  material,
  prefix,
  glint = true,
}: {
  shape: GemShape;
  material: StudioMaterial;
  prefix: string;
  glint?: boolean;
}) {
  const { outline, facets } = GLYPH_PATHS[shape];
  const gold = material === "gold";
  return (
    <g filter={`url(#${prefix}-shadow)`}>
      <path
        d={outline}
        fill={`url(#${prefix}-${material})`}
        stroke={gold ? "#7a5210" : "rgba(255,255,255,.85)"}
        strokeOpacity={gold ? 0.55 : 1}
        strokeWidth={gold ? 0.9 : 1.1}
        strokeLinejoin="round"
      />
      {!gold && (
        <path d={facets} stroke="#fff" strokeOpacity=".6" strokeWidth=".8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      {glint && (
        <path
          className="gt-studio-glint"
          d="M11 6.5 11.9 9.6 15 10.5 11.9 11.4 11 14.5 10.1 11.4 7 10.5 10.1 9.6Z"
          fill="#fff"
          opacity=".9"
        />
      )}
    </g>
  );
}

/** A standalone piece, for the library grid, chips and swatches. */
export function GemIcon({ shape, material, size = 28, className }: { shape: GemShape; material: StudioMaterial; size?: number; className?: string }) {
  const prefix = useSvgPrefix();
  return (
    <svg width={size} height={size} viewBox="-2 -2 36 36" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <GemDefs prefix={prefix} />
      </defs>
      <GemBody shape={shape} material={material} prefix={prefix} />
    </svg>
  );
}
