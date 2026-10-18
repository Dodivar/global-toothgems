"use client";

import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase/client";
import {
  mapPlanPriceRows,
  readStudioCheckoutAnswer,
  readStudioPortalAnswer,
  type StudioCheckoutAnswer,
  type StudioPlanPrice,
  type StudioPortalAnswer,
} from "./studioBillingMapping";
import type { StudioBillingInterval, StudioPaidPlanId } from "../data/studio";

/**
 * The persistence boundary of 3D Studio subscriptions (decision 94): the plan
 * prices (`studio_plan_prices`, public), the subscription Checkout
 * (`create-studio-subscription`) and the customer portal
 * (`studio-billing-portal`). Nothing here grants access: the Studio opens when
 * the verified webhook has mirrored the subscription, which `studioAccess.tsx`
 * reads back from the database.
 */

export async function fetchStudioPlanPrices(): Promise<StudioPlanPrice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("studio_plan_prices").select("plan, billing_interval, amount, currency");
  if (error) throw new Error("studio_plan_prices unavailable");
  return mapPlanPriceRows(data);
}

/**
 * The live plan prices, read once in the browser (never during render, so the
 * server and the first browser render show the same display values). `null`
 * until read, or when there is no database (mock mode).
 */
export function useStudioPlanPrices(): StudioPlanPrice[] | null {
  const [prices, setPrices] = useState<StudioPlanPrice[] | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    fetchStudioPlanPrices()
      .then((rows) => live && setPrices(rows))
      .catch(() => {
        /* the display values stay: the function refuses an unknown price anyway */
      });
    return () => {
      live = false;
    };
  }, []);
  return prices;
}

async function invoke<T>(name: string, body: Record<string, string | boolean>, read: (body: unknown) => T, missing: T, offline: T): Promise<T> {
  if (!supabase) return missing;
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return read(data);
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === 404 && name === "create-studio-subscription") return missing;
    try {
      return read(await response.json());
    } catch {
      return missing;
    }
  }
  return offline;
}

/** A Stripe Checkout for this plan and interval; the browser is then sent to its address. */
/**
 * `withdrawalConsent`: the member ticked the request for immediate access
 * (decision 94 (a)); the function refuses the checkout without it.
 */
export function startStudioSubscription(
  plan: StudioPaidPlanId,
  interval: StudioBillingInterval,
  locale: "fr" | "en",
  withdrawalConsent: boolean,
): Promise<StudioCheckoutAnswer> {
  return invoke(
    "create-studio-subscription",
    { plan, interval, locale, withdrawal_consent: withdrawalConsent },
    readStudioCheckoutAnswer,
    { kind: "error", error: "payment_unavailable" },
    { kind: "error", error: "network" },
  );
}

/** The Stripe customer portal (change plan, card, invoices, cancel). */
export function openStudioBillingPortal(locale: "fr" | "en"): Promise<StudioPortalAnswer> {
  return invoke(
    "studio-billing-portal",
    { locale },
    readStudioPortalAnswer,
    { kind: "error", error: "unavailable" },
    { kind: "error", error: "unavailable" },
  );
}
