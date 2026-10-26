import type { StudioBillingInterval, StudioPaidPlanId } from "../data/studio";

/**
 * Managing the 3D Studio subscription on our own page (decision 112):
 * `studio-manage-subscription` answers ↔ UI shapes. Pure, unit-tested.
 * Amounts in integer minor units (§8), dates in ms since epoch.
 */

/** The cancellation reasons offered (the ones the Stripe portal offered). */
export const STUDIO_CANCEL_REASONS = ["too_expensive", "missing_features", "unused", "switched_service", "other"] as const;
export type StudioCancelReason = (typeof STUDIO_CANCEL_REASONS)[number];

export type StudioManageError =
  | "sign_in_required"
  | "session_expired"
  | "no_subscription"
  | "not_active"
  | "cancel_scheduled"
  | "same_plan"
  | "plan_unavailable"
  | "already_canceled"
  | "not_canceled"
  | "card_not_saved"
  | "payment_failed"
  | "invalid_request"
  | "unavailable";

const ERRORS: readonly StudioManageError[] = [
  "sign_in_required",
  "session_expired",
  "no_subscription",
  "not_active",
  "cancel_scheduled",
  "same_plan",
  "plan_unavailable",
  "already_canceled",
  "not_canceled",
  "card_not_saved",
  "payment_failed",
  "invalid_request",
  "unavailable",
];

export interface ManagedPlan {
  plan: StudioPaidPlanId | null;
  interval: StudioBillingInterval | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: number | null;
  amountMinor: number | null;
  currency: string;
  /** A change waiting for the bank's confirmation. */
  pendingUpdate: boolean;
}

export interface ManagedCard {
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface StudioManageOverview {
  subscription: ManagedPlan | null;
  card: ManagedCard | null;
}

export interface StudioChangePreview {
  chargedNow: boolean;
  dueNowMinor: number;
  nextAmountMinor: number;
  nextDate: number | null;
  creditMinor: number;
  currency: string;
  /** Sent back with the change, so the amount shown is the amount charged. */
  prorationDate: number;
}

/** A change, or a card retrying an unpaid invoice: done, or the bank's check to finish in the browser. */
export type StudioChargeAnswer =
  | { kind: "done" }
  | { kind: "requires_action"; clientSecret: string; publishableKey: string }
  | { kind: "error"; error: StudioManageError };

export interface StudioCardStep {
  clientSecret: string;
  publishableKey: string;
  expiresAt: number;
}

export type Answer<T> = { kind: "ok"; value: T } | { kind: "error"; error: StudioManageError };

const PLANS: readonly StudioPaidPlanId[] = ["essential", "artist", "atelier"];
const INTERVALS: readonly StudioBillingInterval[] = ["month", "year"];

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const minor = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);
const seconds = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) * 1000 : null);
const currencyOf = (value: unknown) => (typeof value === "string" && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null);

/** The function's `{ error }`, else `unavailable`. */
export function readManageError(body: unknown): StudioManageError {
  const error = record(body)?.error;
  return ERRORS.includes(error as StudioManageError) ? (error as StudioManageError) : "unavailable";
}

function readPlan(value: unknown): ManagedPlan | null {
  const o = record(value);
  if (!o || typeof o.status !== "string") return null;
  return {
    plan: PLANS.includes(o.plan as StudioPaidPlanId) ? (o.plan as StudioPaidPlanId) : null,
    interval: INTERVALS.includes(o.interval as StudioBillingInterval) ? (o.interval as StudioBillingInterval) : null,
    status: o.status,
    cancelAtPeriodEnd: o.cancel_at_period_end === true,
    periodEnd: seconds(o.current_period_end),
    amountMinor: minor(o.amount),
    currency: currencyOf(o.currency) ?? "EUR",
    pendingUpdate: o.pending_update === true,
  };
}

function readCard(value: unknown): ManagedCard | null {
  const o = record(value);
  if (!o || typeof o.type !== "string") return null;
  const last4 = typeof o.last4 === "string" && /^\d{4}$/.test(o.last4) ? o.last4 : null;
  const month = Number.isInteger(o.exp_month) ? (o.exp_month as number) : null;
  const year = Number.isInteger(o.exp_year) ? (o.exp_year as number) : null;
  return { type: o.type, brand: typeof o.brand === "string" ? o.brand : null, last4, expMonth: month, expYear: year };
}

export function readManageOverview(body: unknown): Answer<StudioManageOverview> {
  const o = record(body);
  if (!o || o.error !== undefined) return { kind: "error", error: readManageError(body) };
  return { kind: "ok", value: { subscription: readPlan(o.subscription), card: readCard(o.card) } };
}

export function readChangePreview(body: unknown): Answer<StudioChangePreview> {
  const o = record(body);
  const dueNow = minor(o?.due_now);
  const next = minor(o?.next_amount);
  const credit = minor(o?.credit);
  const currency = currencyOf(o?.currency);
  if (!o || typeof o.charged_now !== "boolean" || dueNow === null || next === null || credit === null || !currency || !Number.isSafeInteger(o.proration_date)) {
    return { kind: "error", error: readManageError(body) };
  }
  return {
    kind: "ok",
    value: {
      chargedNow: o.charged_now,
      dueNowMinor: dueNow,
      nextAmountMinor: next,
      nextDate: seconds(o.next_date),
      creditMinor: credit,
      currency,
      prorationDate: o.proration_date as number,
    },
  };
}

/** `{status: updated | card_saved | canceled | resumed}`, `{status: requires_action, …}`, else the error. */
export function readChargeAnswer(body: unknown): StudioChargeAnswer {
  const o = record(body);
  if (o?.status === "requires_action") {
    return typeof o.client_secret === "string" && o.client_secret.startsWith("pi_") && typeof o.publishable_key === "string" && o.publishable_key.startsWith("pk_")
      ? { kind: "requires_action", clientSecret: o.client_secret, publishableKey: o.publishable_key }
      : { kind: "error", error: "unavailable" };
  }
  if (o && typeof o.status === "string" && ["updated", "card_saved", "canceled", "resumed"].includes(o.status)) return { kind: "done" };
  return { kind: "error", error: readManageError(body) };
}

export function readCardStep(body: unknown): Answer<StudioCardStep> {
  const o = record(body);
  const expiresAt = seconds(o?.expires_at);
  if (!o || typeof o.client_secret !== "string" || typeof o.publishable_key !== "string" || !o.publishable_key.startsWith("pk_") || expiresAt === null) {
    return { kind: "error", error: readManageError(body) };
  }
  return { kind: "ok", value: { clientSecret: o.client_secret, publishableKey: o.publishable_key, expiresAt } };
}

