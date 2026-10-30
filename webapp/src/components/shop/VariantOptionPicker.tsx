import { useTranslation } from "react-i18next";
import type { ProductOption, ProductVariant } from "../../data/products";
import { pick } from "../../data/types";
import { optionValueState, pickOptionVariant } from "../../lib/productOptions";

/**
 * One row of pills per option of a product whose variants combine options
 * (colour × plug…), instead of one list of "Argent · Prise EU" combinations:
 * the customer decides each thing separately.
 *
 * A value stays clickable while any combination with it can be bought; when
 * the other choices do not exist with it (or are sold out), it says so and
 * picking it moves them to the nearest combination that can be bought. A
 * value no combination can be bought with is disabled.
 */
interface VariantOptionPickerProps {
  options: ProductOption[];
  variants: ProductVariant[];
  selected: ProductVariant | undefined;
  onSelect: (variant: ProductVariant) => void;
}

export function VariantOptionPicker({ options, variants, selected, onSelect }: VariantOptionPickerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <div className="grid gap-4">
      {options.map((option, optionIndex) => {
        const chosen = option.values.find((value) => value.id === selected?.optionValues?.[optionIndex]);
        return (
          <fieldset key={option.id} className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
              {pick(option.name, lang)}
              {chosen && (
                <span className="ml-1.5 normal-case tracking-normal text-[var(--text-primary)]">· {pick(chosen.name, lang)}</span>
              )}
            </legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const checked = value.id === chosen?.id;
                const state = optionValueState(variants, optionIndex, value.id, selected);
                const note =
                  state === "out" ? t("product.stockOut") : state === "elsewhere" && !checked ? t("product.optionOtherCombination") : undefined;
                return (
                  <label
                    key={value.id}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]"
                    style={{
                      border: `1px solid ${checked ? "var(--gt-ink-900)" : "var(--border-default)"}`,
                      background: checked ? "var(--gt-ink-100)" : "transparent",
                      fontWeight: checked ? 600 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name={`option-${option.id}`}
                      value={value.id}
                      checked={checked}
                      disabled={state === "out"}
                      onChange={() => {
                        const next = pickOptionVariant(variants, optionIndex, value.id, selected);
                        if (next) onSelect(next);
                      }}
                      className="sr-only"
                    />
                    {value.swatch && (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 flex-none rounded-full border border-[var(--border-default)]"
                        style={{ background: value.swatch }}
                      />
                    )}
                    {pick(value.name, lang)}
                    {note && <span className="text-[var(--text-muted)]">· {note}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
