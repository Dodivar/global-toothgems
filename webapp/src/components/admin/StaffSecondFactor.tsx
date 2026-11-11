"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, ShieldCheck } from "lucide-react";
import { AdminButton } from "./AdminButton";
import { FormField } from "./FormField";
import { useAdminAuth } from "../../lib/adminAuth";
import { useNavigate } from "../../lib/navigation";
import { prepareSecondFactor, verifySecondFactor, type SecondFactorStep, type VerifyOutcome } from "../../lib/staffSecondFactor";

/**
 * The second factor every staff member passes before the back office opens
 * (decided 2026-11-11): the database refuses every staff right to a session
 * that has not (migration `staff_mfa_required`), so this screen is the only
 * way in, not a courtesy.
 *
 * First time: the staff member adds the account to an authenticator app (QR
 * code, or the key typed by hand) and confirms with a code. Afterwards: a code
 * at each sign-in. A verified code raises the session to aal2; the admin
 * session (`lib/adminAuth.tsx`) follows Supabase's MFA_CHALLENGE_VERIFIED
 * event and the back office opens.
 */

const CODE_PATTERN = /^\d{6}$/;

export function StaffSecondFactor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut } = useAdminAuth();
  const [step, setStep] = useState<SecondFactorStep | null>(null);
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [outcome, setOutcome] = useState<VerifyOutcome | "verifying" | null>(null);

  // Prepared once per screen, even when React runs the effect twice
  // (development): a second run would enrol a second factor and orphan the
  // QR code already shown.
  const prepared = useRef<Promise<SecondFactorStep> | null>(null);
  useEffect(() => {
    let active = true;
    prepared.current ??= prepareSecondFactor();
    void prepared.current.then((next) => {
      if (active) setStep(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const codeError = !CODE_PATTERN.test(code) ? t("admin.secondFactor.codeInvalid") : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (codeError || !step || step.kind === "unavailable") return;
    setOutcome("verifying");
    const result = await verifySecondFactor(step.factorId, code);
    // On success the admin session switches to the back office by itself.
    setOutcome(result);
    if (result !== "verified") setCode("");
  };

  const leave = () => {
    signOut();
    navigate("/", { replace: true });
  };

  const busy = outcome === "verifying" || outcome === "verified";

  return (
    <div className="gt-admin grid min-h-screen place-items-center px-4 py-10">
      <section aria-labelledby="gt-second-factor-title" className="w-full max-w-[440px] rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-6 shadow-[var(--shadow-sm)]">
        <ShieldCheck size={22} aria-hidden="true" className="text-[var(--text-primary)]" />
        <h1 id="gt-second-factor-title" className="mt-3 text-[length:var(--text-h3)]">
          {t(step?.kind === "enrol" ? "admin.secondFactor.enrolTitle" : "admin.secondFactor.challengeTitle")}
        </h1>

        {step === null && (
          <p aria-busy="true" className="m-0 mt-3 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("admin.secondFactor.loading")}
          </p>
        )}

        {step?.kind === "unavailable" && (
          <p role="alert" className="m-0 mt-3 flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
            <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("admin.secondFactor.unavailable")}
          </p>
        )}

        {step && step.kind !== "unavailable" && (
          <form onSubmit={submit} noValidate className="mt-3 grid gap-4">
            {step.kind === "enrol" ? (
              <>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("admin.secondFactor.enrolBody")}</p>
                <img
                  src={step.qrCode}
                  alt={t("admin.secondFactor.qrAlt")}
                  width={176}
                  height={176}
                  className="mx-auto h-44 w-44 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] bg-[var(--gt-white)] p-2"
                />
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("admin.secondFactor.manualKey")}{" "}
                  <code className="select-all font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere]">{step.secret}</code>
                </p>
              </>
            ) : (
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("admin.secondFactor.challengeBody")}</p>
            )}

            {(outcome === "wrongCode" || outcome === "tooMany" || outcome === "unavailable") && (
              <p role="alert" className="m-0 flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                {t(`admin.secondFactor.errors.${outcome}`)}
              </p>
            )}
            {outcome === "verified" && (
              <p role="status" className="m-0 text-[length:var(--text-body-sm)] text-[var(--status-success-fg)]">
                {t("admin.secondFactor.verified")}
              </p>
            )}

            <FormField label={t("admin.secondFactor.code")} required error={submitted ? codeError : undefined}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="gt-admin-field tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={busy}
                />
              )}
            </FormField>

            <AdminButton type="submit" variant="primary" loading={outcome === "verifying"} disabled={busy} fullWidth>
              {t("admin.secondFactor.submit")}
            </AdminButton>
          </form>
        )}

        <p className="m-0 mt-5 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.secondFactor.lostDevice")}</p>
        <AdminButton variant="ghost" onClick={leave} className="mt-2">
          {t("admin.secondFactor.signOut")}
        </AdminButton>
      </section>
    </div>
  );
}
