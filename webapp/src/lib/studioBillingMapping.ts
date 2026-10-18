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
  | "withdrawal_consent_required"
  | "already_subscribed"
  | "plan_unavailable"
  | "payment_unavailable"
  | "network"
  | "server_error";

export type StudioCheckoutAnswer = { kind: "redirect"; url: string } | { kind: "error"; error: StudioCheckoutError };
export type StudioPortalAnswer = { kind: "redirect"; url: string } | { kind: "error"; error: "no_subscription" | "unavailable" };

const PLANS: readonly StudioPaidPlanId[] = ["essential", "artist", "atelier"];
const INTERVALS: readonly StudioBillingInterval[] = ["month", "year"];
const ERRORS: readonly StudioCheckoutError[] = [
  "sign_in_required",
  "session_expired",
  "terms_required",
  "withdrawal_consent_required",
  "already_subscribed",
  "plan_unavailable",
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

const isHttps = (value: unknown, host: RegExp): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && host.test(url.hostname);
  } catch {
    return false;
  }
};

/** The function's answer: only a Stripe Checkout address is followed. */
export function readStudioCheckoutAnswer(body: unknown): StudioCheckoutAnswer {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (record.status === "checkout") {
    return isHttps(record.url, /^checkout\.stripe\.com$/) ? { kind: "redirect", url: record.url } : { kind: "error", error: "payment_unavailable" };
  }
  const error = ERRORS.includes(record.error as StudioCheckoutError) ? (record.error as StudioCheckoutError) : "server_error";
  return { kind: "error", error };
}

/** The portal function's answer: only a Stripe billing address is followed. */
export function readStudioPortalAnswer(body: unknown): StudioPortalAnswer {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (isHttps(record.url, /^billing\.stripe\.com$/)) return { kind: "redirect", url: record.url as string };
  return { kind: "error", error: record.error === "no_subscription" ? "no_subscription" : "unavailable" };
}
