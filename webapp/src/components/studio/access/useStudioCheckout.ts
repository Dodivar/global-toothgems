"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordStudioWithdrawalConsent, releaseStudioPaymentStep, startStudioSubscription } from "../../../lib/studioBilling";
import type { StudioCheckoutError, StudioConsentAnswer, StudioPayment, StudioPlanPrice } from "../../../lib/studioBillingMapping";
import { trackStudio } from "../../../lib/studioAnalytics";
import { useNavigate } from "../../../lib/navigation";
import { STUDIO_EDITOR_PATH } from "../../../lib/studioUrl";
import type { StudioBillingInterval, StudioPaidPlanId } from "../../../data/studio";

/**
 * Subscribing to the Studio on our own page: the plan button asks
 * `create-studio-subscription` for a payment step and the shop's payment form
 * opens in place of the plans (`StudioPaymentStep`). Before the payment is
 * confirmed, the request for immediate access ticked beside the form is
 * recorded (`recordConsent`). Once paid, the member is taken to the editor with
 * `?subscription=success`, handled by `useCheckoutReturn` (`StudioAccessGate`),
 * which waits for the verified webhook — as does a payment that had to leave
 * the page (3-D Secure redirect), whose `return_url` is the same address.
 *
 * A note of the checkout is kept in the tab (plan, interval) so the return can
 * say which plan became active and report `studio_subscription_completed` once
 * the database says the account is subscribed.
 */

export type StudioCheckoutSurface = "studio_locked" | "studio_page" | "studio_subscribe_page";

const PENDING_KEY = "gt-studio-checkout";

export interface PendingStudioCheckout {
  plan: StudioPaidPlanId;
  interval: StudioBillingInterval;
  surface: StudioCheckoutSurface;
  startedAt: number;
}

/** The payment step open for a plan. */
export interface StudioCheckoutStep {
  plan: StudioPaidPlanId;
  interval: StudioBillingInterval;
  payment: StudioPayment;
}

export function readPendingCheckout(): PendingStudioCheckout | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    const value = raw ? (JSON.parse(raw) as PendingStudioCheckout) : null;
    return value && typeof value.plan === "string" && typeof value.interval === "string" ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
}

function savePendingCheckout(value: PendingStudioCheckout) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    /* storage blocked: the return still works, without the plan's name */
  }
}

export function useStudioCheckout(surface: StudioCheckoutSurface) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<StudioCheckoutError | null>(null);
  const [step, setStep] = useState<StudioCheckoutStep | null>(null);
  const lock = useRef(false);
  const locale: "fr" | "en" = i18n.language?.startsWith("en") ? "en" : "fr";

  const start = useCallback(
    async (plan: StudioPaidPlanId, interval: StudioBillingInterval, price: StudioPlanPrice | null) => {
      if (lock.current) return;
      lock.current = true;
      setPending(`${plan}:${interval}`);
      setError(null);
      const props = {
        plan_id: plan,
        interval,
        price_minor: price?.amountMinor ?? null,
        currency: price?.currency ?? null,
        surface,
      };
      trackStudio("studio_subscription_cta_clicked", { ...props, checkout_available: true });
      const answer = await startStudioSubscription(plan, interval, locale);
      lock.current = false;
      setPending(null);
      if (answer.kind === "payment") {
        trackStudio("studio_checkout_started", props);
        savePendingCheckout({ plan, interval, surface, startedAt: Date.now() });
        setStep({ plan, interval, payment: answer.payment });
        return;
      }
      trackStudio("studio_checkout_failed", { ...props, reason: answer.error });
      setError(answer.error);
    },
    [locale, surface],
  );

  /** Back to the plans: the step's Stripe session is closed, nothing was charged. */
  const close = useCallback(() => {
    if (!step) return;
    void releaseStudioPaymentStep(step.payment.clientSecret);
    trackStudio("studio_checkout_canceled", { plan_id: step.plan, interval: step.interval, surface });
    clearPendingCheckout();
    setStep(null);
  }, [step, surface]);

  /** The session expired or the form could not load: a fresh step for the same plan. */
  const restart = useCallback(() => {
    if (!step) return;
    const { plan, interval, payment } = step;
    void releaseStudioPaymentStep(payment.clientSecret);
    setStep(null);
    void start(plan, interval, { plan, interval, amountMinor: payment.amountMinor, currency: payment.currency });
  }, [step, start]);

  const recordConsent = useCallback(
    (): Promise<StudioConsentAnswer> =>
      step ? recordStudioWithdrawalConsent(step.payment.clientSecret) : Promise.resolve({ kind: "error", error: "checkout_closed" }),
    [step],
  );

  /** Paid on the page: the editor waits for the webhook before opening. */
  const paid = useCallback(() => {
    navigate(`${STUDIO_EDITOR_PATH}?subscription=success`, { replace: true });
  }, [navigate]);

  return { start, pending, error, clearError: () => setError(null), step, close, restart, recordConsent, paid, locale };
}
