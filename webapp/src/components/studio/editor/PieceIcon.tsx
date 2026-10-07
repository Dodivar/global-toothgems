import clsx from "clsx";
import type { GemLook } from "../../../data/studioEditor";
import { shapeGlyph } from "./pieceGlyphs";

/** A piece's outline, tinted with its colour (decorative: its name is always written beside it). */
export function PieceIcon({ look, size = 22, className }: { look: GemLook; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={clsx("flex-none", className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={look.color}
      color={look.color}
      stroke="rgba(38, 60, 82, .55)"
      strokeWidth={0.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapeGlyph(look.shape)}
    </svg>
  );
}

/**
 * A shop gem's photo, the way a customer recognises it in the shop. Falls back
 * to its tinted outline when the product has no photo.
 */
export function GemPhoto({ src, look, size, className }: { src?: string; look: GemLook; size: number; className?: string }) {
  if (!src) return <PieceIcon look={look} size={size} className={className} />;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={clsx("flex-none object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
