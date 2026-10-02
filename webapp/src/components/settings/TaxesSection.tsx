import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgePercent, Globe2, Pencil, Plus, Receipt, ScrollText, Trash2, TriangleAlert } from "lucide-react";
import { AdminButton } from "../admin/AdminButton";
import { AdminIconButton } from "../admin/AdminIconButton";
import { AdminSelect } from "../admin/AdminSelect";
import { ConfirmationDialog } from "../admin/ConfirmationDialog";
import { EmptyState } from "../admin/EmptyState";
import { FormField } from "../admin/FormField";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { FormDialog } from "../promotions/PromoUi";
import { useMoney } from "../promotions/PromoBadges";
import { useToast } from "../../lib/toast";
import { useAdminSettings } from "../../lib/adminSettings";
import {
  bpToInput,
  countryName,
  flagOf,
  formatPercent,
  inVatArea,
  parsePercent,
  servedWithoutVat,
  splitGross,
  validateVatRate,
  vatRateFor,
} from "../../lib/settingsRules";
import { COUNTRY_GROUPS, REDUCED_CATEGORIES, type ReducedCategory, type ReducedRate, type VatRate } from "../../data/adminSettings";
import { RowSwitch, SettingsCard, StatusPill, TextField } from "./SettingsUi";

/**
 * VAT, as the checkout applies it.
 *
 * The calculation rules are fixed in the database (`create_order()`) and are
 * shown here as they are, read-only: prices include VAT, the destination
 * country's rate applies, rounded per line, shipping at the standard rate. What
 * an administrator sets is the rates themselves — one standard rate per
 * country, and reduced rates for the product categories that have one — and
 * the page says plainly which served countries would be charged no VAT.
 */

const SAMPLE_PRICE = 2490;
const ALL_COUNTRIES = Array.from(new Set(COUNTRY_GROUPS.flatMap((g) => g.countries)));
const RULES = ["inclusive", "destination", "rounding", "shipping", "none", "giftCards"] as const;
const NO_COUNTRIES: ReadonlySet<string> = new Set();

function useCountryOptions(exclude: ReadonlySet<string> = NO_COUNTRIES) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useMemo(
    () =>
      ALL_COUNTRIES.filter((c) => !exclude.has(c))
        .map((c) => ({ code: c, name: countryName(c, lang) }))
        .sort((a, b) => a.name.localeCompare(b.name, lang))
        .map((c) => ({ value: c.code, label: `${flagOf(c.code)}  ${c.name}` })),
    [lang, exclude],
  );
}

