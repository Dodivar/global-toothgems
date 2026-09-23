import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, Clock, Home, Link2Off, MailCheck, RotateCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { AuthShell, StateHeading } from "../components/security/AuthShell";
import { Notice } from "../components/security/Notice";
import { MockInbox } from "../components/security/MockInbox";
import { SuccessMark } from "../components/security/SuccessMark";
import { DemoControls, DemoNote, RadioPills } from "../components/security/DemoControls";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { LINK_TOKENS, VERIFY_LINK_HOURS, confirmVerification, formatCountdown, sendVerification, useCooldown, verifyLink, verifyOutcomeOf, type ServiceOutcome, type VerifyOutcome } from "../lib/accountSecurity";
import { useAccountSecurity } from "../lib/securityState";

type Phase = "verifying" | VerifyOutcome;
type SendState = "idle" | "sending" | "sent" | "failed";

const OUTCOMES: VerifyOutcome[] = ["verified", "expired", "invalid", "alreadyVerified"];
const SEND_OUTCOMES: ServiceOutcome[] = ["success", "serverError"];
const TOKEN_FOR: Record<VerifyOutcome, string> = {
  verified: LINK_TOKENS.valid,
  expired: LINK_TOKENS.expired,
  invalid: LINK_TOKENS.invalid,
  alreadyVerified: LINK_TOKENS.alreadyVerified,
};

/**
 * Landing page for the link in a verification email, at
 * `/verifier-email?jeton=…` (`&type=changement` when the link confirms a new
 * address from the Security & privacy page).
 *
 * It opens on a short "verifying" state, then lands on one of four outcomes:
 * verified (a small celebration and the way into the account), expired (send
 * a new link), invalid (the link is incomplete or was already used) and
 * already verified (nothing left to do). Only the first two need the member to
 * act, and each state offers exactly one primary action.
 */
