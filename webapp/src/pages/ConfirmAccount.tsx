import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, CircleAlert, Clock, MailCheck, RotateCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { AuthCard, AuthField, AuthLayout } from "../components/auth/AuthScene";
import { useAuth, type ResendResult } from "../lib/auth";
import { confirmationRedirect, isSafeNext } from "../lib/authRedirect";

type LinkError = "expired" | "invalid";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Supabase reports a refused link in the URL fragment
 * (`#error=access_denied&error_code=otp_expired&…`). Read once, before
 * anything rewrites the address bar.
 */
function linkErrorFromHash(): LinkError | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = hash.get("error_code");
  if (!code && !hash.get("error")) return null;
  return code === "otp_expired" ? "expired" : "invalid";
}

/**
 * Landing page of the confirmation email, at `/confirmation-compte`.
 *
 * Supabase Auth has already verified the address before redirecting here, and
 * the session arrives in the URL, where supabase-js picks it up
 * (`detectSessionInUrl`). The page only waits for that session and says what
 * happened: confirmed (continue to `?suite=`, the page the member was heading
 * to), expired (ask for a new link) or unusable.
 */
export function ConfirmAccount() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signedIn, restoring, displayName, resendConfirmation } = useAuth();
  const [linkError] = useState(linkErrorFromHash);

  const suite = params.get("suite");
  const next = suite && isSafeNext(suite) ? suite : "/compte";

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [resend, setResend] = useState<"idle" | "sending" | ResendResult>("idle");

  const outcome: "verifying" | "confirmed" | LinkError = signedIn
    ? "confirmed"
    : linkError ?? (restoring ? "verifying" : "invalid");

  const requestLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t("authAlt.errorEmail"));
      return;
    }
    setResend("sending");
    setResend(await resendConfirmation(email, confirmationRedirect(next)));
  };

  const crown = (
    <>
      <span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("auth.eyebrow")}</span>
      {outcome === "confirmed" && (
        <Badge tone="success" icon={BadgeCheck} className="justify-self-start">
          {t("confirmAccount.badge")}
        </Badge>
      )}
    </>
  );

  return (
    <AuthLayout>
      <AuthCard crown={crown}>
        {outcome === "verifying" && (
          <div role="status" className="grid justify-items-center gap-4 py-8 text-center">
            <RotateCw size={28} aria-hidden="true" className="animate-spin text-[var(--gt-blue-600)]" />
            <h1 className="text-[clamp(24px,3vw,30px)]">{t("confirmAccount.verifyingTitle")}</h1>
          </div>
        )}

        {outcome === "confirmed" && (
          <div className="grid gap-5">
            <span aria-hidden="true" className="grid h-[64px] w-[64px] place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
              <MailCheck size={28} strokeWidth={1.7} />
            </span>
            <div className="grid gap-2">
              <h1 className="text-[clamp(26px,3.4vw,34px)]">
                {displayName ? t("confirmAccount.titleNamed", { name: displayName }) : t("confirmAccount.title")}
              </h1>
              <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("confirmAccount.body")}</p>
            </div>
            <div className="grid gap-3">
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => navigate(next, { replace: true })}>
                {t(next === "/compte" ? "auth.signedInAccount" : "confirmAccount.continue")}
              </Button>
              {next !== "/compte" && (
                <Button variant="outline" size="lg" fullWidth onClick={() => navigate("/compte", { replace: true })}>
                  {t("auth.signedInAccount")}
                </Button>
              )}
            </div>
          </div>
        )}

        {(outcome === "expired" || outcome === "invalid") && (
          <div className="grid gap-5">
            <span aria-hidden="true" className="grid h-[64px] w-[64px] place-items-center rounded-full bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
              {outcome === "expired" ? <Clock size={28} strokeWidth={1.7} /> : <CircleAlert size={28} strokeWidth={1.7} />}
            </span>
            <div className="grid gap-2">
              <h1 className="text-[clamp(26px,3.4vw,34px)]">{t(`confirmAccount.${outcome}Title`)}</h1>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`confirmAccount.${outcome}Body`)}</p>
            </div>

            {resend === "sent" ? (
              <p role="status" className="m-0 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--status-success-bg)] p-4 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-success-fg)]">
                <MailCheck size={16} aria-hidden="true" />
                {t("confirmAccount.resent")}
              </p>
            ) : (
              <form noValidate onSubmit={requestLink} className="grid gap-4">
                <AuthField
                  id="confirm-email"
                  label={t("auth.email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(undefined);
                  }}
                  error={emailError}
                />
                {(resend === "failed" || resend === "rateLimited") && (
                  <p role="alert" className="m-0 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
                    {t(resend === "rateLimited" ? "login.resendRateLimited" : "login.resendFailed")}
                  </p>
                )}
                <Button type="submit" variant="primary" size="lg" fullWidth iconLeft={RotateCw} loading={resend === "sending"}>
                  {t("confirmAccount.sendNewLink")}
                </Button>
              </form>
            )}

            <p className="m-0 border-t border-[var(--border-subtle)] pt-5 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("confirmAccount.alreadyConfirmed")}{" "}
              <Link
                to="/connexion"
                className="font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--text-link-hover)]"
              >
                {t("register.signIn")}
              </Link>
            </p>
          </div>
        )}
      </AuthCard>
    </AuthLayout>
  );
}
