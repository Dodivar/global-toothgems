import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Line drawings of the library's pieces, one per catalog id, on a 16-unit
 * grid. Solid glyphs mark the precious-metal pieces. Decorative: the piece's
 * name is always written beside or on the control that shows it.
 */
const TYPE_ICONS: Record<string, ReactNode> = {
  "crystal-round": (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M3.9 6.4 6.2 3.6H9.8L12.1 6.4 8 12.4Z" />
    </>
  ),
  "crystal-petite": (
    <>
      <circle cx="8" cy="8" r="3.5" />
      <path d="M5.6 7.2 6.8 5.7H9.2L10.4 7.2 8 10.5Z" />
    </>
  ),
  "crystal-grand": (
    <>
      <circle cx="8" cy="8" r="6.9" />
      <path d="M3 6.6 5.8 3.2H10.2L13 6.6 8 13Z" />
    </>
  ),
  "crystal-diamond": (
    <>
      <path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" />
      <path d="M1.6 8H14.4M8 1.6 5 8 8 14.4M8 1.6 11 8 8 14.4" />
    </>
  ),
  "crystal-square": (
    <>
      <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1.2" />
      <path d="M3.4 6.4H12.6M3.4 9.6H12.6M6.4 3.4V12.6M9.6 3.4V12.6" />
    </>
  ),
  "shape-star": <path d="M8 1.5 9.65 5.73 14.2 6 10.66 8.87 11.82 13.26 8 10.8 4.18 13.26 5.34 8.87 1.8 6 6.35 5.73Z" />,
  "shape-heart": (
    <path d="M8 13.5C4.5 10.5 2 8.4 2 5.9 2 4 3.5 2.8 5.1 2.8 6.4 2.8 7.4 3.6 8 4.7 8.6 3.6 9.6 2.8 10.9 2.8 12.5 2.8 14 4 14 5.9 14 8.4 11.5 10.5 8 13.5Z" />
  ),
  "shape-triangle": <path d="M8 2 14 13.5H2Z" />,
  "shape-drop": <path d="M8 1.6C8 4.2 11.8 6.9 11.8 10.3A3.8 3.8 0 0 1 4.2 10.3C4.2 6.9 8 4.2 8 1.6Z" />,
  "shape-navette": <path d="M8 1.5C10.8 4.6 10.8 11.4 8 14.5 5.2 11.4 5.2 4.6 8 1.5Z" />,
  "shape-baguette": (
    <>
      <path d="M5.3 2.6H10.7L13.4 5.3V10.7L10.7 13.4H5.3L2.6 10.7V5.3Z" />
      <path d="M2.6 5.3H13.4M2.6 10.7H13.4" />
    </>
  ),
  "shape-butterfly": (
    <>
      <path d="M8 8C6 3.5 2 3 2 6C2 8 4.5 8.6 6 8.2 4.2 8.9 2.6 10.5 3.8 12.2 5 13.8 7.4 11.8 8 9.6M8 8C10 3.5 14 3 14 6C14 8 11.5 8.6 10 8.2 11.8 8.9 13.4 10.5 12.2 12.2 11 13.8 8.6 11.8 8 9.6" />
      <path d="M8 4.6V12" />
    </>
  ),
  "shape-moon": <path d="M10.3 2.2A6.2 6.2 0 1 0 13.7 10.7 4.9 4.9 0 0 1 10.3 2.2Z" />,
  "shape-bolt": <path d="M9 1.5 4 9H7.2L6 14.5 11.6 6.6H8.2Z" />,
  "shape-blossom": (
    <>
      <circle cx="8" cy="4.5" r="1.9" />
      <circle cx="11.4" cy="6.9" r="1.9" />
      <circle cx="10.1" cy="10.9" r="1.9" />
      <circle cx="5.9" cy="10.9" r="1.9" />
      <circle cx="4.6" cy="6.9" r="1.9" />
      <circle cx="8" cy="8" r="1.1" />
    </>
  ),
  "metal-gold-dot": <circle cx="8" cy="8" r="5.4" fill="currentColor" stroke="none" />,
  "metal-gold-star": (
    <path
      d="M8 1.5 9.65 5.73 14.2 6 10.66 8.87 11.82 13.26 8 10.8 4.18 13.26 5.34 8.87 1.8 6 6.35 5.73Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  "metal-gold-heart": (
    <path
      d="M8 13.5C4.5 10.5 2 8.4 2 5.9 2 4 3.5 2.8 5.1 2.8 6.4 2.8 7.4 3.6 8 4.7 8.6 3.6 9.6 2.8 10.9 2.8 12.5 2.8 14 4 14 5.9 14 8.4 11.5 10.5 8 13.5Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  "metal-silver": (
    <>
      <path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" />
      <path d="M1.6 8H14.4M8 1.6 5 8 8 14.4M8 1.6 11 8 8 14.4" />
    </>
  ),
};

export function PieceIcon({ id, size = 22, className }: { id: string; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={clsx("flex-none", className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TYPE_ICONS[id] ?? TYPE_ICONS["crystal-round"]}
    </svg>
  );
}
