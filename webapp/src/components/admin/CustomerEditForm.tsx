import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, X } from "lucide-react";
import { Button } from "../ui/Button";
import { FormField } from "./FormField";
import { CustomerTags } from "./CustomerTags";
import { CustomerStatusBadge } from "./CustomerBadges";
import { DELIVERY_COUNTRIES, countryLabelKey } from "../../data/countries";
import {
  CUSTOMER_STATUSES,
  type AdminCustomerRecord,
  type CustomerStatus,
  type CustomerTag,
} from "../../data/adminCustomers";
import type { CustomerProfileDraft } from "../../lib/adminCustomers";

/**
 * Editing a customer.
 *
 * Grouped into three fieldsets — identity, address, account — because a flat
 * column of twelve inputs makes an operator read every label to find the one
 * they came to change. The groups are also the natural permission boundary a
 * real implementation would need: changing an email is an identity operation,
 * changing a status is an access one.
 *
 * Validation is deliberately thin. The two fields that can be *wrong* rather
 * than merely empty — the name and the email — are checked on submit, and
 * nothing is checked while typing: a form that turns red between the third and
 * the eighth character of an address is a form people learn to fight.
 *
 * Status lives here *and* in the status dialog on purpose. The dialog is for
 * the operator who came to change access and needs the consequences spelled
 * out; the field is for the one already editing the record who should not have
 * to leave the form. Both write the same history entry (`lib/adminCustomers`).
 */

