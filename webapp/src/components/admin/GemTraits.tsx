import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ColorSwatch } from "../ui/ColorSwatch";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import type { AdminGemColor } from "../../data/adminCatalog";
import type { GemColor, GemShape } from "../../data/products";

/**
 * Names and pictures of a gem's cut and colour, as the product list shows
 * them in its filters and rows.
 *
 * Colours are data (the back office manages them), so a slug is looked up in
 * the catalogue's list, hidden colours included: a product keeps a colour
 * after it leaves the storefront filter, and the list must still name it. A
 * slug the list no longer knows is shown as-is rather than dropped, so the
 * product stays findable.
 */
export function useGemTraits() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { gemColors } = useAdminCatalog();

  const bySlug = useMemo(() => new Map(gemColors.map((color) => [color.slug, color])), [gemColors]);
  /** Back-office order, which is also the storefront's. */
  const colorOrder = useMemo(
    () => [...gemColors].sort((a, b) => a.position - b.position).map((color) => color.slug),
    [gemColors],
  );

  const shapeLabel = useCallback((shape: GemShape) => t(`shop.shapes.${shape}`), [t]);
  const colorDef = useCallback((slug: GemColor): AdminGemColor | undefined => bySlug.get(slug), [bySlug]);
  const colorLabel = useCallback(
    (slug: GemColor) => {
      const color = bySlug.get(slug);
      return color ? L(color.name) : slug;
    },
    [bySlug, L],
  );

  return { shapeLabel, colorLabel, colorDef, colorOrder };
}

/** The drawing of a cut, sized for a chip. */
export function ShapeMedia({ shape, size = 18 }: { shape: GemShape; size?: number }) {
  return <ShapeGlyph shape={shape} size={size} className="flex-none text-[var(--gt-blue-700)]" />;
}

/** The swatch of a colour, or a dashed ring for a slug the catalogue no longer knows. */
export function ColorMedia({ color, size = 14 }: { color: AdminGemColor | undefined; size?: number }) {
  if (!color) {
    return (
      <span
        aria-hidden="true"
        className="block flex-none rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return <ColorSwatch color={color} size={size} />;
}
