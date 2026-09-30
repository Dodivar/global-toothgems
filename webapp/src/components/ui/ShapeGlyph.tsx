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
/** Shared with the loyalty stamps, which ink the same cuts rather than redrawing them. */
export const GLYPH_PATHS: Record<GemShape, { outline: string; facets: string }> = {
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
  // Fuller than the navette, with a brilliant table, so the two boat cuts stay
  // apart at chip size.
  marquise: {
    outline: "M16 2C25 7.5 28 12 28 16 28 20 25 24.5 16 30 7 24.5 4 20 4 16 4 12 7 7.5 16 2Z",
    facets: "M16 9 21 16 16 23 11 16ZM16 2 16 9M16 23 16 30M4 16 11 16M21 16 28 16",
  },
  // The gem silhouette itself: flat crown, girdle, pointed pavilion.
  diamond: {
    outline: "M9 5 23 5 29.5 12.5 16 29 2.5 12.5Z",
    facets: "M2.5 12.5 29.5 12.5M9 5 12.5 12.5 16 5 19.5 12.5 23 5M12.5 12.5 16 29M19.5 12.5 16 29",
  },
  // A round stone whose crown rises to a point: an eight-point star meeting at the centre.
  "rivoli-star": {
    outline: "M16 3A13 13 0 1 0 16 29 13 13 0 1 0 16 3Z",
    facets:
      "M16 5 17.7 11.8 23.8 8.2 20.2 14.3 27 16 20.2 17.7 23.8 23.8 17.7 20.2 16 27" +
      " 14.3 20.2 8.2 23.8 11.8 17.7 5 16 11.8 14.3 8.2 8.2 14.3 11.8Z" +
      "M16 16 16 5M16 16 23.8 8.2M16 16 27 16M16 16 23.8 23.8M16 16 16 27M16 16 8.2 23.8M16 16 5 16M16 16 8.2 8.2",
  },
  // Six pointed petals, where `flower` has five rounded ones.
  "star-flower": {
    outline:
      "M13 10.8Q12.8 5.5 16 2Q19.2 5.5 19 10.8Q23.5 8 28.1 9Q26.7 13.5 22 16Q26.7 18.5 28.1 23Q23.5 24 19 21.2" +
      "Q19.2 26.5 16 30Q12.8 26.5 13 21.2Q8.5 24 3.9 23Q5.3 18.5 10 16Q5.3 13.5 3.9 9Q8.5 8 13 10.8Z",
    facets: "M16 13 16 6M18.6 14.5 24.7 11M18.6 17.5 24.7 21M16 19 16 26M13.4 17.5 7.3 21M13.4 14.5 7.3 11",
  },
  // Octagonal table ringed by a zigzag of facets reaching the girdle, the flatback's rose.
  "xilion-rose": {
    outline: "M16 3A13 13 0 1 0 16 29 13 13 0 1 0 16 3Z",
    facets:
      "M18.3 10.5 21.5 13.7 21.5 18.3 18.3 21.5 13.7 21.5 10.5 18.3 10.5 13.7 13.7 10.5Z" +
      "M16 3 18.3 10.5 25.2 6.8 21.5 13.7 29 16 21.5 18.3 25.2 25.2 18.3 21.5 16 29" +
      " 13.7 21.5 6.8 25.2 10.5 18.3 3 16 10.5 13.7 6.8 6.8 13.7 10.5Z",
  },
};

interface ShapeGlyphProps {
  shape: GemShape;
  size?: number;
  className?: string;
}

export function ShapeGlyph({ shape, size = 44, className }: ShapeGlyphProps) {
  const { outline, facets } = GLYPH_PATHS[shape];
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
