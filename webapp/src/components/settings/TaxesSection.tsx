import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BadgePercent,
  Building,
  Calculator,
  Globe2,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  ScrollText,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminIconButton } from "../admin/AdminIconButton";
import { AdminSelect } from "../admin/AdminSelect";
import { ConfirmationDialog } from "../admin/ConfirmationDialog";
import { EmptyState } from "../admin/EmptyState";
import { FormField } from "../admin/FormField";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { CheckRow, FormDialog, Segmented } from "../promotions/PromoUi";
import { useMoney } from "../promotions/PromoBadges";
import { useToast } from "../../lib/toast";
import { useAdminSettings } from "../../lib/adminSettings";
import {
  addTax,
  bpToInput,
  countryName,
  effectiveRate,
  flagOf,
  formatPercent,
  parsePercent,
  splitGross,
  validateTaxes,
  validateVatRate,
} from "../../lib/settingsRules";
import {
  EU_COUNTRIES,
  REDUCED_CATEGORIES,
  type ExemptGroup,
  type ReducedCategory,
  type ReducedRate,
  type TaxBasis,
  type TaxSettings,
  type VatRate,
} from "../../data/adminSettings";
import { InfoTip, RowSwitch, SettingsCard, StatusPill, TextField } from "./SettingsUi";

/**
 * VAT, explained in the order it is decided.
 *
 * Three tiers on one vertical rail — the store default, then the rates that
 * replace it country by country, then the rules that adjust it for particular
 * products or customers — so the precedence is the layout itself rather than a
 * paragraph somebody has to read. Every setting that is easy to misread has a
 * toggletip, and the default tier carries a worked example that recalculates
 * as the switches move.
 */

const SAMPLE_PRICE = 2490;
let seq = 0;
const newId = (p: string) => `${p}-new-${++seq}`;

