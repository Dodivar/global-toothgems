"use client";

import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase/client";
import {
  mapPlanPriceRows,
  readStudioCheckoutAnswer,
  readStudioConsentAnswer,
  type StudioCheckoutAnswer,
  type StudioConsentAnswer,
  type StudioPlanPrice,
} from "./studioBillingMapping";
import {
  readCardStep,
  readChangePreview,
  readChargeAnswer,
  readManageOverview,
  type Answer,
  type StudioCancelReason,
  type StudioCardStep,
  type StudioChangePreview,
  type StudioChargeAnswer,
  type StudioManageOverview,
} from "./studioManageMapping";
import type { StudioBillingInterval, StudioPaidPlanId } from "../data/studio";

/**
 * The persistence boundary of 3D Studio subscriptions (decision 94): the plan
 * prices (`studio_plan_prices`, public), the subscription payment step on our
 * own page (`create-studio-subscription`) and its management on the member's
 * subscription page (`studio-manage-subscription`, decision 112). Nothing here
 * grants access: the Studio opens when
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

async function invoke<T>(name: string, body: Record<string, string | number | boolean>, read: (body: unknown) => T, missing: T, offline: T): Promise<T> {
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

/** Opens a payment step for this plan and interval: the Payment Element is mounted from its client secret. */
export function startStudioSubscription(plan: StudioPaidPlanId, interval: StudioBillingInterval, locale: "fr" | "en"): Promise<StudioCheckoutAnswer> {
  return invoke(
    "create-studio-subscription",
    { plan, interval, locale },
    readStudioCheckoutAnswer,
    { kind: "error", error: "payment_unavailable" },
    { kind: "error", error: "network" },
  );
}

/**
 * Records the request for immediate access the member ticked in the payment
 * step (decision 94 (a)), just before the payment is confirmed: the payment is
 * confirmed only on `consented`.
 */
export function recordStudioWithdrawalConsent(clientSecret: string): Promise<StudioConsentAnswer> {
  return invoke(
    "create-studio-subscription",
    { consent_client_secret: clientSecret },
    readStudioConsentAnswer,
    { kind: "error", error: "payment_unavailable" },
    { kind: "error", error: "network" },
  );
}

/** Closes a payment step the member left (its Stripe session is expired). Best effort. */
export async function releaseStudioPaymentStep(clientSecret: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.functions.invoke("create-studio-subscription", { body: { release_client_secret: clientSecret } });
  } catch {
    /* the session expires on its own within the hour */
  }
}

const MANAGE = "studio-manage-subscription";
const manageOffline = { kind: "error", error: "unavailable" } as const;

function manage<T>(body: Record<string, string | number>, read: (body: unknown) => T, missing: T): Promise<T> {
  return invoke(MANAGE, body, read, missing, missing);
}

/** Plan, price, status, period end, card and invoices, read from Stripe by the function. */
export function fetchStudioManageOverview(): Promise<Answer<StudioManageOverview>> {
  return manage({ action: "overview" }, readManageOverview, manageOffline);
}

/** What switching to this plan and interval costs: today, or on the next invoice. */
export function previewStudioChange(plan: StudioPaidPlanId, interval: StudioBillingInterval): Promise<Answer<StudioChangePreview>> {
  return manage({ action: "preview", plan, interval }, readChangePreview, manageOffline);
}

/** Switches the plan or interval (the preview's proration instant keeps the amount shown). */
export function changeStudioPlan(plan: StudioPaidPlanId, interval: StudioBillingInterval, prorationDate: number): Promise<StudioChargeAnswer> {
  return manage({ action: "change", plan, interval, proration_date: prorationDate }, readChargeAnswer, manageOffline);
}

/** Ends the subscription at the end of the paid period. */
export function cancelStudioSubscription(reason: StudioCancelReason | null): Promise<StudioChargeAnswer> {
  return manage(reason ? { action: "cancel", reason } : { action: "cancel" }, readChargeAnswer, manageOffline);
}

/** Keeps a subscription set to end. */
export function resumeStudioSubscription(): Promise<StudioChargeAnswer> {
  return manage({ action: "resume" }, readChargeAnswer, manageOffline);
}

/** Opens the card form (a setup-mode payment step: nothing is charged). */
export function startStudioCardStep(locale: "fr" | "en"): Promise<Answer<StudioCardStep>> {
  return manage({ action: "card_start", locale }, readCardStep, manageOffline);
}

/** The card saved in that step becomes the subscription's; an unpaid invoice is retried with it. */
export function saveStudioCard(sessionId: string): Promise<StudioChargeAnswer> {
  return manage({ action: "card_saved", session_id: sessionId }, readChargeAnswer, manageOffline);
}

/**
 * Finishes the bank's check (3-D Secure) of a charge the function started.
 * Stripe.js is loaded only now. `true` once the payment went through.
 */
export async function confirmStudioCharge(clientSecret: string, publishableKey: string, locale: "fr" | "en"): Promise<boolean> {
  const { loadStripeFor } = await import("./checkout/stripe");
  const stripe = await loadStripeFor(publishableKey, locale);
  if (!stripe) return false;
  const result = await stripe.handleNextAction({ clientSecret });
  return !result.error && (result.paymentIntent?.status === "succeeded" || result.paymentIntent?.status === "processing");
}
