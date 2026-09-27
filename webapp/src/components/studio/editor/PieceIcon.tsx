import clsx from "clsx";
import { TYPE_ICONS } from "./pieceGlyphs";

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
