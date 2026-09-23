import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Dices, Info, Tags, Users } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminSelect } from "../admin/AdminSelect";
import { FormField } from "../admin/FormField";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { useLocalized, CONTENT_LANGS, type ContentLang } from "../../lib/localized";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { CATEGORIES } from "../../data/adminCatalog";
import {
  COLLECTIONS,
  PROMOTION_TYPES,
  SEGMENTS,
  TIMEZONES,
  randomCode,
  type Campaign,
  type Promotion,
  type PromotionType,
  type Timezone,
} from "../../data/adminPromotions";
import { centsToInput, parseEuros, type Issue, type IssueField } from "../../lib/promotionRules";
import { TYPE_ICON, useMoney } from "./PromoBadges";
import { CheckRow, CopyButton, FormSection, Segmented, UnitInput } from "./PromoUi";
import { ProductPicker } from "./ProductPicker";
import { ScheduleTimeline } from "./Timeline";

/**
 * The six lettered sections of the promotion editor.
 *
 * Each section receives the draft, an `update` that takes a recipe, and the
 * list of validation issues. Errors are shown next to the field they concern
 * *and* summarised in the editor's checklist; the section header turns into an
 * error marker so a folded section cannot hide a problem.
 */

export interface SectionProps {
  draft: Promotion;
  update: (recipe: (p: Promotion) => Promotion) => void;
  issues: Issue[];
  showErrors: boolean;
}

function useIssue({ issues, showErrors }: Pick<SectionProps, "issues" | "showErrors">) {
  const { t } = useTranslation();
  return (field: IssueField) => {
    if (!showErrors) return undefined;
    const issue = issues.find((i) => i.field === field);
    return issue ? t(`promo.validation.${issue.key}`) : undefined;
  };
}

function sectionState(section: Issue["section"], props: SectionProps): "ok" | "issue" | "neutral" {
  if (props.showErrors && props.issues.some((i) => i.section === section)) return "issue";
  return props.issues.some((i) => i.section === section) ? "neutral" : "ok";
}