export function CustomerEditForm({
  customer,
  onCancel,
  onSave,
  saving = false,
}: {
  customer: AdminCustomerRecord;
  onCancel: () => void;
  onSave: (draft: CustomerProfileDraft) => void;
  saving?: boolean;
}) {
  const { t } = useTranslation();

  const [draft, setDraft] = useState<CustomerProfileDraft>({
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    birthDate: customer.birthDate ?? "",
    addressLine: customer.addressLine,
    postalCode: customer.postalCode,
    city: customer.city,
    country: customer.country,
    status: customer.status,
    tags: customer.tags,
    marketingOptIn: customer.marketingOptIn,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerProfileDraft, string>>>({});

  const set = <K extends keyof CustomerProfileDraft>(key: K, value: CustomerProfileDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    // Clearing the error as soon as the field is touched, rather than
    // re-validating: the operator is already fixing it, and a message that
    // survives the correction reads as the form not having noticed.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const submit = () => {
    const next: Partial<Record<keyof CustomerProfileDraft, string>> = {};
    if (!draft.firstName.trim()) next.firstName = t("admin.customers.errorRequired");
    if (!draft.lastName.trim()) next.lastName = t("admin.customers.errorRequired");
    if (!draft.email.trim()) next.email = t("admin.customers.errorRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(draft.email.trim())) next.email = t("admin.customers.errorEmail");

    if (Object.keys(next).length > 0) {
      setErrors(next);
      // Focus the first field in error, so a form taller than the viewport does
      // not fail silently below the fold.
      const first = Object.keys(next)[0];
      document.querySelector<HTMLInputElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    onSave(draft);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="grid gap-4"
    >
      <fieldset className="m-0 grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
        <legend className="px-2 text-[length:var(--text-h4)]">{t("admin.customers.formIdentity")}</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("admin.customers.fieldFirstName")} required error={errors.firstName}>
            {(props) => (
              <input
                {...props}
                data-field="firstName"
                type="text"
                value={draft.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                autoComplete="given-name"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldLastName")} required error={errors.lastName}>
            {(props) => (
              <input
                {...props}
                data-field="lastName"
                type="text"
                value={draft.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                autoComplete="family-name"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField
            label={t("admin.customers.fieldEmail")}
            required
            error={errors.email}
            hint={t("admin.customers.fieldEmailHint")}
          >
            {(props) => (
              <input
                {...props}
                data-field="email"
                type="email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldPhone")}>
            {(props) => (
              <input
                {...props}
                data-field="phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                autoComplete="tel"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldBirthDate")} hint={t("admin.customers.fieldBirthDateHint")}>
            {(props) => (
              <input
                {...props}
                data-field="birthDate"
                type="date"
                value={draft.birthDate}
                onChange={(e) => set("birthDate", e.target.value)}
                className="gt-admin-field"
              />
            )}
          </FormField>
        </div>
      </fieldset>

      <fieldset className="m-0 grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
        <legend className="px-2 text-[length:var(--text-h4)]">{t("admin.customers.formAddress")}</legend>

        <FormField label={t("admin.customers.fieldAddressLine")}>
          {(props) => (
            <input
              {...props}
              data-field="addressLine"
              type="text"
              value={draft.addressLine}
              onChange={(e) => set("addressLine", e.target.value)}
              autoComplete="street-address"
              className="gt-admin-field"
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.4fr)]">
          <FormField label={t("admin.customers.fieldPostalCode")}>
            {(props) => (
              <input
                {...props}
                data-field="postalCode"
                type="text"
                value={draft.postalCode}
                onChange={(e) => set("postalCode", e.target.value)}
                autoComplete="postal-code"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldCity")}>
            {(props) => (
              <input
                {...props}
                data-field="city"
                type="text"
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
                autoComplete="address-level2"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldCountry")}>
            {(props) => (
              <select
                {...props}
                data-field="country"
                value={draft.country}
                onChange={(e) => set("country", e.target.value)}
                className="gt-admin-field"
              >
                {DELIVERY_COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {t(countryLabelKey(code))}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
      </fieldset>

      <fieldset className="m-0 grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
        <legend className="px-2 text-[length:var(--text-h4)]">{t("admin.customers.formAccount")}</legend>

        <FormField label={t("admin.customers.fieldStatus")} hint={t(`admin.customers.statusConsequence.${draft.status}`)}>
          {(props) => (
            <select
              {...props}
              data-field="status"
              value={draft.status}
              onChange={(e) => set("status", e.target.value as CustomerStatus)}
              className="gt-admin-field"
            >
              {CUSTOMER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`admin.customers.status.${status}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {/* The chosen status shown as the badge the rest of the interface uses,
            so the operator recognises what they are about to save rather than
            matching a word in a select to a colour in a table. */}
        {draft.status !== customer.status && (
          <p className="m-0 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
            {t("admin.customers.statusWillChange")}
            <CustomerStatusBadge status={customer.status} size="sm" />
            <span aria-hidden="true">→</span>
            <CustomerStatusBadge status={draft.status} size="sm" />
          </p>
        )}

        <div className="grid gap-1.5">
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
            {t("admin.customers.fieldTags")}
          </span>
          <CustomerTags
            tags={draft.tags}
            onAdd={(tag: CustomerTag) => set("tags", [...draft.tags, tag])}
            onRemove={(tag: CustomerTag) => set("tags", draft.tags.filter((existing) => existing !== tag))}
          />
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("admin.customers.fieldTagsHint")}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3.5">
          <input
            type="checkbox"
            checked={draft.marketingOptIn}
            onChange={(e) => set("marketingOptIn", e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
          />
          <span className="grid gap-0.5">
            <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
              {t("admin.customers.fieldMarketing")}
            </span>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.customers.fieldMarketingHint")}
            </span>
          </span>
        </label>
      </fieldset>

      {/* The action bar sticks to the bottom of the form's own scroll area: the
          form is taller than a laptop viewport, and "Save" that has to be
          scrolled to is how an edit gets abandoned halfway. */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]/95 p-3 shadow-[var(--shadow-md)] backdrop-blur-[8px]">
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.customers.formHint")}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" iconLeft={X} onClick={onCancel} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm" iconLeft={saving ? undefined : Save} loading={saving}>
            {t("admin.customers.formSave")}
          </Button>
        </span>
      </div>
    </form>
  );
}

