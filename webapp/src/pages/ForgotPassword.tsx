import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, KeyRound, MailCheck, Pencil, RotateCw, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/register/Field";
import { AuthShell, StateHeading } from "../components/security/AuthShell";
import { Notice } from "../components/security/Notice";
import { MockInbox } from "../components/security/MockInbox";
import { DemoControls, DemoNote, RadioPills } from "../components/security/DemoControls";
import {
  LINK_TOKENS,
  RESET_LINK_MINUTES,
  RESET_PATH,
  formatCountdown,
  isEmail,
  requestPasswordReset,
  useCooldown,
  type ResetLinkState,
  type ServiceOutcome,
} from "../lib/accountSecurity";
import { suggestEmail } from "../lib/registration";

type Phase = "form" | "sent";
type SendFailure = null | "first" | "resend";

const OUTCOMES: ServiceOutcome[] = ["success", "serverError"];
const LINKS: ResetLinkState[] = ["valid", "expired", "invalid"];
const TOKEN_FOR: Record<ResetLinkState, string> = {
  valid: LINK_TOKENS.valid,
  expired: LINK_TOKENS.expired,
  invalid: LINK_TOKENS.invalid,
};

/**
 * "Forgot your password?", at `/mot-de-passe-oublie`.
 *
 * Two states on one screen: the request (email, validation, sending, server
 * error) and the confirmation (check your inbox, resend behind a cooldown, use
 * another address). The confirmation is worded so it stays true whether or not
 * an account exists for the address — telling a stranger which emails are
 * customers would be a leak — and it carries a mock inbox whose button opens
 * the reset page, so the whole journey can be walked end to end.
 *
 * The address may arrive prefilled from the login or registration screen, in
 * history state, so the visitor never types it twice.
 */
