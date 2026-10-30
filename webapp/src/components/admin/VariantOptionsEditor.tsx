import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, Info, Palette, Plus, Trash2, Undo2, X } from "lucide-react";
import clsx from "clsx";
import { MoneyInput, NumberInput } from "./AdminNumberInputs";
import { AdminButton } from "./AdminButton";
import { Field, IconAction } from "./variantEditorParts";
import { DEFAULT_SWATCH, fieldId } from "./variantFields";
import type { CustomVariant, ProductImage, VariantOption, VariantOptionValue } from "../../data/adminCatalog";
import { pick } from "../../data/types";
import {
  MAX_OPTION_VALUES,
  MAX_OPTIONS,
  OPTION_NAME_MAX,
  addCombination,
  combinationName,
  combinationSwatch,
  missingCombinations,
  pruneMediaLinks,
  syncVariants,
} from "../../lib/variantOptions";

/**
 * The options a product's variants combine — "Couleur" (Argent, Noir) ×
 * "Prise" (Prise EU, Prise US) — and the combinations they make.
 *
 * Every combination is a variant with its own stock, price and SKU; its name
 * ("Argent · Prise EU") and colour dot come from its values. Adding a value
 * adds its combinations (empty shelf); removing one removes them. A
 * combination that is not made can be taken out of the list, and offered
 * again. Photos are linked to a value: the silver photos show "Argent",
 * whatever the plug.
 */

interface VariantOptionsEditorProps {
  options: VariantOption[];
  variants: CustomVariant[];
  media: ProductImage[];
  productPrice: number;
  error?: string;
  onChange: (options: VariantOption[], variants: CustomVariant[]) => void;
  onMediaChange: (update: (media: ProductImage[]) => ProductImage[]) => void;
  /** Variant to highlight on arrival (its stock field is focused by the parent). */
  focusVariant?: string | null;
}

const newId = () => crypto.randomUUID();

