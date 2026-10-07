import type { ReactNode } from "react";
import type { StudioShape } from "../../../data/studioEditor";

/**
 * Line drawings of the Studio's outlines, one per shape, on a 16-unit grid
 * (the same outlines as `lib/studio3d/geometry.ts`, longest side ~13 units).
 * Used where a photo would be too small to read: the 2D previews of saved
 * designs and the piece lists. Decorative: the piece's name is always
 * written beside or on the control that shows it.
 *
 * Wire charms (open heart, halo star, snake) are drawn with a thick stroke in
 * `currentColor`, so a preview that colours a piece shows them in its colour.
 */

const STAR = "M8 1.5 9.65 5.73 14.2 6 10.66 8.87 11.82 13.26 8 10.8 4.18 13.26 5.34 8.87 1.8 6 6.35 5.73Z";
const HEART =
  "M8 13.5C4.5 10.5 2 8.4 2 5.9 2 4 3.5 2.8 5.1 2.8 6.4 2.8 7.4 3.6 8 4.7 8.6 3.6 9.6 2.8 10.9 2.8 12.5 2.8 14 4 14 5.9 14 8.4 11.5 10.5 8 13.5Z";

/** A chubby five-point star with round points, as a closed polygon. */
const STARFLOWER = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r = 5.4 + 1.35 * Math.cos(5 * (a + Math.PI / 2));
    pts.push(`${(8 + Math.cos(a) * r).toFixed(2)} ${(8 + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(" ")}Z`;
})();

const wire = (d: string) => <path d={d} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" />;

export const SHAPE_GLYPHS: Record<StudioShape, ReactNode> = {
  round: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M3.9 6.4 6.2 3.6H9.8L12.1 6.4 8 12.4Z" />
    </>
  ),
  baguette: (
    <>
      <path d="M5 1.5H11L11.5 2V14L11 14.5H5L4.5 14V2Z" />
      <path d="M6.2 3.2H9.8V12.8H6.2Z" />
    </>
  ),
  square: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="0.8" />
      <path d="M4.6 4.6H11.4V11.4H4.6Z" />
    </>
  ),
  heart: <path d={HEART} />,
  "open-heart": wire(HEART),
  kite: (
    <>
      <path d="M8 1.5 12 8 8 14.5 4 8Z" />
      <path d="M8 4 10 8 8 12 6 8Z" />
    </>
  ),
  navette: (
    <>
      <path d="M8 1.5 11.3 5 11.3 11 8 14.5 4.7 11 4.7 5Z" />
      <path d="M8 4 9.6 6V10L8 12 6.4 10V6Z" />
    </>
  ),
  raindrop: <path d="M8 1.5C8.5 5 10.2 9 10.2 11.9A2.2 2.2 0 0 1 5.8 11.9C5.8 9 7.5 5 8 1.5Z" />,
  triangle: <path d="M8 2 14 13.5H2Z" />,
  "rivoli-star": <path d={STAR} />,
  starflower: <path d={STARFLOWER} />,
  "halo-star": wire(STAR),
  bolt: <path d="M10.5 1.5 4 8.6H7.4L5.5 14.5 12 7.2H8.6Z" />,
  cherries: (
    <>
      <path d="M5.2 10.4C5.6 7.6 7 5.2 9 3.8M10.9 10.4C10.6 7.8 10 5.5 9 3.8" fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
      <path d="M9 3.8C7.6 1.9 5 1.8 3.6 2.6 5 4.3 7.4 4.6 9 3.8Z" />
      <circle cx="5" cy="11.6" r="2.6" />
      <circle cx="11" cy="11.6" r="2.6" />
    </>
  ),
  snake: (
    <>
      {wire("M6 14.5C9 14 10.4 12.2 8.6 10.6 6.4 8.8 6 7.6 8 6.2 10 4.8 9.8 3 8.4 2.6")}
      <ellipse cx="8.6" cy="2.2" rx="1.5" ry="1.3" />
    </>
  ),
  dachshund: (
    <path d="M1.5 5.2 3 7.6H9.6L10.6 5.6 11.6 4.6H13.2L14.5 6.1 14.2 6.6 12.3 6.9 11.6 8.4 11.2 11.9H10V9.6H4.5L4 11.9H2.8L2.6 8.6Z" />
  ),
};

/** The glyph of a shape, with the round brilliant for anything unknown. */
export function shapeGlyph(shape: string): ReactNode {
  return SHAPE_GLYPHS[shape as StudioShape] ?? SHAPE_GLYPHS.round;
}
