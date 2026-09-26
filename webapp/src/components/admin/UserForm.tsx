import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, CircleAlert, Info, Lock, UserPlus, Save } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { AdminSelect } from "./AdminSelect";
import { FormField } from "./FormField";
import { SheetBody, SheetFooter } from "./AdminSheet";
import { RoleMatrix } from "./RolePermissions";
import { LastActivity } from "./UserBadges";
import { ROLE_META, STATUS_META, formatDate, useAdminLocale } from "./userMeta";
import {
  EMAIL_PATTERN,
  USER_ROLES,
  USER_TEAMS,
  type AdminUser,
  type UserRole,
  type UserStatus,
} from "../../data/adminUsers";
import type { UserDraft } from "../../lib/adminUsers";
import type { GuardReason } from "../../lib/adminUserFilters";

/**
 * The one form behind both "Add user" and "Edit user".
 *
 * Shared rather than duplicated so the two flows cannot drift: the same labels,
 * the same validation, the same role picker with the same explanations. What
 * differs is passed in — the statuses on offer, whether the read-only account
 * facts are shown above the fields, and the submit label.
 *
 * Validation runs on submit and then live on every field that has been
 * touched, so an operator is never scolded for a field they have not reached
 * yet but sees an error disappear the moment it is fixed. On a failed submit
 * focus moves to the first invalid field — the error text is wired to it with
 * `aria-describedby`, so a screen reader announces what is wrong on arrival.
 *
 * Checking that an email is not already in use is the server's job, not this
 * form's: it arrives as `serverError` after a submit and is shown on the email
 * field exactly like a local error.
 */

type FieldKey = "firstName" | "lastName" | "email";
type Errors = Partial<Record<FieldKey, string>>;

export function RolePicker({
  value,
  onChange,
  name,
  disabledReason,
  legend,
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
  name: string;
  /** When set, the picker is read-only and this explains why. */
  disabledReason?: string;
  legend: string;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={disabledReason ? hintId : undefined}>
      <legend className="mb-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {legend}
        <span className="ml-1 text-[var(--accent-highlight-ink)]" aria-hidden="true">
          *
        </span>
      </legend>
      {USER_ROLES.map((role) => {
        const Icon = ROLE_META[role].icon;
        const checked = value === role;
        return (
          <label
            key={role}
            className={clsx(
              "group relative flex cursor-pointer items-start gap-3 rounded-[var(--admin-radius)] border p-3 transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)]",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
              checked
                ? "border-[var(--gt-ink-900)] bg-[var(--surface-brand-wash)] shadow-[var(--shadow-xs)]"
                : "border-[var(--border-subtle)] bg-[var(--admin-panel)] hover:border-[var(--border-default)] hover:bg-[var(--admin-panel-sunken)]",
              disabledReason && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={checked}
              disabled={Boolean(disabledReason)}
              onChange={() => onChange(role)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={clsx(
                "grid h-9 w-9 flex-none place-items-center rounded-[var(--admin-radius-sm)] transition-colors",
                checked ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]" : "bg-[var(--surface-sunken)] text-[var(--text-body)]",
              )}
            >
              <Icon size={17} strokeWidth={1.9} />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(`admin.users.role.${role}`)}
              </span>
              <span className="text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                {t(`admin.users.roleDescription.${role}`)}
              </span>
            </span>
            {/* The radio's own mark, drawn: the native control is visually
                hidden so the whole card can be the target, and the checked
                state must still be a shape, not just a border colour. */}
            <span
              aria-hidden="true"
              className={clsx(
                "mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-2 transition-colors",
                checked ? "border-[var(--gt-ink-900)]" : "border-[var(--gt-ink-300)]",
              )}
            >
              <span
                className={clsx(
                  "h-2 w-2 rounded-full bg-[var(--gt-ink-900)] transition-transform duration-[var(--duration-fast)]",
                  checked ? "scale-100" : "scale-0",
                )}
              />
            </span>
          </label>
        );
      })}
      {disabledReason && (
        <p id={hintId} className="m-0 flex items-start gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          <Lock size={13} aria-hidden="true" className="mt-0.5 flex-none" />
          {disabledReason}
        </p>
      )}
    </fieldset>
  );
}

/** Compact segmented choice for the account status. */
function StatusChoice({
  value,
  options,
  onChange,
  disabledReason,
}: {
  value: UserStatus;
  options: UserStatus[];
  onChange: (status: UserStatus) => void;
  disabledReason?: string;
}) {
  const { t } = useTranslation();
  const name = useId();
  const hintId = useId();
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={hintId}>
      <legend className="mb-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {t("admin.users.fieldStatus")}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((status) => {
          const Icon = STATUS_META[status].icon;
          const checked = value === status;
          return (
            <label
              key={status}
              className={clsx(
                "inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 py-2 text-[length:var(--text-body-sm)] transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                checked
                  ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] font-semibold text-[var(--text-inverse)]"
                  : "border-[var(--border-default)] bg-[var(--admin-panel)] text-[var(--text-body)] hover:border-[var(--gt-ink-400)]",
                disabledReason && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={status}
                checked={checked}
                disabled={Boolean(disabledReason)}
                onChange={() => onChange(status)}
                className="sr-only"
              />
              <Icon size={14} strokeWidth={2} aria-hidden="true" />
              {t(`admin.users.status.${status}`)}
            </label>
          );
        })}
      </div>
      <p id={hintId} className="m-0 flex items-start gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {disabledReason ? (
          <>
            <Lock size={13} aria-hidden="true" className="mt-0.5 flex-none" />
            {disabledReason}
          </>
        ) : (
          t(`admin.users.statusHint.${value}`)
        )}
      </p>
    </fieldset>
  );
}