export function TaxesSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { draft, saved } = useAdminSettings();
  // Against the stored shipping zones: those are what customers can order to.
  const missing = useMemo(() => servedWithoutVat(saved.shipping, draft.taxes), [saved.shipping, draft.taxes]);

  return (
    <>
      {missing.length > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-4 text-[var(--status-warning-fg)]">
          <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />
          <div className="grid gap-1">
            <p className="m-0 text-[length:var(--text-body-sm)] font-semibold">{t("settings.taxes.missing.title", { count: missing.length })}</p>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
              {t("settings.taxes.missing.body", { countries: missing.map((c) => countryName(c, lang)).join(", ") })}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        <SettingsCard icon={ScrollText} title={t("settings.taxes.rules.title")} description={t("settings.taxes.rules.description")}>
          <ul className="m-0 grid list-disc gap-1.5 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            {RULES.map((rule) => (
              <li key={rule}>{t(`settings.taxes.rules.items.${rule}`)}</li>
            ))}
          </ul>
        </SettingsCard>
        <DestinationChecker />
      </div>

      <CountryRates />
      <ReducedRates />

      <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <Receipt size={14} aria-hidden="true" className="mt-px flex-none" />
        {t("settings.taxes.disclaimer")}
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** "What does an order to X pay?" — answered from the draft, the way the checkout computes it. */
function DestinationChecker() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const money = useMoney();
  const { draft } = useAdminSettings();
  const [code, setCode] = useState("DE");
  const options = useCountryOptions();
  const rate = vatRateFor(code, draft.taxes);
  const { tax } = splitGross(SAMPLE_PRICE, rate.bp);
  const country = countryName(code, lang);

  return (
    <SettingsCard icon={Globe2} tone="emerald" title={t("settings.taxes.checker.title")} description={t("settings.taxes.checker.description")}>
      <div className="grid gap-3">
        <AdminSelect value={code} onChange={(e) => setCode(e.target.value)} options={options} aria-label={t("settings.taxes.checker.country")} />
        <div aria-live="polite" className="grid gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] p-3 text-[length:var(--text-caption)] text-[var(--text-body)]">
          <p className="m-0 font-semibold text-[var(--text-primary)]">
            {rate.source === "country"
              ? t("settings.taxes.checker.rate", { country, rate: formatPercent(rate.bp, lang) })
              : inVatArea(code)
                ? t("settings.taxes.checker.missing", { country })
                : t("settings.taxes.checker.export", { country })}
          </p>
          <p className="m-0 tabular-nums">{t("settings.taxes.checker.example", { price: money(SAMPLE_PRICE), tax: money(tax) })}</p>
        </div>
      </div>
    </SettingsCard>
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
  const toggle = (country: string, active: boolean) => setRates((all) => all.map((x) => (x.country === country ? { ...x, active } : x)));

  return (
    <SettingsCard
      icon={Globe2}
      title={t("settings.taxes.rates.title")}
      description={t("settings.taxes.rates.description")}
      flush
      actions={
        <AdminButton variant="dark" size="sm" iconLeft={Plus} onClick={() => setEditing({ rate: { country: "", standardBp: 2000, active: true }, isNew: true })}>
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
                  <tr key={r.country} className="gt-admin-row border-t border-[var(--border-subtle)]">
                    <th scope="row" className="px-6 py-3 font-normal">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="text-[18px]">{flagOf(r.country)}</span>
                        <span className="grid">
                          <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{name}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{r.country}</span>
                        </span>
                      </span>
                    </th>
                    <td className="px-3 py-3 text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">{formatPercent(r.standardBp, lang)}</td>
                    <td className="px-3 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {reducedCount(r.country) > 0 ? t("settings.taxes.rates.reducedCount", { count: reducedCount(r.country) }) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2.5">
                        <RowSwitch checked={r.active} onChange={(v) => toggle(r.country, v)} label={t("settings.taxes.rates.activeFor", { country: name })} />
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
                <li key={r.country} className="flex items-center gap-3 border-t border-[var(--border-subtle)] px-5 py-3">
                  <span aria-hidden="true" className="text-[20px]">{flagOf(r.country)}</span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums">{formatPercent(r.standardBp, lang)}</span>
                      <StatusPill active={r.active} />
                    </span>
                  </span>
                  <RowSwitch checked={r.active} onChange={(v) => toggle(r.country, v)} label={t("settings.taxes.rates.activeFor", { country: name })} />
                  <AdminIconButton icon={Pencil} size="sm" label={t("settings.taxes.rates.edit", { country: name })} onClick={() => setEditing({ rate: r, isNew: false })} />
                  <AdminIconButton icon={Trash2} size="sm" tone="danger" label={t("settings.taxes.rates.delete", { country: name })} onClick={() => setDeleting(r)} />
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="m-0 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)] sm:px-6">
        {t("settings.taxes.rates.fallback")}
      </p>

      {editing && (
        <VatRateDialog
          rate={editing.rate}
          isNew={editing.isNew}
          all={rates}
          onClose={() => setEditing(null)}
          onApply={(rate) => {
            setRates((all) => (editing.isNew ? [...all, rate] : all.map((x) => (x.country === rate.country ? rate : x))));
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
        body={t("settings.taxes.rates.deleteBody")}
        confirmLabel={t("settings.taxes.rates.deleteConfirm")}
        cancelLabel={t("settings.ui.cancel")}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            setRates((all) => all.filter((x) => x.country !== deleting.country));
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
  const [country, setCountry] = useState(rate.country);
  const [value, setValue] = useState(bpToInput(rate.standardBp));
  const [active, setActive] = useState(rate.active);
  const [attempted, setAttempted] = useState(false);
  const bp = parsePercent(value);
  const next: VatRate = { country, standardBp: bp ?? -1, active };
  const errors = validateVatRate(next, all, isNew);
  const taken = useMemo(() => new Set(all.filter((r) => r.country !== rate.country).map((r) => r.country)), [all, rate.country]);
  const countries = useCountryOptions(taken);
  const options = [{ value: "", label: t("settings.taxes.rates.chooseCountry") }, ...countries];

  return (
    <FormDialog
      open
      icon={BadgePercent}
      tone="primary"
      title={isNew ? t("settings.taxes.rates.addTitle") : t("settings.taxes.rates.editTitle", { country: countryName(rate.country, i18n.language) })}
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
  const reduced = draft.taxes.reduced;
  const [adding, setAdding] = useState(false);
  const [country, setCountry] = useState("FR");
  const [category, setCategory] = useState<ReducedCategory>("training");
  const [value, setValue] = useState("5.5");
  const setReduced = (next: (r: ReducedRate[]) => ReducedRate[]) => update("taxes", (v) => ({ ...v, reduced: next(v.reduced) }));
  const countries = useCountryOptions();
  const bp = parsePercent(value);
  const same = (a: ReducedRate, b: Pick<ReducedRate, "country" | "category">) => a.country === b.country && a.category === b.category;
  const duplicate = reduced.some((r) => same(r, { country, category }));
  const categoryName = (c: ReducedCategory) => t(`settings.taxes.reduced.categories.${c}`);

  return (
    <SettingsCard
      icon={BadgePercent}
      tone="fuchsia"
      title={t("settings.taxes.reduced.title")}
      description={t("settings.taxes.reduced.description")}
      actions={
        <AdminButton variant="outline" size="sm" iconLeft={Plus} onClick={() => setAdding(true)}>
          {t("settings.taxes.reduced.add")}
        </AdminButton>
      }
    >
      {reduced.length === 0 ? (
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.taxes.reduced.empty")}</p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {reduced.map((r) => {
            const name = countryName(r.country, lang);
            return (
              <li key={`${r.country}-${r.category}`} className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] px-3 py-2">
                <span aria-hidden="true" className="text-[18px]">{flagOf(r.country)}</span>
                <span className="grid min-w-[10rem] flex-1">
                  <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{categoryName(r.category)}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">{name}</span>
                </span>
                <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">{formatPercent(r.rateBp, lang)}</span>
                <StatusPill active={r.active} />
                <RowSwitch
                  checked={r.active}
                  onChange={(v) => setReduced((all) => all.map((x) => (same(x, r) ? { ...x, active: v } : x)))}
                  label={t("settings.taxes.reduced.activeFor", { category: categoryName(r.category), country: name })}
                />
                <AdminIconButton
                  icon={Trash2}
                  size="sm"
                  tone="danger"
                  label={t("settings.taxes.reduced.remove", { category: categoryName(r.category), country: name })}
                  onClick={() => {
                    setReduced((all) => all.filter((x) => !same(x, r)));
                    showToast(t("settings.taxes.toast.reducedRemoved"), t("settings.toast.pendingBody"), "info");
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <FormDialog
        open={adding}
        icon={BadgePercent}
        tone="primary"
        title={t("settings.taxes.reduced.addTitle")}
        description={t("settings.taxes.reduced.addBody")}
        confirmLabel={t("settings.taxes.reduced.addConfirm")}
        cancelLabel={t("settings.ui.cancel")}
        confirmDisabled={bp == null || !country || duplicate}
        onClose={() => setAdding(false)}
        onConfirm={() => {
          if (bp == null || duplicate) return;
          setReduced((all) => [...all, { country, category, rateBp: bp, active: true }]);
          showToast(t("settings.taxes.toast.reducedAdded"), t("settings.toast.pendingBody"), "info");
          setAdding(false);
        }}
      >
        <div className="grid gap-4 pb-2">
          <FormField label={t("settings.taxes.rates.country")} error={duplicate ? t("settings.errors.reducedTaken") : undefined}>
            {(props) => <AdminSelect {...props} value={country} onChange={(e) => setCountry(e.target.value)} options={countries} />}
          </FormField>
          <FormField label={t("settings.taxes.reduced.category")}>
            {(props) => (
              <AdminSelect
                {...props}
                value={category}
                onChange={(e) => setCategory(e.target.value as ReducedCategory)}
                options={REDUCED_CATEGORIES.map((c) => ({ value: c, label: categoryName(c) }))}
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
