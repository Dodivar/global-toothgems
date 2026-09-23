import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Link as LinkGlyph, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/Button";
import { PasswordField } from "../register/Field";
import { PasswordStrength } from "../register/PasswordStrength";
import { DetailRow, SecurityCard } from "./SecurityCard";
import { Notice } from "./Notice";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { formatDate } from "../../lib/format";
import { FORGOT_PATH, SecurityServiceError, changePassword, newPasswordError, type ServiceOutcome } from "../../lib/accountSecurity";
import { useAccountSecurity } from "../../lib/securityState";

type Field = "current" | "next" | "confirm";

const OPEN_ID = "security-password-open";
const EMPTY = { current: "", next: "", confirm: "" };
const UNTOUCHED: Record<Field, boolean> = { current: false, next: false, confirm: false };

/**
 * Changing the password from inside the account.
 *
 * Closed, the card only says when the password last changed; the form opens
 * in place, so nothing else on the page moves. After a successful change the
 * form closes, an inline confirmation replaces it and a toast repeats it —
 * no modal: the member was mid-task on their account, not starting a new one.
 */
export function ChangePasswordCard({ outcome }: { outcome: ServiceOutcome }) {
  const { t } = useTranslation();
  const { email } = useAuth();
  const { passwordChangedAt, markPasswordChanged } = useAccountSecurity();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState(UNTOUCHED);
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [done, setDone] = useState(false);

  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const focusField = (field: Field) => ({ current: currentRef, next: nextRef, confirm: confirmRef })[field].current?.focus();

  useEffect(() => {
    if (open) currentRef.current?.focus();
  }, [open]);

  const errorKeys: Record<Field, string | null> = {
    current: !values.current ? "security.errors.currentPasswordRequired" : null,
    next:
      newPasswordError(values.next) ??
      (values.current && values.next === values.current ? "security.errors.passwordSame" : null),
    confirm: !values.confirm ? "register.errors.confirmRequired" : values.confirm !== values.next ? "security.errors.mismatch" : null,
  };

  const errorOf = (field: Field) => {
    if (field === "current" && wrongCurrent) return t("security.errors.wrongPassword");
    return touched[field] && errorKeys[field] ? t(errorKeys[field]!) : null;
  };

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (field === "current") setWrongCurrent(false);
    if (field === "confirm" && values.next && value.length >= values.next.length) setTouched((s) => ({ ...s, confirm: true }));
    if (serverError) setServerError(false);
  };

  const blur = (field: Field) => () => {
    if (values[field]) setTouched((s) => ({ ...s, [field]: true }));
  };

  const reset = () => {
    setValues(EMPTY);
    setTouched(UNTOUCHED);
    setWrongCurrent(false);
    setServerError(false);
  };

  const close = () => {
    setOpen(false);
    reset();
    requestAnimationFrame(() => document.getElementById(OPEN_ID)?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setTouched({ current: true, next: true, confirm: true });
    const firstInvalid = (["current", "next", "confirm"] as Field[]).find((f) => errorKeys[f]);
    if (firstInvalid) return focusField(firstInvalid);

    setSaving(true);
    setServerError(false);
    try {
      await changePassword(values.current, values.next, outcome);
      setSaving(false);
      markPasswordChanged();
      setOpen(false);
      reset();
      setDone(true);
      showToast(t("security.password.toastTitle"), t("security.password.toastBody"));
      requestAnimationFrame(() => document.getElementById("security-password-title")?.focus());
    } catch (error) {
      setSaving(false);
      if (error instanceof SecurityServiceError && error.code === "wrongPassword") {
        setWrongCurrent(true);
        currentRef.current?.focus();
      } else {
        setServerError(true);
      }
    }
  };

  return (
    <SecurityCard id="security-password" icon={KeyRound} title={t("security.password.title")} description={<p>{t("security.password.body")}</p>}>
      <dl className="m-0 grid gap-2">
        <DetailRow label={t("security.password.lastChanged")}>
          {passwordChangedAt ? formatDate(passwordChangedAt) : t("security.password.sinceSignUp")}
        </DetailRow>
      </dl>

      <div role="status" aria-live="polite" className="empty:hidden">
        {done && !open && (
          <Notice tone="success" title={t("security.password.doneTitle")}>
            <p>{t("security.password.doneBody")}</p>
          </Notice>
        )}
      </div>

      {open ? (
        <form noValidate onSubmit={submit} className="grid gap-4 border-t border-[var(--border-subtle)] pt-5">
          {serverError && (
            <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
              {t("security.password.failedBody")}
            </Notice>
          )}
          {/* Lets password managers attach the new password to the right account. */}
          <input type="text" name="username" autoComplete="username" hidden readOnly value={email ?? ""} />
          <PasswordField
            ref={currentRef}
            id="security-current-password"
            label={t("security.fields.currentPassword")}
            autoComplete="current-password"
            value={values.current}
            disabled={saving}
            onChange={set("current")}
            onBlur={blur("current")}
            error={errorOf("current")}
            after={
              <Link
                to={FORGOT_PATH}
                state={{ email }}
                className="justify-self-start text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
              >
                {t("security.password.forgot")}
              </Link>
            }
          />
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <PasswordField
              ref={nextRef}
              id="security-new-password"
              label={t("security.fields.newPassword")}
              autoComplete="new-password"
              value={values.next}
              disabled={saving}
              onChange={set("next")}
              onBlur={blur("next")}
              error={errorOf("next")}
              success={touched.next && !errorKeys.next}
              describedBy="security-new-password-strength"
            />
            <PasswordField
              ref={confirmRef}
              id="security-confirm-password"
              label={t("security.fields.confirmNewPassword")}
              autoComplete="new-password"
              value={values.confirm}
              disabled={saving}
              onChange={set("confirm")}
              onBlur={blur("confirm")}
              error={errorOf("confirm")}
              success={!!values.confirm && !errorKeys.confirm && !errorKeys.next}
              successMessage={t("register.fields.passwordsMatch")}
            />
          </div>
          <PasswordStrength id="security-new-password-strength" value={values.next} errorShown={!!errorOf("next")} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? t("security.password.saving") : t("security.password.submit")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            id={OPEN_ID}
            variant="outline"
            iconLeft={Pencil}
            onClick={() => {
              setDone(false);
              setOpen(true);
            }}
          >
            {t("security.password.open")}
          </Button>
          <Link
            to={FORGOT_PATH}
            state={{ email }}
            className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
          >
            <LinkGlyph size={13} aria-hidden="true" />
            {t("security.password.forgot")}
          </Link>
        </div>
      )}
    </SecurityCard>
  );
}
