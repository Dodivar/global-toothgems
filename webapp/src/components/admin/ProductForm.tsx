import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Archive, CircleAlert, Info, Save, Send, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { AdminSelect, type AdminOption } from "./AdminSelect";
import { MoneyInput, NumberInput } from "./AdminNumberInputs";
import { FormField } from "./FormField";
import { GemOptionsEditor } from "./GemOptionsEditor";
import { ProductMediaUploader } from "./ProductMediaUploader";
import { ToggleSwitch } from "./ToggleSwitch";
import { CONTENT_LANGS, type ContentLang } from "../../lib/localized";
import { formatDate } from "../../lib/format";
import { useAdminCatalog } from "../../lib/adminCatalog";
import {
  offeredGemVariants,
  type AdminProduct,
  type Availability,
  type CategoryId,
  type ProductStatus,
  type ProductType,
} from "../../data/adminCatalog";
import type { Localized } from "../../data/types";
import { comboSkuSuffix, longestSkuSuffix } from "../../lib/gemOptions";

/**
 * Create and edit a product.
 *
 * One component for both, because an edit screen that looks different from the
 * creation screen is a second interface to learn. `mode` only changes the
 * wording and which actions are offered.
 *
 * Product text is stored per language, so the text fields carry a FR/EN switch
 * rather than being doubled: the form stays the length of one product, and the
 * switch makes it obvious that a translation is missing instead of hiding it.
 */

export type SubmitIntent = "publish" | "draft" | "save";

const TYPES: ProductType[] = ["single", "set", "kit", "tool", "care", "course-material"];

interface ProductFormProps {
  initial: AdminProduct;
  mode: "create" | "edit";
  /** Every other product's SKU, for the uniqueness check. */
  takenSkus: string[];
  saving: boolean;
  onSubmit: (draft: AdminProduct, intent: SubmitIntent) => void;
  onCancel: () => void;
  onArchive?: () => void;
}

type FieldKey =
  | "name" | "sku" | "price" | "compareAtPrice" | "promoPrice" | "stock" | "lowStockThreshold" | "category" | "options";

/** Same rule as the `products.sku` column: upper-case letters, digits and hyphens. */
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,63}$/;
const SKU_MAX_LENGTH = 64;

type Errors = Partial<Record<FieldKey, string>>;

