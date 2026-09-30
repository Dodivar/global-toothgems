import { toDecimalString } from "../_shared/money.ts";

/**
 * POST /functions/v1/stripe-webhook — the only path by which a card payment
 * becomes a paid order (AGENTS.md §8).
 *
 *   1. signature checked against STRIPE_WEBHOOK_SECRET (raw body) → 400 if not
 *   2. event id recorded in stripe_webhook_events (attempts counted); an event
 *      already `processed` or `ignored` is acknowledged without doing anything
 *   3. checkout.session.completed (payment_status 'paid'),
 *      checkout.session.async_payment_succeeded → mark_order_paid()
 *      checkout.session.expired, checkout.session.async_payment_failed
 *        → cancel_order() while the order is still unpaid
 *   4. the event is marked `processed` (or `failed` + error)
 *
 * Replays are harmless: mark_order_paid() returns a paid order unchanged and
 * cancel_order() a cancelled one. 2xx only once the outcome is stored; a
 * transient failure answers 500 so Stripe retries.
 */

export interface CheckoutSessionObject {
  id: string;
  object: "checkout.session";
  amount_total: number | null;
  currency: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent: string | { id: string } | null;
  metadata: Record<string, string> | null;
}

export interface WebhookEvent {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: unknown };
}

export type EventStatus = "received" | "processed" | "ignored" | "failed";

export interface PaymentDetails {
  methodType: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
}

export interface OrderState {
  paymentStatus: string;
  status: string;
}

/** A database error: `code` is the Postgres SQLSTATE when there is one. */
export class DbCallError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

export interface WebhookDeps {
  /** Throws when the signature (or the payload) is not valid. */
  verify(rawBody: string, signature: string): Promise<WebhookEvent>;
  /** Records the delivery; the event's status after it (existing rows keep theirs). */
  recordEvent(event: WebhookEvent, objectId: string | null, orderId: string | null): Promise<EventStatus>;
  finishEvent(eventId: string, status: "processed" | "ignored" | "failed", error?: string): Promise<void>;
  orderState(orderId: string): Promise<OrderState | null>;
  paymentDetails(paymentIntentId: string): Promise<PaymentDetails>;
  markOrderPaid(args: {
    orderId: string;
    amount: string;
    currency: string;
    checkoutId: string;
    paymentId: string | null;
    details: PaymentDetails;
  }): Promise<void>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
  closeCheckoutPayment(checkoutId: string, status: "cancelled" | "failed", reason: string): Promise<void>;
  log(message: string, detail?: unknown): void;
}

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.expired",
  "checkout.session.async_payment_failed",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Errors that will fail the same way on every retry (amount mismatch, unknown
 * order, invalid argument): stored as `failed` for the team and acknowledged,
 * rather than retried by Stripe for three days.
 */
const PERMANENT_SQLSTATES = new Set(["22023", "22P02", "P0002", "23514", "42501"]);

const text = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function sessionOf(event: WebhookEvent): CheckoutSessionObject | null {
  const object = event.data?.object as Partial<CheckoutSessionObject> | undefined;
  return object && object.object === "checkout.session" && typeof object.id === "string"
    ? (object as CheckoutSessionObject)
    : null;
}

function orderIdOf(session: CheckoutSessionObject | null): string | null {
  const id = session?.metadata?.order_id;
  return typeof id === "string" && UUID_RE.test(id) ? id.toLowerCase() : null;
}

function paymentIntentId(session: CheckoutSessionObject): string | null {
  const pi = session.payment_intent;
  if (typeof pi === "string") return pi;
  return pi && typeof pi.id === "string" ? pi.id : null;
}

const UNPAID = new Set(["pending", "failed"]);

async function applyEvent(event: WebhookEvent, session: CheckoutSessionObject, orderId: string, deps: WebhookDeps) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // `unpaid` on completion = a delayed method (e.g. bank debit): the
      // async_payment_succeeded / _failed event decides later.
      if (session.payment_status !== "paid") return "ignored" as const;
      if (session.amount_total === null || !session.currency) throw new DbCallError("session without amount", "22023");
      const paymentId = paymentIntentId(session);
      let details: PaymentDetails = { methodType: null, cardBrand: null, cardLast4: null };
      if (paymentId) {
        try {
          details = await deps.paymentDetails(paymentId);
        } catch (error) {
          // Display-only details: the payment itself is recorded without them.
          deps.log("payment details unavailable", error instanceof Error ? error.message : error);
        }
      }
      await deps.markOrderPaid({
        orderId,
        amount: toDecimalString(session.amount_total),
        currency: session.currency.toUpperCase(),
        checkoutId: session.id,
        paymentId,
        details,
      });
      return "processed" as const;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const failed = event.type === "checkout.session.async_payment_failed";
      await deps.closeCheckoutPayment(session.id, failed ? "failed" : "cancelled", failed ? "async_payment_failed" : "expired");
      const order = await deps.orderState(orderId);
      if (!order) throw new DbCallError("order not found", "P0002");
      // Never cancel an order that got paid another way (a newer session, a
      // bank transfer marked by the team): only an unpaid one is released.
      if (order.status === "pending" && UNPAID.has(order.paymentStatus)) {
        await deps.cancelOrder(orderId, failed ? "payment_failed" : "expired");
      }
      return "processed" as const;
    }
    default:
      return "ignored" as const;
  }
}

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== "POST") return text({ error: "method_not_allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return text({ error: "invalid_signature" }, 400);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return text({ error: "payload_too_large" }, 413);

  let event: WebhookEvent;
  try {
    event = await deps.verify(rawBody, signature);
  } catch {
    return text({ error: "invalid_signature" }, 400);
  }

  const session = sessionOf(event);
  const orderId = orderIdOf(session);
  const handled = (HANDLED_EVENTS as readonly string[]).includes(event.type);

  let status: EventStatus;
  try {
    status = await deps.recordEvent(event, session?.id ?? null, orderId);
  } catch (error) {
    deps.log("event not recorded", error instanceof Error ? error.message : error);
    return text({ error: "retry" }, 500);
  }
  if (status === "processed" || status === "ignored") return text({ received: true, duplicate: true }, 200);

  // Not an event of ours (other type, or a session this site did not create).
  if (!handled || !session || !orderId) {
    try {
      await deps.finishEvent(event.id, "ignored");
    } catch (error) {
      deps.log("event not finished", error instanceof Error ? error.message : error);
      return text({ error: "retry" }, 500);
    }
    return text({ received: true, ignored: true }, 200);
  }

  try {
    const outcome = await applyEvent(event, session, orderId, deps);
    await deps.finishEvent(event.id, outcome);
    return text({ received: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permanent = error instanceof DbCallError && error.code !== undefined && PERMANENT_SQLSTATES.has(error.code);
    deps.log(`processing ${event.type} failed (${permanent ? "permanent" : "will retry"})`, message);
    try {
      await deps.finishEvent(event.id, "failed", message.slice(0, 2000));
    } catch (finishError) {
      deps.log("event not finished", finishError instanceof Error ? finishError.message : finishError);
      return text({ error: "retry" }, 500);
    }
    // A permanent failure is stored for the team (stripe_webhook_events.status
    // = 'failed') and acknowledged; anything else is retried by Stripe.
    return permanent ? text({ received: true, failed: true }, 200) : text({ error: "retry" }, 500);
  }
}
