import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import { GEM_SHAPES, sortByShapeLabel, type GemShape } from "../../data/products";

/**
 * Gem cut of a product, picked from its drawing.
 *
 * A native `<select>` cannot show the glyphs, and the cut is the one field an
 * administrator recognises faster by silhouette than by name. Each option is a
 * real radio input under a painted pill, so arrow keys, the checked state and
 * the group label come from the platform. Shapes are listed alphabetically in
 * the interface language, after "not set".
 */
interface ShapePickerProps {
  label: string;
  hint?: string;
  value: GemShape | undefined;
  onChange: (shape: GemShape | undefined) => void;
}

export function ShapePicker({ label, hint, value, onChange }: ShapePickerProps) {
  const { t, i18n } = useTranslation();
  const name = useId();
  const hintId = hint ? `${name}-hint` : undefined;

  const shapes = useMemo(
    () => sortByShapeLabel(GEM_SHAPES, (shape) => shape, (shape) => t(`shop.shapes.${shape}`), i18n.language),
    [t, i18n.language],
  );

  return (
    <fieldset className="m-0 grid gap-1.5 border-0 p-0" aria-describedby={hintId}>
      <legend className="mb-1.5 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        <Option name={name} checked={value === undefined} onSelect={() => onChange(undefined)} label={t("admin.form.gemLookNone")} />
        {shapes.map((shape) => (
          <Option
            key={shape}
            name={name}
            checked={value === shape}
            onSelect={() => onChange(shape)}
            label={t(`shop.shapes.${shape}`)}
            shape={shape}
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
  shape,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  shape?: GemShape;
}) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input type="radio" name={name} className="peer sr-only" checked={checked} onChange={onSelect} />
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border py-1 pr-3 text-[length:var(--text-body-sm)] transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
          shape ? "pl-1.5" : "pl-3",
          checked
            ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] font-semibold text-[var(--text-inverse)]"
            : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-primary)] hover:border-[var(--gt-ink-900)]",
        )}
      >
        {shape && <ShapeGlyph shape={shape} size={22} className={checked ? undefined : "text-[var(--gt-blue-700)]"} />}
        <span className="whitespace-nowrap">{label}</span>
      </span>
    </label>
  );
}
