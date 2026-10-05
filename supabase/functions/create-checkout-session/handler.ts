import { parseCheckoutInput, type CheckoutInput, type CheckoutLocale } from "../_shared/checkoutInput.ts";
import { corsHeaders, json, readJson, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { toMinorUnits } from "../_shared/money.ts";
import { checkoutErrorCode, checkoutErrorStatus, type DbError } from "../_shared/orderErrors.ts";

/**
 * POST /functions/v1/create-checkout-session
 *
 *   browser ──(cart ids + quantities, contact, rate id)──▶ this function
 *     1. validates the input strictly (no amount is accepted from the browser),
 *        refuses while the shop is in maintenance
 *     2. create_order() with the service role → order 'pending', stock reserved,
 *        every amount computed by Postgres
 *     3. Stripe Checkout Session for orders.amount_due / orders.currency
 *        (integer minor units), metadata.order_id, idempotency key per order
 *     4. records the session id on a pending `payments` row, returns its URL
 *
 * Nothing is paid or granted here: the order becomes paid only through the
 * verified `stripe-webhook`. If Stripe cannot be reached the order is cancelled
 * at once, releasing the reservation.
 *
 * Everything with side effects is injected (`CheckoutDeps`), so the flow is
 * tested without Stripe or a database.
 */

export interface OrderRow {
  id: string;
  order_number: string;
  customer_email: string;
  currency: string;
  amount_due: number | string;
  payment_status: string;
  expires_at: string | null;
}

export interface CheckoutSessionParams {
  orderId: string;
  orderNumber: string;
  email: string;
  currency: string;
  amountDue: number;
  locale: CheckoutLocale;
  expiresAt: number;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutDeps {
  origins: SiteOrigins;
  /** store_settings.maintenance_enabled: the checkout refuses orders while it is on. */
  maintenanceEnabled(): Promise<boolean>;
  /** The signed-in customer behind a bearer token, or null (guest, invalid or publishable key). */
  userFromToken(token: string): Promise<string | null>;
  /** Whether the account holds a granted `terms` consent record. */
  termsAccepted(userId: string): Promise<boolean>;
  createOrder(input: CheckoutInput, userId: string | null, reservationMinutes: number): Promise<
    { order: OrderRow; error?: undefined } | { order?: undefined; error: DbError }
  >;
  cancelOrder(orderId: string, reason: string): Promise<void>;
  /** An order paid in full at creation (gift cards): confirmation e-mail. Must never throw. */
  orderPaid?(orderId: string): Promise<void>;
  createStripeSession(params: CheckoutSessionParams, idempotencyKey: string): Promise<{ id: string; url: string }>;
  recordCheckoutPayment(orderId: string, sessionId: string, amountDue: number | string, currency: string): Promise<void>;
  now(): number;
  log(message: string, detail?: unknown): void;
}

/**
 * Stock stays reserved a little longer than the Stripe session can be paid,
 * so a card payment completed at the last minute still finds its stock.
 * Stripe accepts sessions expiring 30 minutes to 24 hours after creation.
 */
export const RESERVATION_MINUTES = 70;
export const SESSION_MINUTES = 60;
const MAX_BODY_BYTES = 32 * 1024;

const PATHS: Record<CheckoutLocale, { cart: string; confirmation: string }> = {
  fr: { cart: "/fr/panier", confirmation: "/fr/panier/confirmation" },
  en: { cart: "/en/cart", confirmation: "/en/cart/confirmation" },
};

export function returnUrls(origin: string, locale: CheckoutLocale) {
  return {
    // Stripe replaces {CHECKOUT_SESSION_ID}; the page only reads the order's state with it.
    successUrl: `${origin}${PATHS[locale].confirmation}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${PATHS[locale].cart}`,
  };
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

// A user access token is a JWT; the publishable key (`sb_publishable_…`) is not.
const looksLikeJwt = (token: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);

export async function handleCheckout(req: Request, deps: CheckoutDeps): Promise<Response> {
  const requestOrigin = req.headers.get("origin");
  const cors = corsHeaders(deps.origins, requestOrigin);
  const fail = (code: ReturnType<typeof checkoutErrorCode>) => json({ error: code }, checkoutErrorStatus(code), cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const body = await readJson(req, MAX_BODY_BYTES);
  const parsed = parseCheckoutInput(body);
  if (!parsed.ok) return json({ error: "invalid_request", field: parsed.field }, 400, cors);
  const input = parsed.value;

  try {
    if (await deps.maintenanceEnabled()) return json({ error: "maintenance" }, 503, cors);
  } catch (error) {
    deps.log("maintenance switch unreadable", error instanceof Error ? error.message : error);
    return fail("server_error");
  }

  const token = bearer(req);
  let userId: string | null = null;
  if (token && looksLikeJwt(token)) {
    userId = await deps.userFromToken(token);
    // A token that is present but no longer valid is refused rather than
    // silently turned into a guest order the customer would not find.
    if (!userId) return json({ error: "session_expired" }, 401, cors);
  }

  // An account created through Google may not have accepted the terms yet:
  // nothing is reserved or charged until it has (the storefront asks for it).
  if (userId) {
    try {
      if (!(await deps.termsAccepted(userId))) return fail("terms_required");
    } catch (error) {
      deps.log("terms acceptance unreadable", error instanceof Error ? error.message : error);
      return fail("server_error");
    }
  }

  const created = await deps.createOrder(input, userId, RESERVATION_MINUTES);
  if (created.error) {
    const code = checkoutErrorCode(created.error);
    if (code === "server_error") deps.log("create_order failed", created.error);
    return fail(code);
  }
  const order = created.order;

  // Entirely paid with gift cards: create_order() already marked it paid.
  const amountDue = toMinorUnits(order.amount_due);
  if (amountDue === 0) {
    try {
      await deps.orderPaid?.(order.id);
    } catch (error) {
      deps.log("order follow-ups failed", error instanceof Error ? error.message : error);
    }
    return json({ status: "paid", order_number: order.order_number }, 200, cors);
  }

  const origin = returnOrigin(deps.origins, requestOrigin);
  let session: { id: string; url: string };
  try {
    session = await deps.createStripeSession(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        email: order.customer_email,
        currency: order.currency,
        amountDue,
        locale: input.locale,
        expiresAt: Math.floor(deps.now() / 1000) + SESSION_MINUTES * 60,
        ...returnUrls(origin, input.locale),
      },
      `checkout-session:${order.id}`,
    );
  } catch (error) {
    deps.log("Stripe session creation failed", error instanceof Error ? error.message : error);
    try {
      await deps.cancelOrder(order.id, "checkout_failed");
    } catch (cancelError) {
      // The expiry job releases it anyway once the reservation is over.
      deps.log("cancel_order after Stripe failure failed", cancelError instanceof Error ? cancelError.message : cancelError);
    }
    return fail("payment_unavailable");
  }

  try {
    await deps.recordCheckoutPayment(order.id, session.id, order.amount_due, order.currency);
  } catch (error) {
    // Not blocking: the webhook creates the payment row itself if it is missing;
    // only the return page's early status is affected.
    deps.log("pending payment row not recorded", error instanceof Error ? error.message : error);
  }

  return json({ status: "redirect", url: session.url }, 200, cors);
}