/** Number input that stores a positive integer or null. */
function intOrNull(value: string): number | null {
  const n = parseInt(value.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* -------------------------------------------------------------------------- */
/* A — Basics                                                                 */
/* -------------------------------------------------------------------------- */

export function BasicsSection(props: SectionProps & { campaigns: Campaign[] }) {
  const { t } = useTranslation();
  const { draft, update, campaigns } = props;
  const issue = useIssue(props);
  const [lang, setLang] = useState<ContentLang>("fr");

  const langSwitch = (
    <Segmented
      label={t("promo.editor.contentLanguage")}
      hideLabel
      size="sm"
      value={lang}
      onChange={setLang}
      options={CONTENT_LANGS.map((l) => ({
        value: l,
        label: `${l.toUpperCase()}${draft.customerTitle[l].trim() ? " ✓" : ""}`,
      }))}
    />
  );

  return (
    <FormSection
      id="section-basics"
      letter="A"
      title={t("promo.editor.basics.title")}
      description={t("promo.editor.basics.description")}
      summary={draft.name || t("promo.editor.untitled")}
      state={sectionState("basics", props)}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <FormField label={t("promo.editor.basics.name")} hint={t("promo.editor.basics.nameHint")} error={issue("name")} required>
          {(a) => (
            <input
              {...a}
              data-autofocus
              type="text"
              value={draft.name}
              maxLength={80}
              onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
              placeholder="Summer Smile -20%"
              className="gt-admin-field"
            />
          )}
        </FormField>
        <FormField label={t("promo.editor.basics.campaign")} hint={t("promo.editor.basics.campaignHint")}>
          {(a) => (
            <AdminSelect
              {...a}
              value={draft.campaignId ?? ""}
              onChange={(e) => update((p) => ({ ...p, campaignId: e.target.value || null }))}
              options={[{ value: "", label: t("promo.editor.basics.noCampaign") }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
            />
          )}
        </FormField>
      </div>
      <FormField label={t("promo.editor.basics.internal")} hint={t("promo.editor.basics.internalHint")}>
        {(a) => (
          <textarea
            {...a}
            rows={2}
            value={draft.internalDescription}
            onChange={(e) => update((p) => ({ ...p, internalDescription: e.target.value }))}
            className="gt-admin-field"
          />
        )}
      </FormField>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-[var(--admin-radius)] border border-[var(--gt-fuchsia-300)] bg-[linear-gradient(180deg,var(--gt-fuchsia-50),transparent_70%)] p-4">
        <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[var(--accent-highlight-ink)]">
          <Info size={14} aria-hidden="true" /> {t("promo.editor.basics.customerFacing")}
        </p>
        <FormField
          label={t("promo.editor.basics.customerTitle", { lang: lang.toUpperCase() })}
          hint={t("promo.editor.basics.customerTitleHint")}
          error={issue("customerTitle")}
          required
          aside={langSwitch}
        >
          {(a) => (
            <input
              {...a}
              type="text"
              lang={lang}
              value={draft.customerTitle[lang]}
              maxLength={60}
              onChange={(e) => update((p) => ({ ...p, customerTitle: { ...p.customerTitle, [lang]: e.target.value } }))}
              placeholder={lang === "fr" ? "Black Friday : -25 % sur tout" : "Black Friday: 25% off everything"}
              className="gt-admin-field"
            />
          )}
        </FormField>
        <FormField
          label={t("promo.editor.basics.customerDescription", { lang: lang.toUpperCase() })}
          aside={
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{draft.customerDescription[lang].length}/200</span>
          }
        >
          {(a) => (
            <textarea
              {...a}
              rows={2}
              lang={lang}
              maxLength={200}
              value={draft.customerDescription[lang]}
              onChange={(e) => update((p) => ({ ...p, customerDescription: { ...p.customerDescription, [lang]: e.target.value } }))}
              className="gt-admin-field"
            />
          )}
        </FormField>
      </div>
    </FormSection>
  );
}

/* -------------------------------------------------------------------------- */
/* B — Discount type                                                          */
/* -------------------------------------------------------------------------- */

export function DiscountSection(props: SectionProps) {
  const { t } = useTranslation();
  const money = useMoney();
  const l = useLocalized();
  const { products } = useAdminCatalog();
  const { draft, update } = props;
  const issue = useIssue(props);
  const d = draft.discount;

  const setType = (type: PromotionType) =>
    update((p) => {
      const defaults: Record<PromotionType, Promotion["discount"]> = {
        percentage: { type, percent: 20, maxDiscountCents: null },
        fixed: { type, amountCents: 1000, minOrderCents: 5000 },
        bxgy: { type, buyQty: 2, getQty: 1, rewardPercent: 100 },
        freeShipping: { type, minOrderCents: 4000 },
        bundle: { type, bundleProductIds: [], bundlePriceCents: undefined },
        gift: { type, giftProductId: undefined, minOrderCents: 10000 },
      };
      return { ...p, discount: p.discount.type === type ? p.discount : defaults[type] };
    });

  const patch = (next: Partial<Promotion["discount"]>) => update((p) => ({ ...p, discount: { ...p.discount, ...next } }));

  const bundleFull = (d.bundleProductIds ?? []).reduce((s, id) => s + Math.round((products.find((x) => x.id === id)?.price ?? 0) * 100), 0);

  return (
    <FormSection
      id="section-discount"
      letter="B"
      title={t("promo.editor.discount.title")}
      description={t("promo.editor.discount.description")}
      summary={t(`promo.type.${d.type}`)}
      state={sectionState("discount", props)}
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
          {t("promo.editor.discount.typeLegend")}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROMOTION_TYPES.map((type) => {
            const Icon = TYPE_ICON[type];
            const on = d.type === type;
            return (
              <label
                key={type}
                className={clsx(
                  "relative grid cursor-pointer gap-1 rounded-[var(--admin-radius)] border p-3 transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)]",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                  on
                    ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)] shadow-[inset_0_0_0_1px_var(--gt-ink-900)]"
                    : "border-[var(--border-default)] bg-[var(--admin-panel)] hover:border-[var(--gt-ink-400)]",
                )}
              >
                <input type="radio" name="promo-type" value={type} checked={on} onChange={() => setType(type)} className="sr-only" />
                <span className="flex items-center justify-between">
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "grid h-8 w-8 place-items-center rounded-[8px]",
                      on ? "bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
                    )}
                  >
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  {on && <Check size={16} strokeWidth={2.4} aria-hidden="true" className="text-[var(--gt-ink-900)]" />}
                </span>
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t(`promo.type.${type}`)}</span>
                <span className="text-[11px] leading-snug text-[var(--text-muted)]">{t(`promo.typeHint.${type}`)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Contextual fields, keyed so switching type replays a short entrance. */}
      <div key={d.type} className="gt-auth-swap grid gap-4 rounded-[var(--admin-radius)] bg-[var(--admin-panel-sunken)] p-4 md:grid-cols-2">
        {d.type === "percentage" && (
          <>
            <FormField label={t("promo.editor.discount.percent")} error={issue("percent")} required>
              {(a) => (
                <UnitInput
                  id={a.id}
                  describedBy={a["aria-describedby"]}
                  invalid={a["aria-invalid"]}
                  inputMode="numeric"
                  unit="%"
                  value={d.percent ? String(d.percent) : ""}
                  onChange={(v) => patch({ percent: intOrNull(v) ?? 0 })}
                />
              )}
            </FormField>
            <FormField label={t("promo.editor.discount.maxDiscount")} hint={t("promo.editor.discount.maxDiscountHint")}>
              {(a) => (
                <UnitInput id={a.id} describedBy={a["aria-describedby"]} unit="€" value={centsToInput(d.maxDiscountCents)} onChange={(v) => patch({ maxDiscountCents: parseEuros(v) })} placeholder={t("promo.editor.noLimit")} />
              )}
            </FormField>
            <div className="flex flex-wrap gap-1.5 md:col-span-2" role="group" aria-label={t("promo.editor.discount.quickValues")}>
              {[10, 15, 20, 25, 30].map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={d.percent === v}
                  onClick={() => patch({ percent: v })}
                  className={clsx(
                    "h-8 rounded-[var(--radius-pill)] border px-3 text-[length:var(--text-caption)] font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
                    d.percent === v ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "border-[var(--border-default)] bg-[var(--admin-panel)] hover:border-[var(--gt-ink-400)]",
                  )}
                >
                  −{v} %
                </button>
              ))}
            </div>
          </>
        )}

        {d.type === "fixed" && (
          <>
            <FormField label={t("promo.editor.discount.amount")} error={issue("amount")} required>
              {(a) => (
                <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} unit="€" value={centsToInput(d.amountCents)} onChange={(v) => patch({ amountCents: parseEuros(v) ?? 0 })} />
              )}
            </FormField>
            <FormField label={t("promo.editor.discount.minOrder")} hint={t("promo.editor.discount.minOrderHint")}>
              {(a) => (
                <UnitInput id={a.id} describedBy={a["aria-describedby"]} unit="€" value={centsToInput(d.minOrderCents)} onChange={(v) => patch({ minOrderCents: parseEuros(v) })} placeholder={t("promo.editor.noMinimum")} />
              )}
            </FormField>
            {d.amountCents && d.minOrderCents && d.amountCents >= d.minOrderCents ? (
              <p className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-warning-fg)] md:col-span-2">
                {t("promo.editor.discount.amountAboveMin")}
              </p>
            ) : null}
          </>
        )}

        {d.type === "bxgy" && (
          <>
            <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-3">
              <FormField label={t("promo.editor.discount.buyQty")} error={issue("buyGet")} required>
                {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} inputMode="numeric" unit="×" value={d.buyQty ? String(d.buyQty) : ""} onChange={(v) => patch({ buyQty: intOrNull(v) ?? 0 })} />}
              </FormField>
              <FormField label={t("promo.editor.discount.getQty")} required>
                {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} inputMode="numeric" unit="×" value={d.getQty ? String(d.getQty) : ""} onChange={(v) => patch({ getQty: intOrNull(v) ?? 0 })} />}
              </FormField>
              <FormField label={t("promo.editor.discount.reward")}>
                {(a) => (
                  <AdminSelect
                    {...a}
                    value={String(d.rewardPercent ?? 100)}
                    onChange={(e) => patch({ rewardPercent: Number(e.target.value) })}
                    options={[
                      { value: "100", label: t("promo.editor.discount.rewardFree") },
                      { value: "50", label: t("promo.editor.discount.rewardHalf") },
                    ]}
                  />
                )}
              </FormField>
            </div>
            <p className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel)] px-3 py-2 text-[length:var(--text-caption)] text-[var(--text-body)] md:col-span-2">
              {t("promo.editor.discount.bxgySentence", { buy: d.buyQty ?? 0, get: d.getQty ?? 0 })}
            </p>
            <div className="md:col-span-2">
              <ProductPicker
                label={t("promo.editor.discount.eligibleProducts")}
                hint={t("promo.editor.discount.eligibleProductsHint")}
                selected={draft.eligibility.productIds}
                onChange={(ids) => update((p) => ({ ...p, eligibility: { ...p.eligibility, scope: ids.length ? "products" : "all", productIds: ids } }))}
              />
            </div>
          </>
        )}

        {d.type === "freeShipping" && (
          <FormField label={t("promo.editor.discount.minOrder")} hint={t("promo.editor.discount.freeShippingHint")}>
            {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} unit="€" value={centsToInput(d.minOrderCents)} onChange={(v) => patch({ minOrderCents: parseEuros(v) })} placeholder={t("promo.editor.noMinimum")} />}
          </FormField>
        )}

        {d.type === "bundle" && (
          <>
            <div className="md:col-span-2">
              <ProductPicker
                label={t("promo.editor.discount.bundleProducts")}
                hint={t("promo.editor.discount.bundleProductsHint")}
                selected={d.bundleProductIds ?? []}
                onChange={(ids) => patch({ bundleProductIds: ids })}
                error={issue("bundle")}
              />
            </div>
            <FormField label={t("promo.editor.discount.bundlePrice")} required>
              {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} unit="€" value={centsToInput(d.bundlePriceCents)} onChange={(v) => patch({ bundlePriceCents: parseEuros(v) ?? undefined })} />}
            </FormField>
            <div className="grid content-end">
              {bundleFull > 0 && (
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                  {t("promo.editor.discount.bundleCompare", { full: money(bundleFull) })}
                  {d.bundlePriceCents && d.bundlePriceCents < bundleFull ? (
                    <strong className="ml-1 text-[var(--accent-highlight-ink)]">
                      {t("promo.editor.discount.bundleSaves", { amount: money(bundleFull - d.bundlePriceCents) })}
                    </strong>
                  ) : null}
                </p>
              )}
            </div>
          </>
        )}

        {d.type === "gift" && (
          <>
            <div className="md:col-span-2">
              <ProductPicker
                single
                label={t("promo.editor.discount.giftProduct")}
                hint={t("promo.editor.discount.giftProductHint")}
                selected={d.giftProductId ? [d.giftProductId] : []}
                onChange={(ids) => patch({ giftProductId: ids[0] })}
                error={issue("gift")}
              />
            </div>
            <FormField label={t("promo.editor.discount.minOrder")}>
              {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} unit="€" value={centsToInput(d.minOrderCents)} onChange={(v) => patch({ minOrderCents: parseEuros(v) })} placeholder={t("promo.editor.noMinimum")} />}
            </FormField>
            {d.giftProductId && (
              <p className="m-0 self-end text-[length:var(--text-caption)] text-[var(--text-body)]">
                {t("promo.editor.discount.giftStock", {
                  name: l(products.find((p) => p.id === d.giftProductId)?.name ?? { fr: "", en: "" }),
                  stock: products.find((p) => p.id === d.giftProductId)?.stock ?? 0,
                })}
              </p>
            )}
          </>
        )}
      </div>
    </FormSection>
  );
}

