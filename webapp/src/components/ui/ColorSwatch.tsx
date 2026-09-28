import { colorSwatchFill, type GemColorDef } from "../../data/products";

interface ColorSwatchProps {
  color: Pick<GemColorDef, "hex" | "isMulticolor">;
  size?: number;
  className?: string;
}

/**
 * The visual half of a colour chip.
 *
 * Purely decorative: every caller already labels itself with the translated
 * colour name, so announcing the swatch again would double up.
 */
export function ColorSwatch({ color, size = 44, className }: ColorSwatchProps) {
  return (
    <span
      aria-hidden="true"
      className={`block flex-none rounded-[var(--radius-pill)] border border-[var(--border-subtle)] ${className ?? ""}`}
      style={{ width: size, height: size, background: colorSwatchFill(color) }}
    />
  );
}
