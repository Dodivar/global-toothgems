import { corsHeaders, json, readJson, type SiteOrigins } from "../_shared/http.ts";
import { parseRefundInput, type CancelInput, type RefundReason, type RequestInput } from "./input.ts";

/**
 * POST /functions/v1/refund-order — the only way a card refund leaves the back office.
 *
 *   back office --(caller's JWT + {action: "request", order_id, amount_minor, reason, items, restock})--> this function
 *
 *   1. the caller is authenticated from their JWT and `my_permissions()` is read
 *      WITH THAT JWT: without `manage_orders` nothing else happens;
 *   2. `request_refund()` runs WITH THE CALLER'S JWT: the database checks the
 *      permission, that the payment is a paid card payment, that the amount fits
 *      what is still refundable (payment row locked), that the lines were not
 *      refunded before, and that no gift card bought in the order is still
 *      active. The refund row is `pending` and audited under the caller;
 *   3. Stripe Refunds API (service secret, only here) with the idempotency key
 *      `refund:<refund id>`, the amount sent being the very integer received;
 *   4. the Stripe refund id is saved on the row. The refund is NOT confirmed
 *      here: `stripe-webhook` does it on the verified `refund.*` event
 *      (AGENTS.md §8) — payment, order, stock and the e-mail follow from that;
 *   5. a refusal by Stripe frees the balance (`mark_refund_failed`); a Stripe
 *      outage leaves the row pending (the idempotency key makes a retry safe and
 *      the webhook settles it) — the team sees it, and may cancel it while no
 *      Stripe refund id is attached.
 *
 *   {action: "cancel", refund_id}: a pending refund that never reached Stripe is
 *   cancelled WITH THE CALLER'S JWT (RLS + guard trigger, audited).
 *
 * Errors are short codes; SQL and Stripe messages are logged, never returned.
 */

export interface Caller {
  userId: string;
  permissions: ReadonlySet<string>;
}

export interface DbError {
  code?: string;
  message?: string;
}

export interface RefundRow {
  id: string;
  paymentId: string;
  status: string;
  providerRefundId: string | null;
}

export type StripeOutcome =
  | { ok: true; providerRefundId: string; status: string | null }
  /** Stripe answered and said no (invalid request, charge already refunded…): final. */
  | { ok: false; definite: true; code: string }
  /** No usable answer (network, timeout, 5xx): the refund may or may not exist. */
  | { ok: false; definite: false };

export interface RefundDeps {
  origins: SiteOrigins;
  /** The verified caller behind a user JWT, or null when the token is not valid. */
  caller(token: string): Promise<Caller | null>;
  /** `request_refund()` with the caller's JWT. */
  requestRefund(token: string, input: RequestInput): Promise<{ refund: RefundRow } | { error: DbError }>;
  /** The Stripe PaymentIntent of a payment row (service role); null when none was recorded. */
  paymentIntentOf(paymentId: string): Promise<string | null>;
  createStripeRefund(args: {
    paymentIntentId: string;
    amountMinor: number;
    refundId: string;
    orderId: string;
    reason: RefundReason;
  }): Promise<StripeOutcome>;
  /** Saves the Stripe refund id on a pending row (service role). */
  saveProviderRefundId(refundId: string, providerRefundId: string): Promise<void>;
  /** `mark_refund_failed()` (service role). */
  markFailed(refundId: string, reason: string): Promise<void>;
  /** The refund row (service role), to decide whether it can still be cancelled. */
  findRefund(refundId: string): Promise<RefundRow | null>;
  /** UPDATE status = 'cancelled' with the caller's JWT. */
  cancelAsCaller(token: string, refundId: string): Promise<DbError | null>;
  log(message: string, detail?: unknown): void;
}

export type RefundErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "no_card_payment"
  | "amount_too_high"
  | "gift_card_active"
  | "refund_refused"
  | "stripe_refused"
  | "stripe_unavailable"
  | "not_found"
  | "already_sent"
  | "server_error";

const STATUS: Record<RefundErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  no_card_payment: 409,
  amount_too_high: 409,
  gift_card_active: 409,
  refund_refused: 409,
  stripe_refused: 422,
  stripe_unavailable: 502,
  not_found: 404,
  already_sent: 409,
  server_error: 500,
};

const MAX_BODY_BYTES = 8 * 1024;