export function TaxesSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { draft, update, attempted } = useAdminSettings();
  const tax = draft.taxes;
  const set = (patch: Partial<TaxSettings>) => update("taxes", (v) => ({ ...v, ...patch }));
  const errors = validateTaxes(tax);
  const [rateInput, setRateInput] = useState(bpToInput(tax.defaultRateBp));

  // Discard resets the draft underneath the typed text; follow it.
  useEffect(() => {
    if (tax.defaultRateBp >= 0) setRateInput((current) => (parsePercent(current) === tax.defaultRateBp ? current : bpToInput(tax.defaultRateBp)));
  }, [tax.defaultRateBp]);

  const euOptions = useMemo(
    () =>
      EU_COUNTRIES.map((c) => ({ code: c, name: countryName(c, lang) }))
        .sort((a, b) => a.name.localeCompare(b.name, lang))
        .map((c) => ({ value: c.code, label: `${flagOf(c.code)}  ${c.name}` })),
    [lang],
  );

  return (
    <>
      {/* Master switch */}
      <div
        className={clsx(
          "gt-admin-panel flex flex-wrap items-center gap-4 p-5 sm:px-6",
          tax.enabled ? "border-[var(--gt-emerald-300)]" : "border-[var(--border-default)]",
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "grid h-11 w-11 flex-none place-items-center rounded-[12px]",
            tax.enabled ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" : "bg-[var(--surface-sunken)] text-[var(--text-muted)]",
          )}
        >
          <Landmark size={20} strokeWidth={1.8} />
        </span>
        <div className="min-w-[16rem] flex-1">
          <ToggleSwitch
            label={t("settings.taxes.enabled")}
            description={tax.enabled ? t("settings.taxes.enabledOn") : t("settings.taxes.enabledOff")}
            checked={tax.enabled}
            onChange={(enabled) => set({ enabled })}
          />
        </div>
      </div>

      {!tax.enabled && (
        <div className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-4 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
          <TriangleAlert size={18} aria-hidden="true" className="flex-none" />
          <span>
            <strong className="block text-[length:var(--text-body-sm)]">{t("settings.taxes.disabledTitle")}</strong>
            {t("settings.taxes.disabledBody")}
          </span>
        </div>
      )}

      <PrecedenceExplainer />

      <fieldset disabled={!tax.enabled} className={clsx("m-0 grid min-w-0 gap-0 border-0 p-0 transition-opacity", !tax.enabled && "opacity-55")}>
        <legend className="sr-only">{t("settings.taxes.rules")}</legend>

        {/* Tier 1 ---------------------------------------------------------- */}
        <Tier step={1} title={t("settings.taxes.tier1.title")} caption={t("settings.taxes.tier1.caption")}>
          <SettingsCard icon={Building} title={t("settings.taxes.default.title")} description={t("settings.taxes.default.description")}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid min-w-0 gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label={t("settings.taxes.default.country")} hint={t("settings.taxes.default.countryHint")} error={attempted.taxes && errors.defaultCountry ? t(`settings.errors.${errors.defaultCountry}`) : undefined}>
                    {(props) => <AdminSelect {...props} value={tax.defaultCountry} onChange={(e) => set({ defaultCountry: e.target.value })} options={euOptions} />}
                  </FormField>
                  <TextField
                    label={t("settings.taxes.default.rate")}
                    hint={t("settings.taxes.default.rateHint")}
                    value={rateInput}
                    inputMode="decimal"
                    suffix="%"
                    onChange={(v) => {
                      setRateInput(v);
                      const bp = parsePercent(v);
                      set({ defaultRateBp: bp ?? -1 });
                    }}
                    error={errors.defaultRate ? t(`settings.errors.${errors.defaultRate}`) : undefined}
                    showError={rateInput.trim() !== "" || attempted.taxes}
                  />
                </div>

                <div className="grid gap-4 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-4">
                  <LabelledToggle
                    label={t("settings.taxes.default.pricesInclude")}
                    description={t("settings.taxes.default.pricesIncludeHint")}
                    tip={t("settings.taxes.tips.pricesInclude")}
                    checked={tax.pricesIncludeVat}
                    onChange={(pricesIncludeVat) => set({ pricesIncludeVat })}
                  />
                  <LabelledToggle
                    label={t("settings.taxes.default.showProduct")}
                    description={t("settings.taxes.default.showProductHint")}
                    checked={tax.showOnProduct}
                    onChange={(showOnProduct) => set({ showOnProduct })}
                  />
                  <LabelledToggle
                    label={t("settings.taxes.default.showCheckout")}
                    description={t("settings.taxes.default.showCheckoutHint")}
                    checked={tax.showOnCheckout}
                    onChange={(showOnCheckout) => set({ showOnCheckout })}
                  />
                </div>

                <div className="grid gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                    {t("settings.taxes.default.display")}
                    <InfoTip label={t("settings.taxes.default.display")}>{t("settings.taxes.tips.display")}</InfoTip>
                  </span>
                  <Segmented
                    label={t("settings.taxes.default.display")}
                    hideLabel
                    value={tax.display}
                    onChange={(display) => set({ display })}
                    options={[
                      { value: "included", label: t("settings.taxes.display.included") },
                      { value: "excluded", label: t("settings.taxes.display.excluded") },
                    ]}
                  />
                </div>
              </div>

              <PriceExample tax={tax} />
            </div>
          </SettingsCard>
        </Tier>

        {/* Tier 2 ---------------------------------------------------------- */}
        <Tier step={2} title={t("settings.taxes.tier2.title")} caption={t("settings.taxes.tier2.caption")}>
          <CountryRates />
        </Tier>

        {/* Tier 3 ---------------------------------------------------------- */}
        <Tier step={3} title={t("settings.taxes.tier3.title")} caption={t("settings.taxes.tier3.caption")} last>
          <div className="grid gap-4">
            <ReducedRates />
            <div className="grid gap-4 xl:grid-cols-2">
              <SettingsCard icon={ScrollText} title={t("settings.taxes.b2b.title")} description={t("settings.taxes.b2b.description")}>
                <div className="grid gap-4">
                  <LabelledToggle
                    label={t("settings.taxes.b2b.collect")}
                    description={t("settings.taxes.b2b.collectHint")}
                    checked={tax.collectVatNumber}
                    onChange={(collectVatNumber) => set({ collectVatNumber, validateVatNumber: collectVatNumber && tax.validateVatNumber })}
                  />
                  <LabelledToggle
                    label={t("settings.taxes.b2b.validate")}
                    description={t("settings.taxes.b2b.validateHint")}
                    tip={t("settings.taxes.tips.vies")}
                    checked={tax.validateVatNumber}
                    disabled={!tax.collectVatNumber}
                    onChange={(validateVatNumber) => set({ validateVatNumber })}
                  />
                </div>
              </SettingsCard>

              <SettingsCard icon={ShieldCheck} title={t("settings.taxes.exempt.title")} description={t("settings.taxes.exempt.description")}>
                <div className="grid gap-4">
                  <LabelledToggle
                    label={t("settings.taxes.exempt.enable")}
                    tip={t("settings.taxes.tips.exempt")}
                    checked={tax.exemptEnabled}
                    onChange={(exemptEnabled) => set({ exemptEnabled })}
                  />
                  <div className={clsx("grid gap-3 border-l-2 border-[var(--border-subtle)] pl-4", !tax.exemptEnabled && "opacity-50")}>
                    {(["reverseCharge", "export", "trainingBodies"] as ExemptGroup[]).map((g) => (
                      <CheckRow
                        key={g}
                        label={t(`settings.taxes.exempt.groups.${g}.label`)}
                        hint={t(`settings.taxes.exempt.groups.${g}.hint`)}
                        checked={tax.exemptGroups[g]}
                        disabled={!tax.exemptEnabled || (g === "reverseCharge" && !tax.collectVatNumber)}
                        onChange={(v) => set({ exemptGroups: { ...tax.exemptGroups, [g]: v } })}
                      />
                    ))}
                  </div>
                </div>
              </SettingsCard>
            </div>

            <SettingsCard icon={Calculator} title={t("settings.taxes.calc.title")} description={t("settings.taxes.calc.description")}>
              <div className="grid gap-5">
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="mb-2 inline-flex items-center gap-1 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                    {t("settings.taxes.calc.basis")}
                    <InfoTip label={t("settings.taxes.calc.basis")}>{t("settings.taxes.tips.basis")}</InfoTip>
                  </legend>
                  <div className="grid gap-2 md:grid-cols-3">
                    {(["shipping", "billing", "store"] as TaxBasis[]).map((b) => (
                      <label
                        key={b}
                        className={clsx(
                          "relative grid cursor-pointer gap-1 rounded-[var(--admin-radius-sm)] border p-3.5 transition-[border-color,background-color,box-shadow]",
                          "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                          tax.basis === b
                            ? "border-[var(--gt-ink-900)] bg-[var(--admin-panel)] shadow-[var(--shadow-sm)]"
                            : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]",
                        )}
                      >
                        <input type="radio" name="tax-basis" value={b} checked={tax.basis === b} onChange={() => set({ basis: b })} className="sr-only" />
                        <span className="flex items-center justify-between gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                          {t(`settings.taxes.calc.basisOptions.${b}.label`)}
                          <span
                            aria-hidden="true"
                            className={clsx(
                              "grid h-4 w-4 place-items-center rounded-full border-2",
                              tax.basis === b ? "border-[var(--gt-ink-900)]" : "border-[var(--gt-ink-300)]",
                            )}
                          >
                            {tax.basis === b && <span className="h-2 w-2 rounded-full bg-[var(--gt-ink-900)]" />}
                          </span>
                        </span>
                        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`settings.taxes.calc.basisOptions.${b}.hint`)}</span>
                        {b === "shipping" && (
                          <span className="mt-1 w-fit rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gt-blue-700)]">
                            {t("settings.taxes.calc.recommended")}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                      {t("settings.taxes.calc.rounding")}
                      <InfoTip label={t("settings.taxes.calc.rounding")}>{t("settings.taxes.tips.rounding")}</InfoTip>
                    </span>
                    <Segmented
                      label={t("settings.taxes.calc.rounding")}
                      hideLabel
                      value={tax.rounding}
                      onChange={(rounding) => set({ rounding })}
                      options={[
                        { value: "line", label: t("settings.taxes.calc.roundLine") },
                        { value: "order", label: t("settings.taxes.calc.roundOrder") },
                      ]}
                    />
                  </div>
                  <LabelledToggle
                    label={t("settings.taxes.calc.shipping")}
                    description={t("settings.taxes.calc.shippingHint")}
                    checked={tax.taxShipping}
                    onChange={(taxShipping) => set({ taxShipping })}
                  />
                </div>
              </div>
            </SettingsCard>
          </div>
        </Tier>
      </fieldset>

      <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <Receipt size={14} aria-hidden="true" className="mt-px flex-none" />
        {t("settings.taxes.disclaimer")}
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Tier({ step, title, caption, children, last }: { step: number; title: string; caption: string; children: ReactNode; last?: boolean }) {
  return (
    <section className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-x-4" aria-label={title}>
      <div className="relative flex justify-center">
        <span className="relative z-[1] grid h-8 w-8 place-items-center rounded-full bg-[var(--gt-ink-900)] text-[length:var(--text-caption)] font-bold text-[var(--gt-white)] shadow-[0_0_0_4px_var(--admin-page)] sm:h-10 sm:w-10 sm:text-[length:var(--text-body-sm)]">
          {step}
        </span>
        {!last && <span aria-hidden="true" className="absolute bottom-0 top-8 w-px bg-[linear-gradient(var(--gt-ink-300),var(--gt-blue-300))] sm:top-10" />}
      </div>
      <div className={clsx("grid min-w-0 gap-3", last ? "pb-0" : "pb-8")}>
        <div className="grid gap-0.5 pt-1 sm:pt-2">
          <h2 className="text-[length:var(--text-h4)]">{title}</h2>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{caption}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function LabelledToggle({
  label,
  description,
  tip,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  tip?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  if (!tip) return <ToggleSwitch label={label} description={description} checked={checked} onChange={onChange} disabled={disabled} />;
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        <ToggleSwitch label={label} description={description} checked={checked} onChange={onChange} disabled={disabled} />
      </div>
      <InfoTip label={label}>{tip}</InfoTip>
    </div>
  );
}

/** How a default sale reads with the current switches — recalculated live. */
function PriceExample({ tax }: { tax: TaxSettings }) {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const rate = Math.max(0, tax.defaultRateBp);
  const { gross, net, vat } = tax.pricesIncludeVat
    ? (() => {
        const s = splitGross(SAMPLE_PRICE, rate);
        return { gross: SAMPLE_PRICE, net: s.net, vat: s.tax };
      })()
    : (() => {
        const a = addTax(SAMPLE_PRICE, rate);
        return { gross: a.gross, net: SAMPLE_PRICE, vat: a.tax };
      })();
  const shown = tax.display === "included" ? gross : net;

  return (
    <aside aria-label={t("settings.taxes.example.label")} className="grid content-start gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-blue-200)] bg-[linear-gradient(160deg,var(--gt-white),var(--gt-blue-50))] p-4">
      <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">{t("settings.taxes.example.label")}</span>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
        {t(tax.pricesIncludeVat ? "settings.taxes.example.enteredGross" : "settings.taxes.example.enteredNet", { price: money(SAMPLE_PRICE) })}
      </p>
      <div className="grid gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel)] p-3 shadow-[var(--shadow-xs)]">
        <span className="text-[11px] text-[var(--text-muted)]">{t("settings.taxes.example.productPage")}</span>
        <span className="text-[22px] font-bold tabular-nums leading-tight text-[var(--text-primary)]">{money(shown)}</span>
        {tax.showOnProduct && (
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            {tax.display === "included" ? t("settings.taxes.example.incl", { rate: formatPercent(rate, i18n.language) }) : t("settings.taxes.example.excl")}
          </span>
        )}
      </div>
      <dl className="m-0 grid gap-1 text-[length:var(--text-caption)] tabular-nums">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-muted)]">{t("settings.taxes.example.net")}</dt>
          <dd className="m-0 font-semibold text-[var(--text-primary)]">{money(net)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-muted)]">{t("settings.taxes.example.vat", { rate: formatPercent(rate, i18n.language) })}</dt>
          <dd className="m-0 font-semibold text-[var(--text-primary)]">{money(vat)}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-[var(--gt-blue-200)] pt-1">
          <dt className="font-semibold text-[var(--text-primary)]">{t("settings.taxes.example.total")}</dt>
          <dd className="m-0 font-bold text-[var(--text-primary)]">{money(gross)}</dd>
        </div>
      </dl>
      {!tax.showOnCheckout && <p className="m-0 text-[11px] text-[var(--status-warning-fg)]">{t("settings.taxes.example.checkoutHidden")}</p>}
    </aside>
  );
}

/** Plain-language precedence with a destination checker. */
function PrecedenceExplainer() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { draft } = useAdminSettings();
  const [code, setCode] = useState("DE");
  const eff = effectiveRate(code, draft.taxes);
  const options = useMemo(
    () =>
      [...EU_COUNTRIES, "CH", "GB", "US"]
        .map((c) => ({ code: c, name: countryName(c, lang) }))
        .sort((a, b) => a.name.localeCompare(b.name, lang))
        .map((c) => ({ value: c.code, label: `${flagOf(c.code)}  ${c.name}` })),
    [lang],
  );
  const outsideEu = !EU_COUNTRIES.includes(code);

  return (
    <div className="grid gap-4 rounded-[var(--admin-radius)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
      <div className="grid gap-2">
        <p className="m-0 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">{t("settings.taxes.precedence.title")}</p>
        <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
          {[1, 2, 3].map((n) => (
            <li key={n} className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--admin-panel)] px-2.5 py-1 font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xs)]">
                <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full bg-[var(--gt-ink-900)] text-[9px] text-[var(--gt-white)]">
                  {n}
                </span>
                {t(`settings.taxes.tier${n}.title`)}
              </span>
              {n < 3 && <span aria-hidden="true" className="text-[var(--text-subtle)]">→</span>}
            </li>
          ))}
        </ol>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.taxes.precedence.body")}</p>
      </div>
      <div className="grid gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel)] p-3 shadow-[var(--shadow-xs)]">
        <AdminSelect value={code} onChange={(e) => setCode(e.target.value)} options={options} aria-label={t("settings.taxes.precedence.checker")} />
        <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-body)]" aria-live="polite">
          <Globe2 size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
          {!draft.taxes.enabled
            ? t("settings.taxes.precedence.off")
            : outsideEu
              ? t("settings.taxes.precedence.export", { country: countryName(code, lang) })
              : t(eff.source === "country" ? "settings.taxes.precedence.country" : "settings.taxes.precedence.default", {
                  country: countryName(code, lang),
                  rate: formatPercent(eff.bp, lang),
                })}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CountryRates() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { showToast } = useToast();
  const { draft, update } = useAdminSettings();
  const rates = draft.taxes.rates;
  const [editing, setEditing] = useState<{ rate: VatRate; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<VatRate | null>(null);
  const setRates = (next: (r: VatRate[]) => VatRate[]) => update("taxes", (v) => ({ ...v, rates: next(v.rates) }));
  const pending = t("settings.toast.pendingBody");

  const sorted = [...rates].sort((a, b) => countryName(a.country, lang).localeCompare(countryName(b.country, lang), lang));
  const reducedCount = (c: string) => draft.taxes.reduced.filter((r) => r.country === c).length;

  return (
    <SettingsCard
      icon={Globe2}
      title={t("settings.taxes.rates.title")}
      description={t("settings.taxes.rates.description", { rate: formatPercent(draft.taxes.defaultRateBp, lang) })}
      flush
      actions={
        <AdminButton variant="dark" size="sm" iconLeft={Plus} onClick={() => setEditing({ rate: { id: newId("vat"), country: "", standardBp: 2000, active: true }, isNew: true })}>
          {t("settings.taxes.rates.add")}
        </AdminButton>
      }
    >
      {rates.length === 0 ? (
        <EmptyState icon={Globe2} title={t("settings.taxes.rates.emptyTitle")} body={t("settings.taxes.rates.emptyBody")} />
      ) : (
        <>
          {/* Table from md */}
          <table className="hidden w-full border-collapse text-left md:table">
            <caption className="sr-only">{t("settings.taxes.rates.title")}</caption>
            <thead className="gt-admin-thead">
              <tr className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                <th scope="col" className="px-6 py-2.5 font-semibold">{t("settings.taxes.rates.country")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t("settings.taxes.rates.rate")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t("settings.taxes.rates.reduced")}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t("settings.taxes.rates.status")}</th>
                <th scope="col" className="px-6 py-2.5 text-right font-semibold"><span className="sr-only">{t("settings.ui.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const name = countryName(r.country, lang);
                return (
                  <tr key={r.id} className="gt-admin-row border-t border-[var(--border-subtle)]">
                    <th scope="row" className="px-6 py-3 font-normal">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="text-[18px]">{flagOf(r.country)}</span>
                        <span className="grid">
                          <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{name}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{r.country}{r.country === draft.taxes.defaultCountry && ` · ${t("settings.taxes.rates.storeCountry")}`}</span>
                        </span>
                      </span>
                    </th>
                    <td className="px-3 py-3 text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">{formatPercent(r.standardBp, lang)}</td>
                    <td className="px-3 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {reducedCount(r.country) > 0 ? t("settings.taxes.rates.reducedCount", { count: reducedCount(r.country) }) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2.5">
                        <RowSwitch checked={r.active} onChange={(v) => setRates((all) => all.map((x) => (x.id === r.id ? { ...x, active: v } : x)))} label={t("settings.taxes.rates.activeFor", { country: name })} />
                        <StatusPill active={r.active} />
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="flex justify-end gap-1">
                        <AdminIconButton icon={Pencil} size="sm" label={t("settings.taxes.rates.edit", { country: name })} onClick={() => setEditing({ rate: r, isNew: false })} />
                        <AdminIconButton icon={Trash2} size="sm" tone="danger" label={t("settings.taxes.rates.delete", { country: name })} onClick={() => setDeleting(r)} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Cards below md */}
          <ul className="m-0 grid list-none gap-0 p-0 md:hidden">
            {sorted.map((r) => {
              const name = countryName(r.country, lang);
              return (
                <li key={r.id} className="flex items-center gap-3 border-t border-[var(--border-subtle)] px-5 py-3">
                  <span aria-hidden="true" className="text-[20px]">{flagOf(r.country)}</span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums">{formatPercent(r.standardBp, lang)}</span>
                      <StatusPill active={r.active} />
                    </span>
                  </span>
                  <RowSwitch checked={r.active} onChange={(v) => setRates((all) => all.map((x) => (x.id === r.id ? { ...x, active: v } : x)))} label={t("settings.taxes.rates.activeFor", { country: name })} />
                  <AdminIconButton icon={Pencil} size="sm" label={t("settings.taxes.rates.edit", { country: name })} onClick={() => setEditing({ rate: r, isNew: false })} />
                  <AdminIconButton icon={Trash2} size="sm" tone="danger" label={t("settings.taxes.rates.delete", { country: name })} onClick={() => setDeleting(r)} />
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="m-0 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)] sm:px-6">
        {t("settings.taxes.rates.fallback", { rate: formatPercent(draft.taxes.defaultRateBp, lang) })}
      </p>

      {editing && (
        <VatRateDialog
          rate={editing.rate}
          isNew={editing.isNew}
          all={rates}
          onClose={() => setEditing(null)}
          onApply={(rate) => {
            setRates((all) => (editing.isNew ? [...all, rate] : all.map((x) => (x.id === rate.id ? rate : x))));
            showToast(t(editing.isNew ? "settings.taxes.toast.rateAdded" : "settings.taxes.toast.rateUpdated", { country: countryName(rate.country, lang) }), pending, "info");
            setEditing(null);
          }}
        />
      )}
      <ConfirmationDialog
        open={deleting != null}
        tone="danger"
        icon={Trash2}
        title={t("settings.taxes.rates.deleteTitle", { country: deleting ? countryName(deleting.country, lang) : "" })}
        body={t("settings.taxes.rates.deleteBody", { rate: formatPercent(draft.taxes.defaultRateBp, lang) })}
        confirmLabel={t("settings.taxes.rates.deleteConfirm")}
        cancelLabel={t("settings.ui.cancel")}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            setRates((all) => all.filter((x) => x.id !== deleting.id));
            showToast(t("settings.taxes.toast.rateDeleted", { country: countryName(deleting.country, lang) }), pending, "info");
          }
          setDeleting(null);
        }}
      />
    </SettingsCard>
  );
}

function VatRateDialog({
  rate,
  isNew,
  all,
  onClose,
  onApply,
}: {
  rate: VatRate;
  isNew: boolean;
  all: VatRate[];
  onClose: () => void;
  onApply: (r: VatRate) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [country, setCountry] = useState(rate.country);
  const [value, setValue] = useState(bpToInput(rate.standardBp));
  const [active, setActive] = useState(rate.active);
  const [attempted, setAttempted] = useState(false);
  const bp = parsePercent(value);
  const next: VatRate = { ...rate, country, standardBp: bp ?? -1, active };
  const errors = validateVatRate(next, all);

  const taken = new Set(all.filter((r) => r.id !== rate.id).map((r) => r.country));
  const options = [
    { value: "", label: t("settings.taxes.rates.chooseCountry") },
    ...EU_COUNTRIES.filter((c) => !taken.has(c))
      .map((c) => ({ code: c, name: countryName(c, lang) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang))
      .map((c) => ({ value: c.code, label: `${flagOf(c.code)}  ${c.name}` })),
  ];

  return (
    <FormDialog
      open
      icon={BadgePercent}
      tone="primary"
      title={isNew ? t("settings.taxes.rates.addTitle") : t("settings.taxes.rates.editTitle", { country: countryName(rate.country, lang) })}
      description={t("settings.taxes.rates.dialogBody")}
      confirmLabel={isNew ? t("settings.taxes.rates.addConfirm") : t("settings.taxes.rates.editConfirm")}
      cancelLabel={t("settings.ui.cancel")}
      onClose={onClose}
      onConfirm={() => {
        setAttempted(true);
        if (Object.keys(errors).length === 0) onApply(next);
      }}
    >
      <div className="grid gap-4 pb-2">
        <FormField label={t("settings.taxes.rates.country")} required error={attempted && errors.country ? t(`settings.errors.${errors.country}`) : undefined}>
          {(props) => <AdminSelect {...props} value={country} onChange={(e) => setCountry(e.target.value)} options={options} disabled={!isNew} />}
        </FormField>
        <TextField
          label={t("settings.taxes.rates.rate")}
          hint={t("settings.taxes.rates.rateHint")}
          value={value}
          inputMode="decimal"
          suffix="%"
          required
          onChange={setValue}
          error={errors.rate ? t(`settings.errors.${errors.rate}`) : undefined}
          showError={attempted}
        />
        <ToggleSwitch label={t("settings.taxes.rates.activeLabel")} description={t("settings.taxes.rates.activeHint")} checked={active} onChange={setActive} />
      </div>
    </FormDialog>
  );
}

/* -------------------------------------------------------------------------- */

function ReducedRates() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { showToast } = useToast();
  const { draft, update } = useAdminSettings();
  const tax = draft.taxes;
  const [adding, setAdding] = useState(false);
  const [country, setCountry] = useState("FR");
  const [category, setCategory] = useState<ReducedCategory>("training");
  const [value, setValue] = useState("5.5");
  const setReduced = (next: (r: ReducedRate[]) => ReducedRate[]) => update("taxes", (v) => ({ ...v, reduced: next(v.reduced) }));
  const bp = parsePercent(value);

  return (
    <SettingsCard
      icon={BadgePercent}
      tone="fuchsia"
      title={t("settings.taxes.reduced.title")}
      description={t("settings.taxes.reduced.description")}
      actions={
        <span className="inline-flex items-center gap-1">
          <RowSwitch checked={tax.reducedEnabled} onChange={(reducedEnabled) => update("taxes", (v) => ({ ...v, reducedEnabled }))} label={t("settings.taxes.reduced.enable")} />
          <span aria-hidden="true" className="text-[length:var(--text-caption)] font-semibold">{tax.reducedEnabled ? t("settings.ui.on") : t("settings.ui.off")}</span>
          <InfoTip label={t("settings.taxes.reduced.title")}>{t("settings.taxes.tips.reduced")}</InfoTip>
        </span>
      }
    >
      <div className={clsx("grid gap-3", !tax.reducedEnabled && "opacity-50")}>
        {tax.reduced.length === 0 ? (
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.taxes.reduced.empty")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {tax.reduced.map((r) => {
              const name = countryName(r.country, lang);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] px-3 py-2">
                  <span aria-hidden="true" className="text-[18px]">{flagOf(r.country)}</span>
                  <span className="grid min-w-[10rem] flex-1">
                    <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t(`settings.taxes.reduced.categories.${r.category}`)}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{name}</span>
                  </span>
                  <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">{formatPercent(r.rateBp, lang)}</span>
                  <StatusPill active={r.active} />
                  <RowSwitch
                    checked={r.active}
                    disabled={!tax.reducedEnabled}
                    onChange={(v) => setReduced((all) => all.map((x) => (x.id === r.id ? { ...x, active: v } : x)))}
                    label={t("settings.taxes.reduced.activeFor", { category: t(`settings.taxes.reduced.categories.${r.category}`), country: name })}
                  />
                  <AdminIconButton
                    icon={Trash2}
                    size="sm"
                    tone="danger"
                    disabled={!tax.reducedEnabled}
                    label={t("settings.taxes.reduced.remove", { category: t(`settings.taxes.reduced.categories.${r.category}`), country: name })}
                    onClick={() => {
                      setReduced((all) => all.filter((x) => x.id !== r.id));
                      showToast(t("settings.taxes.toast.reducedRemoved"), t("settings.toast.pendingBody"), "info");
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <div>
          <AdminButton variant="outline" size="sm" iconLeft={Plus} disabled={!tax.reducedEnabled} onClick={() => setAdding(true)}>
            {t("settings.taxes.reduced.add")}
          </AdminButton>
        </div>
      </div>

      <FormDialog
        open={adding}
        icon={BadgePercent}
        tone="primary"
        title={t("settings.taxes.reduced.addTitle")}
        description={t("settings.taxes.reduced.addBody")}
        confirmLabel={t("settings.taxes.reduced.addConfirm")}
        cancelLabel={t("settings.ui.cancel")}
        confirmDisabled={bp == null || !country}
        onClose={() => setAdding(false)}
        onConfirm={() => {
          if (bp == null) return;
          setReduced((all) => [...all, { id: newId("red"), country, category, rateBp: bp, active: true }]);
          showToast(t("settings.taxes.toast.reducedAdded"), t("settings.toast.pendingBody"), "info");
          setAdding(false);
        }}
      >
        <div className="grid gap-4 pb-2">
          <FormField label={t("settings.taxes.rates.country")}>
            {(props) => (
              <AdminSelect
                {...props}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                options={EU_COUNTRIES.map((c) => ({ code: c, name: countryName(c, lang) }))
                  .sort((a, b) => a.name.localeCompare(b.name, lang))
                  .map((c) => ({ value: c.code, label: `${flagOf(c.code)}  ${c.name}` }))}
              />
            )}
          </FormField>
          <FormField label={t("settings.taxes.reduced.category")}>
            {(props) => (
              <AdminSelect
                {...props}
                value={category}
                onChange={(e) => setCategory(e.target.value as ReducedCategory)}
                options={REDUCED_CATEGORIES.map((c) => ({ value: c, label: t(`settings.taxes.reduced.categories.${c}`) }))}
              />
            )}
          </FormField>
          <TextField
            label={t("settings.taxes.reduced.rate")}
            value={value}
            inputMode="decimal"
            suffix="%"
            onChange={setValue}
            error={bp == null ? t("settings.errors.percent") : undefined}
            showError={value.trim() !== ""}
          />
        </div>
      </FormDialog>
    </SettingsCard>
  );
}
