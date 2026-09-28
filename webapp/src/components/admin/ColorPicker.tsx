import { useTranslation } from "react-i18next";
import { LookTileGroup } from "./LookTileGroup";
import { ColorSwatch } from "../ui/ColorSwatch";
import type { AdminGemColor } from "../../data/adminCatalog";
import type { GemColor } from "../../data/products";

/**
 * Gem colour of a product, picked from its swatch.
 *
 * The twin of `ShapePicker`: a native `<select>` cannot paint the shades, and
 * the team tells "Aigue-marine" from "Bleu Capri" faster by eye than by name.
 * Colours keep the order set in the back office, after "not set". Hidden
 * colours are not offered, except the one the product already has.
 */
interface ColorPickerProps {
  label: string;
  colors: AdminGemColor[];
  value: GemColor | undefined;
  onChange: (color: GemColor | undefined) => void;
}

export function ColorPicker({ label, colors, value, onChange }: ColorPickerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";

  const options = colors
    .filter((color) => color.isActive || color.slug === value)
    .map((color) => {
      const colorName = color.name[lang] || color.name.fr;
      return {
        value: color.slug,
        label: color.isActive ? colorName : t("admin.gemColors.hiddenOption", { name: colorName }),
        visual: <ColorSwatch color={color} size={24} />,
      };
    });

  return <LookTileGroup label={label} options={options} value={value} onChange={onChange} />;
}