/* -------------------------------------------------------------------------- */
/* C — Eligibility                                                            */
/* -------------------------------------------------------------------------- */

export function EligibilitySection(props: SectionProps) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { draft, update } = props;
  const issue = useIssue(props);
  const e = draft.eligibility;
  const set = (next: Partial<Promotion["eligibility"]>) => update((p) => ({ ...p, eligibility: { ...p.eligibility, ...next } }));
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const bundle = draft.discount.type === "bundle";

  const chip = (on: boolean) =>
    clsx(
      "inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 text-[length:var(--text-caption)] font-semibold transition-colors",
      "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
      on ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "border-[var(--border-default)] bg-[var(--admin-panel)] hover:border-[var(--gt-ink-400)]",
    );

  return (
    <FormSection
      id="section-eligibility"
      letter="C"
      title={t("promo.editor.eligibility.title")}
      description={t("promo.editor.eligibility.description")}
      summary={`${t(`promo.editor.eligibility.scope.${e.scope}`)} · ${t(`promo.editor.eligibility.customers.${e.customers}`)}`}
      state={sectionState("eligibility", props)}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h3 className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
          <Tags size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
          {t("promo.editor.eligibility.productsHeading")}
        </h3>
        {bundle ? (
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("promo.editor.eligibility.bundleNote")}</p>
        ) : (
          <>
            <Segmented
              label={t("promo.editor.eligibility.scopeLabel")}
              hideLabel
              value={e.scope}
              onChange={(scope) => set({ scope })}
              options={(["all", "products", "categories", "collections"] as const).map((s) => ({ value: s, label: t(`promo.editor.eligibility.scope.${s}`) }))}
            />
            {e.scope === "products" && (
              <ProductPicker label={t("promo.editor.eligibility.pickProducts")} selected={e.productIds} onChange={(productIds) => set({ productIds })} error={issue("scope")} />
            )}
            {e.scope === "categories" && (
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold">{t("promo.editor.eligibility.pickCategories")}</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <label key={c.id} className={chip(e.categoryIds.includes(c.id))}>
                      <input type="checkbox" className="sr-only" checked={e.categoryIds.includes(c.id)} onChange={() => set({ categoryIds: toggleIn(e.categoryIds, c.id) })} />
                      {e.categoryIds.includes(c.id) && <Check size={13} aria-hidden="true" />}
                      {l(c.name)}
                    </label>
                  ))}
                </div>
                {issue("scope") && <p className="m-0 mt-2 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">{issue("scope")}</p>}
              </fieldset>
            )}
            {e.scope === "collections" && (
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold">{t("promo.editor.eligibility.pickCollections")}</legend>
                <div className="flex flex-wrap gap-2">
                  {COLLECTIONS.map((c) => (
                    <label key={c.id} className={chip(e.collectionIds.includes(c.id))}>
                      <input type="checkbox" className="sr-only" checked={e.collectionIds.includes(c.id)} onChange={() => set({ collectionIds: toggleIn(e.collectionIds, c.id) })} />
                      {e.collectionIds.includes(c.id) && <Check size={13} aria-hidden="true" />}
                      {l(c.name)}
                      <span className="opacity-70">· {c.productIds.length}</span>
                    </label>
                  ))}
                </div>
                {issue("scope") && <p className="m-0 mt-2 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">{issue("scope")}</p>}
              </fieldset>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-[var(--border-subtle)] pt-5">
        <h3 className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
          <Users size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
          {t("promo.editor.eligibility.customersHeading")}
        </h3>
        <Segmented
          label={t("promo.editor.eligibility.customersLabel")}
          hideLabel
          value={e.customers}
          onChange={(customers) => set({ customers })}
          options={(["all", "new", "existing", "segments"] as const).map((s) => ({ value: s, label: t(`promo.editor.eligibility.customers.${s}`) }))}
        />
        {e.customers === "segments" && (
          <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2">
            <legend className="mb-2 p-0 text-[length:var(--text-caption)] font-semibold">{t("promo.editor.eligibility.pickSegments")}</legend>
            {SEGMENTS.map((s) => {
              const on = e.segmentIds.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-[var(--admin-radius-sm)] border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                    on ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)]" : "border-[var(--border-default)] hover:border-[var(--gt-ink-400)]",
                  )}
                >
                  <input type="checkbox" checked={on} onChange={() => set({ segmentIds: toggleIn(e.segmentIds, s.id) })} className="h-4 w-4 accent-[var(--gt-ink-900)]" />
                  <span className="grid flex-1 leading-tight">
                    <span className="text-[length:var(--text-body-sm)] font-semibold">{l(s.name)}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{t("promo.editor.eligibility.segmentSize", { count: s.size })}</span>
                  </span>
                </label>
              );
            })}
            {issue("segments") && <p className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)] sm:col-span-2">{issue("segments")}</p>}
          </fieldset>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-[var(--border-subtle)] pt-5 md:grid-cols-2">
        <FormField label={t("promo.editor.eligibility.minCart")} hint={t("promo.editor.eligibility.minCartHint")}>
          {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} unit="€" value={centsToInput(e.minCartCents)} onChange={(v) => set({ minCartCents: parseEuros(v) })} placeholder={t("promo.editor.noMinimum")} />}
        </FormField>
        <FormField label={t("promo.editor.eligibility.minQty")}>
          {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} inputMode="numeric" unit="×" value={e.minQuantity ? String(e.minQuantity) : ""} onChange={(v) => set({ minQuantity: intOrNull(v) })} placeholder={t("promo.editor.noMinimum")} />}
        </FormField>
      </div>
    </FormSection>
  );
}

