import { FunctionsHttpError } from "@supabase/supabase-js";
import { requireSupabase } from "../supabase/client";
import type { CheckoutItem } from "./cartLines";
import type { ShippingRateRow } from "./shippingRates";

/**
 * The checkout's single persistence boundary (screens never call Supabase):
 * delivery rates (public tables), the `create-checkout-session` Edge Function
 * (opening and closing the payment step), and the payment return page's status
 * read. Live mode only.
 */

export interface CheckoutAddress {
  first_name: string;
  last_name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  country_code: string;
}

export interface CheckoutRequest {
  items: CheckoutItem[];
  email: string;
  address: CheckoutAddress;
  /** Null for a basket with nothing to ship (gift cards only). */
  shipping_rate_id: string | null;
  locale: "fr" | "en";
  gift_card_codes?: string[];
  /** A request to spend the completed loyalty card; the database computes the discount. */
  use_loyalty_reward?: boolean;
  /** The client secret of the payment step this basket opened before, closed by the function first. */
  previous_client_secret?: string;
}

/** Codes the function answers with (`supabase/functions/_shared/orderErrors.ts`), plus the client's own. */
export const CHECKOUT_ERRORS = [
  "invalid_request",
  "unavailable",
  "out_of_stock",
  "shipping_unavailable",
  "promotion_code_invalid",
  "loyalty_reward_unavailable",
  "gift_card_invalid",
  "gift_card_details_invalid",
  "account_required",
  "terms_required",
  "course_owned",
  "payment_unavailable",
  "maintenance",
  "session_expired",
  "server_error",
  "network",
  /** The basket changed while its payment step was open: the step was closed. */
  "basket_changed",
] as const;
export type CheckoutError = (typeof CHECKOUT_ERRORS)[number];

/**
 * An order created and reserved, waiting for its card payment on our own page:
 * the Stripe Checkout Session's client secret mounts the payment form. The amount
 * is the one Postgres computed (gift cards and discounts deducted), in minor units.
 */
export interface PaymentStep {
  clientSecret: string;
  publishableKey: string;
  orderNumber: string;
  amountDue: number;
  currency: string;
  /** When the session stops accepting a payment (ms since epoch). */
  expiresAt: number;
}

export type CheckoutResult =
  | { kind: "payment"; payment: PaymentStep }
  | { kind: "paid"; orderNumber: string }
  | { kind: "error"; error: CheckoutError };

const asError = (value: unknown): CheckoutError =>
  (CHECKOUT_ERRORS as readonly unknown[]).includes(value) ? (value as CheckoutError) : "server_error";

/** A Checkout Session client secret (`cs_test_…_secret_…`), as the function returns it. */
export const isClientSecret = (value: unknown): value is string =>
  typeof value === "string" && /^cs_(test|live)_[A-Za-z0-9]{10,250}_secret_[A-Za-z0-9%_.~-]{8,1000}$/.test(value);

/** A Stripe publishable key; only ever a `pk_` key reaches Stripe.js. */
export const isPublishableKey = (value: unknown): value is string =>
  typeof value === "string" && /^pk_(test|live)_[A-Za-z0-9]{10,250}$/.test(value);

function readPaymentStep(body: Record<string, unknown>): PaymentStep | null {
  const { client_secret, publishable_key, order_number, amount_due, currency, expires_at } = body;
  if (!isClientSecret(client_secret) || !isPublishableKey(publishable_key)) return null;
  // Test and live never mix: a live key with a test session (or the reverse) cannot open it.
  if (client_secret.startsWith("cs_test_") !== publishable_key.startsWith("pk_test_")) return null;
  if (typeof order_number !== "string" || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof amount_due !== "number" || !Number.isSafeInteger(amount_due) || amount_due <= 0) return null;
  const expiresAt = typeof expires_at === "string" ? Date.parse(expires_at) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return null;
  return { clientSecret: client_secret, publishableKey: publishable_key, orderNumber: order_number, amountDue: amount_due, currency, expiresAt };
}

export function readCheckoutAnswer(data: unknown): CheckoutResult {
  const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (body.status === "payment") {
    const payment = readPaymentStep(body);
    return payment ? { kind: "payment", payment } : { kind: "error", error: "payment_unavailable" };
  }
  if (body.status === "paid" && typeof body.order_number === "string") return { kind: "paid", orderNumber: body.order_number };
  return { kind: "error", error: asError(body.error) };
}

export async function startCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
  const { data, error } = await requireSupabase().functions.invoke("create-checkout-session", { body: request });
  if (!error) return readCheckoutAnswer(data);
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    // The function is not deployed (yet): payment is not available, nothing was created.
    if (response.status === 404) return { kind: "error", error: "payment_unavailable" };
    try {
      return readCheckoutAnswer(await response.json());
    } catch {
      return { kind: "error", error: "server_error" };
    }
  }
  return { kind: "error", error: "network" };
}

/**
 * Closes a payment step the customer left to change their order (session
 * expired, order cancelled, stock and gift cards released). Best effort: the
 * reservation runs out by itself anyway, and the next checkout names it again.
 */
export async function releasePaymentStep(clientSecret: string): Promise<void> {
  try {
    await requireSupabase().functions.invoke("create-checkout-session", { body: { release_client_secret: clientSecret } });
  } catch {
    // Not blocking: see above.
  }
}

export async function fetchShippingRates(countryCode: string): Promise<ShippingRateRow[]> {
  const supabase = requireSupabase();
  const country = await supabase
    .from("shipping_zone_countries")
    .select("zone_id")
    .eq("country_code", countryCode.toUpperCase())
    .maybeSingle();
  if (country.error) throw new Error(country.error.message);
  let zoneId = country.data?.zone_id ?? null;
  if (!zoneId) {
    const rest = await supabase.from("shipping_zones").select("id").eq("is_rest_of_world", true).maybeSingle();
    if (rest.error) throw new Error(rest.error.message);
    zoneId = rest.data?.id ?? null;
  }
  if (!zoneId) return [];
  const rates = await supabase
    .from("shipping_rates")
    .select("id, kind, min_days, max_days, price, currency, free_over_amount, min_order_amount, max_order_amount, position")
    .eq("zone_id", zoneId)
    .eq("is_active", true)
    .order("position");
  if (rates.error) throw new Error(rates.error.message);
  return rates.data;
}

export type PaymentState = "pending" | "paid" | "cancelled" | "failed";

export interface CheckoutStatus {
  orderNumber: string;
  state: PaymentState;
}

const STATES: readonly PaymentState[] = ["pending", "paid", "cancelled", "failed"];

/** The order behind a Stripe Checkout Session id, or null when none is known (yet). */
export async function fetchCheckoutStatus(sessionId: string): Promise<CheckoutStatus | null> {
  const { data, error } = await requireSupabase().rpc("checkout_session_status", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row || !(STATES as readonly string[]).includes(row.state)) return null;
  return { orderNumber: row.order_number, state: row.state as PaymentState };
}

/** Stripe Checkout Session ids, as the return address carries them. */
export const isCheckoutSessionId = (value: string | null): value is string =>
  value !== null && /^cs_(test|live)_[A-Za-z0-9]{10,250}$/.test(value);
