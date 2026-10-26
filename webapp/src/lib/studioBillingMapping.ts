import { STUDIO_PLANS, type StudioBillingInterval, type StudioPaidPlanId } from "../data/studio";

/**
 * 3D Studio subscriptions (decision 94): rows and function answers ↔ UI
 * shapes. Pure, unit-tested. Amounts in integer minor units (§8).
 */

export interface StudioPlanPrice {
  plan: StudioPaidPlanId;
  interval: StudioBillingInterval;
  amountMinor: number;
  currency: string;
}

export type StudioCheckoutError =
  | "sign_in_required"
  | "session_expired"
  | "terms_required"
  | "already_subscribed"
  | "plan_unavailable"
  | "checkout_closed"
  | "payment_unavailable"
  | "network"
  | "server_error";

/**
 * A subscription payment step opened on our own page: the Stripe Checkout
 * Session's client secret mounts the payment form (same form as the shop's).
 * The amount is the stored plan price, VAT included, in minor units.
 */
export interface StudioPayment {
  clientSecret: string;
  publishableKey: string;
  amountMinor: number;
  currency: string;
  /** When the session stops accepting a payment (ms since epoch). */
  expiresAt: number;
}

export type StudioCheckoutAnswer = { kind: "payment"; payment: StudioPayment } | { kind: "error"; error: StudioCheckoutError };
export type StudioConsentAnswer = { kind: "consented" } | { kind: "error"; error: StudioCheckoutError };

const PLANS: readonly StudioPaidPlanId[] = ["essential", "artist", "atelier"];
const INTERVALS: readonly StudioBillingInterval[] = ["month", "year"];
const ERRORS: readonly StudioCheckoutError[] = [
  "sign_in_required",
  "session_expired",
  "terms_required",
  "already_subscribed",
  "plan_unavailable",
  "checkout_closed",
  "payment_unavailable",
  "network",
  "server_error",
];

/** `numeric` as PostgREST returns it (number or string) → minor units, without float arithmetic. */
function minorOf(value: unknown): number | null {
  const text = typeof value === "number" ? value.toFixed(2) : typeof value === "string" ? value.trim() : "";
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** `studio_plan_prices` rows → prices; malformed rows are dropped. */
export function mapPlanPriceRows(rows: unknown): StudioPlanPrice[] {
  if (!Array.isArray(rows)) return [];
  const prices: StudioPlanPrice[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { plan, billing_interval, amount, currency } = row as Record<string, unknown>;
    if (!PLANS.includes(plan as StudioPaidPlanId) || !INTERVALS.includes(billing_interval as StudioBillingInterval)) continue;
    const amountMinor = minorOf(amount);
    if (amountMinor === null || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) continue;
    prices.push({ plan: plan as StudioPaidPlanId, interval: billing_interval as StudioBillingInterval, amountMinor, currency });
  }
  return prices;
}

/**
 * The price shown for a plan and interval: the live one when the database
 * gave it, else the owner-confirmed display value of `data/studio.ts`.
 */
export function displayPrice(plan: StudioPaidPlanId, interval: StudioBillingInterval, live: StudioPlanPrice[] | null): StudioPlanPrice | null {
  const found = live?.find((p) => p.plan === plan && p.interval === interval);
  if (found) return found;
  if (live && live.length > 0) return null;
  const fallback = STUDIO_PLANS.find((p) => p.id === plan);
  const amountMinor = interval === "month" ? fallback?.amountMinor : fallback?.yearlyAmountMinor;
  return fallback && amountMinor ? { plan, interval, amountMinor, currency: fallback.currency } : null;
}

/** Months a yearly price saves over twelve monthly ones (rounded down), or 0. */
export function monthsFreeOf(monthly: StudioPlanPrice | null, yearly: StudioPlanPrice | null): number {
  if (!monthly || !yearly || monthly.currency !== yearly.currency || monthly.amountMinor <= 0) return 0;
  const saved = monthly.amountMinor * 12 - yearly.amountMinor;
  return saved > 0 ? Math.floor(saved / monthly.amountMinor) : 0;
}


const errorOf = (record: Record<string, unknown>): StudioCheckoutError =>
  ERRORS.includes(record.error as StudioCheckoutError) ? (record.error as StudioCheckoutError) : "server_error";

const CLIENT_SECRET_RE = /^cs_(?:test|live)_[A-Za-z0-9]+_secret_[A-Za-z0-9%_.~-]+$/;

/** The function's answer: a payment step only when every part of it is well formed. */
export function readStudioCheckoutAnswer(body: unknown): StudioCheckoutAnswer {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (record.status !== "payment") return { kind: "error", error: errorOf(record) };
  const { client_secret, publishable_key, amount, currency, expires_at } = record;
  const expiresAt = typeof expires_at === "string" ? Date.parse(expires_at) : Number.NaN;
  const valid =
    typeof client_secret === "string" &&
    CLIENT_SECRET_RE.test(client_secret) &&
    typeof publishable_key === "string" &&
    /^pk_(?:test|live)_/.test(publishable_key) &&
    Number.isSafeInteger(amount) &&
    (amount as number) > 0 &&
    typeof currency === "string" &&
    /^[A-Za-z]{3}$/.test(currency) &&
    Number.isFinite(expiresAt);
  if (!valid) return { kind: "error", error: "payment_unavailable" };
  return {
    kind: "payment",
    payment: {
      clientSecret: client_secret as string,
      publishableKey: publishable_key as string,
      amountMinor: amount as number,
      currency: (currency as string).toUpperCase(),
      expiresAt,
    },
  };
}

/** The answer to recording the immediate-access request: the payment is confirmed only on `consented`. */
export function readStudioConsentAnswer(body: unknown): StudioConsentAnswer {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return record.status === "consented" ? { kind: "consented" } : { kind: "error", error: errorOf(record) };
}
