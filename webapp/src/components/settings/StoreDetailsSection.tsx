import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Clock, Eye, Landmark, Mail, MapPin, MessageSquareHeart, Phone, Server } from "lucide-react";
import clsx from "clsx";
import { AdminSelect } from "../admin/AdminSelect";
import { FormField } from "../admin/FormField";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { useAdminSettings } from "../../lib/adminSettings";
import { SUPPORT_MESSAGE_MAX, countryName, flagOf, validateStore, type StoreErrors } from "../../lib/settingsRules";
import { addressLines, hasOpeningHours, hoursSummary, weekdayName } from "../../lib/storeDetails";
import { COUNTRY_GROUPS, STORE_CURRENCY, WEEKDAYS, type StoreDetails, type Weekday } from "../../data/adminSettings";
import { Eyebrow, FieldGrid, RowSwitch, SettingsCard, SubHeading, TextField } from "./SettingsUi";

/**
 * The store's identity, from the legal facts to the friendly ones: who the
 * business is (published on the legal notice), how to reach it, who publishes
 * and hosts the site (legal notice again), and what the contact page shows —
 * with a live preview of that block beside the fields that feed it.
 */

type FieldKey = keyof StoreErrors;

const ALL_COUNTRIES = Array.from(new Set(COUNTRY_GROUPS.flatMap((g) => g.countries)));