/* -------------------------------------------------------------------------- */
/* D — Usage rules                                                            */
/* -------------------------------------------------------------------------- */

export function UsageSection(props: SectionProps) {
  const { t } = useTranslation();
  const { draft, update } = props;
  const issue = useIssue(props);
  const u = draft.usage;
  const set = (next: Partial<Promotion["usage"]>) => update((p) => ({ ...p, usage: { ...p.usage, ...next } }));
  const [excludeOpen, setExcludeOpen] = useState(u.excludedProductIds.length > 0);

  return (
    <FormSection
      id="section-usage"
      letter="D"
      title={t("promo.editor.usage.title")}
      description={t("promo.editor.usage.description")}
      summary={[
        u.maxTotal ? t("promo.editor.usage.summaryTotal", { count: u.maxTotal }) : t("promo.editor.usage.unlimited"),
        u.maxPerCustomer ? t("promo.editor.usage.summaryPer", { count: u.maxPerCustomer }) : null,
        u.combinable ? t("promo.editor.usage.combinableShort") : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      state={sectionState("usage", props)}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <FormField label={t("promo.editor.usage.maxTotal")} hint={t("promo.editor.usage.maxTotalHint")}>
          {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} inputMode="numeric" unit="×" value={u.maxTotal ? String(u.maxTotal) : ""} onChange={(v) => set({ maxTotal: intOrNull(v) })} placeholder={t("promo.editor.noLimit")} />}
        </FormField>
        <FormField label={t("promo.editor.usage.maxPerCustomer")} error={issue("usage")}>
          {(a) => (
            <UnitInput id={a.id} describedBy={a["aria-describedby"]} invalid={a["aria-invalid"]} inputMode="numeric" unit="×" value={u.maxPerCustomer ? String(u.maxPerCustomer) : ""} onChange={(v) => set({ maxPerCustomer: intOrNull(v) })} placeholder={t("promo.editor.noLimit")} />
          )}
        </FormField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] p-4">
        <ToggleSwitch label={t("promo.editor.usage.combinable")} description={t("promo.editor.usage.combinableHint")} checked={u.combinable} onChange={(combinable) => set({ combinable })} />
        <ToggleSwitch label={t("promo.editor.usage.excludeDiscounted")} description={t("promo.editor.usage.excludeDiscountedHint")} checked={u.excludeDiscounted} onChange={(excludeDiscounted) => set({ excludeDiscounted })} />
        <ToggleSwitch label={t("promo.editor.usage.excludeGiftCards")} description={t("promo.editor.usage.excludeGiftCardsHint")} checked={u.excludeGiftCards} onChange={(excludeGiftCards) => set({ excludeGiftCards })} />
        <ToggleSwitch
          label={t("promo.editor.usage.excludeProducts")}
          description={t("promo.editor.usage.excludeProductsHint")}
          checked={excludeOpen}
          onChange={(on) => {
            setExcludeOpen(on);
            if (!on) set({ excludedProductIds: [] });
          }}
        />
        <div className="gt-collapse" data-open={excludeOpen}>
          <div>
            {excludeOpen && (
              <ProductPicker label={t("promo.editor.usage.excludedLabel")} selected={u.excludedProductIds} onChange={(excludedProductIds) => set({ excludedProductIds })} />
            )}
          </div>
        </div>
      </div>
    </FormSection>
  );
}

