import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Check, CircleAlert, CircleCheck, Eye, EyeOff, LockKeyhole, ShieldCheck, X } from "lucide-react";
import clsx from "clsx";
import monogram from "../../assets/monogram-white.png";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminIconButton } from "../../components/admin/AdminIconButton";
import { FormField } from "../../components/admin/FormField";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, useAdminAuth } from "../../lib/adminAuth";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { photo } from "../../lib/images";

/**
 * Administration access screen.
 *
 * With Supabase configured it signs in through Supabase Auth and only lets a
 * staff account through (see `lib/adminAuth.tsx`). Without it, it rehearses
 * the same states against the prototype's demo account, whose credentials are
 * then printed on the page on purpose; they never appear with real sign-in.
 */

type Status = "idle" | "submitting" | "rejected" | "notStaff" | "unavailable" | "success";

/** Good enough to catch a typo; the real check belongs to the server. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signedIn, signIn, realAuth } = useAdminAuth();

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  const [email, setEmail] = useState(realAuth ? "" : DEMO_ADMIN_EMAIL);
  const [password, setPassword] = useState(realAuth ? "" : DEMO_ADMIN_PASSWORD);
  const [remember, setRemember] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [submitted, setSubmitted] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const emailError = !email.trim()
    ? t("admin.login.errors.emailRequired")
    : !EMAIL_PATTERN.test(email.trim())
      ? t("admin.login.errors.emailInvalid")
      : undefined;
  const passwordError = !password ? t("admin.login.errors.passwordRequired") : undefined;

  // Sends the administrator where they were headed once the session opens.
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => navigate(from, { replace: true }), 550);
      return () => clearTimeout(timer);
    }
  }, [status, navigate, from]);

  // Only an already-open session is bounced straight through. Once a submission
  // is under way the page owns its own transition, and redirecting mid-flight
  // would skip both the error and the success state.
  if (signedIn && status === "idle") {
    return <Navigate to={from} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (emailError || passwordError) return;

    setStatus("submitting");
    const result = await signIn(email, password);
    setStatus(result === "accepted" ? "success" : result);
  };

  const busy = status === "submitting" || status === "success";

  return (
    <div className="gt-admin grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(520px,46%)]">
      {/* Brand side. Near-black and quiet: this is a staff entrance, not a
          storefront, and it should read that way before a word is spoken. */}
      <section className="relative hidden overflow-hidden bg-[var(--gt-ink-900)] lg:block">
        <img
          src={photo("img-11.jpg")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-[.22]"
        />
        {/* Scrim: the photograph is decorative, and the copy on top of it has to
            keep its contrast wherever the image happens to be light. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,.35),rgba(17,17,17,.82))]"
        />
        <div className="relative flex h-full flex-col justify-between p-[clamp(32px,4vw,64px)] text-[var(--text-inverse)]">
          <img src={monogram} alt="Global Toothgems" className="h-9 w-auto" />

          <div className="grid max-w-[30ch] gap-4">
            <span className="gt-script text-[clamp(44px,5vw,68px)] text-[var(--gt-blue-300)]">
              {t("admin.login.scriptAccent")}
            </span>
            <h2 className="text-[length:var(--text-h2)] text-[var(--text-inverse)]">{t("admin.login.brandTitle")}</h2>
            <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-relaxed)] text-[rgba(250,250,248,.72)]">
              {t("admin.login.brandBody")}
            </p>
          </div>

          <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[rgba(250,250,248,.56)]">
            <ShieldCheck size={14} aria-hidden="true" />
            {t("admin.login.brandFooter")}
          </p>
        </div>
      </section>

      {/* Form side */}
      <section className="flex items-center justify-center px-[clamp(20px,5vw,64px)] py-[clamp(40px,6vw,72px)]">
        <div className="w-full max-w-[420px]">
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--admin-panel)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            <LockKeyhole size={12} strokeWidth={2.2} aria-hidden="true" />
            {t("admin.login.areaBadge")}
          </span>

          <h1 className="mt-5 text-[length:var(--text-h1)] leading-[var(--leading-snug)]">{t("admin.login.title")}</h1>
          <p className="m-0 mt-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("admin.login.body")}</p>

          <form onSubmit={submit} noValidate className="mt-7 grid gap-4">
            {(status === "rejected" || status === "notStaff" || status === "unavailable") && (
              <p
                role="alert"
                className="m-0 flex items-start gap-2.5 rounded-[var(--admin-radius-sm)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-3.5 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]"
              >
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                {t(`admin.login.errors.${status}`)}
              </p>
            )}
            {status === "success" && (
              <p
                role="status"
                className="m-0 flex items-start gap-2.5 rounded-[var(--admin-radius-sm)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] p-3.5 text-[length:var(--text-body-sm)] text-[var(--status-success-fg)]"
              >
                <CircleCheck size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                {t("admin.login.successMessage")}
              </p>
            )}

            <FormField label={t("admin.login.email")} required error={submitted ? emailError : undefined}>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  autoComplete="username"
                  className="gt-admin-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              )}
            </FormField>

            <FormField label={t("admin.login.password")} required error={submitted ? passwordError : undefined}>
              {(props) => (
                <span className="relative block">
                  <input
                    {...props}
                    type={reveal ? "text" : "password"}
                    autoComplete="current-password"
                    className="gt-admin-field pr-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                  <span className="absolute right-1 top-1/2 -translate-y-1/2">
                    <AdminIconButton
                      size="sm"
                      icon={reveal ? EyeOff : Eye}
                      label={reveal ? t("admin.login.hidePassword") : t("admin.login.showPassword")}
                      onClick={() => setReveal((v) => !v)}
                    />
                  </span>
                </span>
              )}
            </FormField>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="group flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border transition-colors",
                    "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
                    remember ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)]" : "border-[var(--border-default)]",
                  )}
                >
                  {remember && <Check size={12} strokeWidth={3} className="text-[var(--gt-white)]" />}
                </span>
                <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                  {t("admin.login.remember")}
                </span>
              </label>

              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="rounded-[2px] text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-4 transition-colors hover:decoration-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t("admin.login.forgot")}
              </button>
            </div>

            <AdminButton
              type="submit"
              variant="primary"
              iconRight={ArrowRight}
              loading={status === "submitting"}
              disabled={busy}
              fullWidth
              className="mt-1 h-11"
            >
              {t("admin.login.submit")}
            </AdminButton>
          </form>

          <p className="m-0 mt-5 flex items-start gap-2.5 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-3.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-success-fg)]" />
            {t("admin.login.security")}
          </p>

          {!realAuth && (
            <p className="m-0 mt-3 rounded-[var(--admin-radius-sm)] bg-[var(--status-info-bg)] p-3.5 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
              {t("admin.login.demoNotice", { email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD })}
            </p>
          )}
        </div>
      </section>

      {forgotOpen && <ForgotPasswordDialog onClose={() => setForgotOpen(false)} defaultEmail={email} />}
    </div>
  );
}