export function ForgotPassword() {
  const { t } = useTranslation();
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [phase, setPhase] = useState<Phase>("form");
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<SendFailure>(null);
  const [resent, setResent] = useState(false);
  const [outcome, setOutcome] = useState<ServiceOutcome>("success");
  const [linkState, setLinkState] = useState<ResetLinkState>("valid");
  const cooldown = useCooldown();

  const headingRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const error = touched ? (!email.trim() ? t("register.errors.emailRequired") : !isEmail(email) ? t("register.errors.emailInvalid") : null) : null;
  const suggestion = suggestEmail(email);

  // Focus follows the state change, so a screen reader hears the new heading.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    if (phase === "sent") headingRef.current?.focus();
    else emailRef.current?.focus();
  }, [phase]);

  const send = async (resend: boolean) => {
    setSending(true);
    setFailure(null);
    setResent(false);
    try {
      await requestPasswordReset(email, outcome);
      setSending(false);
      cooldown.start();
      if (resend) setResent(true);
      setPhase("sent");
    } catch {
      setSending(false);
      setFailure(resend ? "resend" : "first");
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setTouched(true);
    if (!email.trim() || !isEmail(email)) {
      emailRef.current?.focus();
      return;
    }
    void send(false);
  };

  const demo = (
    <DemoControls summary={`${t(`security.demo.outcome.${outcome}`)} · ${t(`security.demo.resetLink.${linkState}`)}`}>
      <DemoNote>{t("security.forgot.demoBody")}</DemoNote>
      <RadioPills
        name="gt-forgot-outcome"
        legend={t("security.demo.outcomeLegend")}
        options={OUTCOMES}
        value={outcome}
        onChange={setOutcome}
        labelFor={(v) => t(`security.demo.outcome.${v}`)}
      />
      <RadioPills
        name="gt-forgot-link"
        legend={t("security.demo.resetLinkLegend")}
        options={LINKS}
        value={linkState}
        onChange={setLinkState}
        labelFor={(v) => t(`security.demo.resetLink.${v}`)}
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

  if (phase === "sent") {
    const locked = cooldown.left > 0;
    return (
      <AuthShell demo={demo}>
        <StateHeading icon={MailCheck} tone="brand" title={t("security.forgot.sentTitle")} headingRef={headingRef}>
          <p>{t("security.forgot.sentBody")}</p>
          <p>
            <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-[var(--surface-brand-wash)] px-3 py-1 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              <span className="sr-only">{t("security.forgot.sentTo")} </span>
              <span className="truncate font-semibold text-[var(--text-primary)]">{email.trim()}</span>
            </span>
          </p>
          <p className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("security.forgot.sentSpam")}</p>
        </StateHeading>

        <div role="status" aria-live="polite" className="empty:hidden">
          {resent && (
            <Notice tone="success" title={t("security.forgot.resentTitle")}>
              {t("security.forgot.resentBody")}
            </Notice>
          )}
        </div>
        {failure === "resend" && (
          <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
            {t("security.forgot.resendFailed")}
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            fullWidth
            iconLeft={sending ? undefined : RotateCw}
            loading={sending}
            aria-disabled={locked || sending}
            onClick={() => {
              if (!locked && !sending) void send(true);
            }}
            className={clsx(locked && "cursor-not-allowed opacity-60 hover:bg-transparent")}
          >
            {sending
              ? t("security.resending")
              : locked
                ? t("security.resendIn", { time: formatCountdown(cooldown.left) })
                : t("security.resend")}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            iconLeft={Pencil}
            onClick={() => {
              setResent(false);
              setFailure(null);
              setPhase("form");
            }}
          >
            {t("security.forgot.useOther")}
          </Button>
        </div>

        <MockInbox
          to={email.trim()}
          subject={t("security.forgot.mailSubject")}
          ctaLabel={t("security.forgot.mailCta")}
          href={`${RESET_PATH}?jeton=${TOKEN_FOR[linkState]}`}
          hint={t("security.forgot.mailHint", { minutes: RESET_LINK_MINUTES })}
        >
          <p>{t("security.forgot.mailBody")}</p>
        </MockInbox>

        <aside className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-4 text-[length:var(--text-caption)] leading-[1.55] text-[var(--text-body)]">
          <ShieldCheck size={17} aria-hidden="true" className="mt-[1px] flex-none text-[var(--gt-blue-700)]" />
          <div className="grid gap-1">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("security.forgot.noteTitle")}</strong>
            <span>{t("security.forgot.noteBody", { minutes: RESET_LINK_MINUTES })}</span>
          </div>
        </aside>

        <div className="grid justify-items-center">{backToLogin}</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell demo={demo}>
      <StateHeading icon={KeyRound} tone="brand" eyebrow={t("security.forgot.eyebrow")} title={t("security.forgot.title")} headingRef={headingRef}>
        <p>{t("security.forgot.body")}</p>
      </StateHeading>

      {failure === "first" && (
        <Notice
          tone="error"
          live="alert"
          title={t("security.errors.serverTitle")}
          actions={
            <Button variant="dark" size="sm" iconLeft={RotateCw} onClick={() => void send(false)}>
              {t("security.tryAgain")}
            </Button>
          }
        >
          {t("security.forgot.failedBody")}
        </Notice>
      )}

      <form noValidate onSubmit={submit} className="grid gap-5">
        <TextField
          ref={emailRef}
          id="forgot-email"
          label={t("register.fields.email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("register.fields.emailPlaceholder")}
          value={email}
          disabled={sending}
          onChange={(e) => {
            setEmail(e.target.value);
            if (failure) setFailure(null);
          }}
          onBlur={() => email.trim() && setTouched(true)}
          error={error}
          success={touched && !error && !!email.trim()}
          hint={t("security.forgot.emailHint")}
          after={
            suggestion &&
            !error && (
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                {t("register.fields.didYouMean")}{" "}
                <button
                  type="button"
                  onClick={() => setEmail(suggestion)}
                  className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
                >
                  {suggestion}
                </button>
                ?
              </p>
            )
          }
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={sending}>
          {sending ? t("security.forgot.sending") : t("security.forgot.submit")}
        </Button>
      </form>

      <div className="grid justify-items-center gap-1 text-center">
        {backToLogin}
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("security.forgot.noAccount")}{" "}
          <Link to="/inscription" className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]">
            {t("security.forgot.createAccount")}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