export function ProductForm({
  initial,
  mode,
  takenSkus,
  saving,
  onSubmit,
  onCancel,
  onArchive,
}: ProductFormProps) {
  const { t } = useTranslation();
  const { source, categories, uploadImage } = useAdminCatalog();
  // The database has no promotional price: discounts are the promotions
  // workspace's job, so the field only exists in the prototype.
  const withPromoPrice = source === "mock";
  const [draft, setDraft] = useState<AdminProduct>(initial);
  const [lang, setLang] = useState<ContentLang>("fr");
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const set = <K extends keyof AdminProduct>(key: K, value: AdminProduct[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /** Writes one language of a localized field, leaving the other alone. */
  const setLocalized = (key: "name" | "shortDescription" | "description" | "material", value: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...(prev[key] as Localized), [lang]: value } }));

  const errors = useMemo<Errors>(
    () => validate(draft, takenSkus, categories.map((c) => c.id), t),
    [draft, takenSkus, categories, t],
  );

  /** Errors are only shown once the administrator has had a chance to be right. */
  const showError = (key: FieldKey) => (submitted || touched[key] ? errors[key] : undefined);
  const blur = (key: FieldKey) => () => setTouched((prev) => ({ ...prev, [key]: true }));

  const submit = (intent: SubmitIntent) => (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      // Send focus to the problem rather than leaving the administrator to hunt
      // for it — the form is long enough that the first error can be off screen.
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    const status: ProductStatus =
      intent === "publish" ? "active" : intent === "draft" ? "draft" : draft.status;
    onSubmit({ ...draft, status, promoPrice: withPromoPrice ? draft.promoPrice : undefined }, intent);
  };

  // Pack/SS options are a gem thing; a product that already has them keeps
  // the editor whatever its category. Products whose variants are another
  // kind (colours, boxes…) never get it: saving would replace them.
  const category = categories.find((c) => c.id === draft.categoryId);
  const isGem = (category?.slug ?? category?.id) === "gems";
  const otherVariants = Boolean(draft.otherVariants) || (Boolean(draft.variantCount) && !draft.gemOptions);
  const showGemOptions = !otherVariants && (isGem || draft.gemOptions !== undefined);
  const optionsOn = Boolean(draft.gemOptions?.enabled);

  const categoryOptions: AdminOption[] = categories.map((c) => ({ value: c.id, label: c.name[lang] }));
  const typeOptions: AdminOption[] = TYPES.map((type) => ({ value: type, label: t(`admin.type.${type}`) }));
  const statusOptions: AdminOption[] = (["draft", "active", "archived"] as ProductStatus[]).map((s) => ({
    value: s,
    label: t(`admin.state.${s}`),
  }));
  const availabilityOptions: AdminOption[] = (["in_stock", "out_of_stock", "preorder"] as Availability[]).map((a) => ({
    value: a,
    label: t(`admin.stock.${a}`),
  }));

  const langSwitch = (
    <div role="group" aria-label={t("admin.form.contentLanguage")} className="flex gap-0.5 rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] p-0.5">
      {CONTENT_LANGS.map((code) => {
        const active = lang === code;
        const missing = draft.name[code].trim() === "";
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={clsx(
              "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
              active ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {code}
            {/* A dot, plus a word for anyone who cannot see it: an untranslated
                language must not be something you only notice at publish time. */}
            {missing && (
              <>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-highlight)]" />
                <span className="sr-only">{t("admin.form.translationMissing")}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <form onSubmit={submit(mode === "create" ? "draft" : "save")} noValidate className="grid gap-5 pb-28">
      {submitted && Object.keys(errors).length > 0 && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2.5 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]"
        >
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.form.errorSummary", { count: Object.keys(errors).length })}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-5">
          <Section title={t("admin.form.basicTitle")} description={t("admin.form.basicBody")} aside={langSwitch}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label={t("admin.form.name")}
                required
                error={showError("name")}
                hint={t("admin.form.nameHint", { lang: lang.toUpperCase() })}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className="gt-admin-field"
                    value={draft.name[lang]}
                    onChange={(e) => setLocalized("name", e.target.value)}
                    onBlur={blur("name")}
                    placeholder={t("admin.form.namePlaceholder")}
                  />
                )}
              </FormField>

              <FormField label={t("admin.form.sku")} required error={showError("sku")} hint={t("admin.form.skuHint")}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className="gt-admin-field font-[family-name:var(--gt-font-mono)]"
                    value={draft.sku}
                    onChange={(e) => set("sku", e.target.value.toUpperCase())}
                    onBlur={blur("sku")}
                    placeholder="GEM-STAR-001"
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              </FormField>
            </div>

            <FormField
              label={t("admin.form.shortDescription")}
              hint={t("admin.form.shortDescriptionHint")}
              aside={
                <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-subtle)]">
                  {draft.shortDescription[lang].length}/120
                </span>
              }
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={120}
                  className="gt-admin-field"
                  value={draft.shortDescription[lang]}
                  onChange={(e) => setLocalized("shortDescription", e.target.value)}
                />
              )}
            </FormField>

            <FormField label={t("admin.form.description")} hint={t("admin.form.descriptionHint")}>
              {(props) => (
                <textarea
                  {...props}
                  rows={5}
                  className="gt-admin-field"
                  value={draft.description[lang]}
                  onChange={(e) => setLocalized("description", e.target.value)}
                />
              )}
            </FormField>
          </Section>

          <Section title={t("admin.form.pricingTitle")} description={t("admin.form.pricingBody")}>
            <div className={clsx("grid gap-4", withPromoPrice ? "md:grid-cols-3" : "md:grid-cols-2")}>
              <FormField label={t("admin.form.price")} required error={showError("price")} hint={t("admin.form.priceHint")}>
                {(props) => (
                  <MoneyInput
                    {...props}
                    value={draft.price}
                    onValueChange={(value) => set("price", value ?? 0)}
                    onBlur={blur("price")}
                  />
                )}
              </FormField>

              <FormField
                label={t("admin.form.compareAtPrice")}
                error={showError("compareAtPrice")}
                hint={t("admin.form.compareAtPriceHint")}
              >
                {(props) => (
                  <MoneyInput
                    {...props}
                    value={draft.compareAtPrice}
                    onValueChange={(value) => set("compareAtPrice", value)}
                    onBlur={blur("compareAtPrice")}
                  />
                )}
              </FormField>

              {withPromoPrice && (
                <FormField
                  label={t("admin.form.promoPrice")}
                  error={showError("promoPrice")}
                  hint={t("admin.form.promoPriceHint")}
                >
                  {(props) => (
                    <MoneyInput
                      {...props}
                      value={draft.promoPrice}
                      onValueChange={(value) => set("promoPrice", value)}
                      onBlur={blur("promoPrice")}
                    />
                  )}
                </FormField>
              )}
            </div>
            {!withPromoPrice && (
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.form.promoInPromotions")}</p>
            )}
          </Section>

          <Section title={t("admin.form.mediaTitle")} description={t("admin.form.mediaBody")}>
            <ProductMediaUploader
              media={draft.media}
              onChange={(update) => setDraft((prev) => ({ ...prev, media: update(prev.media) }))}
              onUpload={uploadImage ? (file) => uploadImage(draft.id, file) : undefined}
            />
          </Section>

          {showGemOptions && (
            <Section title={t("admin.form.optionsTitle")} description={t("admin.form.optionsBody")}>
              <GemOptionsEditor
                options={draft.gemOptions}
                productPrice={draft.price}
                error={showError("options")}
                onChange={(gemOptions) => set("gemOptions", gemOptions)}
              />
            </Section>
          )}

          <Section title={t("admin.form.inventoryTitle")} description={t("admin.form.inventoryBody")}>
            {optionsOn ? (
              <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]">
                <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
                {t("admin.form.optionsStockNotice")}
              </p>
            ) : otherVariants ? (
              <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]">
                <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
                {t("admin.form.variantStock", { count: draft.variantCount, stock: draft.stock })}
              </p>
            ) : (
            <>
            <div className="rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
              <ToggleSwitch
                label={t("admin.form.trackInventory")}
                description={t("admin.form.trackInventoryHint")}
                checked={draft.trackInventory}
                onChange={(checked) => set("trackInventory", checked)}
              />
            </div>

            {draft.trackInventory ? (
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label={t("admin.form.stock")} required error={showError("stock")} hint={t("admin.form.stockHint")}>
                  {(props) => (
                    <NumberInput
                      {...props}
                      value={draft.stock}
                      min={0}
                      onValueChange={(value) => set("stock", value ?? 0)}
                      onBlur={blur("stock")}
                    />
                  )}
                </FormField>

                <FormField
                  label={t("admin.form.lowStockThreshold")}
                  error={showError("lowStockThreshold")}
                  hint={t("admin.form.lowStockThresholdHint")}
                >
                  {(props) => (
                    <NumberInput
                      {...props}
                      value={draft.lowStockThreshold}
                      min={0}
                      onValueChange={(value) => set("lowStockThreshold", value ?? 0)}
                      onBlur={blur("lowStockThreshold")}
                    />
                  )}
                </FormField>
              </div>
            ) : (
              <FormField label={t("admin.form.availability")} hint={t("admin.form.availabilityHint")}>
                {(props) => (
                  <AdminSelect
                    {...props}
                    options={availabilityOptions}
                    value={draft.availability}
                    onChange={(e) => set("availability", e.target.value as Availability)}
                  />
                )}
              </FormField>
            )}
            </>
            )}
          </Section>

          <Section title={t("admin.form.extraTitle")} description={t("admin.form.extraBody")}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t("admin.form.material")} hint={t("admin.form.materialHint")} aside={langSwitch}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className="gt-admin-field"
                    value={draft.material[lang]}
                    onChange={(e) => setLocalized("material", e.target.value)}
                  />
                )}
              </FormField>

              <FormField label={t("admin.form.tags")} hint={t("admin.form.tagsHint")}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className="gt-admin-field"
                    value={draft.tags.join(", ")}
                    onChange={(e) =>
                      set(
                        "tags",
                        e.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="pro, coffret"
                  />
                )}
              </FormField>
            </div>
          </Section>
        </div>

        {/* Right rail: what the product *is*, as opposed to what it says. Sticky
            so status and category stay reachable from anywhere in a long form. */}
        <div className="grid gap-5 xl:sticky xl:top-[calc(var(--admin-header-h)+20px)]">
          <Section title={t("admin.form.statusTitle")} compact>
            <FormField label={t("admin.form.status")} hint={t(`admin.form.statusHint.${draft.status}`)}>
              {(props) => (
                <AdminSelect
                  {...props}
                  options={statusOptions}
                  value={draft.status}
                  onChange={(e) => set("status", e.target.value as ProductStatus)}
                />
              )}
            </FormField>
          </Section>

          <Section title={t("admin.form.organisationTitle")} compact>
            <FormField label={t("admin.form.category")} required error={showError("category")}>
              {(props) => (
                <AdminSelect
                  {...props}
                  options={categoryOptions}
                  value={draft.categoryId}
                  onChange={(e) => set("categoryId", e.target.value as CategoryId)}
                />
              )}
            </FormField>

            <FormField label={t("admin.form.type")} hint={t("admin.form.typeHint")}>
              {(props) => (
                <AdminSelect
                  {...props}
                  options={typeOptions}
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value as ProductType)}
                />
              )}
            </FormField>
          </Section>

          {mode === "edit" && (
            <Section title={t("admin.form.historyTitle")} compact>
              <dl className="m-0 grid gap-3">
                <div className="grid gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                    {t("admin.preview.created")}
                  </dt>
                  <dd className="m-0 text-[length:var(--text-body-sm)]">{formatDate(initial.createdAt)}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                    {t("admin.preview.updated")}
                  </dt>
                  <dd className="m-0 text-[length:var(--text-body-sm)]">{formatDate(initial.updatedAt)}</dd>
                </div>
              </dl>

              {onArchive && (
                <>
                  <span aria-hidden="true" className="my-1 block h-px bg-[var(--border-subtle)]" />
                  <AdminButton variant="ghost" iconLeft={Archive} onClick={onArchive} fullWidth>
                    {t("admin.actions.archive")}
                  </AdminButton>
                </>
              )}
            </Section>
          )}

          <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
            <Info size={14} aria-hidden="true" className="mt-0.5 flex-none" />
            {source === "supabase" ? t("admin.form.databaseNotice") : t("admin.form.prototypeNotice")}
          </p>
        </div>
      </div>

      {/* Action bar. Pinned, because a form this tall would otherwise hide its
          own save button behind a scroll. */}
      <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-[var(--border-subtle)] bg-[var(--admin-panel)]/95 backdrop-blur-[10px] lg:left-[var(--admin-rail-offset,0px)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-[var(--admin-gutter)] py-3">
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {dirty ? t("admin.form.unsaved") : t("admin.form.noChanges")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton variant="ghost" iconLeft={X} onClick={onCancel} disabled={saving}>
              {t("common.cancel")}
            </AdminButton>
            <AdminButton variant="outline" onClick={submit("draft")} disabled={saving}>
              {t("admin.form.saveDraft")}
            </AdminButton>
            {mode === "create" ? (
              <AdminButton variant="primary" iconLeft={Send} loading={saving} onClick={submit("publish")}>
                {t("admin.form.createAndPublish")}
              </AdminButton>
            ) : (
              <AdminButton variant="primary" iconLeft={Save} loading={saving} onClick={submit("save")}>
                {t("admin.form.saveChanges")}
              </AdminButton>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

/** One titled block of the form. */
function Section({
  title,
  description,
  aside,
  compact,
  children,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={clsx("gt-admin-panel grid gap-4", compact ? "p-4" : "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className={compact ? "text-[length:var(--text-body-md)]" : "text-[length:var(--text-h4)]"}>{title}</h2>
          {description && (
            <p className="m-0 max-w-[62ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{description}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Field-level rules.
 *
 * Client-side only and for guidance alone — the real product must revalidate
 * every one of these on the server, which is the only place a rule can be
 * trusted.
 */
function validate(
  draft: AdminProduct,
  takenSkus: string[],
  categoryIds: string[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): Errors {
  const errors: Errors = {};

  if (!draft.name.fr.trim() || !draft.name.en.trim()) {
    errors.name = t("admin.form.errors.nameRequired");
  }

  const sku = draft.sku.trim();
  if (!sku) {
    errors.sku = t("admin.form.errors.skuRequired");
  } else if (!SKU_PATTERN.test(sku)) {
    errors.sku = t("admin.form.errors.skuFormat");
  } else if (takenSkus.some((taken) => taken.toLowerCase() === sku.toLowerCase())) {
    errors.sku = t("admin.form.errors.skuTaken");
  }

  if (!categoryIds.includes(draft.categoryId)) {
    errors.category = t("admin.form.errors.categoryRequired");
  }

  if (!(draft.price > 0)) {
    errors.price = t("admin.form.errors.pricePositive");
  } else if (!isCentAmount(draft.price)) {
    errors.price = t("admin.form.errors.priceCents");
  }
  if (draft.compareAtPrice != null && draft.compareAtPrice <= draft.price) {
    errors.compareAtPrice = t("admin.form.errors.compareAtTooLow");
  } else if (draft.compareAtPrice != null && !isCentAmount(draft.compareAtPrice)) {
    errors.compareAtPrice = t("admin.form.errors.priceCents");
  }
  if (draft.promoPrice != null && draft.promoPrice >= draft.price) {
    errors.promoPrice = t("admin.form.errors.promoTooHigh");
  }

  const productStock = draft.gemOptions ? !draft.gemOptions.enabled : !draft.variantCount;
  if (draft.trackInventory && productStock) {
    if (!Number.isInteger(draft.stock) || draft.stock < 0) {
      errors.stock = t("admin.form.errors.stockInvalid");
    }
    if (!Number.isInteger(draft.lowStockThreshold) || draft.lowStockThreshold < 0) {
      errors.lowStockThreshold = t("admin.form.errors.thresholdInvalid");
    }
  }

  if (draft.gemOptions?.enabled) {
    const offered = offeredGemVariants(draft.gemOptions);
    const suffix = longestSkuSuffix(offered);
    if (offered.length === 0) {
      errors.options = t("admin.form.errors.optionsEmpty");
    } else if (sku.length + suffix > SKU_MAX_LENGTH) {
      const longest = offered.map(comboSkuSuffix).sort((a, b) => b.length - a.length)[0];
      errors.options = t("admin.form.errors.optionsSkuTooLong", { max: SKU_MAX_LENGTH - suffix, suffix: longest });
    } else if (offered.some((v) => v.price != null && (!(v.price > 0) || !isCentAmount(v.price)))) {
      errors.options = t("admin.form.errors.optionsPrice");
    } else if (
      offered.some((v) => ![v.stock, v.lowStockThreshold].every((n) => Number.isInteger(n) && n >= 0))
    ) {
      errors.options = t("admin.form.errors.optionsStock");
    }
  }

  return errors;
}

/**
 * A whole number of cents, below the column's 10 integer digits. Checked on the
 * typed value so "12.345" is refused rather than silently rounded.
 */
function isCentAmount(value: number): boolean {
  const cents = value * 100;
  return value < 1e10 && Math.abs(cents - Math.round(cents)) < 1e-6;
}
