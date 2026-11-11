"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { Link } from "../lib/navigation";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { WithdrawalPanel } from "../components/withdrawal/WithdrawalPanel";
import { isCaptchaConfigured, useTurnstile } from "../lib/captcha/turnstile";
import { declareWithLink, fetchOptionsWithLink, requestWithdrawalLink, withdrawalAvailable } from "../lib/orderWithdrawal";
import type { DeclareError, WithdrawalOptions } from "../lib/orderWithdrawalMapping";
import { useHydrated } from "../lib/useHydrated";

/**
 * The withdrawal function for an order placed without an account
 * (`/fr/retours-remboursements/retractation`, decision 131).
 *
 *   1. the customer types the order number and the order's e-mail address;
 *      the answer is the same whether or not the order exists (no enumeration),
 *      and a link valid 48 hours is e-mailed to the ORDER's address;
 *   2. the link opens this page with its token in the fragment (`#t=…`, never
 *      sent to a server log): the declaration form, then the confirmation.
 *
 * Members are pointed to their order page. Server-rendered as the request form;
 * the fragment is read once hydrated.
 */

const TOKEN_IN_HASH = /(?:^#|&)t=([0-9a-f]{64})(?:&|$)/;

type View =
  | { kind: "request" }
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "ready"; token: string; options: WithdrawalOptions };

export function OrderWithdrawalGuest() {
  const { t } = useTranslation();
  const hydrated = useHydrated();
  const [view, setView] = useState<View>({ kind: "request" });

  useEffect(() => {
    const token = TOKEN_IN_HASH.exec(window.location.hash)?.[1];
    if (!token) return;
    setView({ kind: "loading" });
    void fetchOptionsWithLink(token).then((answer) => {
      if (answer.kind === "ok") setView({ kind: "ready", token, options: answer.options });
      else setView({ kind: answer.kind });
    });
  }, []);

  const reload = (token: string) =>
    void fetchOptionsWithLink(token).then((answer) => {
      if (answer.kind === "ok") setView({ kind: "ready", token, options: answer.options });
    });

  return (
    <main className="mx-auto grid w-full max-w-[720px] gap-6 px-4 py-[clamp(32px,6vw,64px)]">
      <header className="grid gap-2">
        <span className="gt-eyebrow">{t("withdrawal.guest.eyebrow")}</span>
        <h1 className="text-[length:var(--text-h2)]">{t("withdrawal.guest.title")}</h1>
        <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("withdrawal.guest.intro")}</p>
      </header>

      {view.kind === "loading" && (
        <p role="status" aria-busy="true" className="m-0 text-[var(--text-muted)]">
          {t("withdrawal.guest.loading")}
        </p>
      )}
      {view.kind === "invalid" && (
        <div role="alert" className="grid gap-3">
          <p className="m-0 text-[var(--status-error-fg)]">{t("withdrawal.guest.linkInvalid")}</p>
          <div>
            <Button variant="outline" onClick={() => setView({ kind: "request" })}>
              {t("withdrawal.guest.askAgain")}
            </Button>
          </div>
        </div>
      )}
      {view.kind === "error" && (
        <p role="alert" className="m-0 text-[var(--status-error-fg)]">
          {t("withdrawal.error.unavailable")}
        </p>
      )}
      {view.kind === "ready" && (
        <WithdrawalPanel
          options={view.options}
          onDeclare={(declaration) => declareWithLink(view.token, declaration)}
          onDeclared={() => reload(view.token)}
        />
      )}
      {view.kind === "request" && <LinkRequestForm disabled={hydrated && !withdrawalAvailable()} />}

      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t("withdrawal.guest.member")}{" "}
        <Link to="/compte/commandes" className="font-semibold underline underline-offset-4">
          {t("withdrawal.guest.memberLink")}
        </Link>
      </p>
    </main>
  );
}

function LinkRequestForm({ disabled }: { disabled: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<DeclareError | "missing" | null>(null);
  const engaged = orderNumber !== "" || email !== "";
  const { attach: attachCaptcha, token: captchaToken, reset: resetCaptcha, failed: captchaFailed } = useTurnstile(engaged && isCaptchaConfigured, lang);

  const submit = async () => {
    if (!orderNumber.trim() || !email.trim()) return setError("missing");
    setBusy(true);
    setError(null);
    let token: string | null = null;
    if (isCaptchaConfigured) {
      token = await captchaToken();
      if (!token) {
        setBusy(false);
        return setError(captchaFailed ? "captcha_failed" : "captcha_required");
      }
    }
    const answer = await requestWithdrawalLink({ orderNumber, email, locale: lang, captcha: token, website });
    resetCaptcha();
    setBusy(false);
    if (answer.kind === "sent") setSent(true);
    else setError(answer.error);
  };

  if (sent) {
    return (
      <div role="status" className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)]">
        <p className="m-0 flex items-center gap-2 font-semibold">
          <Mail size={16} aria-hidden="true" />
          {t("withdrawal.guest.sentTitle")}
        </p>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("withdrawal.guest.sentBody")}</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)]"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-[length:var(--text-h4)]">{t("withdrawal.guest.formTitle")}</h2>
      <Input
        label={t("withdrawal.guest.orderNumber")}
        id="withdrawal-order-number"
        placeholder="GT-100001"
        autoComplete="off"
        maxLength={40}
        value={orderNumber}
        onChange={(e) => setOrderNumber(e.target.value)}
      />
      <Input
        label={t("withdrawal.guest.email")}
        id="withdrawal-email"
        type="email"
        autoComplete="email"
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {/* Honeypot: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {isCaptchaConfigured && <div ref={attachCaptcha} className="empty:hidden" />}
      {error && (
        <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
          {error === "missing" ? t("withdrawal.guest.missing") : t(`withdrawal.error.${error}`, { defaultValue: t("withdrawal.error.unavailable") })}
        </p>
      )}
      <div>
        <Button type="submit" loading={busy} disabled={busy || disabled}>
          {t("withdrawal.guest.send")}
        </Button>
      </div>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("withdrawal.guest.privacy")}</p>
    </form>
  );
}