/* -------------------------------------------------------------------------- */
/* E — Scheduling                                                             */
/* -------------------------------------------------------------------------- */

function splitLocal(value: string | null): [string, string] {
  if (!value) return ["", ""];
  return [value.slice(0, 10), value.slice(11, 16) || "00:00"];
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ScheduleSection(props: SectionProps) {
  const { t } = useTranslation();
  const { draft, update } = props;
  const issue = useIssue(props);
  const s = draft.schedule;
  const [startDate, startTime] = splitLocal(s.startsAt);
  const [endDate, endTime] = splitLocal(s.endsAt);
  const set = (next: Partial<Promotion["schedule"]>) => update((p) => ({ ...p, schedule: { ...p.schedule, ...next } }));
  const invalid = issue("schedule");

  const presets: { id: string; start: string; end: string | null }[] = [
    { id: "weekend", start: "2027-11-27T00:00", end: "2027-11-28T23:59" },
    { id: "week", start: `${startDate || "2027-11-25"}T00:00`, end: `${shiftDays(startDate || "2027-11-25", 6)}T23:59` },
    { id: "twoWeeks", start: `${startDate || "2027-11-25"}T00:00`, end: `${shiftDays(startDate || "2027-11-25", 13)}T23:59` },
    { id: "december", start: "2027-12-01T00:00", end: "2027-12-31T23:59" },
    { id: "evergreen", start: `${startDate || "2027-11-25"}T00:00`, end: null },
  ];

  return (
    <FormSection
      id="section-schedule"
      letter="E"
      title={t("promo.editor.schedule.title")}
      description={t("promo.editor.schedule.description")}
      summary={`${startDate} ${startTime} → ${s.endsAt ? `${endDate} ${endTime}` : t("promo.timeline.noEnd")}`}
      state={sectionState("schedule", props)}
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("promo.editor.schedule.presets")}>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => set({ startsAt: p.start, endsAt: p.end })}
            className="h-8 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--admin-panel)] px-3 text-[length:var(--text-caption)] font-semibold transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {t(`promo.editor.schedule.preset.${p.id}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
            {t("promo.editor.schedule.start")} <span className="text-[var(--accent-highlight-ink)]" aria-hidden="true">*</span>
          </legend>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
            <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
              <span className="text-[11px] text-[var(--text-muted)]">{t("promo.editor.schedule.date")}</span>
              <input type="date" value={startDate} onChange={(e) => set({ startsAt: `${e.target.value}T${startTime || "00:00"}` })} className="gt-admin-field" required />
            </label>
            <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
              <span className="text-[11px] text-[var(--text-muted)]">{t("promo.editor.schedule.time")}</span>
              <input type="time" value={startTime} onChange={(e) => set({ startsAt: `${startDate}T${e.target.value || "00:00"}` })} className="gt-admin-field" />
            </label>
          </div>
        </fieldset>
        <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={invalid ? "schedule-error" : undefined}>
          <legend className="mb-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("promo.editor.schedule.end")}</legend>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
            <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
              <span className="text-[11px] text-[var(--text-muted)]">{t("promo.editor.schedule.date")}</span>
              <input
                type="date"
                value={endDate}
                disabled={!s.endsAt}
                aria-invalid={invalid ? true : undefined}
                min={startDate || undefined}
                onChange={(e) => set({ endsAt: `${e.target.value}T${endTime || "23:59"}` })}
                className="gt-admin-field"
              />
            </label>
            <label className="grid grid-cols-[minmax(0,1fr)] gap-1">
              <span className="text-[11px] text-[var(--text-muted)]">{t("promo.editor.schedule.time")}</span>
              <input type="time" value={endTime} disabled={!s.endsAt} aria-invalid={invalid ? true : undefined} onChange={(e) => set({ endsAt: `${endDate}T${e.target.value || "23:59"}` })} className="gt-admin-field" />
            </label>
          </div>
          <CheckRow
            label={t("promo.editor.schedule.noEnd")}
            checked={!s.endsAt}
            onChange={(noEnd) => set({ endsAt: noEnd ? null : `${shiftDays(startDate || "2027-11-25", 13)}T23:59` })}
          />
        </fieldset>
      </div>
      {invalid && (
        <p id="schedule-error" className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
          {invalid}
        </p>
      )}
      <label className="grid max-w-[320px] gap-1">
        <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("promo.editor.schedule.timezone")}</span>
        <AdminSelect value={s.timezone} onChange={(e) => set({ timezone: e.target.value as Timezone })} options={TIMEZONES.map((z) => ({ value: z, label: z.replace("_", " ") }))} />
      </label>

      <div className="rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
        <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.editor.schedule.preview")}</p>
        <ScheduleTimeline startsAt={s.startsAt} endsAt={s.endsAt} invalid={!!props.issues.find((i) => i.field === "schedule")} />
      </div>
    </FormSection>
  );
}

