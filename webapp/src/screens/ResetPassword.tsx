"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../lib/navigation";
import { ArrowLeft, ArrowRight, Clock, KeyRound, LinkIcon, LoaderCircle, LockKeyhole, RotateCw, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/register/Field";
import { PasswordStrength } from "../components/register/PasswordStrength";
import { AuthShell, StateHeading } from "../components/security/AuthShell";
import { Notice } from "../components/security/Notice";
import { FORGOT_PATH, RESET_LINK_MINUTES, newPasswordError } from "../lib/accountSecurity";
import { useAuth } from "../lib/auth";
import { authLinkErrorFromUrl } from "../lib/authRedirect";
import { setNewPassword } from "../lib/passwordRecovery";

type Phase = "checking" | "form" | "done" | "expired" | "invalid";

/**
 * Choosing a new password, at `/reinitialiser-mot-de-passe` — the page the
 * reset email opens through `/auth/confirm`.
 *
 * The recovery link has already been checked by Supabase: it lands here with a
 * recovery session (or an error in the URL), and the new password is saved
 * with `supabase.auth.updateUser`. The page shows one of: the form, an expired
 * link, an invalid link, or the success state. Expired and invalid are told
 * apart because the fix differs in wording only — both lead back to requesting
 * a new link — but "expired" reassures the visitor that they did nothing wrong.
 *
 * The form uses the same password policy, meter and fields as registration.
 */
export function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { realAuth, signedIn, restoring } = useAuth();
  // Read once, before anything rewrites the address bar.
  const [linkError] = useState(() => (realAuth ? authLinkErrorFromUrl() : null));

  const [done, setDone] = useState(false);
  const phase: Phase = done ? "done" : (linkError ?? (restoring ? "checking" : signedIn ? "form" : "invalid"));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Focus the heading of each settled state so its message is read first.
  useEffect(() => {
    if (phase !== "checking") headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const passwordErrorKey = newPasswordError(password);
  const confirmErrorKey = !confirm ? "register.errors.confirmRequired" : confirm !== password ? "security.errors.mismatch" : null;
  const passwordError = touched.password && passwordErrorKey ? t(passwordErrorKey) : null;
  const confirmError = touched.confirm && confirmErrorKey ? t(confirmErrorKey) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setTouched({ password: true, confirm: true });
    if (passwordErrorKey) return passwordRef.current?.focus();
    if (confirmErrorKey) return confirmRef.current?.focus();
    setServerError(false);
    setSaving(true);
    try {
      if ((await setNewPassword(password)) !== "updated") throw new Error("password update failed");
      setSaving(false);
      setPassword("");
      setConfirm("");
      setDone(true);
    } catch {
      setSaving(false);
      setServerError(true);
    }
  };

  const backToLogin = (
    <Link
      to="/connexion"
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {t("security.backToLogin")}
    </Link>
  );

  if (phase === "checking") {
    return (
      <AuthShell>
        <div role="status" className="grid justify-items-center gap-4 py-6 text-center">
          <LoaderCircle size={30} aria-hidden="true" className="animate-spin text-[var(--gt-blue-600)]" />
          <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{t("security.reset.checking")}</p>
          <h1 className="sr-only">{t("security.reset.title")}</h1>
        </div>
      </AuthShell>
    );
  }

  if (phase === "expired" || phase === "invalid") {
    const expired = phase === "expired";
    return (
      <AuthShell>
        <StateHeading
          icon={expired ? Clock : LinkIcon}
          tone="warning"
          title={t(expired ? "security.reset.expiredTitle" : "security.reset.invalidTitle")}
          headingRef={headingRef}
        >
          <p>{t(expired ? "security.reset.expiredBody" : "security.reset.invalidBody", { minutes: RESET_LINK_MINUTES })}</p>
        </StateHeading>
        <div className="grid gap-3">
          <Button variant="primary" size="lg" fullWidth iconLeft={RotateCw} onClick={() => navigate(FORGOT_PATH)}>
            {t("security.reset.requestNew")}
          </Button>
          <div className="grid justify-items-center">{backToLogin}</div>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell>
        <StateHeading icon={ShieldCheck} tone="success" title={t("security.reset.doneTitle")} headingRef={headingRef}>
          <p>{t("security.reset.doneBody")}</p>
        </StateHeading>
        <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => navigate("/connexion", { replace: true })}>
          {t("security.reset.logIn")}
        </Button>
        <aside className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-4 text-[length:var(--text-caption)] leading-[1.55] text-[var(--text-body)]">
          <LockKeyhole size={17} aria-hidden="true" className="mt-[1px] flex-none text-[var(--gt-blue-700)]" />
          <div className="grid gap-1">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("security.reset.tipTitle")}</strong>
            <span>{t("security.reset.tipBody")}</span>
          </div>
        </aside>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <StateHeading icon={KeyRound} tone="brand" eyebrow={t("security.reset.eyebrow")} title={t("security.reset.title")} headingRef={headingRef}>
        <p>{t("security.reset.body")}</p>
      </StateHeading>

      {serverError && (
        <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
          {t("security.reset.failedBody")}
        </Notice>
      )}

      <form noValidate onSubmit={submit} className="grid gap-5">
        {/* Lets password managers attach the new password to the right account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly value="" />
        <PasswordField
          ref={passwordRef}
          id="reset-password"
          label={t("security.fields.newPassword")}
          autoComplete="new-password"
          value={password}
          disabled={saving}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => password && setTouched((s) => ({ ...s, password: true }))}
          error={passwordError}
          success={touched.password && !passwordErrorKey}
          describedBy="reset-password-strength"
          after={<PasswordStrength id="reset-password-strength" value={password} errorShown={!!passwordError} />}
        />
        <PasswordField
          ref={confirmRef}
          id="reset-confirm"
          label={t("security.fields.confirmNewPassword")}
          autoComplete="new-password"
          value={confirm}
          disabled={saving}
          onChange={(e) => {
            setConfirm(e.target.value);
            // Once both are typed, say at once whether they match.
            if (e.target.value.length >= password.length && password) setTouched((s) => ({ ...s, confirm: true }));
          }}
          onBlur={() => confirm && setTouched((s) => ({ ...s, confirm: true }))}
          error={confirmError}
          success={!!confirm && !confirmErrorKey && !passwordErrorKey}
          successMessage={t("register.fields.passwordsMatch")}
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={saving}>
          {saving ? t("security.reset.saving") : t("security.reset.submit")}
        </Button>
      </form>

      <div className="grid justify-items-center">{backToLogin}</div>
    </AuthShell>
  );
}
