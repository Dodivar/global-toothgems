import { useId } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ColorSwatch } from "../ui/ColorSwatch";
import type { AdminGemColor } from "../../data/adminCatalog";
import type { GemColor } from "../../data/products";

/**
 * Gem colour of a product, picked from its swatch.
 *
 * The twin of `ShapePicker`: a native `<select>` cannot paint the shades, and
 * the team tells "Aigue-marine" from "Bleu Capri" faster by eye than by name.
 * Each option is a real radio input under a painted pill. Colours keep the
 * order set in the back office, after "not set". Hidden colours are not
 * offered, except the one the product already has.
 */
interface ColorPickerProps {
  label: string;
  hint?: string;
  colors: AdminGemColor[];
  value: GemColor | undefined;
  onChange: (color: GemColor | undefined) => void;
}

export function ColorPicker({ label, hint, colors, value, onChange }: ColorPickerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";
  const name = useId();
  const hintId = hint ? `${name}-hint` : undefined;

  const offered = colors.filter((color) => color.isActive || color.slug === value);

  return (
    <fieldset className="m-0 grid gap-1.5 border-0 p-0" aria-describedby={hintId}>
      <legend className="mb-1.5 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        <Option name={name} checked={value === undefined} onSelect={() => onChange(undefined)} label={t("admin.form.gemLookNone")} />
        {offered.map((color) => (
          <Option
            key={color.slug}
            name={name}
            checked={value === color.slug}
            onSelect={() => onChange(color.slug)}
            label={
              color.isActive
                ? color.name[lang] || color.name.fr
                : t("admin.gemColors.hiddenOption", { name: color.name[lang] || color.name.fr })
            }
            color={color}
          />
        ))}
      </div>
      {hint && (
        <p id={hintId} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

function Option({
  name,
  checked,
  onSelect,
  label,
  color,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  color?: AdminGemColor;
}) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input type="radio" name={name} className="peer sr-only" checked={checked} onChange={onSelect} />
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border py-1 pr-3 text-[length:var(--text-body-sm)] transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
          color ? "pl-1.5" : "pl-3",
          checked
            ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] font-semibold text-[var(--text-inverse)]"
            : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-primary)] hover:border-[var(--gt-ink-900)]",
        )}
      >
        {color && <ColorSwatch color={color} size={22} />}
        <span className="whitespace-nowrap">{label}</span>
      </span>
    </label>
  );
}
