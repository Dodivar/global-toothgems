import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, Info, Palette, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { MoneyInput, NumberInput } from "./AdminNumberInputs";
import { AdminButton } from "./AdminButton";
import { blankCustomVariant, type CustomVariant, type ProductImage } from "../../data/adminCatalog";
import { pick } from "../../data/types";

/**
 * The variants of a product that is not sold in gem packs: a mirror in blue
 * or pink, capsules by 50 or 100, a gem in 2 or 3 mm…
 *
 * One card per variant, in the order the customer sees them. Each has its
 * own name (the storefront shows it as the option label), an optional colour
 * dot, an optional price, its stock and the photos that show it — picking the
 * variant on the product page brings its first photo forward.
 */

interface CustomVariantsEditorProps {
  variants: CustomVariant[] | undefined;
  /** The product's photos, to link each variant to the ones that show it. */
  media: ProductImage[];
  /** Placeholder of an empty variant price. */
  productPrice: number;
  error?: string;
  onChange: (variants: CustomVariant[]) => void;
  /** Links photos to a variant (or unlinks them with `undefined`). */
  onMediaChange: (update: (media: ProductImage[]) => ProductImage[]) => void;
  /**
   * Id of the variant to bring forward on arrival (the product list links
   * here from an option row): scrolled into view, highlighted, its stock
   * field focused. An id the list does not hold is ignored.
   */
  focusOption?: string | null;
}

/** Default colour of a dot being added: a neutral grey the administrator changes. */
const DEFAULT_SWATCH = "#d9d9d9";