export function StoreDetailsSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { draft, update, attempted } = useAdminSettings();
  const d = draft.store;
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());

  const errors = useMemo(() => validateStore(d), [d]);
  const set = <K extends keyof StoreDetails>(key: K, value: StoreDetails[K]) => update("store", (s) => ({ ...s, [key]: value }));
  const touch = (key: FieldKey) => () => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  const err = (key: FieldKey) => (errors[key] ? t(`settings.errors.${errors[key]}`) : undefined);
  const shown = (key: FieldKey) => attempted.store || touched.has(key);

  type TextKey = {
    [K in keyof StoreDetails]: StoreDetails[K] extends string ? K : never;
  }[keyof StoreDetails];

  /** Shorthand for the plain text inputs. */
  const text = (key: TextKey, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
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

  const setMessage = (which: "fr" | "en", value: string) => update("store", (s) => ({ ...s, supportMessage: { ...s.supportMessage, [which]: value } }));

  return (
    <>
      {/* Business identity --------------------------------------------- */}
      <SettingsCard icon={Building2} title={t("settings.store.business.title")} description={t("settings.store.business.description")}>
        <div className="grid gap-4">
          <FieldGrid>
            {text("storeName", { required: true, autoComplete: "organization" })}
            {text("legalName", { required: true })}
            {text("legalForm", { placeholder: t("settings.store.placeholders.legalForm") })}
            {text("shareCapital", { placeholder: t("settings.store.placeholders.shareCapital") })}
            {text("registrationNumber", { placeholder: t("settings.store.placeholders.registrationNumber") })}
            {text("vatNumber", { placeholder: "FR12345678901", autoComplete: "off" })}
          </FieldGrid>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("settings.store.currency", { currency: STORE_CURRENCY })}
          </p>
        </div>
      </SettingsCard>

      {/* Contact ---------------------------------------------------------- */}
      <SettingsCard icon={Mail} title={t("settings.store.contact.title")} description={t("settings.store.contact.description")}>
        <FieldGrid>
          {text("supportEmail", { required: true, type: "email", inputMode: "email" })}
          {text("businessEmail", { type: "email", inputMode: "email", autoComplete: "email" })}
          {text("phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+33 1 23 45 67 89" })}
        </FieldGrid>
      </SettingsCard>

      {/* Address ---------------------------------------------------------- */}
      <SettingsCard icon={MapPin} title={t("settings.store.address.title")} description={t("settings.store.address.description")}>
        <FieldGrid>
          <FormField label={t("settings.store.fields.country")} required>
            {(props) => <AdminSelect {...props} value={d.country} onChange={(e) => set("country", e.target.value)} options={countryOptions} />}
          </FormField>
          {text("region")}
          {text("address1", { autoComplete: "address-line1", className: "md:col-span-2" })}
          {text("address2", { autoComplete: "address-line2", className: "md:col-span-2" })}
          {text("postalCode", { autoComplete: "postal-code" })}
          {text("city", { autoComplete: "address-level2" })}
        </FieldGrid>
      </SettingsCard>

      {/* Legal notice: publisher and host --------------------------------- */}
      <SettingsCard icon={Landmark} title={t("settings.store.legal.title")} description={t("settings.store.legal.description")}>
        <div className="grid gap-5">
          <SubHeading>{t("settings.store.legal.director")}</SubHeading>
          <FieldGrid>
            {text("publicationDirector")}
            {text("publicationDirectorRole", { placeholder: t("settings.store.placeholders.publicationDirectorRole") })}
          </FieldGrid>
          <SubHeading hint={t("settings.store.legal.hostHint")}>
            <span className="inline-flex items-center gap-1.5">
              <Server size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
              {t("settings.store.legal.host")}
            </span>
          </SubHeading>
          <FieldGrid>
            {text("hostName")}
            {text("hostContact")}
            {text("hostAddress", { className: "md:col-span-2" })}
          </FieldGrid>
        </div>
      </SettingsCard>

      {/* Contact page ------------------------------------------------------ */}
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
              label={t("settings.store.fields.supportMessage")}
              hint={t("settings.store.hints.supportMessage")}
              value={d.supportMessage.fr}
              onChange={(v) => setMessage("fr", v)}
              onBlur={touch("supportMessage")}
              counter={SUPPORT_MESSAGE_MAX}
              multiline
              rows={2}
              error={err("supportMessage")}
              showError
            />
            <TextField
              label={t("settings.store.fields.supportMessageEn")}
              hint={t("settings.store.hints.supportMessageEn")}
              value={d.supportMessage.en}
              onChange={(v) => setMessage("en", v)}
              onBlur={touch("supportMessageEn")}
              counter={SUPPORT_MESSAGE_MAX}
              multiline
              rows={2}
              error={err("supportMessageEn")}
              showError
            />
          </div>

          <ContactPreview store={d} />
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
  const { t, i18n } = useTranslation();
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
          const dayLabel = weekdayName(day, i18n.language, "long");
          const invalid = slot.open && slot.from >= slot.to;
          return (
            <li
              key={day}
              className={clsx(
                "grid grid-cols-[88px_auto_minmax(0,1fr)] items-center gap-3 rounded-[6px] px-2.5 py-1.5 sm:grid-cols-[110px_auto_minmax(0,1fr)]",
                !slot.open && "bg-[var(--admin-panel-sunken)]",
              )}
            >
              <span className="text-[length:var(--text-body-sm)] font-semibold capitalize text-[var(--text-primary)]">{dayLabel}</span>
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

/** The "Other ways to reach us" block of the contact page, as it will read in the UI language. */
function ContactPreview({ store }: { store: StoreDetails }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const lines = hoursSummary(store.hours, lang, t("settings.store.hours.closed"));
  const address = addressLines(store);
  const message = lang.startsWith("fr") ? store.supportMessage.fr : store.supportMessage.en;
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
          <p className="m-0 text-[length:var(--text-body-md)] font-bold text-[var(--text-primary)]">{store.storeName || t("settings.store.fields.storeName")}</p>
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
              {store.showAddress && address.length > 0 && (
                <li className="flex items-start gap-2">
                  <MapPin size={13} aria-hidden="true" className="mt-0.5 text-[var(--text-muted)]" />
                  <span>
                    {address.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                    {countryName(store.country, lang)}
                  </span>
                </li>
              )}
            </ul>
          )}
          <div className="grid gap-1 border-t border-[var(--glass-border)] pt-3">
            <Eyebrow>{t("settings.store.preview.hours")}</Eyebrow>
            {hasOpeningHours(store.hours) ? (
              <ul className="m-0 grid list-none gap-0.5 p-0 text-[length:var(--text-caption)] tabular-nums text-[var(--text-primary)]">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.store.preview.noHours")}</p>
            )}
          </div>
          {message && (
            <p className="m-0 rounded-[var(--radius-sm)] bg-[var(--gt-white)]/70 p-2.5 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-body)]">
              {message}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
