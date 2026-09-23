import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Clock, Eye, Hash, Mail, MapPin, MessageSquareHeart, Phone, SlidersHorizontal, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { AdminSelect } from "../admin/AdminSelect";
import { FormField } from "../admin/FormField";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { Segmented } from "../promotions/PromoUi";
import { useAdminSettings } from "../../lib/adminSettings";
import { countryName, flagOf, orderNumberPreview, validateStore } from "../../lib/settingsRules";
import {
  COUNTRY_GROUPS,
  CURRENCIES,
  DATE_FORMATS,
  TIMEZONES,
  WEEKDAYS,
  type DateFormat,
  type StoreDetails,
  type Weekday,
} from "../../data/adminSettings";
import { Eyebrow, FieldGrid, InfoTip, RowSwitch, SettingsCard, SubHeading, TextField } from "./SettingsUi";

/**
 * The store's identity: who it is, where it is, how it counts, and what
 * customers are told. Four cards, from the legal facts to the friendly ones,
 * with a live preview of the customer-facing block beside the fields that
 * feed it.
 */

const ALL_COUNTRIES = Array.from(new Set(COUNTRY_GROUPS.flatMap((g) => g.countries)));
const SAMPLE_DATE = new Date(2026, 8, 23);

function formatSample(format: DateFormat, lang: string): string {
  const d = SAMPLE_DATE;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  if (format === "DD/MM/YYYY") return `${dd}/${mm}/${d.getFullYear()}`;
  if (format === "MM/DD/YYYY") return `${mm}/${dd}/${d.getFullYear()}`;
  if (format === "YYYY-MM-DD") return `${d.getFullYear()}-${mm}-${dd}`;
  return new Intl.DateTimeFormat(lang.startsWith("fr") ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function StoreDetailsSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { draft, saved, update, attempted } = useAdminSettings();
  const d = draft.store;
  const [touched, setTouched] = useState<Set<keyof StoreDetails>>(new Set());

  const errors = useMemo(() => validateStore(d), [d]);
  const set = <K extends keyof StoreDetails>(key: K, value: StoreDetails[K]) => update("store", (s) => ({ ...s, [key]: value }));
  const touch = (key: keyof StoreDetails) => () => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  const err = (key: keyof StoreDetails) => (errors[key] ? t(`settings.errors.${errors[key]}`) : undefined);
  const shown = (key: keyof StoreDetails) => attempted.store || touched.has(key);

  /** Shorthand for the plain text inputs. */
  const text = (key: "storeName" | "legalName" | "businessEmail" | "supportEmail" | "phone" | "website" | "address1" | "address2" | "postalCode" | "city" | "region", extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
    <TextField
      label={t(`settings.store.fields.${key}`)}
      hint={t(`settings.store.hints.${key}`, { defaultValue: "" }) || undefined}
      value={d[key]}
      onChange={(v) => set(key, v)}
      onBlur={touch(key)}
      error={err(key)}
      showError={shown(key)}
      {...extra}
    />
  );

  const countryOptions = useMemo(
    () =>
      ALL_COUNTRIES.map((c) => ({ code: c, name: countryName(c, lang) }))
        .sort((a, b) => a.name.localeCompare(b.name, lang))
        .map((c) => ({ value: c.code, label: `${flagOf(c.code)}  ${c.name}` })),
    [lang],
  );

  const currencyChanged = d.currency !== saved.store.currency;

  return (
    <>
      {/* Business information ------------------------------------------- */}
      <SettingsCard icon={Building2} title={t("settings.store.business.title")} description={t("settings.store.business.description")}>
        <FieldGrid>
          {text("storeName", { required: true, autoComplete: "organization" })}
          {text("legalName", { required: true })}
          {text("businessEmail", { required: true, type: "email", inputMode: "email", autoComplete: "email" })}
          {text("supportEmail", { required: true, type: "email", inputMode: "email" })}
          {text("phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+33 1 23 45 67 89" })}
          {text("website", { type: "url", inputMode: "url", placeholder: "https://" })}
        </FieldGrid>
      </SettingsCard>

      {/* Address ---------------------------------------------------------- */}
      <SettingsCard icon={MapPin} title={t("settings.store.address.title")} description={t("settings.store.address.description")}>
        <FieldGrid>
          <FormField label={t("settings.store.fields.country")} required>
            {(props) => <AdminSelect {...props} value={d.country} onChange={(e) => set("country", e.target.value)} options={countryOptions} />}
          </FormField>
          {text("region")}
          {text("address1", { required: true, autoComplete: "address-line1", className: "md:col-span-2" })}
          {text("address2", { autoComplete: "address-line2", className: "md:col-span-2" })}
          {text("postalCode", { required: true, autoComplete: "postal-code" })}
          {text("city", { required: true, autoComplete: "address-level2" })}
        </FieldGrid>
      </SettingsCard>

      {/* Preferences ------------------------------------------------------ */}
      <SettingsCard icon={SlidersHorizontal} title={t("settings.store.prefs.title")} description={t("settings.store.prefs.description")}>
        <div className="grid gap-5">
          <FieldGrid>
            <FormField label={t("settings.store.fields.currency")} hint={t("settings.store.hints.currency")}>
              {(props) => (
                <AdminSelect
                  {...props}
                  value={d.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  options={CURRENCIES.map((c) => ({ value: c, label: t(`settings.store.currencies.${c}`) }))}
                />
              )}
            </FormField>
            <FormField label={t("settings.store.fields.timezone")} hint={t("settings.store.hints.timezone")}>
              {(props) => (
                <AdminSelect
                  {...props}
                  value={d.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                  options={TIMEZONES.map((z) => ({ value: z, label: z.replace("_", " ").replace("/", " — ") }))}
                />
              )}
            </FormField>
            {currencyChanged && (
              <div className="md:col-span-2 flex items-start gap-2.5 rounded-[var(--admin-radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
                <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" className="mt-px flex-none" />
                <span>
                  <strong className="font-semibold">{t("settings.store.currencyWarning.title")}</strong> {t("settings.store.currencyWarning.body")}
                </span>
              </div>
            )}
            <FormField label={t("settings.store.fields.dateFormat")}>
              {(props) => (
                <AdminSelect
                  {...props}
                  value={d.dateFormat}
                  onChange={(e) => set("dateFormat", e.target.value as DateFormat)}
                  options={DATE_FORMATS.map((f) => ({ value: f, label: `${formatSample(f, lang)}  ·  ${f}` }))}
                />
              )}
            </FormField>
            <Segmented
              label={t("settings.store.fields.measurement")}
              value={d.measurement}
              onChange={(v) => set("measurement", v)}
              options={[
                { value: "metric", label: t("settings.store.measurement.metric") },
                { value: "imperial", label: t("settings.store.measurement.imperial") },
              ]}
            />
          </FieldGrid>

          <SubHeading hint={t("settings.store.order.hint")}>
            <span className="inline-flex items-center gap-1.5">
              {t("settings.store.order.title")}
              <InfoTip label={t("settings.store.order.title")}>{t("settings.store.order.tip")}</InfoTip>
            </span>
          </SubHeading>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
            <div className="grid grid-cols-3 gap-3">
              <TextField
                label={t("settings.store.fields.orderPrefix")}
                value={d.orderPrefix}
                maxLength={6}
                onChange={(v) => set("orderPrefix", v.toUpperCase())}
                onBlur={touch("orderPrefix")}
                error={err("orderPrefix")}
                showError={shown("orderPrefix")}
              />
              <TextField
                label={t("settings.store.fields.orderNextNumber")}
                value={String(d.orderNextNumber || "")}
                inputMode="numeric"
                onChange={(v) => set("orderNextNumber", Number(v.replace(/\D/g, "")) || 0)}
                onBlur={touch("orderNextNumber")}
                error={err("orderNextNumber")}
                showError={shown("orderNextNumber")}
              />
              <TextField
                label={t("settings.store.fields.orderSuffix")}
                value={d.orderSuffix}
                maxLength={6}
                placeholder={t("settings.store.order.none")}
                onChange={(v) => set("orderSuffix", v.toUpperCase())}
                onBlur={touch("orderSuffix")}
                error={err("orderSuffix")}
                showError={shown("orderSuffix")}
              />
            </div>
            <div className="flex items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-3.5 py-2.5">
              <Hash size={16} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
              <span className="grid min-w-0">
                <Eyebrow>{t("settings.store.order.preview")}</Eyebrow>
                <span className="truncate font-[family-name:var(--gt-font-mono)] text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]" aria-live="polite">
                  {orderNumberPreview(d)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* Customer-facing ------------------------------------------------- */}
      <SettingsCard icon={MessageSquareHeart} tone="fuchsia" title={t("settings.store.public.title")} description={t("settings.store.public.description")}>
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-5">
            <fieldset className="m-0 grid gap-3 border-0 p-0">
              <legend className="mb-2 p-0 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">{t("settings.store.public.contactTitle")}</legend>
              <ToggleSwitch label={t("settings.store.public.showEmail")} description={d.supportEmail || "—"} checked={d.showEmail} onChange={(v) => set("showEmail", v)} />
              <ToggleSwitch label={t("settings.store.public.showPhone")} description={d.phone || "—"} checked={d.showPhone} onChange={(v) => set("showPhone", v)} />
              <ToggleSwitch
                label={t("settings.store.public.showAddress")}
                description={t("settings.store.public.showAddressHint")}
                checked={d.showAddress}
                onChange={(v) => set("showAddress", v)}
              />
            </fieldset>

            <HoursEditor
              hours={d.hours}
              onChange={(day, slot) => set("hours", { ...d.hours, [day]: slot })}
              error={attempted.store || touched.has("hours") ? err("hours") : undefined}
              onBlur={touch("hours")}
            />

            <TextField
              label={t("settings.store.fields.description")}
              hint={t("settings.store.hints.description")}
              value={d.description}
              onChange={(v) => set("description", v)}
              onBlur={touch("description")}
              counter={200}
              multiline
              rows={3}
              error={err("description")}
              showError
            />
            <TextField
              label={t("settings.store.fields.supportMessage")}
              hint={t("settings.store.hints.supportMessage")}
              value={d.supportMessage}
              onChange={(v) => set("supportMessage", v)}
              onBlur={touch("supportMessage")}
              counter={280}
              multiline
              rows={3}
              error={err("supportMessage")}
              showError
            />
          </div>

          <CustomerPreview store={d} />
        </div>
      </SettingsCard>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function HoursEditor({
  hours,
  onChange,
  error,
  onBlur,
}: {
  hours: StoreDetails["hours"];
  onChange: (day: Weekday, slot: StoreDetails["hours"][Weekday]) => void;
  error?: string;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0" onBlur={onBlur}>
      <legend className="mb-1 flex items-center gap-1.5 p-0 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">
        <Clock size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
        {t("settings.store.hours.title")}
      </legend>
      <p className="m-0 -mt-1 mb-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.store.hours.hint")}</p>
      <ul className="m-0 grid list-none gap-1 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-1.5">
        {WEEKDAYS.map((day) => {
          const slot = hours[day];
          const dayLabel = t(`settings.store.hours.days.${day}`);
          const invalid = slot.open && slot.from >= slot.to;
          return (
            <li
              key={day}
              className={clsx(
                "grid grid-cols-[88px_auto_minmax(0,1fr)] items-center gap-3 rounded-[6px] px-2.5 py-1.5 sm:grid-cols-[110px_auto_minmax(0,1fr)]",
                !slot.open && "bg-[var(--admin-panel-sunken)]",
              )}
            >
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{dayLabel}</span>
              <RowSwitch
                checked={slot.open}
                onChange={(open) => onChange(day, { ...slot, open })}
                label={t("settings.store.hours.openOn", { day: dayLabel })}
              />
              {slot.open ? (
                <span className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    value={slot.from}
                    aria-label={t("settings.store.hours.from", { day: dayLabel })}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => onChange(day, { ...slot, from: e.target.value })}
                    className="gt-admin-field !min-h-8 w-[112px] !px-2 tabular-nums"
                  />
                  <span aria-hidden="true" className="text-[var(--text-subtle)]">–</span>
                  <input
                    type="time"
                    value={slot.to}
                    aria-label={t("settings.store.hours.to", { day: dayLabel })}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => onChange(day, { ...slot, to: e.target.value })}
                    className="gt-admin-field !min-h-8 w-[112px] !px-2 tabular-nums"
                  />
                </span>
              ) : (
                <span className="text-[length:var(--text-caption)] font-medium text-[var(--text-muted)]">{t("settings.store.hours.closed")}</span>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Groups consecutive days with the same hours: "Mon – Thu · 09:30 – 18:00". */
function useHoursSummary(hours: StoreDetails["hours"]) {
  const { t } = useTranslation();
  const lines: string[] = [];
  let i = 0;
  while (i < WEEKDAYS.length) {
    const slot = hours[WEEKDAYS[i]];
    let j = i;
    while (
      j + 1 < WEEKDAYS.length &&
      hours[WEEKDAYS[j + 1]].open === slot.open &&
      (!slot.open || (hours[WEEKDAYS[j + 1]].from === slot.from && hours[WEEKDAYS[j + 1]].to === slot.to))
    )
      j++;
    const first = t(`settings.store.hours.short.${WEEKDAYS[i]}`);
    const last = t(`settings.store.hours.short.${WEEKDAYS[j]}`);
    const days = i === j ? first : `${first} – ${last}`;
    lines.push(`${days} · ${slot.open ? `${slot.from} – ${slot.to}` : t("settings.store.hours.closed")}`);
    i = j + 1;
  }
  return lines;
}

function CustomerPreview({ store }: { store: StoreDetails }) {
  const { t, i18n } = useTranslation();
  const lines = useHoursSummary(store.hours);
  return (
    <aside aria-label={t("settings.store.preview.label")} className="grid content-start gap-2">
      <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
        <Eye size={14} aria-hidden="true" />
        {t("settings.store.preview.label")}
      </span>
      {/* The one glass surface in this section: it stands for the storefront,
          so it borrows the storefront's material over a soft brand wash. */}
      <div
        className="relative overflow-hidden rounded-[var(--radius-lg)] p-4"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, var(--gt-blue-200), transparent 60%), radial-gradient(90% 80% at 100% 100%, var(--gt-fuchsia-50), transparent 70%), var(--gt-blue-50)",
        }}
      >
        <div className="gt-glass grid gap-3 rounded-[var(--radius-md)] p-4">
          <div className="grid gap-1">
            <p className="m-0 text-[length:var(--text-body-md)] font-bold text-[var(--text-primary)]">{store.storeName || t("settings.store.fields.storeName")}</p>
            <p className="m-0 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-body)]">{store.description}</p>
          </div>
          {(store.showEmail || store.showPhone || store.showAddress) && (
            <ul className="m-0 grid list-none gap-1.5 border-t border-[var(--glass-border)] p-0 pt-3 text-[length:var(--text-caption)] text-[var(--text-primary)]">
              {store.showEmail && store.supportEmail && (
                <li className="flex items-center gap-2">
                  <Mail size={13} aria-hidden="true" className="text-[var(--text-muted)]" />
                  {store.supportEmail}
                </li>
              )}
              {store.showPhone && store.phone && (
                <li className="flex items-center gap-2">
                  <Phone size={13} aria-hidden="true" className="text-[var(--text-muted)]" />
                  {store.phone}
                </li>
              )}
              {store.showAddress && (
                <li className="flex items-start gap-2">
                  <MapPin size={13} aria-hidden="true" className="mt-0.5 text-[var(--text-muted)]" />
                  <span>
                    {store.address1}
                    {store.address2 && `, ${store.address2}`}
                    <br />
                    {store.postalCode} {store.city}, {countryName(store.country, i18n.language)}
                  </span>
                </li>
              )}
            </ul>
          )}
          <div className="grid gap-1 border-t border-[var(--glass-border)] pt-3">
            <Eyebrow>{t("settings.store.preview.hours")}</Eyebrow>
            <ul className="m-0 grid list-none gap-0.5 p-0 text-[length:var(--text-caption)] tabular-nums text-[var(--text-primary)]">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          {store.supportMessage && (
            <p className="m-0 rounded-[var(--radius-sm)] bg-[var(--gt-white)]/70 p-2.5 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-body)]">
              {store.supportMessage}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
