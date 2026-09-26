import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, CircleCheck, Inbox, LifeBuoy, Pencil, RotateCw } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { useAuth, type ResendResult } from "../../lib/auth";
import { RESEND_COOLDOWN, maskEmail } from "../../lib/registration";

function formatCountdown(seconds: number) {
  return `0:${String(seconds).padStart(2, "0")}`;
}

/**
 * "Check your inbox" for a real account. Supabase Auth has already sent the
 * confirmation email when this opens; the link lands on `/confirmation-compte`.
 *
 * If the member opens the link in another tab of this browser, the session
 * reaches this tab too (supabase-js shares it through storage), and the journey
 * moves on to the welcome screen by itself.
 *
 * The address cannot be edited here: the account already exists under it. A
 * mistyped address means starting again, which is what the second button does.
 */
export function CheckInbox({
  email,
  redirectTo,
  headingRef,
  onVerified,
  onRestart,
}: {
  email: string;
  redirectTo: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onVerified: () => void;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const { signedIn, resendConfirmation } = useAuth();
  const [state, setState] = useState<"idle" | "sending" | ResendResult>("idle");
  // Supabase has just sent the first email, so the resend starts locked.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (signedIn) onVerified();
  }, [signedIn, onVerified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0 || state === "sending") return;
    setState("sending");
    const result = await resendConfirmation(email, redirectTo);
    setState(result);
    if (result === "sent") setCooldown(RESEND_COOLDOWN);
  };

  const locked = cooldown > 0;

  return (
    <div className="grid gap-6">
      <div className="grid justify-items-center gap-4 text-center">
        <span
          aria-hidden="true"
          className="gt-envelope relative grid h-[76px] w-[76px] place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]"
        >
          <Inbox size={32} strokeWidth={1.6} />
          <span className="gt-envelope-spark absolute -right-0.5 top-1 h-3 w-3 rotate-45 rounded-[2px] bg-[var(--gt-fuchsia-300)]" />
        </span>
        <div className="grid gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-[length:var(--text-h2)] outline-none">
            {t("register.verify.title")}
          </h2>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
            {t("register.verify.body")} <strong className="whitespace-nowrap text-[var(--text-primary)]">{maskEmail(email)}</strong>
          </p>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("register.verify.instruction")}</p>
        </div>
      </div>

      <div role="status" aria-live="polite" className="grid">
        {state === "sent" || state === "idle" ? (
          <p className="gt-field-message m-0 flex items-center justify-center gap-2 rounded-full bg-[var(--status-success-bg)] px-4 py-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-success-fg)]">
            <CircleCheck size={16} aria-hidden="true" />
            {t(state === "sent" ? "register.verify.resent" : "register.verify.sent")}
          </p>
        ) : state === "failed" || state === "rateLimited" ? (
          <p className="gt-field-message m-0 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-error-fg)]">
            <CircleAlert size={16} aria-hidden="true" />
            {t(state === "rateLimited" ? "login.resendRateLimited" : "login.resendFailed")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          fullWidth
          iconLeft={state === "sending" ? undefined : RotateCw}
          loading={state === "sending"}
          aria-disabled={locked || state === "sending"}
          onClick={() => void resend()}
          className={clsx(locked && "cursor-not-allowed opacity-60 hover:bg-transparent")}
        >
          {state === "sending"
            ? t("register.verify.resending")
            : locked
              ? t("register.verify.resendIn", { time: formatCountdown(cooldown) })
              : t("register.verify.resend")}
        </Button>
        <Button variant="ghost" fullWidth iconLeft={Pencil} onClick={onRestart}>
          {t("register.verify.wrongAddress")}
        </Button>
      </div>

      <aside className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-4 text-[length:var(--text-caption)] leading-[1.55] text-[var(--text-body)]">
        <LifeBuoy size={17} aria-hidden="true" className="mt-[1px] flex-none text-[var(--gt-blue-700)]" />
        <div className="grid gap-1">
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("register.verify.helpTitle")}</strong>
          <span>{t("register.verify.helpBody")}</span>
        </div>
      </aside>
    </div>
  );
}