export function VerifyEmailLanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const token = params.get("jeton");
  const isChange = params.get("type") === "changement";
  const outcome = verifyOutcomeOf(token);
  const { signedIn, email: sessionEmail, updateProfile } = useAuth();
  const { pendingEmail, confirmEmailChange } = useAccountSecurity();
  const { showToast } = useToast();

  // Results are tagged with the link they belong to: a new link (from the demo
  // panel or the mock inbox) reads as "verifying" until its own result lands.
  const linkKey = `${token}|${isChange}`;
  const [result, setResult] = useState<{ key: string; phase: VerifyOutcome } | null>(null);
  const phase: Phase = result?.key === linkKey ? result.phase : "verifying";
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [send, setSend] = useState<{ key: string; state: SendState } | null>(null);
  const sendState: SendState = send?.key === linkKey ? send.state : "idle";
  const setSendState = (state: SendState) => setSend({ key: linkKey, state });
  const [sendOutcome, setSendOutcome] = useState<ServiceOutcome>("success");
  const cooldown = useCooldown();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A new address is confirmed once per visit, even if the effect re-runs.
  const applied = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void confirmVerification().then(() => {
      if (cancelled) return;
      if (outcome === "verified" && isChange && !applied.current) {
        applied.current = true;
        const next = confirmEmailChange();
        if (next) {
          updateProfile({ email: next });
          setConfirmedEmail(next);
        }
      }
      setResult({ key: linkKey, phase: outcome });
    });
    return () => {
      cancelled = true;
    };
  }, [linkKey, outcome, isChange, confirmEmailChange, updateProfile]);

  useEffect(() => {
    if (phase !== "verifying") headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const continueToAccount = () => {
    const target = isChange ? "/compte/securite" : "/compte";
    if (signedIn) navigate(target);
    else navigate("/connexion", { state: { from: target } });
  };

  const sendNew = async () => {
    if (sendState === "sending" || cooldown.left > 0) return;
    setSendState("sending");
    try {
      await sendVerification(sendOutcome);
      setSendState("sent");
      cooldown.start();
      showToast(t("security.verify.toastSentTitle"), t("security.verify.toastSentBody"));
    } catch {
      setSendState("failed");
    }
  };

  const demo = (
    <DemoControls summary={`${t(`security.demo.verify.${outcome}`)} · ${t(`security.demo.outcome.${sendOutcome}`)}`}>
      <DemoNote>{t("security.verify.demoBody")}</DemoNote>
      <RadioPills
        name="gt-verify-outcome"
        legend={t("security.demo.verifyLegend")}
        options={OUTCOMES}
        value={outcome}
        onChange={(v) => {
          const next = new URLSearchParams({ jeton: TOKEN_FOR[v] });
          if (isChange) next.set("type", "changement");
          setParams(next, { replace: true });
        }}
        labelFor={(v) => t(`security.demo.verify.${v}`)}
      />
      <RadioPills
        name="gt-verify-send"
        legend={t("security.demo.sendLegend")}
        options={SEND_OUTCOMES}
        value={sendOutcome}
        onChange={setSendOutcome}
        labelFor={(v) => t(`security.demo.outcome.${v}`)}
      />
    </DemoControls>
  );

  const backToLogin = (
    <Link
      to={signedIn ? "/compte" : "/connexion"}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      {t(signedIn ? "security.backToAccount" : "security.backToLogin")}
    </Link>
  );

  if (phase === "verifying") {
    return (
      <AuthShell demo={demo}>
        <div className="grid justify-items-center gap-5 py-2 text-center">
          <span aria-hidden="true" className="relative grid h-[72px] w-[72px] place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
            <MailCheck size={30} strokeWidth={1.6} />
            <span className="absolute inset-[-6px] animate-spin rounded-full border-2 border-transparent border-t-[var(--gt-blue-400)] motion-reduce:animate-none" />
          </span>
          <div className="grid gap-2">
            <h1 className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)]">{t("security.verify.verifyingTitle")}</h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("security.verify.verifyingBody")}</p>
          </div>
          {/* Indeterminate bar with a text alternative. */}
          <div role="status" className="grid w-full max-w-[280px] gap-2">
            <span aria-hidden="true" className="gt-skeleton block h-1.5 w-full rounded-full" />
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("security.verify.verifyingStatus")}</span>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (phase === "verified") {
    return (
      <AuthShell demo={demo}>
        <div className="grid justify-items-center gap-5 pt-2 text-center">
          <SuccessMark />
          <div className="grid gap-2">
            <span aria-hidden="true" className="gt-script text-[40px] leading-none text-[var(--gt-blue-400)]">
              {t("security.verify.script")}
            </span>
            <h1 ref={headingRef} tabIndex={-1} className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)] outline-none">
              {t("security.verify.successTitle")}
            </h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
              {isChange && confirmedEmail
                ? t("security.verify.successChangeBody", { email: confirmedEmail })
                : t("security.verify.successBody")}
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={continueToAccount}>
            {t("security.verify.continue")}
          </Button>
          <Button variant="ghost" fullWidth iconLeft={Home} onClick={() => navigate("/")}>
            {t("security.verify.home")}
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (phase === "alreadyVerified") {
    return (
      <AuthShell demo={demo}>
        <StateHeading icon={BadgeCheck} tone="success" title={t("security.verify.alreadyTitle")} headingRef={headingRef}>
          <p>{t("security.verify.alreadyBody")}</p>
        </StateHeading>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={continueToAccount}>
            {t("security.verify.continue")}
          </Button>
          <Button variant="ghost" fullWidth iconLeft={Home} onClick={() => navigate("/")}>
            {t("security.verify.home")}
          </Button>
        </div>
      </AuthShell>
    );
  }

  // Expired or invalid: the member needs a fresh link.
  const expired = phase === "expired";
  // Where the new link would go: the pending address for a change, else the session's.
  const recipient = (isChange ? pendingEmail : null) ?? sessionEmail ?? t("security.verify.yourAddress");
  const locked = cooldown.left > 0;

  return (
    <AuthShell demo={demo}>
      <StateHeading
        icon={expired ? Clock : Link2Off}
        tone="warning"
        title={t(expired ? "security.verify.expiredTitle" : "security.verify.invalidTitle")}
        headingRef={headingRef}
      >
        <p>{t(expired ? "security.verify.expiredBody" : "security.verify.invalidBody", { hours: VERIFY_LINK_HOURS })}</p>
      </StateHeading>

      <div role="status" aria-live="polite" className="empty:hidden">
        {sendState === "sent" && (
          <Notice tone="success" title={t("security.verify.sentTitle")}>
            {t("security.verify.sentBody")}
          </Notice>
        )}
      </div>
      {sendState === "failed" && (
        <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
          {t("security.verify.sendFailed")}
        </Notice>
      )}

      <div className="grid gap-2">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          iconLeft={sendState === "sending" ? undefined : RotateCw}
          loading={sendState === "sending"}
          aria-disabled={locked}
          onClick={() => void sendNew()}
          className={locked ? "cursor-not-allowed opacity-60 hover:bg-[var(--accent-cta)]" : undefined}
        >
          {sendState === "sending"
            ? t("security.sending")
            : locked
              ? t("security.resendIn", { time: formatCountdown(cooldown.left) })
              : t("security.verify.sendNew")}
        </Button>
        <div className="grid justify-items-center">{backToLogin}</div>
      </div>

      {sendState === "sent" && (
        <MockInbox
          to={recipient}
          subject={t("security.verify.mailSubject")}
          ctaLabel={t("security.verify.mailCta")}
          href={verifyLink(LINK_TOKENS.valid, isChange ? "changement" : "inscription")}
          hint={t("security.verify.mailHint", { hours: VERIFY_LINK_HOURS })}
        >
          <p>{t("security.verify.mailBody")}</p>
        </MockInbox>
      )}
    </AuthShell>
  );
}
