"use client";

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, CalendarClock, CircleAlert, CircleCheck, Clock, Gift, RotateCcw, Search, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge, type BadgeTone } from "../ui/Badge";
import { useAuth } from "../../lib/auth";
import { useFormat } from "../../lib/format";
import { isCaptchaConfigured, useTurnstile } from "../../lib/captcha/turnstile";
import { balanceCheckAvailable, checkBalanceAsMember, checkBalanceAsVisitor } from "../../lib/giftCards/balance";
import { type BalanceCard, type BalanceError, type BalanceStatus, normaliseBalanceCode } from "../../lib/giftCards/balanceMapping";

/**
 * "What is left on my gift card?" (decision 140): a code typed by the person, read by the
 * database. Members (signed in) go through check_gift_card_balance() with their session;
 * visitors through the Edge Function `gift-card-balance` (honeypot, Turnstile loaded once they
 * start typing). The code lives in this component's state only — never stored, never sent to
 * analytics (the field is excluded from session replay) — and the answer shows its last 4.
 *
 * The same markup renders on the server and on the first browser render: nothing here reads
 * the browser during render.
 */

const STATUS: Record<BalanceStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CircleCheck },
  used_up: { tone: "neutral", icon: Gift },
  expired: { tone: "warning", icon: Clock },
  cancelled: { tone: "error", icon: Ban },
};

type ScreenError = BalanceError | "not_found";

export function GiftCardBalanceCheck({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const { t, i18n } = useTranslation();
  const { signedIn } = useAuth();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<BalanceCard | null>(null);
  const [error, setError] = useState<ScreenError | null>(null);
  const available = balanceCheckAvailable();
  const captchaNeeded = available && isCaptchaConfigured && !signedIn;
  const { attach: attachCaptcha, token: captchaToken, reset: resetCaptcha, failed: captchaFailed } = useTurnstile(code !== "" && captchaNeeded, i18n.language?.startsWith("en") ? "en" : "fr");
  const Heading = headingLevel === 2 ? "h2" : "h3";

  async function submit() {
    if (busy) return;
    if (!normaliseBalanceCode(code)) {
      setError("invalid");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let token: string | null = null;
    if (captchaNeeded) {
      token = await captchaToken();
      if (!token) {
        setBusy(false);
        setError(captchaFailed ? "captcha_failed" : "captcha_required");
        return;
      }
    }
    const outcome = signedIn ? await checkBalanceAsMember(code) : await checkBalanceAsVisitor(code, { captcha: token, website });
    if (captchaNeeded) resetCaptcha();
    setBusy(false);
    if (outcome.kind === "found") {
      setCard(outcome.card);
      setCode("");
    } else {
      setError(outcome.kind === "not_found" ? "not_found" : outcome.error);
    }
  }

  function again() {
    setCard(null);
    setError(null);
    // The field comes back with the next render.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!available) {
    return (
      <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        <CircleAlert size={16} aria-hidden="true" />
        {t("promo.balance.unavailable")}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div aria-live="polite" className="contents">
        {card && <BalanceResult card={card} Heading={Heading} onAgain={again} />}
      </div>
      {!card && (
        <form
          noValidate
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={`${id}-code`} className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
              {t("promo.balance.codeLabel")}
            </span>
            <span className="flex flex-col gap-2 sm:flex-row">
              <input
                ref={inputRef}
                id={`${id}-code`}
                name="gift-card-code"
                // Excluded from analytics and session replay (decision 140): the code is a bearer credential.
                className="ph-no-capture h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 font-mono text-sm uppercase tracking-[0.08em] text-[var(--text-primary)] outline-none transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] aria-[invalid=true]:border-[var(--status-error-fg)]"
                placeholder="GT-XXXX-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                value={code}
                aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                aria-invalid={error === "invalid" || error === "not_found" ? true : undefined}
                onChange={(event) => {
                  setCode(event.target.value);
                  if (error) setError(null);
                }}
              />
              <Button type="submit" iconLeft={Search} loading={busy} disabled={busy}>
                {busy ? t("promo.balance.checking") : t("promo.balance.submit")}
              </Button>
            </span>
            <span id={`${id}-hint`} className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("promo.balance.codeHint")}
            </span>
          </label>
          {/* Honeypot: hidden from people and assistive technology. */}
          <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </label>
          </div>
          {/* Rendered for everyone (same markup on the server); Turnstile only draws here for a visitor who needs it. */}
          {isCaptchaConfigured && <div ref={attachCaptcha} className="empty:hidden" />}
          {error && (
            <p
              id={`${id}-error`}
              role="alert"
              className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-3 py-2 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]"
            >
              <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
              <span>{t(`promo.balance.errors.${error}`)}</span>
            </p>
          )}
          <p className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <ShieldCheck size={14} aria-hidden="true" className="flex-none" />
            {t("promo.balance.privacy")}
          </p>
        </form>
      )}
    </div>
  );
}

function BalanceResult({ card, Heading, onAgain }: { card: BalanceCard; Heading: "h2" | "h3"; onAgain: () => void }) {
  const { t } = useTranslation();
  const { formatMoney, formatDate } = useFormat();
  const status = STATUS[card.status];
  const expiry = !card.expiresAt
    ? t("promo.balance.noExpiry")
    : t(card.status === "expired" ? "promo.balance.expiredOn" : "promo.balance.validUntil", { date: formatDate(card.expiresAt) });

  return (
    <section
      aria-label={t("promo.balance.resultLabel", { last4: card.last4 })}
      className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-xs)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading className="m-0 font-mono text-[length:var(--text-body)] tracking-[0.08em] text-[var(--text-primary)]">
          <span className="sr-only">{t("promo.balance.resultLabel", { last4: card.last4 })}</span>
          <span aria-hidden="true">GT-••••-••••-{card.last4}</span>
        </Heading>
        <Badge tone={status.tone} icon={status.icon}>
          {t(`promo.balance.status.${card.status}`)}
        </Badge>
      </div>
      <div className="grid gap-1">
        <span className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
          {t("promo.balance.available")}
        </span>
        <strong className="text-[length:var(--text-h2)] leading-none text-[var(--text-primary)]">
          {formatMoney(card.balanceMinor, card.currency)}
        </strong>
      </div>
      <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
        <CalendarClock size={16} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
        {expiry}
      </p>
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`promo.balance.statusBody.${card.status}`)}</p>
      <div>
        <Button variant="outline" size="sm" iconLeft={RotateCcw} onClick={onAgain}>
          {t("promo.balance.again")}
        </Button>
      </div>
    </section>
  );
}
