"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckoutProvider, PaymentElement, useCheckout } from "@stripe/react-stripe-js/checkout";
import type { StripeCheckoutContact } from "@stripe/stripe-js";
import { CircleAlert, Clock, Lock, RotateCcw } from "lucide-react";
import { Button } from "../ui/Button";
import { loadStripeFor, STRIPE_FONTS, stripeAppearance } from "../../lib/checkout/stripe";

/**
 * The site's payment form: Stripe's Payment Element mounted from a Checkout
 * Session in `custom` ui mode, on our own page. Shared by the shop's checkout
 * (`PaymentStep`) and the 3D Studio subscription (`StudioPaymentStep`), so both
 * pay through the same form, look and states.
 *
 * Import it lazily: Stripe.js is fetched only once the form is shown.
 * Confirming never grants anything: what was paid is known from the verified
 * webhook, which the page the payer is taken to waits for.
 */

export interface StripePaymentFormProps {
  clientSecret: string;
  publishableKey: string;
  /** When the session stops accepting a payment (ms since epoch). */
  expiresAt: number;
  locale: "fr" | "en";
  /** The pay button's words (with the amount). */
  payLabel: string;
  /**
   * Name and address the payer already gave: sent with the payment, so the
   * form does not ask again. Without it, the Payment Element asks what the
   * payment method needs.
   */
  billing?: StripeCheckoutContact;
  /**
   * Runs when Pay is pressed, before the payment is confirmed: `false` stops
   * there (the caller says why). Used by the Studio to record the request for
   * immediate access first.
   */
  beforeConfirm?: () => Promise<boolean>;
  /** Pay was pressed and will be confirmed (analytics). */
  onSubmit?: () => void;
  /** Paid without leaving the page (cards, wallets). */
  onPaid: (sessionId: string) => void;
  /** Opens a fresh payment step (the session expired, or the form could not load). */
  onRestart: () => void;
  /** Shown between the form and the pay button. */
  children?: ReactNode;
  /** Shown under the pay button. */
  footer?: ReactNode;
}

export function StripePaymentForm(props: StripePaymentFormProps) {
  const { clientSecret, publishableKey, locale } = props;
  const stripe = useMemo(() => loadStripeFor(publishableKey, locale), [publishableKey, locale]);
  // Stable for the session's life: the provider must not be given new options on each render.
  const options = useMemo(
    () => ({
      fetchClientSecret: () => Promise.resolve(clientSecret),
      elementsOptions: { appearance: stripeAppearance(), fonts: STRIPE_FONTS, loader: "never" as const },
    }),
    [clientSecret],
  );
  return (
    <CheckoutProvider key={clientSecret} stripe={stripe} options={options}>
      <PaymentForm {...props} />
    </CheckoutProvider>
  );
}

/** One minute of margin: a payment started at the last second would be refused by Stripe. */
const EXPIRY_MARGIN_MS = 60_000;

function PaymentForm({ expiresAt, payLabel, billing, beforeConfirm, onSubmit, onPaid, onRestart, children, footer }: StripePaymentFormProps) {
  const { t } = useTranslation();
  const state = useCheckout();
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const left = Math.max(0, expiresAt - EXPIRY_MARGIN_MS - Date.now());
    const timer = window.setTimeout(() => setExpired(true), left);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  if (expired && !paying) {
    return (
      <Notice icon={Clock} title={t("checkout.payment.expiredTitle")} body={t("checkout.payment.expiredBody")}>
        <Button variant="outline" iconLeft={RotateCcw} onClick={onRestart}>{t("checkout.payment.restart")}</Button>
      </Notice>
    );
  }

  if (state.type === "error") {
    return (
      <Notice icon={CircleAlert} title={t("checkout.payment.loadErrorTitle")} body={t("checkout.payment.loadError")} tone="error">
        <Button variant="outline" iconLeft={RotateCcw} onClick={onRestart}>{t("checkout.payment.restart")}</Button>
      </Notice>
    );
  }

  const checkout = state.type === "success" ? state.checkout : null;

  const pay = async () => {
    if (!checkout || paying) return;
    setPaying(true);
    setError(null);
    if (beforeConfirm) {
      // It may change the session on the server (metadata): Stripe.js re-reads it before confirming.
      let allowed = false;
      const synced = await checkout.runServerUpdate(async () => {
        allowed = await beforeConfirm();
      });
      if (!allowed || synced.type === "error") {
        if (allowed && synced.type === "error") setError(synced.error.message || t("checkout.payment.failed"));
        setPaying(false);
        return;
      }
    }
    onSubmit?.();
    const result = await checkout.confirm(billing ? { billingAddress: billing, redirect: "if_required" } : { redirect: "if_required" });
    if (result.type === "error") {
      // Stripe's buyer-facing message (card declined, authentication failed…), in the page's language.
      setError(result.error.message || t("checkout.payment.failed"));
      setPaying(false);
      return;
    }
    onPaid(result.session.id);
  };

  const showSkeleton = !checkout || !ready;

  return (
    <div className="grid gap-5">
      <div className="relative min-h-[236px]">
        {showSkeleton && (
          <div role="status" aria-live="polite" className="absolute inset-0 grid content-start gap-4">
            <span className="sr-only">{t("checkout.payment.loading")}</span>
            <div className="gt-skeleton h-[60px] rounded-[var(--radius-md)]" aria-hidden="true" />
            <div className="gt-skeleton h-[46px] rounded-[var(--radius-pill)]" aria-hidden="true" />
            <div className="grid grid-cols-2 gap-3" aria-hidden="true">
              <div className="gt-skeleton h-[46px] rounded-[var(--radius-pill)]" />
              <div className="gt-skeleton h-[46px] rounded-[var(--radius-pill)]" />
            </div>
          </div>
        )}
        {checkout && (
          <div className={showSkeleton ? "opacity-0" : "gt-step-in"}>
            <PaymentElement
              options={{
                layout: { type: "accordion", defaultCollapsed: false, radios: true, spacedAccordionItems: true },
                // Name and address given earlier are sent with the payment.
                ...(billing ? { fields: { billingDetails: { name: "never", email: "never", address: "never" } } } : {}),
              }}
              onReady={() => setReady(true)}
              onChange={() => setError(null)}
            />
          </div>
        )}
      </div>

      {children}

      {error && (
        <p role="alert" className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-sm font-medium text-[var(--status-error-fg)]">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          {error}
        </p>
      )}

      <Button variant="primary" size="lg" fullWidth iconLeft={Lock} loading={paying} disabled={!checkout || !ready || paying} onClick={() => void pay()}>
        {paying ? t("checkout.payment.processing") : payLabel}
      </Button>

      {footer}
    </div>
  );
}

function Notice({
  icon: Icon,
  title,
  body,
  tone = "neutral",
  children,
}: {
  icon: typeof Clock;
  title: string;
  body: string;
  tone?: "neutral" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`grid justify-items-start gap-3 rounded-[var(--radius-md)] p-5 ${
        tone === "error" ? "bg-[var(--status-error-bg)]" : "bg-[var(--surface-brand-wash)]"
      }`}
    >
      <p className={`m-0 flex items-center gap-2 text-sm font-semibold ${tone === "error" ? "text-[var(--status-error-fg)]" : "text-[var(--text-primary)]"}`}>
        <Icon size={16} aria-hidden="true" className="flex-none" />
        {title}
      </p>
      <p className="m-0 text-sm text-[var(--text-body)]">{body}</p>
      {children}
    </div>
  );
}
