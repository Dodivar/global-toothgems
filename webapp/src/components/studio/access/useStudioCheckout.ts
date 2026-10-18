"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { startStudioSubscription } from "../../../lib/studioBilling";
import type { StudioCheckoutError, StudioPlanPrice } from "../../../lib/studioBillingMapping";
import { trackStudio } from "../../../lib/studioAnalytics";
import type { StudioBillingInterval, StudioPaidPlanId } from "../../../data/studio";

/**
 * Starting a Studio subscription: the plan button asks `create-studio-subscription`
 * for a Stripe Checkout and the browser goes there. Coming back
 * (`?subscription=success|canceled`) is handled by `StudioCheckoutReturn`.
 *
 * A note of the checkout is kept in the tab (plan, interval) so the return can
 * say which plan became active and report `studio_subscription_completed` once
 * the database — fed by the verified webhook — says the account is subscribed.
 */

export type StudioCheckoutSurface = "studio_locked" | "studio_page" | "studio_subscribe_page";

const PENDING_KEY = "gt-studio-checkout";

export interface PendingStudioCheckout {
  plan: StudioPaidPlanId;
  interval: StudioBillingInterval;
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
    /* storage blocked: the return still works, without the plan's name */
  }
}

export function useStudioCheckout(surface: StudioCheckoutSurface) {
  const { i18n } = useTranslation();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<StudioCheckoutError | null>(null);
  const lock = useRef(false);

  // Back from Stripe with the browser's back button (page restored from cache): the buttons work again.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      lock.current = false;
      setPending(null);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

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
      const locale = i18n.language?.startsWith("en") ? "en" : "fr";
      const answer = await startStudioSubscription(plan, interval, locale);
      if (answer.kind === "redirect") {
        trackStudio("studio_checkout_started", props);
        savePendingCheckout({ plan, interval, surface, startedAt: Date.now() });
        // Leaving for Stripe's page: the lock stays, so a second click cannot open a second checkout.
        window.location.assign(answer.url);
        return;
      }
      trackStudio("studio_checkout_failed", { ...props, reason: answer.error });
      setError(answer.error);
      setPending(null);
      lock.current = false;
    },
    [i18n.language, surface],
  );

  return { start, pending, error, clearError: () => setError(null) };
}
