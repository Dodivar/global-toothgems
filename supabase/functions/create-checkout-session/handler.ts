import { parseCheckoutInput, parseClientSecret, type CheckoutInput, type CheckoutLocale } from "../_shared/checkoutInput.ts";
import { corsHeaders, json, readJson, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { toMinorUnits } from "../_shared/money.ts";
import { checkoutErrorCode, checkoutErrorStatus, type DbError } from "../_shared/orderErrors.ts";

/**
 * POST /functions/v1/create-checkout-session
 *
 *   browser ──(cart ids + quantities, contact, rate id)──▶ this function
 *     1. validates the input strictly (no amount is accepted from the browser),
 *        refuses while the shop is in maintenance
 *     2. closes the customer's previous unpaid payment step, if they name it
 *        (they went back to change something): nothing stays reserved twice
 *     3. create_order() with the service role → order 'pending', stock reserved,
 *        every amount computed by Postgres
 *     4. Stripe Checkout Session (`ui_mode: "custom"`: the payment form is
 *        Stripe's Payment Element inside our own checkout page) for
 *        orders.amount_due / orders.currency (integer minor units),
 *        metadata.order_id, idempotency key per order
 *     5. records the session id on a pending `payments` row, returns the
 *        session's client secret and the publishable key to mount the form
 *
 *   browser ──{ release_client_secret }──▶ this function
 *     closes that unpaid payment step (session expired, order cancelled):
 *     the customer left the payment step to change their order.
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
  /** Where Stripe sends the customer after a payment that needs a redirect (3-D Secure, wallets, banks). */
  returnUrl: string;
}

/** What closing a payment step found. Never told to the browser. */
export type ReleaseOutcome = "released" | "not_found" | "kept";

/** What closing a payment step needs from Stripe and the database. */
export interface ReleaseDeps {
  /** The session, or null when Stripe does not know it. */
  retrieveSession(sessionId: string): Promise<{ clientSecret: string | null; status: string | null; orderId: string | null } | null>;
  /** Throws when Stripe refuses (a payment being confirmed right now cannot be expired). */
  expireSession(sessionId: string): Promise<void>;
  orderState(orderId: string): Promise<{ status: string; paymentStatus: string } | null>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
}

const UNPAID = new Set(["pending", "failed"]);

/**
 * Closes an unpaid payment step. Only whoever holds the session's client secret
 * (the browser it was given to) can close it; a completed payment, or one that
 * Stripe will not let expire, is left alone; only a pending unpaid order is cancelled.
 */
export async function releasePaymentStep(sessionId: string, clientSecret: string, deps: ReleaseDeps): Promise<ReleaseOutcome> {
  const session = await deps.retrieveSession(sessionId).catch(() => null);
  if (!session || session.clientSecret === null || session.clientSecret !== clientSecret) return "not_found";
  if (session.status === "complete") return "kept";
  if (session.status === "open") {
    try {
      await deps.expireSession(sessionId);
    } catch {
      const again = await deps.retrieveSession(sessionId);
      if (again?.status !== "expired") return "kept";
    }
  }
  if (!session.orderId) return "released";
  const order = await deps.orderState(session.orderId);
  if (order && order.status === "pending" && UNPAID.has(order.paymentStatus)) {
    await deps.cancelOrder(session.orderId, "payment_step_left");
  }
  return "released";
}

