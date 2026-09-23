import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Clock, KeyRound, LinkIcon, LoaderCircle, LockKeyhole, RotateCw, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/register/Field";
import { PasswordStrength } from "../components/register/PasswordStrength";
import { AuthShell, StateHeading } from "../components/security/AuthShell";
import { Notice } from "../components/security/Notice";
import { DemoControls, DemoNote, RadioPills } from "../components/security/DemoControls";
import { FORGOT_PATH, LINK_TOKENS, RESET_LINK_MINUTES, newPasswordError, resetLinkStateOf, resetPassword, type ResetLinkState, type ServiceOutcome } from "../lib/accountSecurity";
import { useAccountSecurity } from "../lib/securityState";

type Phase = "checking" | "form" | "done" | "expired" | "invalid";

const OUTCOMES: ServiceOutcome[] = ["success", "serverError"];
const LINKS: ResetLinkState[] = ["valid", "expired", "invalid"];
const TOKEN_FOR: Record<ResetLinkState, string> = {
  valid: LINK_TOKENS.valid,
  expired: LINK_TOKENS.expired,
  invalid: LINK_TOKENS.invalid,
};

/**
 * Choosing a new password, at `/reinitialiser-mot-de-passe?jeton=…` — the page
 * the reset email opens.
 *
 * The link is checked first (a short "checking your link" state), then the page
 * shows one of: the form, an expired link, an invalid link, or the success
 * state. Expired and invalid are told apart because the fix differs in wording
 * only — both lead back to requesting a new link — but "expired" reassures the
 * visitor that they did nothing wrong.
 *
 * The form uses the same password policy, meter and fields as registration.
 */
export function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const token = params.get("jeton");
  const linkState = resetLinkStateOf(token);
  const { markPasswordChanged } = useAccountSecurity();

  /** Outcome of the last link check, tagged with the token it was for. */
  const [checked, setChecked] = useState<{ token: string | null; phase: Exclude<Phase, "checking"> } | null>(null);
  const phase: Phase = checked && checked.token === token ? checked.phase : "checking";
  const setPhase = (next: Exclude<Phase, "checking">) => setChecked({ token, phase: next });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [outcome, setOutcome] = useState<ServiceOutcome>("success");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Checking the link: a new token (the demo panel rewrites it) reads as
  // "checking" until its own result lands, so every state opens from one page.
  useEffect(() => {
    const timer = setTimeout(() => setChecked({ token, phase: linkState === "valid" ? "form" : linkState }), 700);
    return () => clearTimeout(timer);
  }, [linkState, token]);

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
      await resetPassword(password, outcome);
      setSaving(false);
      markPasswordChanged();
      setPassword("");
      setConfirm("");
      setPhase("done");
    } catch {
      setSaving(false);
      setServerError(true);
    }
  };

  const changeLink = (state: ResetLinkState) => {
    setParams({ jeton: TOKEN_FOR[state] }, { replace: true });
    setTouched({ password: false, confirm: false });
    setServerError(false);
  };

  const demo = (
    <DemoControls summary={`${t(`security.demo.resetLink.${linkState}`)} · ${t(`security.demo.outcome.${outcome}`)}`}>
      <DemoNote>{t("security.reset.demoBody")}</DemoNote>
      <RadioPills
        name="gt-reset-link"
        legend={t("security.demo.resetLinkLegend")}
        options={LINKS}
        value={linkState}
        onChange={changeLink}
        labelFor={(v) => t(`security.demo.resetLink.${v}`)}
      />
      <RadioPills
        name="gt-reset-outcome"
        legend={t("security.demo.outcomeLegend")}
        options={OUTCOMES}
        value={outcome}
        onChange={setOutcome}
        labelFor={(v) => t(`security.demo.outcome.${v}`)}
      />
    </DemoControls>
  );

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
      <AuthShell demo={demo}>
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
      <AuthShell demo={demo}>
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
      <AuthShell demo={demo}>
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
    <AuthShell demo={demo}>
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