export function VariantOptionsEditor({
  options,
  variants,
  media,
  productPrice,
  error,
  onChange,
  onMediaChange,
  focusVariant,
}: VariantOptionsEditorProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const missing = missingCombinations(options, variants);

  /** New options: the variants follow, and photos lose links to values that are gone. */
  const setOptions = (next: VariantOption[]) => {
    const nextVariants = syncVariants(options, next, variants, newId);
    onChange(next, nextVariants);
    onMediaChange((list) => pruneMediaLinks(list, next, nextVariants));
  };

  const updateOption = (optionId: string, patch: Partial<VariantOption>) =>
    setOptions(options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)));

  const updateValue = (optionId: string, valueId: string, patch: Partial<VariantOptionValue>) =>
    setOptions(
      options.map((option) =>
        option.id === optionId
          ? { ...option, values: option.values.map((value) => (value.id === valueId ? { ...value, ...patch } : value)) }
          : option,
      ),
    );

  const moveIn = <T,>(list: T[], index: number, by: -1 | 1): T[] => {
    const next = [...list];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    return next;
  };

  const addOption = () =>
    setOptions([...options, { id: newId(), name: { fr: "", en: "" }, values: [{ id: newId(), name: { fr: "", en: "" } }] }]);

  const addValue = (option: VariantOption) =>
    updateOption(option.id, { values: [...option.values, { id: newId(), name: { fr: "", en: "" } }] });

  const updateVariant = (id: string, patch: Partial<CustomVariant>) =>
    onChange(options, variants.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));

  const removeVariant = (id: string) => {
    const next = variants.filter((variant) => variant.id !== id);
    onChange(options, next);
    onMediaChange((list) => pruneMediaLinks(list, options, next));
  };

  /** A photo shows one value at most, and then no variant. */
  const togglePhoto = (valueId: string, imageId: string) =>
    onMediaChange((list) =>
      list.map((image) => {
        if (image.id !== imageId) return image;
        const { variantId: _variant, optionValueId, ...rest } = image;
        return optionValueId === valueId ? rest : { ...rest, optionValueId: valueId };
      }),
    );

  const optionLabel = (option: VariantOption, index: number) =>
    pick(option.name, lang).trim() || t("admin.form.optionsUnnamed", { index: index + 1 });
  const valueLabel = (value: VariantOptionValue, index: number) =>
    pick(value.name, lang).trim() || t("admin.form.optionsValueUnnamed", { index: index + 1 });
  const comboLabel = (valueIds: string[]) =>
    valueIds
      .map((id, index) => {
        const values = options[index]?.values ?? [];
        const at = values.findIndex((value) => value.id === id);
        return at >= 0 ? valueLabel(values[at], at) : "";
      })
      .join(" · ");
  const valueName = (valueId: string) => {
    for (const option of options) {
      const at = option.values.findIndex((value) => value.id === valueId);
      if (at >= 0) return valueLabel(option.values[at], at);
    }
    return "";
  };

  return (
    <div className="grid gap-5">
      <ol className="m-0 grid list-none gap-3 p-0">
        {options.map((option, optionIndex) => {
          const label = optionLabel(option, optionIndex);
          return (
            <li key={option.id} className="grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {t("admin.form.optionsHeading", { index: optionIndex + 1, option: label })}
                </span>
                <div className="flex items-center gap-1">
                  <IconAction
                    icon={ArrowUp}
                    label={t("admin.form.variantsMoveUp", { option: label })}
                    disabled={optionIndex === 0}
                    onClick={() => setOptions(moveIn(options, optionIndex, -1))}
                  />
                  <IconAction
                    icon={ArrowDown}
                    label={t("admin.form.variantsMoveDown", { option: label })}
                    disabled={optionIndex === options.length - 1}
                    onClick={() => setOptions(moveIn(options, optionIndex, 1))}
                  />
                  <IconAction
                    icon={Trash2}
                    label={t("admin.form.optionsRemove", { option: label })}
                    onClick={() => setOptions(options.filter((o) => o.id !== option.id))}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field id={fieldId(option.id, "name-fr")} label={t("admin.form.optionsNameFr")}>
                  <input
                    id={fieldId(option.id, "name-fr")}
                    type="text"
                    maxLength={OPTION_NAME_MAX}
                    className="gt-admin-field"
                    value={option.name.fr}
                    placeholder={t("admin.form.optionsNamePlaceholder")}
                    aria-invalid={error && !option.name.fr.trim() ? true : undefined}
                    onChange={(e) => updateOption(option.id, { name: { ...option.name, fr: e.target.value } })}
                  />
                </Field>
                <Field id={fieldId(option.id, "name-en")} label={t("admin.form.optionsNameEn")}>
                  <input
                    id={fieldId(option.id, "name-en")}
                    type="text"
                    maxLength={OPTION_NAME_MAX}
                    className="gt-admin-field"
                    value={option.name.en}
                    placeholder={t("admin.form.optionsNamePlaceholderEn")}
                    aria-invalid={error && !option.name.en.trim() ? true : undefined}
                    onChange={(e) => updateOption(option.id, { name: { ...option.name, en: e.target.value } })}
                  />
                </Field>
              </div>

              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className="mb-1.5 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                  {t("admin.form.optionsValues")}
                </legend>
                <ol className="m-0 grid list-none gap-2 p-0">
                  {option.values.map((value, valueIndex) => {
                    const valueText = valueLabel(value, valueIndex);
                    return (
                      <li key={value.id} className="grid gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-3">
                        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                          <Field id={fieldId(value.id, "name-fr")} label={t("admin.form.variantsNameFr")}>
                            <input
                              id={fieldId(value.id, "name-fr")}
                              type="text"
                              maxLength={OPTION_NAME_MAX}
                              className="gt-admin-field"
                              value={value.name.fr}
                              placeholder={t("admin.form.optionsValuePlaceholder")}
                              aria-invalid={error && !value.name.fr.trim() ? true : undefined}
                              onChange={(e) => updateValue(option.id, value.id, { name: { ...value.name, fr: e.target.value } })}
                            />
                          </Field>
                          <Field id={fieldId(value.id, "name-en")} label={t("admin.form.variantsNameEn")}>
                            <input
                              id={fieldId(value.id, "name-en")}
                              type="text"
                              maxLength={OPTION_NAME_MAX}
                              className="gt-admin-field"
                              value={value.name.en}
                              placeholder={t("admin.form.optionsValuePlaceholderEn")}
                              aria-invalid={error && !value.name.en.trim() ? true : undefined}
                              onChange={(e) => updateValue(option.id, value.id, { name: { ...value.name, en: e.target.value } })}
                            />
                          </Field>
                          <div className="flex items-center gap-1">
                            {value.swatch ? (
                              <>
                                {/* The native picker: keyboard and screen readers get a real colour field. */}
                                <input
                                  type="color"
                                  value={value.swatch}
                                  aria-label={t("admin.form.variantsSwatchLabel", { option: valueText })}
                                  onChange={(e) => updateValue(option.id, value.id, { swatch: e.target.value.toLowerCase() })}
                                  className="h-9 w-12 cursor-pointer rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-1"
                                />
                                <IconAction
                                  icon={X}
                                  label={t("admin.form.variantsSwatchRemove", { option: valueText })}
                                  onClick={() => updateValue(option.id, value.id, { swatch: undefined })}
                                />
                              </>
                            ) : (
                              <IconAction
                                icon={Palette}
                                label={t("admin.form.optionsSwatchAdd", { option: valueText })}
                                onClick={() => updateValue(option.id, value.id, { swatch: DEFAULT_SWATCH })}
                              />
                            )}
                            <IconAction
                              icon={ArrowUp}
                              label={t("admin.form.variantsMoveUp", { option: valueText })}
                              disabled={valueIndex === 0}
                              onClick={() => updateOption(option.id, { values: moveIn(option.values, valueIndex, -1) })}
                            />
                            <IconAction
                              icon={ArrowDown}
                              label={t("admin.form.variantsMoveDown", { option: valueText })}
                              disabled={valueIndex === option.values.length - 1}
                              onClick={() => updateOption(option.id, { values: moveIn(option.values, valueIndex, 1) })}
                            />
                            {/* The last value goes with its option ("Remove the option"), never alone. */}
                            <IconAction
                              icon={Trash2}
                              label={t("admin.form.variantsRemove", { option: valueText })}
                              disabled={option.values.length === 1}
                              onClick={() => updateOption(option.id, { values: option.values.filter((v) => v.id !== value.id) })}
                            />
                          </div>
                        </div>
                        {media.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.optionsValuePhotos")}</span>
                            {media.map((image, imageIndex) => {
                              const linked = image.optionValueId === value.id;
                              const other = !linked && image.optionValueId ? valueName(image.optionValueId) : "";
                              return (
                                <button
                                  key={image.id}
                                  type="button"
                                  aria-pressed={linked}
                                  aria-label={t("admin.form.variantsPhotoToggle", { index: imageIndex + 1, option: valueText })}
                                  title={other ? t("admin.form.variantsPhotoTaken", { option: other }) : undefined}
                                  onClick={() => togglePhoto(value.id, image.id)}
                                  className={clsx(
                                    "relative h-12 w-12 overflow-hidden rounded-[var(--admin-radius-sm)] border-2 bg-[var(--admin-panel)] transition-[border-color,opacity]",
                                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                                    linked ? "border-[var(--gt-ink-900)]" : "border-transparent",
                                    other && "opacity-50",
                                  )}
                                >
                                  <img src={image.src} alt="" className="h-full w-full object-cover" />
                                  {linked && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                                    >
                                      <Check size={10} />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <div>
                  <AdminButton
                    variant="outline"
                    size="sm"
                    iconLeft={Plus}
                    disabled={option.values.length >= MAX_OPTION_VALUES}
                    onClick={() => addValue(option)}
                  >
                    {t("admin.form.optionsValueAdd")}
                  </AdminButton>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      {options.length < MAX_OPTIONS && (
        <div>
          <AdminButton variant="outline" iconLeft={Plus} onClick={addOption}>
            {t("admin.form.optionsAdd")}
          </AdminButton>
        </div>
      )}

      <section className="grid gap-3" aria-labelledby="variant-combinations-title">
        <h3 id="variant-combinations-title" className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {t("admin.form.optionsCombinations", { count: variants.length })}
        </h3>
        {variants.length === 0 ? (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.form.optionsCombinationsNone")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {variants.map((variant) => {
              const valueIds = variant.optionValues ?? [];
              const label = comboLabel(valueIds);
              const swatch = combinationSwatch(options, valueIds);
              return (
                <li
                  key={variant.id}
                  className={clsx(
                    "grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] md:items-end",
                    variant.id === focusVariant ? "bg-[var(--status-warning-bg)]" : "bg-[var(--admin-panel-sunken)]",
                  )}
                >
                  <span className="inline-flex items-center gap-2 self-center text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 flex-none rounded-full border border-[var(--border-default)]"
                      style={{ background: swatch ?? "transparent" }}
                    />
                    {label}
                  </span>
                  <Field id={fieldId(variant.id, "price")} label={t("admin.form.optionsColPrice")}>
                    <MoneyInput
                      id={fieldId(variant.id, "price")}
                      value={variant.price}
                      placeholder={String(productPrice)}
                      onValueChange={(price) => updateVariant(variant.id, { price })}
                    />
                  </Field>
                  <Field id={fieldId(variant.id, "stock")} label={t("admin.form.optionsColStock")}>
                    <NumberInput
                      id={fieldId(variant.id, "stock")}
                      value={variant.stock}
                      min={0}
                      onValueChange={(stock) => updateVariant(variant.id, { stock: stock ?? 0 })}
                    />
                  </Field>
                  <Field id={fieldId(variant.id, "threshold")} label={t("admin.form.optionsColThreshold")}>
                    <NumberInput
                      id={fieldId(variant.id, "threshold")}
                      value={variant.lowStockThreshold}
                      min={0}
                      onValueChange={(value) => updateVariant(variant.id, { lowStockThreshold: value ?? 0 })}
                    />
                  </Field>
                  <IconAction
                    icon={Trash2}
                    label={t("admin.form.optionsCombinationRemove", { option: label })}
                    onClick={() => removeVariant(variant.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {missing.length > 0 && (
          <div className="grid gap-2">
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.optionsCombinationsMissing")}</p>
            <div className="flex flex-wrap gap-2">
              {missing.map((combo) => {
                const label = comboLabel(combo);
                return (
                  <AdminButton
                    key={combo.join(",")}
                    variant="outline"
                    size="sm"
                    iconLeft={Undo2}
                    aria-label={t("admin.form.optionsCombinationOffer", { option: label })}
                    onClick={() => onChange(options, addCombination(options, variants, combo, newId))}
                  >
                    {pick(combinationName(options, combo), lang) || label}
                  </AdminButton>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
          {error}
        </p>
      )}

      <div className="grid gap-1.5">
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.optionsHint")}</p>
        <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.form.variantsRemoveNotice")}
        </p>
      </div>
    </div>
  );
}