export interface CheckoutDeps {
  origins: SiteOrigins;
  /**
   * Stripe publishable key of the same account and mode as the secret key, or
   * null when it is not configured (or does not match): no order is then created.
   */
  publishableKey: string | null;
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
  /**
   * Unpaid orders of an abandoned payment still holding these gift cards: their Stripe sessions
   * are expired and the orders cancelled (the cards are credited back). Orders whose session
   * cannot be proven closed are left alone. Returns how many were released.
   */
  releaseHeldGiftCards?(codes: string[]): Promise<number>;
  /** An order paid in full at creation (gift cards): confirmation e-mail. Must never throw. */
  orderPaid?(orderId: string): Promise<void>;
  createStripeSession(params: CheckoutSessionParams, idempotencyKey: string): Promise<{ id: string; clientSecret: string }>;
  /**
   * Closes an unpaid payment step named by its client secret: the session must
   * carry exactly that secret, is expired on Stripe and, once provably closed,
   * its order cancelled. A completed (or completing) payment is left alone.
   */
  releasePaymentStep?(sessionId: string, clientSecret: string): Promise<ReleaseOutcome>;
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

const CONFIRMATION_PATHS: Record<CheckoutLocale, string> = {
  fr: "/fr/panier/confirmation",
  en: "/en/cart/confirmation",
};

/** Stripe replaces {CHECKOUT_SESSION_ID}; the page only reads the order's state with it. */
export const returnUrl = (origin: string, locale: CheckoutLocale) =>
  `${origin}${CONFIRMATION_PATHS[locale]}?session_id={CHECKOUT_SESSION_ID}`;

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

  // Leaving the payment step: close it. The answer is the same whatever was found.
  if (body && typeof body === "object" && !Array.isArray(body) && "release_client_secret" in body) {
    const named = parseClientSecret((body as Record<string, unknown>).release_client_secret);
    if (Object.keys(body).length !== 1 || !named) {
      return json({ error: "invalid_request", field: "release_client_secret" }, 400, cors);
    }
    await release(deps, named);
    return json({ status: "released" }, 200, cors);
  }

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

  // The previous payment step of this basket is closed first, so its stock and
  // gift cards are free for the new order. Never blocks the checkout.
  const previous = parseClientSecret(input.previous_client_secret);
  if (previous) await release(deps, previous);

  // A card still held by an abandoned payment (cancelled on Stripe, not yet expired) is released
  // first, so retrying with the same code works. Never blocks the checkout.
  if (input.gift_card_codes.length > 0 && deps.releaseHeldGiftCards) {
    try {
      await deps.releaseHeldGiftCards(input.gift_card_codes);
    } catch (error) {
      deps.log("gift cards held by an earlier payment not released", error instanceof Error ? error.message : error);
    }
  }

  // Without the publishable key the payment form cannot be shown: nothing is reserved.
  if (!deps.publishableKey) {
    deps.log("STRIPE_PUBLISHABLE_KEY missing or not matching the secret key's mode");
    return fail("payment_unavailable");
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
    // Nothing to pay but no gift card covered it (a promotion made the basket free): create_order() leaves such an
    // order pending, and there is nothing to charge on Stripe. Free orders are not offered yet: release it.
    if (order.payment_status !== "paid") {
      try {
        await deps.cancelOrder(order.id, "free_order");
      } catch (cancelError) {
        deps.log("cancel_order of a free order failed", cancelError instanceof Error ? cancelError.message : cancelError);
      }
      return fail("free_order");
    }
    try {
      await deps.orderPaid?.(order.id);
    } catch (error) {
      deps.log("order follow-ups failed", error instanceof Error ? error.message : error);
    }
    return json({ status: "paid", order_number: order.order_number }, 200, cors);
  }

  const origin = returnOrigin(deps.origins, requestOrigin);
  const expiresAt = Math.floor(deps.now() / 1000) + SESSION_MINUTES * 60;
  let session: { id: string; clientSecret: string };
  try {
    session = await deps.createStripeSession(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        email: order.customer_email,
        currency: order.currency,
        amountDue,
        locale: input.locale,
        expiresAt,
        returnUrl: returnUrl(origin, input.locale),
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

  return json(
    {
      status: "payment",
      client_secret: session.clientSecret,
      publishable_key: deps.publishableKey,
      order_number: order.order_number,
      // What Stripe will charge, as Postgres computed it (gift cards and discounts deducted).
      amount_due: amountDue,
      currency: order.currency,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    },
    200,
    cors,
  );
}

async function release(deps: CheckoutDeps, named: { secret: string; sessionId: string }) {
  if (!deps.releasePaymentStep) return;
  try {
    await deps.releasePaymentStep(named.sessionId, named.secret);
  } catch (error) {
    // The expiry job releases it anyway once the reservation is over.
    deps.log("previous payment step not released", error instanceof Error ? error.message : error);
  }
}