function bearer(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

const looksLikeJwt = (token: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);

/** Stripe's `reason` knows three values; the others stay in our own table. */
export function stripeReason(reason: RefundReason): "duplicate" | "fraudulent" | "requested_by_customer" | undefined {
  return reason === "duplicate" || reason === "fraudulent" || reason === "requested_by_customer" ? reason : undefined;
}

/** A refusal by the database's rules, as a code (messages are never returned). */
export function refusal(error: DbError): RefundErrorCode {
  const message = error.message ?? "";
  if (error.code === "42501") return "forbidden";
  if (error.code === "P0002") return "no_card_payment";
  if (error.code === "23514") {
    if (/refundable balance/.test(message)) return "amount_too_high";
    if (/gift card/.test(message)) return "gift_card_active";
    return "refund_refused";
  }
  if (error.code === "22023" || error.code === "22P02") return "invalid_request";
  return "server_error";
}

export async function handleRefundOrder(req: Request, deps: RefundDeps): Promise<Response> {
  const cors = corsHeaders(deps.origins, req.headers.get("origin"));
  const fail = (code: RefundErrorCode, extra: Record<string, unknown> = {}) =>
    json({ error: code, ...extra }, STATUS[code], cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return fail("unauthorized");
  let caller: Caller | null;
  try {
    caller = await deps.caller(token);
  } catch (error) {
    deps.log("caller check failed", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
  if (!caller) return fail("unauthorized");
  if (!caller.permissions.has("manage_orders")) return fail("forbidden");

  const parsed = parseRefundInput(await readJson(req, MAX_BODY_BYTES));
  if (!parsed.ok) return json({ error: "invalid_request", field: parsed.field }, 400, cors);

  try {
    return parsed.value.action === "cancel"
      ? await cancel(parsed.value, token, deps, fail, cors)
      : await request(parsed.value, token, deps, fail, cors);
  } catch (error) {
    deps.log("unexpected failure", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
}

type Fail = (code: RefundErrorCode, extra?: Record<string, unknown>) => Response;

async function request(
  input: RequestInput,
  token: string,
  deps: RefundDeps,
  fail: Fail,
  cors: Record<string, string>,
): Promise<Response> {
  const created = await deps.requestRefund(token, input);
  if ("error" in created) {
    const code = refusal(created.error);
    if (code === "server_error") deps.log("request_refund failed", created.error);
    return fail(code);
  }
  const refund = created.refund;

  const paymentIntentId = await deps.paymentIntentOf(refund.paymentId);
  if (!paymentIntentId) {
    // A card payment recorded without its PaymentIntent cannot be refunded through Stripe.
    await deps.markFailed(refund.id, "no_payment_intent");
    return fail("no_card_payment");
  }

  const outcome = await deps.createStripeRefund({
    paymentIntentId,
    amountMinor: input.amount_minor,
    refundId: refund.id,
    orderId: input.order_id,
    reason: input.reason,
  });

  if (!outcome.ok) {
    if (outcome.definite) {
      await deps.markFailed(refund.id, outcome.code.slice(0, 200));
      return fail("stripe_refused");
    }
    // Unknown outcome: the row stays pending. The same idempotency key makes a retry safe,
    // and the webhook settles it if Stripe did create the refund.
    deps.log("stripe refund outcome unknown", refund.id);
    return fail("stripe_unavailable", { refund_id: refund.id });
  }

  try {
    await deps.saveProviderRefundId(refund.id, outcome.providerRefundId);
  } catch (error) {
    // The webhook matches the refund by metadata.refund_id as well: not fatal.
    deps.log("provider refund id not saved", error instanceof Error ? error.message : error);
  }
  return json({ status: "requested", refund_id: refund.id, stripe_status: outcome.status }, 200, cors);
}

async function cancel(
  input: CancelInput,
  token: string,
  deps: RefundDeps,
  fail: Fail,
  cors: Record<string, string>,
): Promise<Response> {
  const refund = await deps.findRefund(input.refund_id);
  if (!refund) return fail("not_found");
  // Once Stripe has the refund, cancelling here would make the database disagree with it.
  if (refund.status !== "pending" || refund.providerRefundId) return fail("already_sent");
  const error = await deps.cancelAsCaller(token, refund.id);
  if (error) {
    const code = refusal(error);
    return fail(code === "no_card_payment" ? "not_found" : code);
  }
  return json({ status: "cancelled", refund_id: refund.id }, 200, cors);
}