function validateUserDraft(draft: UserDraft, t: (key: string) => string): Errors {
  const errors: Errors = {};
  if (!draft.firstName.trim()) errors.firstName = t("admin.users.errorFirstName");
  if (!draft.lastName.trim()) errors.lastName = t("admin.users.errorLastName");
  if (!draft.email.trim()) errors.email = t("admin.users.errorEmailRequired");
  else if (!EMAIL_PATTERN.test(draft.email.trim())) errors.email = t("admin.users.errorEmailInvalid");
  return errors;
}

export function UserForm({
  mode,
  initial,
  user,
  guard,
  submitting,
  serverError,
  onClearServerError,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initial: UserDraft;
  /** The record being edited, for the read-only account facts. */
  user?: AdminUser;
  /** Why role and status are locked for this record, if they are. */
  guard?: GuardReason;
  submitting: boolean;
  /** An error the simulated server returned for the email field. */
  serverError?: string;
  onClearServerError: () => void;
  onSubmit: (draft: UserDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const locale = useAdminLocale();
  const [draft, setDraft] = useState<UserDraft>(initial);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const roleName = useId();

  // Opening the form — as a new panel or by switching the drawer into editing —
  // puts the caret in the first field.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const errors = validateUserDraft(draft, t);
  const visible = (key: FieldKey) => (submitted || touched[key] ? errors[key] : undefined);
  const emailError = visible("email") ?? serverError;

  const dirty = mode === "create" || (Object.keys(initial) as (keyof UserDraft)[]).some((k) => initial[k] !== draft[k]);

  const set = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (key === "email" && serverError) onClearServerError();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      // After the error messages render, so the described-by text exists.
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    onSubmit(draft);
  };

  const guardText = guard ? t(`admin.users.guard.${guard}`) : undefined;
  const statusOptions: UserStatus[] =
    mode === "create" ? ["invited", "active"] : user?.status === "invited" ? ["invited", "active", "suspended"] : ["active", "suspended"];
  const errorCount = Object.keys(errors).length + (serverError ? 1 : 0);

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <div className="grid gap-6">
          {submitted && errorCount > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] px-3.5 py-3 text-[length:var(--text-caption)] text-[var(--status-error-fg)]"
            >
              <CircleAlert size={16} aria-hidden="true" className="mt-px flex-none" />
              <span>{t("admin.users.errorSummary", { count: errorCount })}</span>
            </div>
          )}

          {/* Read-only account facts, visibly not fields: a sunken card with a
              lock, no borders that look like inputs, and a heading that says
              why they cannot be changed here. */}
          {mode === "edit" && user && (
            <section
              aria-labelledby="gt-user-readonly-title"
              className="grid gap-3 rounded-[var(--admin-radius)] bg-[var(--surface-sunken)] p-4"
            >
              <h3
                id="gt-user-readonly-title"
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]"
              >
                <Lock size={12} aria-hidden="true" />
                {t("admin.users.readOnlyInfo")}
              </h3>
              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 text-[length:var(--text-caption)]">
                <ReadOnlyFact label={t("admin.users.factId")} value={<span className="font-mono">{user.id}</span>} />
                <ReadOnlyFact label={t("admin.users.factCreated")} value={formatDate(user.createdAt, locale)} />
                <ReadOnlyFact label={t("admin.users.factLastActive")} value={<LastActivity user={user} compact />} />
                <ReadOnlyFact label={t("admin.users.factInvitedBy")} value={user.invitedBy ?? "—"} />
              </dl>
              <p className="m-0 text-[11px] text-[var(--text-muted)]">{t("admin.users.readOnlyInfoHint")}</p>
            </section>
          )}

          <section aria-labelledby="gt-user-identity-title" className="grid gap-4">
            <h3 id="gt-user-identity-title" className="text-[length:var(--text-body-md)] font-semibold">
              {t("admin.users.sectionIdentity")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("admin.users.fieldFirstName")} required error={visible("firstName")}>
                {(props) => (
                  <input
                    {...props}
                    data-autofocus
                    type="text"
                    autoComplete="off"
                    value={draft.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, firstName: true }))}
                    className="gt-admin-field"
                  />
                )}
              </FormField>
              <FormField label={t("admin.users.fieldLastName")} required error={visible("lastName")}>
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="off"
                    value={draft.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, lastName: true }))}
                    className="gt-admin-field"
                  />
                )}
              </FormField>
            </div>
            <FormField
              label={t("admin.users.fieldEmail")}
              required
              error={emailError}
              hint={mode === "create" ? t("admin.users.emailHintCreate") : t("admin.users.emailHintEdit")}
            >
              {(props) => (
                <input
                  {...props}
                  aria-invalid={emailError ? true : undefined}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("admin.users.emailPlaceholder")}
                  value={draft.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                  className="gt-admin-field"
                />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t("admin.users.fieldJobTitle")}
                aside={<span className="text-[11px] text-[var(--text-muted)]">{t("admin.users.optional")}</span>}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="off"
                    value={draft.jobTitle}
                    onChange={(e) => set("jobTitle", e.target.value)}
                    className="gt-admin-field"
                  />
                )}
              </FormField>
              <FormField label={t("admin.users.fieldTeam")}>
                {(props) => (
                  <AdminSelect
                    {...props}
                    value={draft.team}
                    onChange={(e) => set("team", e.target.value as UserDraft["team"])}
                    options={USER_TEAMS.map((team) => ({ value: team, label: t(`admin.users.team.${team}`) }))}
                  />
                )}
              </FormField>
            </div>
          </section>

          <section aria-labelledby="gt-user-access-title" className="grid gap-4 border-t border-[var(--border-subtle)] pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="gt-user-access-title" className="text-[length:var(--text-body-md)] font-semibold">
                {t("admin.users.sectionAccess")}
              </h3>
            </div>
            <RolePicker
              name={roleName}
              legend={t("admin.users.fieldRole")}
              value={draft.role}
              onChange={(role) => set("role", role)}
              disabledReason={guardText}
            />
            {mode === "edit" && user && draft.role !== user.role && (
              <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] px-3 py-2 text-[length:var(--text-caption)] text-[var(--status-info-fg)]">
                <Info size={14} aria-hidden="true" className="mt-px flex-none" />
                {t("admin.users.roleWillConfirm")}
              </p>
            )}

            <div>
              <button
                type="button"
                onClick={() => setCompareOpen((v) => !v)}
                aria-expanded={compareOpen}
                aria-controls="gt-user-role-compare"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t("admin.users.compareRoles")}
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={clsx("transition-transform duration-[var(--duration-fast)]", compareOpen && "rotate-180")}
                />
              </button>
              <div id="gt-user-role-compare" hidden={!compareOpen} className="mt-3">
                <RoleMatrix highlight={draft.role} compact />
              </div>
            </div>

            <StatusChoice
              value={draft.status}
              options={statusOptions}
              onChange={(status) => set("status", status)}
              disabledReason={guardText}
            />
          </section>
        </div>
      </SheetBody>

      <SheetFooter>
        <AdminButton variant="ghost" onClick={onCancel} disabled={submitting}>
          {t("common.cancel")}
        </AdminButton>
        <span className="ml-auto">
          <AdminButton
            type="submit"
            variant="primary"
            iconLeft={mode === "create" ? UserPlus : Save}
            loading={submitting}
            disabled={!dirty}
          >
            {submitting
              ? t("admin.users.saving")
              : mode === "create"
                ? t("admin.users.createUser")
                : t("admin.users.saveChanges")}
          </AdminButton>
        </span>
      </SheetFooter>
    </form>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 truncate text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