export function CustomVariantsEditor({
  variants = [],
  media,
  productPrice,
  error,
  onChange,
  onMediaChange,
  focusOption,
}: CustomVariantsEditorProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const target = focusOption && variants.some((v) => v.id === focusOption) ? focusOption : null;
  const arrived = useRef(false);
  /** Name field to focus once the variant it belongs to has been rendered. */
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    if (arrived.current || !target) return;
    arrived.current = true;
    const input = document.getElementById(fieldId(target, "stock"));
    input?.closest("li")?.scrollIntoView({ block: "center" });
    input?.focus({ preventScroll: true });
  }, [target]);

  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(fieldId(focusNext.current, "name-fr"))?.focus();
    focusNext.current = null;
  });

  const update = (id: string, patch: Partial<CustomVariant>) =>
    onChange(variants.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const move = (index: number, by: -1 | 1) => {
    const next = [...variants];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };

  const add = () => {
    const variant = blankCustomVariant(crypto.randomUUID());
    focusNext.current = variant.id;
    onChange([...variants, variant]);
  };

  const remove = (id: string) => {
    onChange(variants.filter((v) => v.id !== id));
    onMediaChange((list) => list.map((image) => (image.variantId === id ? { ...image, variantId: undefined } : image)));
  };

  /** A photo shows one variant at most: linking it here takes it from any other. */
  const togglePhoto = (variantId: string, imageId: string) =>
    onMediaChange((list) =>
      list.map((image) =>
        image.id === imageId ? { ...image, variantId: image.variantId === variantId ? undefined : variantId } : image,
      ),
    );

  const nameOf = (variant: CustomVariant, index: number) =>
    pick(variant.name, lang).trim() || t("admin.form.variantsUnnamed", { index: index + 1 });

  return (
    <div className="grid gap-4">
      {variants.length === 0 ? (
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.form.variantsNone")}</p>
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {variants.map((variant, index) => {
            const label = nameOf(variant, index);
            const missingName = Boolean(error) && (!variant.name.fr.trim() || !variant.name.en.trim());
            return (
              <li
                key={variant.id}
                className={clsx(
                  "grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-4",
                  variant.id === target ? "bg-[var(--status-warning-bg)]" : "bg-[var(--admin-panel-sunken)]",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 flex-none rounded-full border border-[var(--border-default)]"
                      style={{ background: variant.swatch ?? "transparent" }}
                    />
                    {label}
                  </span>
                  <div className="flex items-center gap-1">
                    <IconAction
                      icon={ArrowUp}
                      label={t("admin.form.variantsMoveUp", { option: label })}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconAction
                      icon={ArrowDown}
                      label={t("admin.form.variantsMoveDown", { option: label })}
                      disabled={index === variants.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <IconAction
                      icon={Trash2}
                      label={t("admin.form.variantsRemove", { option: label })}
                      onClick={() => remove(variant.id)}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field id={fieldId(variant.id, "name-fr")} label={t("admin.form.variantsNameFr")}>
                    <input
                      id={fieldId(variant.id, "name-fr")}
                      type="text"
                      maxLength={120}
                      className="gt-admin-field"
                      value={variant.name.fr}
                      placeholder={t("admin.form.variantsNamePlaceholder")}
                      aria-invalid={missingName && !variant.name.fr.trim() ? true : undefined}
                      onChange={(e) => update(variant.id, { name: { ...variant.name, fr: e.target.value } })}
                    />
                  </Field>
                  <Field id={fieldId(variant.id, "name-en")} label={t("admin.form.variantsNameEn")}>
                    <input
                      id={fieldId(variant.id, "name-en")}
                      type="text"
                      maxLength={120}
                      className="gt-admin-field"
                      value={variant.name.en}
                      placeholder={t("admin.form.variantsNamePlaceholderEn")}
                      aria-invalid={missingName && !variant.name.en.trim() ? true : undefined}
                      onChange={(e) => update(variant.id, { name: { ...variant.name, en: e.target.value } })}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="grid content-start gap-1.5">
                    <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                      {t("admin.form.variantsSwatch")}
                    </span>
                    {variant.swatch ? (
                      <div className="flex items-center gap-2">
                        {/* The native picker: keyboard and screen readers get a real colour field. */}
                        <input
                          type="color"
                          value={variant.swatch}
                          aria-label={t("admin.form.variantsSwatchLabel", { option: label })}
                          onChange={(e) => update(variant.id, { swatch: e.target.value.toLowerCase() })}
                          className="h-9 w-12 cursor-pointer rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-1"
                        />
                        <span className="font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {variant.swatch}
                        </span>
                        <IconAction
                          icon={X}
                          label={t("admin.form.variantsSwatchRemove", { option: label })}
                          onClick={() => update(variant.id, { swatch: undefined })}
                        />
                      </div>
                    ) : (
                      <AdminButton variant="outline" size="sm" iconLeft={Palette} onClick={() => update(variant.id, { swatch: DEFAULT_SWATCH })}>
                        {t("admin.form.variantsSwatchAdd")}
                      </AdminButton>
                    )}
                  </div>
                  <Field id={fieldId(variant.id, "price")} label={t("admin.form.optionsColPrice")}>
                    <MoneyInput
                      id={fieldId(variant.id, "price")}
                      value={variant.price}
                      placeholder={String(productPrice)}
                      onValueChange={(price) => update(variant.id, { price })}
                    />
                  </Field>
                  <Field id={fieldId(variant.id, "stock")} label={t("admin.form.optionsColStock")}>
                    <NumberInput
                      id={fieldId(variant.id, "stock")}
                      value={variant.stock}
                      min={0}
                      onValueChange={(stock) => update(variant.id, { stock: stock ?? 0 })}
                    />
                  </Field>
                  <Field id={fieldId(variant.id, "threshold")} label={t("admin.form.optionsColThreshold")}>
                    <NumberInput
                      id={fieldId(variant.id, "threshold")}
                      value={variant.lowStockThreshold}
                      min={0}
                      onValueChange={(value) => update(variant.id, { lowStockThreshold: value ?? 0 })}
                    />
                  </Field>
                </div>

                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="mb-1.5 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                    {t("admin.form.variantsPhotos")}
                  </legend>
                  {media.length === 0 ? (
                    <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.variantsPhotosNone")}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {media.map((image, imageIndex) => {
                        const linked = image.variantId === variant.id;
                        const other = !linked && image.variantId ? variants.find((v) => v.id === image.variantId) : undefined;
                        const otherIndex = other ? variants.indexOf(other) : -1;
                        return (
                          <button
                            key={image.id}
                            type="button"
                            aria-pressed={linked}
                            aria-label={t("admin.form.variantsPhotoToggle", { index: imageIndex + 1, option: label })}
                            title={other ? t("admin.form.variantsPhotoTaken", { option: nameOf(other, otherIndex) }) : undefined}
                            onClick={() => togglePhoto(variant.id, image.id)}
                            className={clsx(
                              "relative h-16 w-16 overflow-hidden rounded-[var(--admin-radius-sm)] border-2 bg-[var(--admin-panel)] transition-[border-color,opacity]",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                              linked ? "border-[var(--gt-ink-900)]" : "border-transparent",
                              other && "opacity-50",
                            )}
                          >
                            <img src={image.src} alt="" className="h-full w-full object-cover" />
                            {linked && (
                              <span
                                aria-hidden="true"
                                className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                              >
                                <Check size={10} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}

      <div>
        <AdminButton variant="outline" iconLeft={Plus} onClick={add}>
          {t("admin.form.variantsAdd")}
        </AdminButton>
      </div>

      {error && (
        <p role="alert" className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
          {error}
        </p>
      )}

      {variants.length > 0 && (
        <div className="grid gap-1.5">
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.variantsPriceHint")}</p>
          <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("admin.form.variantsRemoveNotice")}
          </p>
        </div>
      )}
    </div>
  );
}

/** Id of one field of a variant card, for labels and the arrival focus. */
function fieldId(variantId: string, field: string): string {
  return `variant-${variantId}-${field}`;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--admin-radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--admin-panel)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}
