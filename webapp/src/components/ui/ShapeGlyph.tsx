import type { GemShape } from "../../data/products";

/**
 * Line drawings of the gem cuts.
 *
 * Photography cannot carry this: a macro shot of a 2 mm crystal reads as "a
 * sparkle", not as "a marquise". The silhouette is the whole point of the
 * carousel, so each shape is drawn rather than photographed.
 *
 * Every glyph shares one 32x32 box and is drawn with `currentColor`, so the
 * tile controls the colour and the facet lines stay consistent between cuts.
 */
const PATHS: Record<GemShape, { outline: string; facets: string }> = {
  round: {
    outline: "M16 3A13 13 0 1 0 16 29 13 13 0 1 0 16 3Z",
    facets:
      "M16 9 20.9 11.1 23 16 20.9 20.9 16 23 11.1 20.9 9 16 11.1 11.1Z" +
      "M16 9 16 3M20.9 11.1 25.2 6.8M23 16 29 16M20.9 20.9 25.2 25.2" +
      "M16 23 16 29M11.1 20.9 6.8 25.2M9 16 3 16M11.1 11.1 6.8 6.8",
  },
  heart: {
    outline:
      "M16 28.5 5.8 18.1C2.4 14.7 2.9 9.1 6.9 6.4 10 4.3 14.1 5.2 16 8.2" +
      " 17.9 5.2 22 4.3 25.1 6.4 29.1 9.1 29.6 14.7 26.2 18.1Z",
    facets: "M16 8.2 16 28.5M6.9 6.4 11 15 16 28.5M25.1 6.4 21 15 16 28.5M5.5 15 26.5 15",
  },
  drop: {
    outline: "M16 2 24.5 14.5C27.5 19.5 25 27 19 29.2 17 29.9 15 29.9 13 29.2 7 27 4.5 19.5 7.5 14.5Z",
    facets: "M16 2 16 30M7.5 14.5 16 11 24.5 14.5M10 21.5 22 21.5",
  },
  navette: {
    outline: "M16 1.5C21 7 24 11 24 16 24 21 21 25 16 30.5 11 25 8 21 8 16 8 11 11 7 16 1.5Z",
    facets: "M16 1.5 16 30.5M8 16 24 16M11.5 8 20.5 8M11.5 24 20.5 24",
  },
  star: {
    outline: "M16 1.5 19.9 12.1 30.5 16 19.9 19.9 16 30.5 12.1 19.9 1.5 16 12.1 12.1Z",
    facets: "M16 1.5 16 30.5M1.5 16 30.5 16M12.1 12.1 19.9 19.9M19.9 12.1 12.1 19.9",
  },
  square: {
    outline: "M4.5 4.5 27.5 4.5 27.5 27.5 4.5 27.5Z",
    facets: "M4.5 4.5 11 11 21 11 27.5 4.5M4.5 27.5 11 21 21 21 27.5 27.5M11 11 11 21M21 11 21 21",
  },
  triangle: {
    outline: "M16 3 29 27 3 27Z",
    facets: "M16 3 16 27M16 15.5 8.3 27M16 15.5 23.7 27M9.7 15.5 22.3 15.5",
  },
  baguette: {
    outline: "M9 2.5 23 2.5 23 29.5 9 29.5Z",
    facets: "M9 2.5 13 7 19 7 23 2.5M9 29.5 13 25 19 25 23 29.5M13 7 13 25M19 7 19 25",
  },
  flower: {
    outline:
      "M16 3.5C18.8 3.5 20.8 6.6 20 9.3 22.4 7.8 25.9 9 26.7 11.8 27.6 14.5 25.5 17.3 22.7 17.4 24.9 19.2 24.6 22.8 22.1 24.3 19.7 25.8 16.4 24.5 15.7 21.8 15 24.5 11.7 25.8 9.3 24.3 6.8 22.8 6.5 19.2 8.7 17.4 5.9 17.3 3.8 14.5 4.7 11.8 5.5 9 9 7.8 11.4 9.3 10.6 6.6 12.6 3.5 16 3.5Z",
    facets: "M16 12.5A3.6 3.6 0 1 0 16 19.7 3.6 3.6 0 1 0 16 12.5Z",
  },
};

interface ShapeGlyphProps {
  shape: GemShape;
  size?: number;
  className?: string;
}

export function ShapeGlyph({ shape, size = 44, className }: ShapeGlyphProps) {
  const { outline, facets } = PATHS[shape];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={outline} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      <path d={facets} stroke="currentColor" strokeWidth={0.9} strokeOpacity={0.55} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
