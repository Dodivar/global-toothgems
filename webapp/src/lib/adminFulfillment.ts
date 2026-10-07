import { FunctionsHttpError } from "@supabase/supabase-js";
import { requireSupabase } from "./supabase/client";

/**
 * Writes of the order desk: parcels and refunds. The persistence boundary for
 * both (screens never call Supabase directly, AGENTS.md §6).
 *
 *   - Parcels: the RPCs `create_shipment` / `set_shipment_status` (one
 *     transaction, `manage_orders`, forward-only). The parcel's lines, the
 *     order's fulfilment and status, and the audit trail are the database's.
 *     The shipping e-mail is sent by the sweep (`send-pending-emails`) once a
 *     parcel is `shipped`: nothing to trigger from here.
 *   - Refunds: the Edge Function `refund-order` (the only code holding the
 *     Stripe secret). It records the request and sends it to Stripe; the new
 *     state of the payment and of the order arrives with Stripe's verified
 *     webhook, never from the browser (AGENTS.md §8). A refund asked for here
 *     is therefore "pending" until then.
 *
 * Every function answers with a short reason code, never a SQL or provider
 * message; the screens translate the code.
 */

export type FulfillmentError =
  | "forbidden"
  | "invalid"
  | "refused"
  | "amountTooHigh"
  | "giftCardActive"
  | "noCardPayment"
  | "stripeRefused"
  | "stripeUnavailable"
  | "alreadySent"
  | "notFound"
  | "unavailable";

export type FulfillmentResult = { ok: true } | { ok: false; error: FulfillmentError };

const OK: FulfillmentResult = { ok: true };
const fail = (error: FulfillmentError): FulfillmentResult => ({ ok: false, error });

/** A Postgres refusal (RPC) as a reason. */
export function reasonOfDbError(error: { code?: string } | null | undefined): FulfillmentError {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "22023":
    case "22P02":
      return "invalid";
    case "23514":
    case "23505":
      return "refused";
    case "P0002":
      return "notFound";
    default:
      return "unavailable";
  }
}

const FUNCTION_ERRORS: Record<string, FulfillmentError> = {
  forbidden: "forbidden",
  unauthorized: "forbidden",
  invalid_request: "invalid",
  no_card_payment: "noCardPayment",
  amount_too_high: "amountTooHigh",
  gift_card_active: "giftCardActive",
  refund_refused: "refused",
  stripe_refused: "stripeRefused",
  stripe_unavailable: "stripeUnavailable",
  not_found: "notFound",
  already_sent: "alreadySent",
};

/** `refund-order`'s `{ error }` code as a reason. */
export function reasonOfFunctionError(code: unknown): FulfillmentError {
  return typeof code === "string" && Object.hasOwn(FUNCTION_ERRORS, code) ? FUNCTION_ERRORS[code] : "unavailable";
}

export interface ParcelLineInput {
  orderItemId: string;
  quantity: number;
}

export interface ParcelInput {
  lines: ParcelLineInput[];
  carrier: string;
  service?: string;
  trackingNumber: string;
  trackingUrl?: string;
  /** ISO date (YYYY-MM-DD). */
  estimatedDelivery?: string;
  /** `preparing`: the label is not made yet; `shipped`: the parcel has left. */
  status: "preparing" | "shipped";
}

/** Empty strings never reach the database as values. */
const blank = (value: string | undefined) => (value && value.trim() !== "" ? value.trim() : null);

export async function createShipment(orderId: string, input: ParcelInput): Promise<FulfillmentResult> {
  const { error } = await requireSupabase().rpc("create_shipment", {
    p_order_id: orderId,
    p_items: input.lines.map((l) => ({ order_item_id: l.orderItemId, quantity: l.quantity })),
    p_carrier: blank(input.carrier) ?? undefined,
    p_service: blank(input.service) ?? undefined,
    p_tracking_number: blank(input.trackingNumber) ?? undefined,
    p_tracking_url: blank(input.trackingUrl) ?? undefined,
    p_estimated_delivery: blank(input.estimatedDelivery) ?? undefined,
    p_status: input.status,
  });
  if (error) {
    console.error("[admin fulfilment] create_shipment refused", error);
    return fail(reasonOfDbError(error));
  }
  return OK;
}

export interface ParcelChange {
  status: "preparing" | "shipped" | "delivered" | "returned" | "lost" | "cancelled";
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
}

export async function setShipmentStatus(parcelId: string, change: ParcelChange): Promise<FulfillmentResult> {
  const { error } = await requireSupabase().rpc("set_shipment_status", {
    p_shipment_id: parcelId,
    p_status: change.status,
    p_carrier: blank(change.carrier) ?? undefined,
    p_service: blank(change.service) ?? undefined,
    p_tracking_number: blank(change.trackingNumber) ?? undefined,
    p_tracking_url: blank(change.trackingUrl) ?? undefined,
    p_estimated_delivery: blank(change.estimatedDelivery) ?? undefined,
  });
  if (error) {
    console.error("[admin fulfilment] set_shipment_status refused", error);
    return fail(reasonOfDbError(error));
  }
  return OK;
}

export interface RefundInput {
  /** Integer minor units of the order's currency. */
  amountMinor: number;
  reason: string;
  lines: ParcelLineInput[];
  restock: boolean;
}

async function callRefundFunction(body: Record<string, unknown>): Promise<FulfillmentResult> {
  const { error } = await requireSupabase().functions.invoke("refund-order", { body });
  if (!error) return OK;
  if (error instanceof FunctionsHttpError) {
    try {
      const answer = (await (error.context as Response).json()) as { error?: unknown };
      return fail(reasonOfFunctionError(answer.error));
    } catch {
      return fail("unavailable");
    }
  }
  return fail("unavailable");
}

export function requestRefund(orderId: string, input: RefundInput): Promise<FulfillmentResult> {
  return callRefundFunction({
    action: "request",
    order_id: orderId,
    amount_minor: input.amountMinor,
    reason: input.reason,
    items: input.lines.map((l) => ({ order_item_id: l.orderItemId, quantity: l.quantity })),
    restock: input.restock,
  });
}

export function cancelRefund(refundId: string): Promise<FulfillmentResult> {
  return callRefundFunction({ action: "cancel", refund_id: refundId });
}