/** Password recovery, rehearsed: the request, the wait, the confirmation. */
function ForgotPasswordDialog({ onClose, defaultEmail }: { onClose: () => void; defaultEmail: string }) {
  const { t } = useTranslation();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) return;
    setState("sending");
    await new Promise((resolve) => setTimeout(resolve, 800));
    setState("sent");
  };

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.42)]"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gt-forgot-title"
        tabIndex={-1}
        className="gt-admin-dialog relative w-full max-w-[440px] rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-6 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="gt-forgot-title" className="text-[length:var(--text-h4)]">
            {t("admin.login.forgotTitle")}
          </h2>
          <AdminIconButton icon={X} label={t("common.close")} onClick={onClose} />
        </div>

        {state === "sent" ? (
          <div className="mt-4 grid gap-4">
            <p
              role="status"
              className="m-0 flex items-start gap-2.5 rounded-[var(--admin-radius-sm)] bg-[var(--status-success-bg)] p-3.5 text-[length:var(--text-body-sm)] text-[var(--status-success-fg)]"
            >
              <CircleCheck size={16} aria-hidden="true" className="mt-0.5 flex-none" />
              {t("admin.login.forgotSent", { email })}
            </p>
            <AdminButton variant="dark" onClick={onClose} fullWidth>
              {t("common.close")}
            </AdminButton>
          </div>
        ) : (
          <form onSubmit={send} noValidate className="mt-4 grid gap-4">
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              {t("admin.login.forgotBody")}
            </p>
            <FormField label={t("admin.login.email")} required>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  className="gt-admin-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={state === "sending"}
                />
              )}
            </FormField>
            <div className="flex justify-end gap-2">
              <AdminButton variant="outline" onClick={onClose}>
                {t("common.cancel")}
              </AdminButton>
              <AdminButton type="submit" variant="dark" loading={state === "sending"}>
                {t("admin.login.forgotSubmit")}
              </AdminButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
