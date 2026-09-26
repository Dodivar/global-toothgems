import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, CircleAlert, Eye, EyeOff, Info, LogOut, MailCheck, RotateCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { AuthCard, AuthField, AuthLayout, GoogleButton } from "../components/auth/AuthScene";
import { confirmationRedirect, useAuth, type ResendResult, type SignInResult } from "../lib/auth";
import { useProgress } from "../lib/progress";
import { useToast } from "../lib/toast";
import { FORGOT_PATH } from "../lib/accountSecurity";

/** Where a visitor lands when they reach the page on their own, with nothing pending. */
const DEFAULT_TARGET = "/compte";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Sign-in failures shown above the form, each with its own message. */
type Failure = Exclude<SignInResult, "accepted">;

const linkClass =
  "font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-[var(--text-link-hover)]";

/**
 * Sign-in, at `/connexion`. Creating an account is a separate page
 * (`/inscription`); the link to it carries the same history state, so a
 * visitor sent here by a course or the cart still finishes that errand after
 * registering instead.
 */
export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signedIn, restoring, realAuth, email: sessionEmail, signInWithPassword, resendConfirmation, signOut } = useAuth();
  const { openCourse } = useProgress();
  const { showToast } = useToast();

  /**
   * `from` is set by RequireAccount when it turned someone away from a gated
   * page, and by the training pages when a visitor asked to start a course.
   * `course` carries which one, so that purchase finishes on its own.
   */
  const routeState = location.state as { from?: string; course?: string } | null;
  const from = routeState?.from;
  const pendingCourse = routeState?.course;
  const target = from ?? DEFAULT_TARGET;

  // The mock accepts anything, so it is prefilled to be walked through without
  // typing. A real sign-in starts empty.
  const [form, setForm] = useState(() =>
    realAuth ? { email: "", password: "" } : { email: "camille@studio.fr", password: "gemstudio" },
  );
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [resend, setResend] = useState<"idle" | "sending" | ResendResult>("idle");

  const fieldId = (key: string) => `login-${key}`;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    // Clear the complaint as soon as the field is touched.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // Shape checks only; the password itself is checked by Supabase Auth.
    const found: typeof errors = {};
    if (!EMAIL_RE.test(form.email.trim())) found.email = t("authAlt.errorEmail");
    if (!form.password) found.password = t("login.errorPasswordRequired");
    setErrors(found);
    const first = (["email", "password"] as const).find((k) => found[k]);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }

    setBusy(true);
    setFailure(null);
    setResend("idle");
    const result = await signInWithPassword(form.email, form.password);
    setBusy(false);
    if (result !== "accepted") {
      setFailure(result);
      return;
    }
    // Finishes what the visitor came here for: the training they chose is added
    // to the account, so the player opens on it.
    if (pendingCourse) openCourse(pendingCourse);
    showToast(t("auth.toastSignInTitle"), t("auth.toastSignInBody"));
    // `replace` so Back returns to the page the visitor came from rather than
    // bouncing them into the login wall again.
    navigate(target, { replace: true });
  };

  const sendConfirmation = async () => {
    setResend("sending");
    setResend(await resendConfirmation(form.email, confirmationRedirect(from)));
  };

  if (restoring) {
    return <AuthLayout><div aria-busy="true" className="min-h-[420px]" /></AuthLayout>;
  }

  if (signedIn) {
    return (
      <AuthLayout>
        <AuthCard
          crown={
            <>
              <span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("auth.eyebrow")}</span>
              <Badge tone="success" icon={BadgeCheck} className="justify-self-start">
                {t("auth.signedInBadge")}
              </Badge>
            </>
          }
        >
          <div className="grid gap-5">
            <h1 className="text-[clamp(26px,3.4vw,34px)]">{t("auth.signedInTitle")}</h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
              {t("auth.signedInBody", { email: sessionEmail })}
            </p>
            <div className="grid gap-3">
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => navigate("/compte")}>
                {t("auth.signedInAccount")}
              </Button>
              <Button variant="outline" size="lg" fullWidth onClick={() => navigate("/academy")}>
                {t("auth.signedInAcademy")}
              </Button>
              <Button variant="ghost" fullWidth iconLeft={LogOut} onClick={() => signOut()}>
                {t("auth.signOut")}
              </Button>
            </div>
          </div>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCard crown={<span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("auth.eyebrow")}</span>}>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <h1 className="text-[clamp(26px,3.4vw,34px)]">{t("auth.signInTitle")}</h1>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("auth.signInBody")}</p>
          </div>

          {/* Says why they are here. Without it, being bounced out of a course
              into a login form reads as an error rather than as the rule. */}
          {from && (
            <p
              role="status"
              className="m-0 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-info-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]"
            >
              <Info size={16} aria-hidden="true" className="mt-0.5 flex-none" />
              <span>{t("auth.gateNotice")}</span>
            </p>
          )}

          {failure && (
            <div
              role="alert"
              className="gt-field-message grid gap-3 rounded-[var(--radius-md)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4"
            >
              <p className="m-0 flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                <span>
                  <strong className="block">{t(`login.failure.${failure}Title`)}</strong>
                  {t(`login.failure.${failure}Body`)}
                </span>
              </p>
              {failure === "unconfirmed" && (
                <div className="grid justify-items-start gap-2 pl-[26px]">
                  {resend === "sent" ? (
                    <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-success-fg)]">
                      <MailCheck size={16} aria-hidden="true" />
                      {t("login.resendSent")}
                    </p>
                  ) : (
                    <Button variant="dark" size="sm" iconLeft={RotateCw} loading={resend === "sending"} onClick={() => void sendConfirmation()}>
                      {t("login.resend")}
                    </Button>
                  )}
                  {(resend === "failed" || resend === "rateLimited") && (
                    <p className="m-0 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
                      {t(resend === "rateLimited" ? "login.resendRateLimited" : "login.resendFailed")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <form onSubmit={submit} noValidate className="grid gap-4">
            <AuthField
              id={fieldId("email")}
              label={t("auth.email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={set("email")}
              error={errors.email}
            />

            <AuthField
              id={fieldId("password")}
              label={t("auth.password")}
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              value={form.password}
              onChange={set("password")}
              error={errors.password}
              trailing={
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-pressed={reveal}
                  aria-controls={fieldId("password")}
                  aria-label={t(reveal ? "authAlt.hidePassword" : "authAlt.showPassword")}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
                >
                  {reveal ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              }
            />

            {/* Hands the typed address to the recovery page, so it is not asked twice. */}
            <div className="flex justify-end">
              <Link to={FORGOT_PATH} state={{ email: form.email.trim() }} className={`rounded-[var(--radius-xs)] text-[length:var(--text-body-sm)] ${linkClass}`}>
                {t("authAlt.forgot")}
              </Link>
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={busy} iconRight={ArrowRight}>
              {t("auth.submitSignIn")}
            </Button>

            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--border-subtle)]" />
              <span className="gt-eyebrow">{t("authAlt.orContinue")}</span>
              <span className="h-px flex-1 bg-[var(--border-subtle)]" />
            </div>

            <GoogleButton
              label={t("authAlt.google")}
              disabled={busy}
              onClick={() => showToast(t("authAlt.googleToastTitle"), t("authAlt.googleToastBody"), "info")}
            />
          </form>

          <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-5">
            <p className="m-0 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("authAlt.switchToSignUpPrompt")}{" "}
              {/* Same state as this page received: registering instead still
                  finishes the errand that brought the visitor here. */}
              <Link to="/inscription" state={routeState ?? undefined} className={linkClass}>
                {t("login.createAccount")}
              </Link>
            </p>
            {!realAuth && (
              <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("auth.mockNote")}</p>
            )}
          </div>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
