import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LookTileGroup } from "./LookTileGroup";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import { GEM_SHAPES, shapeName, sortByShapeLabel, type GemShape } from "../../data/products";

/**
 * Gem cut of a product, picked from its drawing.
 *
 * A native `<select>` cannot show the glyphs, and the cut is the one field an
 * administrator recognises faster by silhouette than by name. Shapes are
 * listed alphabetically in the interface language, after "not set".
 */
interface ShapePickerProps {
  label: string;
  value: GemShape | undefined;
  onChange: (shape: GemShape | undefined) => void;
}

export function ShapePicker({ label, value, onChange }: ShapePickerProps) {
  const { t, i18n } = useTranslation();

  const options = useMemo(
    () =>
      sortByShapeLabel(GEM_SHAPES, (shape) => shape, shapeName, i18n.language).map((shape) => ({
        value: shape,
        label: shapeName(shape),
        visual: <ShapeGlyph shape={shape} size={26} className="text-[var(--gt-blue-700)]" />,
      })),
    [t, i18n.language],
  );

  return <LookTileGroup label={label} options={options} value={value} onChange={onChange} />;
}
