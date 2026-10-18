"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordStudioWithdrawalConsent, releaseStudioPaymentStep, startStudioSubscription } from "../../../lib/studioBilling";
import type { StudioCheckoutError, StudioConsentAnswer, StudioPayment } from "../../../lib/studioBillingMapping";
import { trackStudio } from "../../../lib/studioAnalytics";
import type { StudioCheckoutQuery, StudioCheckoutSurface } from "../../../lib/studioUrl";

/**
 * The Studio subscription's checkout page (`/studio-3d/paiement`,
 * `screens/StudioCheckout.tsx`): it asks `create-studio-subscription` for a
 * payment step and the shop's payment form opens (`StudioPaymentStep`). Before
 * the payment is confirmed, the request for immediate access ticked beside the
 * form is recorded (`recordConsent`). Once paid, the page opens the editor with
 * `?subscription=success`, handled by `useCheckoutReturn` (`StudioAccessGate`),
 * which waits for the verified webhook — as does a payment that had to leave
 * the page (3-D Secure redirect), whose `return_url` is the same address.
 *
 * A note of the checkout is kept in the tab (plan, interval) so the return can
 * report `studio_subscription_completed` with the surface the plan was chosen on.
 */

export type { StudioCheckoutSurface };

const PENDING_KEY = "gt-studio-checkout";

export interface PendingStudioCheckout {
  plan: StudioCheckoutQuery["plan"];
  interval: StudioCheckoutQuery["interval"];
  surface: StudioCheckoutSurface;
  startedAt: number;
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
    /* storage blocked: the return still works, without the surface */
  }
}

export function useStudioCheckout({ plan, interval, surface }: StudioCheckoutQuery) {
  const { i18n } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<StudioCheckoutError | null>(null);
  const [payment, setPayment] = useState<StudioPayment | null>(null);
  const lock = useRef(false);
  const locale: "fr" | "en" = i18n.language?.startsWith("en") ? "en" : "fr";

  /** Opens a payment step for the page's plan (again, after an expiry or once the terms are accepted). */
  const open = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setOpening(true);
    setError(null);
    setPayment(null);
    const answer = await startStudioSubscription(plan, interval, locale);
    lock.current = false;
    setOpening(false);
    const props = {
      plan_id: plan,
      interval,
      price_minor: answer.kind === "payment" ? answer.payment.amountMinor : null,
      currency: answer.kind === "payment" ? answer.payment.currency : null,
      surface,
    };
    if (answer.kind === "payment") {
      trackStudio("studio_checkout_started", props);
      savePendingCheckout({ plan, interval, surface, startedAt: Date.now() });
      setPayment(answer.payment);
      return;
    }
    trackStudio("studio_checkout_failed", { ...props, reason: answer.error });
    setError(answer.error);
  }, [plan, interval, surface, locale]);

  /** The member leaves for the plans: the step's Stripe session is closed, nothing was charged. */
  const leave = useCallback(() => {
    if (!payment) return;
    void releaseStudioPaymentStep(payment.clientSecret);
    trackStudio("studio_checkout_canceled", { plan_id: plan, interval, surface });
    clearPendingCheckout();
  }, [payment, plan, interval, surface]);

  /** The session expired or the form could not load: a fresh step for the same plan. */
  const restart = useCallback(() => {
    if (payment) void releaseStudioPaymentStep(payment.clientSecret);
    void open();
  }, [payment, open]);

  const recordConsent = useCallback(
    (): Promise<StudioConsentAnswer> =>
      payment ? recordStudioWithdrawalConsent(payment.clientSecret) : Promise.resolve({ kind: "error", error: "checkout_closed" }),
    [payment],
  );

  return { open, opening, error, payment, leave, restart, recordConsent, locale };
}
