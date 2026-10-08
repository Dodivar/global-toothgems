/**
 * Strict validation of the body of `refund-order`. No amount is accepted in
 * anything but integer minor units, and nothing about the order (who paid, how
 * much) comes from the caller: the database reads it.
 */

export const REFUND_REASONS = [
  "requested_by_customer",
  "return",
  "defective",
  "not_received",
  "duplicate",
  "fraudulent",
  "goodwill",
  "other",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export interface RefundLine {
  order_item_id: string;
  quantity: number;
}

export interface RequestInput {
  action: "request";
  order_id: string;
  /** Integer minor units (cents) of the order's currency. */
  amount_minor: number;
  reason: RefundReason;
  items: RefundLine[];
  restock: boolean;
}

export interface CancelInput {
  action: "cancel";
  refund_id: string;
}

export type RefundInput = RequestInput | CancelInput;

export type Parsed = { ok: true; value: RefundInput } | { ok: false; field: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINES = 100;
/** 10 million euros: far above any real refund, and safely an integer. */
const MAX_MINOR = 1_000_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseRefundInput(body: unknown): Parsed {
  if (!isRecord(body)) return { ok: false, field: "body" };

  if (body.action === "cancel") {
    return typeof body.refund_id === "string" && UUID_RE.test(body.refund_id)
      ? { ok: true, value: { action: "cancel", refund_id: body.refund_id.toLowerCase() } }
      : { ok: false, field: "refund_id" };
  }
  if (body.action !== "request") return { ok: false, field: "action" };

  if (typeof body.order_id !== "string" || !UUID_RE.test(body.order_id)) return { ok: false, field: "order_id" };
  const amount = body.amount_minor;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_MINOR) {
    return { ok: false, field: "amount_minor" };
  }
  if (typeof body.reason !== "string" || !(REFUND_REASONS as readonly string[]).includes(body.reason)) {
    return { ok: false, field: "reason" };
  }
  if (body.restock !== undefined && typeof body.restock !== "boolean") return { ok: false, field: "restock" };

  const rawItems = body.items ?? [];
  if (!Array.isArray(rawItems) || rawItems.length > MAX_LINES) return { ok: false, field: "items" };
  const items: RefundLine[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    if (!isRecord(raw) || typeof raw.order_item_id !== "string" || !UUID_RE.test(raw.order_item_id)) {
      return { ok: false, field: "items" };
    }
    const quantity = raw.quantity;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) {
      return { ok: false, field: "items" };
    }
    const id = raw.order_item_id.toLowerCase();
    if (seen.has(id)) return { ok: false, field: "items" };
    seen.add(id);
    items.push({ order_item_id: id, quantity });
  }
  // Restocking means something: it needs the lines that come back.
  const restock = body.restock === true;
  if (restock && items.length === 0) return { ok: false, field: "restock" };

  return {
    ok: true,
    value: {
      action: "request",
      order_id: body.order_id.toLowerCase(),
      amount_minor: amount,
      reason: body.reason as RefundReason,
      items,
      restock,
    },
  };
}
