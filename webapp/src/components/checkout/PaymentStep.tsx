"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import posthog from "posthog-js";
import { CheckoutProvider, PaymentElement, useCheckout } from "@stripe/react-stripe-js/checkout";
import type { StripeCheckoutContact } from "@stripe/stripe-js";
import { CircleAlert, Clock, Lock, RotateCcw } from "lucide-react";
import { Button } from "../ui/Button";
import { Link, useNavigate } from "../../lib/navigation";
import type { PaymentStep as PaymentStepData } from "../../lib/checkout/api";
import { loadStripeFor, STRIPE_FONTS, stripeAppearance } from "../../lib/checkout/stripe";

/**
 * The payment form of our checkout page: Stripe's Payment Element mounted from
 * the Checkout Session that `create-checkout-session` opened for the order.
 *
 * Loaded on demand (Cart imports it lazily): Stripe.js is fetched only here.
 * Confirming never marks anything paid: the customer is taken to the
 * confirmation page, which waits for the verified webhook.
 */

interface PaymentStepProps {
  payment: PaymentStepData;
  locale: "fr" | "en";
  /** Name and address the customer already gave: sent with the payment, so the form does not ask again. */
  billing: StripeCheckoutContact;
  /** Formatted amount due, for the button. */
  amountLabel: string;
  /** Opens a fresh payment step for the same basket (the session expired, or the form could not load). */
  onRestart: () => void;
}

export default function PaymentStep({ payment, locale, billing, amountLabel, onRestart }: PaymentStepProps) {
  const stripe = useMemo(() => loadStripeFor(payment.publishableKey, locale), [payment.publishableKey, locale]);
  // Stable for the session's life: the provider must not be given new options on each render.
  const options = useMemo(
    () => ({
      fetchClientSecret: () => Promise.resolve(payment.clientSecret),
      elementsOptions: { appearance: stripeAppearance(), fonts: STRIPE_FONTS, loader: "never" as const },
    }),
    [payment.clientSecret],
  );
  return (
    <CheckoutProvider key={payment.clientSecret} stripe={stripe} options={options}>
      <PaymentForm payment={payment} billing={billing} amountLabel={amountLabel} onRestart={onRestart} />
    </CheckoutProvider>
  );
}

/** One minute of margin: a payment started at the last second would be refused by Stripe. */
const EXPIRY_MARGIN_MS = 60_000;

function PaymentForm({ payment, billing, amountLabel, onRestart }: Omit<PaymentStepProps, "locale">) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useCheckout();
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const left = Math.max(0, payment.expiresAt - EXPIRY_MARGIN_MS - Date.now());
    const timer = window.setTimeout(() => setExpired(true), left);
    return () => window.clearTimeout(timer);
  }, [payment.expiresAt]);

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
    posthog.capture("payment_submitted", { amount_due: payment.amountDue, currency: payment.currency });
    const result = await checkout.confirm({ billingAddress: billing, redirect: "if_required" });
    if (result.type === "error") {
      // Stripe's buyer-facing message (card declined, authentication failed…), in the page's language.
      setError(result.error.message || t("checkout.payment.failed"));
      setPaying(false);
      return;
    }
    // Paid without leaving the page (cards, wallets): the confirmation page reads the
    // order's state, which only the verified webhook turns into "paid".
    navigate(`/panier/confirmation?session_id=${encodeURIComponent(result.session.id)}`, { replace: true });
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
                // Name and address come from the details step, sent with the payment.
                fields: { billingDetails: { name: "never", email: "never", address: "never" } },
              }}
              onReady={() => setReady(true)}
              onChange={() => setError(null)}
            />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-sm font-medium text-[var(--status-error-fg)]">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          {error}
        </p>
      )}

      <Button variant="primary" size="lg" fullWidth iconLeft={Lock} loading={paying} disabled={!checkout || !ready || paying} onClick={() => void pay()}>
        {paying ? t("checkout.payment.processing") : t("checkout.payment.pay", { amount: amountLabel })}
      </Button>

      <p className="m-0 text-center text-xs leading-relaxed text-[var(--text-muted)]">
        {t("checkout.payment.consentBefore")}{" "}
        <Link to="/conditions-generales" target="_blank" className="underline decoration-1 underline-offset-2 hover:text-[var(--text-primary)]">
          {t("checkout.payment.consentLink")}
        </Link>
        {t("checkout.payment.consentAfter")}
      </p>
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
  children: React.ReactNode;
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
