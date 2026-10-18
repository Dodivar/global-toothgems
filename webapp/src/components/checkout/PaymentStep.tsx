"use client";

import { useTranslation } from "react-i18next";
import posthog from "posthog-js";
import type { StripeCheckoutContact } from "@stripe/stripe-js";
import { Link, useNavigate } from "../../lib/navigation";
import type { PaymentStep as PaymentStepData } from "../../lib/checkout/api";
import { StripePaymentForm } from "./StripePaymentForm";

/**
 * The payment form of our checkout page: the shared Stripe form
 * (`StripePaymentForm`) mounted from the Checkout Session that
 * `create-checkout-session` opened for the order.
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <StripePaymentForm
      clientSecret={payment.clientSecret}
      publishableKey={payment.publishableKey}
      expiresAt={payment.expiresAt}
      locale={locale}
      payLabel={t("checkout.payment.pay", { amount: amountLabel })}
      billing={billing}
      onSubmit={() => posthog.capture("payment_submitted", { amount_due: payment.amountDue, currency: payment.currency })}
      // Paid without leaving the page (cards, wallets): the confirmation page reads the
      // order's state, which only the verified webhook turns into "paid".
      onPaid={(sessionId) => navigate(`/panier/confirmation?session_id=${encodeURIComponent(sessionId)}`, { replace: true })}
      onRestart={onRestart}
      footer={
        <p className="m-0 text-center text-xs leading-relaxed text-[var(--text-muted)]">
          {t("checkout.payment.consentBefore")}{" "}
          <Link to="/conditions-generales" target="_blank" className="underline decoration-1 underline-offset-2 hover:text-[var(--text-primary)]">
            {t("checkout.payment.consentLink")}
          </Link>
          {t("checkout.payment.consentAfter")}
        </p>
      }
    />
  );
}