/* -------------------------------------------------------------------------- */
/* F — Promotional code                                                       */
/* -------------------------------------------------------------------------- */

export function CodeSection(props: SectionProps & { codeTaken: boolean }) {
  const { t } = useTranslation();
  const { draft, update, codeTaken } = props;
  const issue = useIssue(props);
  const c = draft.code;
  const set = (next: Partial<Promotion["code"]>) => update((p) => ({ ...p, code: { ...p.code, ...next } }));
  const [generating, setGenerating] = useState(false);

  const generate = () => {
    setGenerating(true);
    // A short beat so the button's busy state is visible — generation is instant
    // here, but a real one checks uniqueness on the server.
    setTimeout(() => {
      set({ code: randomCode(draft.discount.type === "percentage" && draft.discount.percent ? `GT${draft.discount.percent}-` : "GT-") });
      setGenerating(false);
    }, 380);
  };

  const codeError = issue("code") ?? (codeTaken ? t("promo.validation.codeTaken") : undefined);

  return (
    <FormSection
      id="section-code"
      letter="F"
      title={t("promo.editor.code.title")}
      description={t("promo.editor.code.description")}
      summary={c.mode === "automatic" ? t("promo.code.automatic") : c.code || t("promo.editor.code.missing")}
      state={codeTaken && c.mode === "code" ? "issue" : sectionState("code", props)}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {(["automatic", "code"] as const).map((mode) => {
          const on = c.mode === mode;
          return (
            <label
              key={mode}
              className={clsx(
                "grid cursor-pointer gap-1 rounded-[var(--admin-radius)] border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                on ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)] shadow-[inset_0_0_0_1px_var(--gt-ink-900)]" : "border-[var(--border-default)] hover:border-[var(--gt-ink-400)]",
              )}
            >
              <input type="radio" name="code-mode" checked={on} onChange={() => set({ mode })} className="sr-only" />
              <span className="flex items-center justify-between text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(`promo.editor.code.mode.${mode}`)}
                {on && <Check size={16} strokeWidth={2.4} aria-hidden="true" />}
              </span>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`promo.editor.code.modeHint.${mode}`)}</span>
            </label>
          );
        })}
      </div>

      {c.mode === "code" && (
        <div className="gt-auth-swap grid gap-4">
          <FormField label={t("promo.editor.code.code")} hint={t("promo.editor.code.codeHint")} error={codeError} required>
            {(a) => (
              <div className="flex flex-wrap gap-2">
                <input
                  {...a}
                  type="text"
                  value={c.code}
                  maxLength={24}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => set({ code: c.caseSensitive ? e.target.value.replace(/\s/g, "") : e.target.value.toUpperCase().replace(/\s/g, "") })}
                  placeholder="SPARKLE20"
                  aria-invalid={codeError ? true : undefined}
                  className="gt-admin-field min-w-[180px] flex-1 font-[family-name:var(--gt-font-mono)] font-semibold tracking-[.06em]"
                />
                <AdminButton variant="outline" iconLeft={Dices} loading={generating} onClick={generate}>
                  {t("promo.editor.code.generate")}
                </AdminButton>
                <CopyButton value={c.code} label={t("promo.editor.code.copy")} copiedLabel={t("promo.editor.code.copied")} size="md" />
              </div>
            )}
          </FormField>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-muted)]">{t("promo.editor.code.examples")}</span>
            {["WELCOME15", "SPARKLE20", "BLACKFRIDAY25", "NOEL2027", "STUDIOPRO"].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => set({ code: ex })}
                className="rounded-[6px] border border-dashed border-[var(--border-default)] px-2 py-0.5 font-[family-name:var(--gt-font-mono)] text-[11px] font-semibold text-[var(--text-body)] transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] p-4">
            <ToggleSwitch
              label={t("promo.editor.code.caseSensitive")}
              description={c.caseSensitive ? t("promo.editor.code.caseSensitiveOn") : t("promo.editor.code.caseSensitiveOff", { code: c.code || "SPARKLE20", lower: (c.code || "SPARKLE20").toLowerCase() })}
              checked={c.caseSensitive}
              onChange={(caseSensitive) => set({ caseSensitive })}
            />
            <Segmented
              label={t("promo.editor.code.kind")}
              value={c.kind}
              onChange={(kind) => set({ kind, uniqueCount: kind === "unique" ? (c.uniqueCount ?? 500) : null })}
              options={[
                { value: "shared", label: t("promo.editor.code.shared") },
                { value: "unique", label: t("promo.editor.code.unique") },
              ]}
            />
            {c.kind === "unique" && (
              <FormField label={t("promo.editor.code.uniqueCount")} hint={t("promo.editor.code.uniqueHint", { prefix: c.code || "GT" })}>
                {(a) => <UnitInput id={a.id} describedBy={a["aria-describedby"]} inputMode="numeric" unit="×" value={c.uniqueCount ? String(c.uniqueCount) : ""} onChange={(v) => set({ uniqueCount: intOrNull(v) })} />}
              </FormField>
            )}
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("promo.editor.code.limitsNote", {
                total: draft.usage.maxTotal ?? "∞",
                per: draft.usage.maxPerCustomer ?? "∞",
              })}
            </p>
          </div>
        </div>
      )}
    </FormSection>
  );
}
