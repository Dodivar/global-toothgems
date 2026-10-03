import { FunctionsHttpError } from "@supabase/supabase-js";
import { requireSupabase } from "../supabase/client";
import type { CheckoutItem } from "./cartLines";
import type { ShippingRateRow } from "./shippingRates";

/**
 * The checkout's single persistence boundary (screens never call Supabase):
 * delivery rates (public tables), the `create-checkout-session` Edge Function,
 * and the payment return page's status read. Live mode only.
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
  "course_owned",
  "payment_unavailable",
  "maintenance",
  "session_expired",
  "server_error",
  "network",
] as const;
export type CheckoutError = (typeof CHECKOUT_ERRORS)[number];

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "paid"; orderNumber: string }
  | { kind: "error"; error: CheckoutError };

const asError = (value: unknown): CheckoutError =>
  (CHECKOUT_ERRORS as readonly unknown[]).includes(value) ? (value as CheckoutError) : "server_error";

/** Only Stripe's hosted page is followed, whatever the answer says. */
export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

export function readCheckoutAnswer(data: unknown): CheckoutResult {
  const body = (data ?? {}) as { status?: unknown; url?: unknown; order_number?: unknown; error?: unknown };
  if (body.status === "redirect" && isStripeCheckoutUrl(body.url)) return { kind: "redirect", url: body.url };
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
