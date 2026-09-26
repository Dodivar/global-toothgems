import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Hourglass, Mail, Pencil, RotateCw, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { PasswordField, TextField } from "../register/Field";
import { DetailRow, SecurityCard } from "./SecurityCard";
import { Notice } from "./Notice";
import { MockInbox } from "./MockInbox";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { LINK_TOKENS, SecurityServiceError, VERIFY_LINK_HOURS, formatCountdown, isEmail, requestEmailChange, sendVerification, useCooldown, verifyLink, type ServiceOutcome } from "../../lib/accountSecurity";
import { useAccountSecurity } from "../../lib/securityState";

type Field = "email" | "confirm" | "password";

const OPEN_ID = "security-email-open";

/**
 * Changing the sign-in email.
 *
 * The current address stays the sign-in address until the new one is proven:
 * submitting sends a verification link to the new address and puts the change
 * in a visible "pending" state, with the two addresses side by side and
 * labelled so they cannot be confused. The member can resend the link or
 * cancel the change. Opening the link (the mock inbox here) completes it on
 * the verification page.
 *
 * The current password is asked for because an email change is how an account
 * is taken over: an unattended open session must not be enough.
 */
export function ChangeEmailCard({ outcome }: { outcome: ServiceOutcome }) {
  const { t } = useTranslation();
  const { email: currentEmail } = useAuth();
  const { pendingEmail, startEmailChange, cancelEmailChange, resendEmailChange } = useAccountSecurity();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ email: "", confirm: "", password: "" });
  const [touched, setTouched] = useState<Record<Field, boolean>>({ email: false, confirm: false, password: false });
  const [serverField, setServerField] = useState<{ field: Field; key: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendFailed, setResendFailed] = useState(false);
  const cooldown = useCooldown();

  const emailRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const focusField = (field: Field) => ({ email: emailRef, confirm: confirmRef, password: passwordRef })[field].current?.focus();

  // Focus moves into the form when it opens, and back to its trigger when it closes.
  useEffect(() => {
    if (open) emailRef.current?.focus();
  }, [open]);

  const errorKeys: Record<Field, string | null> = {
    email: !values.email.trim()
      ? "security.errors.newEmailRequired"
      : !isEmail(values.email)
        ? "register.errors.emailInvalid"
        : values.email.trim().toLowerCase() === currentEmail?.toLowerCase()
          ? "register.errors.emailSame"
          : null,
    confirm: !values.confirm.trim()
      ? "security.errors.confirmEmailRequired"
      : values.confirm.trim().toLowerCase() !== values.email.trim().toLowerCase()
        ? "security.errors.emailMismatch"
        : null,
    password: !values.password ? "security.errors.currentPasswordRequired" : null,
  };

  const errorOf = (field: Field) => {
    if (serverField?.field === field) return t(serverField.key);
    return touched[field] && errorKeys[field] ? t(errorKeys[field]!) : null;
  };

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (serverField?.field === field) setServerField(null);
    if (serverError) setServerError(false);
  };

  const blur = (field: Field) => () => {
    if (values[field]) setTouched((s) => ({ ...s, [field]: true }));
  };

  const close = () => {
    setOpen(false);
    setValues({ email: "", confirm: "", password: "" });
    setTouched({ email: false, confirm: false, password: false });
    setServerField(null);
    setServerError(false);
    requestAnimationFrame(() => document.getElementById(OPEN_ID)?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setTouched({ email: true, confirm: true, password: true });
    setServerField(null);
    const firstInvalid = (["email", "confirm", "password"] as Field[]).find((f) => errorKeys[f]);
    if (firstInvalid) return focusField(firstInvalid);

    setSaving(true);
    setServerError(false);
    try {
      await requestEmailChange(values.email, values.password, outcome);
      setSaving(false);
      startEmailChange(values.email);
      cooldown.start();
      setJustSent(true);
      setOpen(false);
      setValues({ email: "", confirm: "", password: "" });
      setTouched({ email: false, confirm: false, password: false });
      showToast(t("security.email.toastTitle"), t("security.email.toastBody"));
      // The form is gone; the card heading is the natural place to land.
      requestAnimationFrame(() => document.getElementById("security-email-title")?.focus());
    } catch (error) {
      setSaving(false);
      const code = error instanceof SecurityServiceError ? error.code : "server";
      if (code === "emailTaken") {
        setServerField({ field: "email", key: "security.errors.emailTaken" });
        emailRef.current?.focus();
      } else if (code === "wrongPassword") {
        setServerField({ field: "password", key: "security.errors.wrongPassword" });
        passwordRef.current?.focus();
      } else {
        setServerError(true);
      }
    }
  };

  const resend = async () => {
    if (resending || cooldown.left > 0) return;
    setResending(true);
    setResendFailed(false);
    try {
      await sendVerification(outcome);
      resendEmailChange();
      cooldown.start();
      showToast(t("security.email.resentTitle"), t("security.email.resentBody", { email: pendingEmail }));
    } catch {
      setResendFailed(true);
    }
    setResending(false);
  };

  const cancel = () => {
    cancelEmailChange();
    setJustSent(false);
    setResendFailed(false);
    showToast(t("security.email.cancelledTitle"), t("security.email.cancelledBody"), "info");
  };

  const locked = cooldown.left > 0;

  return (
    <SecurityCard
      id="security-email"
      icon={Mail}
      title={t("security.email.title")}
      description={<p>{t("security.email.body")}</p>}
      status={
        pendingEmail ? (
          <Badge tone="warning" icon={Hourglass} size="sm">
            {t("security.email.pendingBadge")}
          </Badge>
        ) : undefined
      }
    >
      <dl className="m-0 grid gap-2">
        <DetailRow label={t("security.email.current")}>
          <span className="break-all font-semibold">{currentEmail}</span>
          <Badge tone="success" icon={BadgeCheck} size="sm">
            {t("security.email.verified")}
          </Badge>
        </DetailRow>
        {pendingEmail && (
          <DetailRow label={t("security.email.pending")}>
            <span className="break-all font-semibold">{pendingEmail}</span>
            <Badge tone="warning" icon={Hourglass} size="sm">
              {t("security.email.awaiting")}
            </Badge>
          </DetailRow>
        )}
      </dl>

      {pendingEmail ? (
        <div className="grid gap-4">
          <div role="status" aria-live="polite">
            <Notice tone={justSent ? "success" : "info"} title={t(justSent ? "security.email.sentTitle" : "security.email.pendingTitle")}>
              <p>{t("security.email.sentBody", { email: pendingEmail, current: currentEmail, hours: VERIFY_LINK_HOURS })}</p>
            </Notice>
          </div>
          {resendFailed && (
            <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
              {t("security.email.resendFailed")}
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              iconLeft={resending ? undefined : RotateCw}
              loading={resending}
              aria-disabled={locked}
              onClick={() => void resend()}
              className={clsx(locked && "cursor-not-allowed opacity-60 hover:bg-transparent")}
            >
              {resending ? t("security.resending") : locked ? t("security.resendIn", { time: formatCountdown(cooldown.left) }) : t("security.resend")}
            </Button>
            <Button variant="ghost" size="sm" iconLeft={X} onClick={cancel} disabled={resending}>
              {t("security.email.cancelChange")}
            </Button>
          </div>
          <MockInbox
            id="gt-email-change-inbox"
            to={pendingEmail}
            subject={t("security.email.mailSubject")}
            ctaLabel={t("security.email.mailCta")}
            href={verifyLink(LINK_TOKENS.valid, "changement")}
            hint={t("security.verify.mailHint", { hours: VERIFY_LINK_HOURS })}
          >
            <p>{t("security.email.mailBody", { email: pendingEmail })}</p>
          </MockInbox>
        </div>
      ) : open ? (
        <form noValidate onSubmit={submit} className="grid gap-4 border-t border-[var(--border-subtle)] pt-5">
          {serverError && (
            <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
              {t("security.email.failedBody")}
            </Notice>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              ref={emailRef}
              id="security-new-email"
              label={t("security.fields.newEmail")}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("register.fields.emailPlaceholder")}
              value={values.email}
              disabled={saving}
              onChange={set("email")}
              onBlur={blur("email")}
              error={errorOf("email")}
              success={touched.email && !errorKeys.email && serverField?.field !== "email"}
            />
            <TextField
              ref={confirmRef}
              id="security-confirm-email"
              label={t("security.fields.confirmNewEmail")}
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={values.confirm}
              disabled={saving}
              onChange={set("confirm")}
              onBlur={blur("confirm")}
              error={errorOf("confirm")}
              success={touched.confirm && !errorKeys.confirm && !errorKeys.email}
              successMessage={t("security.email.match")}
            />
          </div>
          <PasswordField
            ref={passwordRef}
            id="security-email-password"
            label={t("security.fields.currentPassword")}
            autoComplete="current-password"
            value={values.password}
            disabled={saving}
            onChange={set("password")}
            onBlur={blur("password")}
            error={errorOf("password")}
            hint={t("security.email.passwordHint")}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? t("security.email.saving") : t("security.email.submit")}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            id={OPEN_ID}
            variant="outline"
            iconLeft={Pencil}
            onClick={() => {
              setJustSent(false);
              setOpen(true);
            }}
          >
            {t("security.email.open")}
          </Button>
        </div>
      )}
    </SecurityCard>
  );
}
