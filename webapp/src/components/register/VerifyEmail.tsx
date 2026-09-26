import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  CircleCheck,
  Clock,
  FlaskConical,
  Inbox,
  LifeBuoy,
  MailCheck,
  Pencil,
  RotateCw,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { TextField } from "./Field";
import {
  RESEND_COOLDOWN,
  checkEmailAvailable,
  maskEmail,
  sendVerificationEmail,
  validateField,
  verifyLink,
  EMPTY_REGISTRATION,
  type Scenario,
} from "../../lib/registration";
import monogram from "../../assets/monogram-blue.png";

type SendState = "sending" | "sent" | "failed" | "resending" | "resent";
type LinkState = "idle" | "verifying" | "expired" | "verified";

function formatCountdown(seconds: number) {
  return `0:${String(seconds).padStart(2, "0")}`;
}

/**
 * "Check your inbox" — the simulated verification step.
 *
 * Every state the real flow has is reachable here: sending, sent, send failed,
 * resend locked behind a countdown, resend available, resending, resent, link
 * expired, verified. There is no real email, so the screen carries a clearly
 * labelled mock inbox holding the latest message; its button stands in for the
 * link, and the demo scenario decides whether that link has expired.
 */
export function VerifyEmail({
  email,
  firstName,
  scenario,
  onEmailChange,
  onVerified,
  headingRef,
}: {
  email: string;
  firstName: string;
  scenario: Scenario;
  onEmailChange: (email: string) => void;
  onVerified: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useTranslation();
  const [sendState, setSendState] = useState<SendState>("sending");
  const [attempt, setAttempt] = useState(1);
  /** Number of the newest link actually delivered. */
  const [linkNumber, setLinkNumber] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [linkState, setLinkState] = useState<LinkState>("idle");
  const [changeOpen, setChangeOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (attemptNumber: number, resend: boolean) => {
      setSendState(resend ? "resending" : "sending");
      try {
        await sendVerificationEmail(scenario, attemptNumber);
        if (!mounted.current) return;
        setLinkNumber((n) => n + 1);
        setSendState(resend ? "resent" : "sent");
        setCooldown(RESEND_COOLDOWN);
        setLinkState("idle");
      } catch {
        if (!mounted.current) return;
        setSendState("failed");
      }
    },
    [scenario],
  );

  // First send, once, when the screen opens.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send(1, false);
  }, [send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((c) => c - 1);
      if (cooldown === 1) setAnnouncement(t("register.verify.resendReady"));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown, t]);

  const resend = (force = false) => {
    if (!force && (cooldown > 0 || sendState === "resending" || sendState === "sending")) return;
    const next = attempt + 1;
    setAttempt(next);
    setAnnouncement("");
    void send(next, true);
  };

  const openLink = async () => {
    setLinkState("verifying");
    const result = await verifyLink(scenario, linkNumber);
    if (!mounted.current) return;
    setLinkState(result);
    if (result === "verified") {
      setTimeout(() => mounted.current && onVerified(), 1100);
    }
  };

  const busy = sendState === "sending" || sendState === "resending";
  const locked = cooldown > 0;

  return (
    <div className="grid gap-6">
      <div className="grid justify-items-center gap-4 text-center">
        <span aria-hidden="true" className="gt-envelope relative grid h-[76px] w-[76px] place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
          {linkState === "verified" ? <MailCheck size={32} strokeWidth={1.6} /> : <Inbox size={32} strokeWidth={1.6} />}
          <span className="gt-envelope-spark absolute -right-0.5 top-1 h-3 w-3 rotate-45 rounded-[2px] bg-[var(--gt-fuchsia-300)]" />
        </span>
        <div className="grid gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-[length:var(--text-h2)] outline-none">
            {t("register.verify.title")}
          </h2>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
            {t("register.verify.body")}{" "}
            <strong className="whitespace-nowrap text-[var(--text-primary)]">{maskEmail(email)}</strong>
          </p>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("register.verify.instruction")}</p>
        </div>
      </div>

      {/* Status line. One live region for the whole send lifecycle. */}
      <div role="status" aria-live="polite" className="grid">
        {sendState === "sending" && (
          <p className="gt-field-message m-0 flex items-center justify-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            <RotateCw size={15} aria-hidden="true" className="animate-spin" />
            {t("register.verify.sending")}
          </p>
        )}
        {(sendState === "sent" || sendState === "resent") && linkState !== "expired" && linkState !== "verified" && (
          <p className="gt-field-message m-0 flex items-center justify-center gap-2 rounded-full bg-[var(--status-success-bg)] px-4 py-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-success-fg)]">
            <CircleCheck size={16} aria-hidden="true" />
            {t(sendState === "resent" ? "register.verify.resent" : "register.verify.sent")}
          </p>
        )}
        {linkState === "verified" && (
          <p className="gt-field-message m-0 flex items-center justify-center gap-2 rounded-full bg-[var(--status-success-bg)] px-4 py-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-success-fg)]">
            <CircleCheck size={16} aria-hidden="true" />
            {t("register.verify.verified")}
          </p>
        )}
        <span className="sr-only">{announcement}</span>
      </div>

      {sendState === "failed" && (
        <div role="alert" className="gt-field-message grid gap-3 rounded-[var(--radius-md)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4">
          <p className="m-0 flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
            <CircleAlert size={17} aria-hidden="true" className="mt-[1px] flex-none" />
            <span>
              <strong className="block">{t("register.verify.failedTitle")}</strong>
              {t("register.verify.failedBody")}
            </span>
          </p>
          <div className="flex flex-wrap gap-2 pl-[26px]">
            <Button variant="dark" size="sm" iconLeft={RotateCw} onClick={() => resend(true)}>
              {t("register.verify.tryAgain")}
            </Button>
            <Button variant="ghost" size="sm" iconLeft={Pencil} onClick={() => setChangeOpen(true)}>
              {t("register.verify.changeEmail")}
            </Button>
          </div>
        </div>
      )}

      {linkState === "expired" && (
        <div role="alert" className="gt-field-message grid gap-3 rounded-[var(--radius-md)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-4">
          <p className="m-0 flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--status-warning-fg)]">
            <Clock size={17} aria-hidden="true" className="mt-[1px] flex-none" />
            <span>
              <strong className="block text-[var(--gt-ink-900)]">{t("register.verify.expiredTitle")}</strong>
              <span className="text-[var(--text-body)]">{t("register.verify.expiredBody")}</span>
            </span>
          </p>
          <div className="pl-[26px]">
            <Button variant="dark" size="sm" iconLeft={RotateCw} loading={busy} onClick={() => resend(true)}>
              {t("register.verify.sendNewLink")}
            </Button>
          </div>
        </div>
      )}

      {sendState !== "failed" && linkState !== "verified" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            fullWidth
            iconLeft={busy ? undefined : RotateCw}
            loading={sendState === "resending"}
            aria-disabled={locked || busy}
            onClick={() => resend()}
            className={clsx(locked && "cursor-not-allowed opacity-60 hover:bg-transparent")}
          >
            {sendState === "resending"
              ? t("register.verify.resending")
              : locked
                ? t("register.verify.resendIn", { time: formatCountdown(cooldown) })
                : t("register.verify.resend")}
          </Button>
          <Button variant="ghost" fullWidth iconLeft={Pencil} onClick={() => setChangeOpen(true)}>
            {t("register.verify.changeEmail")}
          </Button>
        </div>
      )}

      {/* Mock inbox: the prototype's stand-in for the real email. */}
      {linkNumber > 0 && linkState !== "verified" && (
        <section
          aria-labelledby="gt-mock-inbox-title"
          className="grid gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] p-3.5 sm:p-4"
        >
          <h3 id="gt-mock-inbox-title" className="gt-eyebrow flex items-center gap-2 text-[var(--text-muted)]">
            <FlaskConical size={13} aria-hidden="true" />
            {t("register.verify.mockInbox")}
          </h3>
          <article className="grid gap-3 rounded-[var(--radius-md)] bg-white p-4 shadow-[var(--shadow-sm)]">
            <header className="flex items-center gap-3">
              <img src={monogram} alt="" className="h-9 w-9 rounded-full bg-[var(--gt-ink-900)] object-contain p-1.5" />
              <div className="grid min-w-0 flex-1">
                <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">Global Toothgems</strong>
                <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("register.verify.mailTo", { email })}
                </span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">{t("register.verify.mailNow")}</span>
            </header>
            <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
              {t("register.verify.mailSubject")}
              {linkNumber > 1 && <span className="font-normal text-[var(--text-muted)]"> · {t("register.verify.mailNewLink")}</span>}
            </p>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              {t("register.verify.mailBody", { name: firstName || t("register.verify.mailFallbackName") })}
            </p>
            <div>
              <Button variant="primary" size="sm" loading={linkState === "verifying"} onClick={openLink}>
                {linkState === "verifying" ? t("register.verify.verifying") : t("register.verify.mailCta")}
              </Button>
            </div>
            <p className="m-0 text-[11px] text-[var(--text-muted)]">
              {t(scenario === "linkExpired" && linkNumber === 1 ? "register.verify.mailHintExpired" : "register.verify.mailHint")}
            </p>
          </article>
        </section>
      )}

      <aside className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-4 text-[length:var(--text-caption)] leading-[1.55] text-[var(--text-body)]">
        <LifeBuoy size={17} aria-hidden="true" className="mt-[1px] flex-none text-[var(--gt-blue-700)]" />
        <div className="grid gap-1">
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("register.verify.helpTitle")}</strong>
          <span>{t("register.verify.helpBody")}</span>
        </div>
      </aside>

      {changeOpen && (
        <ChangeEmailDialog
        current={email}
        onClose={() => setChangeOpen(false)}
        onSave={(next) => {
          setChangeOpen(false);
          onEmailChange(next);
          setLinkState("idle");
          const nextAttempt = attempt + 1;
          setAttempt(nextAttempt);
          void send(nextAttempt, true);
        }}
      />
      )}
    </div>
  );
}

/**
 * Correcting a mistyped address without restarting the whole journey. Mounted
 * only while open, so every opening starts from the current address.
 */
function ChangeEmailDialog({
  current,
  onClose,
  onSave,
}: {
  current: string;
  onClose: () => void;
  onSave: (email: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const formatError = validateField("email", { ...EMPTY_REGISTRATION, email: value });
    if (formatError) return setError(t(formatError));
    if (value.trim().toLowerCase() === current.toLowerCase()) return setError(t("register.errors.emailSame"));
    setChecking(true);
    const available = await checkEmailAvailable(value);
    setChecking(false);
    if (!available) return setError(t("register.errors.emailTaken"));
    onSave(value.trim());
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("register.verify.changeTitle")}
      description={t("register.verify.changeBody")}
      icon={<Pencil size={16} />}
      closeLabel={t("common.close")}
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        <TextField
          label={t("register.fields.email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          error={error}
          loading={checking}
          loadingLabel={t("register.checkingEmail")}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={checking}>
            {t("register.verify.changeSubmit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
