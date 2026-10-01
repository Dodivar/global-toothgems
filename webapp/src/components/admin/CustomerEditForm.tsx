import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Save, X } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { FormField } from "./FormField";
import { CustomerTags } from "./CustomerTags";
import { CustomerStatusBadge } from "./CustomerBadges";
import { DELIVERY_COUNTRIES, countryLabelKey } from "../../data/countries";
import {
  STAFF_SETTABLE_STATUSES,
  type AdminCustomerRecord,
  type CustomerTag,
  type StaffSettableStatus,
} from "../../data/adminCustomers";
import {
  BIRTH_DATE_MAX,
  BIRTH_DATE_MIN,
  draftOf,
  validateDraft,
  type CustomerProfileDraft,
  type DraftError,
  type DraftField,
} from "../../lib/adminCustomerMapping";

/**
 * Editing a customer.
 *
 * Only what the back office may write is editable: names, phone, birth date,
 * country, status and tags (`profiles` under `manage_customers`). The e-mail
 * is the sign-in identity, marketing consent is the customer's own decision
 * and the address book is theirs too — those are shown read-only, with where
 * they are changed, rather than offered as fields the database would refuse.
 *
 * Validation mirrors the database CHECKs (`validateDraft`) and runs on submit
 * only: a form that turns red between the third and the eighth character of a
 * name is a form people learn to fight.
 *
 * Status lives here *and* in the status dialog on purpose. The dialog is for
 * the operator who came to change access and needs the consequences spelled
 * out; the field is for the one already editing the record. Both write the
 * same audited column.
 */

const ERROR_KEY: Record<DraftError, string> = {
  required: "admin.customers.errorRequired",
  tooLong: "admin.customers.errorTooLong",
  phone: "admin.customers.errorPhone",
  birthDate: "admin.customers.errorBirthDate",
  country: "admin.customers.errorCountry",
};

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

  const [draft, setDraft] = useState<CustomerProfileDraft>(() => draftOf(customer));
  const [errors, setErrors] = useState<Partial<Record<DraftField, DraftError>>>({});

  const set = <K extends keyof CustomerProfileDraft>(key: K, value: CustomerProfileDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    // Clearing the error as soon as the field is touched, rather than
    // re-validating: the operator is already fixing it.
    setErrors((prev) => (prev[key as DraftField] ? { ...prev, [key]: undefined } : prev));
  };

  const submit = () => {
    const next = validateDraft(draft);
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

  const errorOf = (field: DraftField) => (errors[field] ? t(ERROR_KEY[errors[field]!]) : undefined);

  // A country outside the delivery list (set by the customer elsewhere) stays selectable.
  const countries: string[] = [...DELIVERY_COUNTRIES];
  if (customer.country && !countries.includes(customer.country)) countries.push(customer.country);

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
          <FormField label={t("admin.customers.fieldFirstName")} required error={errorOf("firstName")}>
            {(props) => (
              <input
                {...props}
                data-field="firstName"
                type="text"
                maxLength={100}
                value={draft.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                autoComplete="off"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldLastName")} required error={errorOf("lastName")}>
            {(props) => (
              <input
                {...props}
                data-field="lastName"
                type="text"
                maxLength={100}
                value={draft.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                autoComplete="off"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldPhone")} error={errorOf("phone")}>
            {(props) => (
              <input
                {...props}
                data-field="phone"
                type="tel"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                autoComplete="off"
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField
            label={t("admin.customers.fieldBirthDate")}
            hint={t("admin.customers.fieldBirthDateHint")}
            error={errorOf("birthDate")}
          >
            {(props) => (
              <input
                {...props}
                data-field="birthDate"
                type="date"
                min={BIRTH_DATE_MIN}
                max={BIRTH_DATE_MAX}
                value={draft.birthDate}
                onChange={(e) => set("birthDate", e.target.value)}
                className="gt-admin-field"
              />
            )}
          </FormField>

          <FormField label={t("admin.customers.fieldCountry")} error={errorOf("country")}>
            {(props) => (
              <select
                {...props}
                data-field="country"
                value={draft.country}
                onChange={(e) => set("country", e.target.value)}
                className="gt-admin-field"
              >
                <option value="">{t("admin.customers.notProvided")}</option>
                {countries.map((code) => (
                  <option key={code} value={code}>
                    {t(countryLabelKey(code), { defaultValue: code.toUpperCase() })}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>
      </fieldset>

      {/* What belongs to the customer: shown, with where it is changed. */}
      <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-[var(--space-5)]">
        <h3 className="flex items-center gap-2 text-[length:var(--text-h4)]">
          <Lock size={14} aria-hidden="true" className="text-[var(--text-muted)]" />
          {t("admin.customers.formCustomerOwned")}
        </h3>
        <dl className="m-0 grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1">
            <dt className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.customers.fieldEmail")}
            </dt>
            <dd className="m-0 break-all text-[length:var(--text-body-sm)] text-[var(--text-body)]">{customer.email}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.customers.fieldAddress")}
            </dt>
            <dd className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              {customer.address ? (
                <>
                  {customer.address.line1}
                  <br />
                  {customer.address.postalCode} {customer.address.city}
                </>
              ) : (
                <span className="text-[var(--text-subtle)]">{t("admin.customers.noAddress")}</span>
              )}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.customers.fieldMarketing")}
            </dt>
            <dd className="m-0">
              <Badge tone={customer.marketingOptIn ? "success" : "neutral"} size="sm">
                {t(customer.marketingOptIn ? "admin.customers.optedIn" : "admin.customers.optedOut")}
              </Badge>
            </dd>
          </div>
        </dl>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.customers.formCustomerOwnedHint")}
        </p>
      </section>

      <fieldset className="m-0 grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
        <legend className="px-2 text-[length:var(--text-h4)]">{t("admin.customers.formAccount")}</legend>

        {draft.status === null ? (
          <p className="m-0 flex flex-wrap items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            <CustomerStatusBadge status={customer.status} size="sm" />
            {t("admin.customers.statusConsequence.deactivated")}
          </p>
        ) : (
          <FormField
            label={t("admin.customers.fieldStatus")}
            hint={t(`admin.customers.statusConsequence.${draft.status}`)}
          >
            {(props) => (
              <select
                {...props}
                data-field="status"
                value={draft.status ?? ""}
                onChange={(e) => set("status", e.target.value as StaffSettableStatus)}
                className="gt-admin-field"
              >
                {STAFF_SETTABLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`admin.customers.status.${status}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}

        {/* The chosen status shown as the badge the rest of the interface uses,
            so the operator recognises what they are about to save. */}
        {draft.status !== null && draft.status !== customer.status && (
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
