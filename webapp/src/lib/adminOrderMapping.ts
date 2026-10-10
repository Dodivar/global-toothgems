import { INVOICE_SELECT } from "./documents/invoiceModel";
import type {
  AdminDiscount,
  AdminGiftCardUse,
  AdminNote,
  AdminOrder,
  AdminOrderStatus,
  AdminPayment,
  AdminTaxLine,
  FulfillmentStatus,
  OrderBuyer,
  PaymentMethod,
  PaymentStatus,
  TimelineEvent,
} from "../data/adminOrders";
import { spentByCurrency, type SpentTotal } from "../data/orders";
import type { Product } from "../data/products";
import { toMinorUnits } from "./catalog/money";
import {
  mapOrder,
  type CustomerOrderItemRow,
  type OrderDiscountRow,
  type OrderRow,
} from "./orderMapping";

/**
 * `orders` rows → the back office's `AdminOrder`. Pure, so it is unit-tested
 * without a Supabase client (`adminOrderMapping.test.ts`).
 *
 * Built on the member area's `mapOrder` (`orderMapping.ts`): amounts, lines,
 * discounts, parcels, refunds and address snapshots follow exactly the same
 * rules on both sides — recorded values in integer minor units, never
 * recomputed. This module adds what only staff read: payment references, gift
 * cards used, VAT by rate, the buyer's history in the book, a timeline dated
 * by the rows themselves, and the internal notes.
 */

type Amount = number | string;

export interface AdminOrderItemRow extends CustomerOrderItemRow {
  tax_rate_bp: number;
  tax_amount: Amount;
}

export interface AdminOrderDiscountRow extends OrderDiscountRow {
  source: string;
}

export interface PaymentRow {
  /** `stripe` (card provider) or `gift_card`. */
  provider: string;
  provider_payment_id: string | null;
  provider_checkout_id: string | null;
  status: string;
  amount: Amount;
  amount_refunded: Amount;
  payment_method_type: string | null;
  card_brand: string | null;
  card_last4: string | null;
  created_at: string;
  updated_at: string;
  /** Gift card payments only; staff can read `code_last4`, never the code. */
  gift_card: { code_last4: string | null } | null;
}

export interface AdminOrderRow
  extends Omit<OrderRow, "order_items" | "order_discounts"> {
  id: string;
  user_id: string | null;
  customer_email: string;
  updated_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  order_items: AdminOrderItemRow[];
  order_discounts: AdminOrderDiscountRow[];
  payments: PaymentRow[];
}

/** A staff note as `order_notes` holds it: one text per order. */
export interface OrderNoteRow {
  body: string;
  updated_at: string;
}

/**
 * Exactly the columns `AdminOrderRow` maps. Staff notes are read from
 * `order_notes`; `orders.admin_note` is always NULL and not read.
 */
export const ADMIN_ORDER_SELECT = `
  id, order_number, user_id, customer_email, created_at, updated_at, paid_at, cancelled_at,
  status, payment_status, fulfillment_status, currency,
  subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount,
  gift_card_amount, amount_due, prices_include_tax, shipping_method_name,
  billing_address, shipping_address,
  order_items ( id, product_name, variant_name, variant_id, unit_price, quantity, discount_amount, tax_rate_bp, tax_amount,
                product:products ( slug ), course:courses ( slug ), gift_cards ( design ) ),
  order_discounts ( label, code, goods_amount, shipping_amount, source ),
  shipments ( id, status, carrier, service, tracking_number, tracking_url, estimated_delivery,
              shipped_at, delivered_at, created_at, shipment_items ( order_item_id, quantity ) ),
  refunds ( id, provider_refund_id, amount, status, reason, created_at, processed_at, refund_items ( order_item_id, quantity ) ),
  payments ( provider, provider_payment_id, provider_checkout_id, status, amount, amount_refunded,
             payment_method_type, card_brand, card_last4, created_at, updated_at,
             gift_card:gift_cards ( code_last4 ) ),
  invoices ( ${INVOICE_SELECT} )
`;

const ORDER_STATUS: readonly AdminOrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const PAYMENT_STATUS: Record<string, PaymentStatus> = {
  paid: "paid",
  pending: "pending",
  failed: "failed",
  refunded: "refunded",
  partially_refunded: "partiallyRefunded",
};

const FULFILLMENT: Record<string, FulfillmentStatus> = {
  unfulfilled: "unfulfilled",
  preparing: "preparing",
  partially_fulfilled: "partiallyFulfilled",
  fulfilled: "fulfilled",
};

/** Payment rows that hold money: collected, possibly refunded since. */
const COLLECTED = new Set(["succeeded", "partially_refunded", "refunded"]);

/** Back-office fulfilment value → database column. */
export function fulfillmentToDb(value: FulfillmentStatus): string {
  return value === "partiallyFulfilled" ? "partially_fulfilled" : value;
}

function byTime(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

function paymentMethod(row: PaymentRow | undefined): PaymentMethod {
  const brand = row?.card_brand?.toLowerCase();
  if (brand === "visa" || brand === "mastercard") return brand;
  switch (row?.payment_method_type) {
    case "paypal":
      return "paypal";
    case "apple_pay":
      return "applePay";
    case "sepa_debit":
    case "bank_transfer":
    case "customer_balance":
      return "bankTransfer";
    case "card":
      return "card";
    default:
      return "other";
  }
}

/**
 * The card provider's side of the payment. Several Checkout attempts can
 * exist (an expired session, then a paid one): the method and reference shown
 * are those of the latest attempt that collected money, else the latest one.
 */
function mapPayment(row: AdminOrderRow, status: PaymentStatus): AdminPayment {
  const card = row.payments.filter((p) => p.provider !== "gift_card");
  const collected = card.filter((p) => COLLECTED.has(p.status));
  const shown = [...(collected.length > 0 ? collected : card)].sort((a, b) => byTime(b.created_at, a.created_at))[0];
  return {
    method: paymentMethod(shown),
    last4: shown?.card_last4 ?? undefined,
    status,
    reference: shown?.provider_payment_id ?? shown?.provider_checkout_id ?? undefined,
    capturedAt: row.paid_at ?? undefined,
    captured: collected.reduce((sum, p) => sum + toMinorUnits(p.amount), 0),
    refunded: collected.reduce((sum, p) => sum + toMinorUnits(p.amount_refunded), 0),
  };
}

function giftCardsOf(row: AdminOrderRow): AdminGiftCardUse[] {
  return row.payments
    .filter((p) => p.provider === "gift_card" && COLLECTED.has(p.status))
    .sort((a, b) => byTime(a.created_at, b.created_at))
    .map((p) => ({ last4: p.gift_card?.code_last4 ?? undefined, amount: toMinorUnits(p.amount), status: p.status }));
}

/**
 * VAT by rate, from the lines' own rates and amounts, highest rate first.
 * `create_order` also taxes the shipping at the standard rate without storing
 * that rate: what the order's VAT holds beyond its lines is shown as the
 * shipping's VAT, without a rate rather than with a guessed one.
 */
export function taxesOf(row: Pick<AdminOrderRow, "tax_amount" | "order_items">): AdminTaxLine[] {
  const byRate = new Map<number, number>();
  for (const item of row.order_items) {
    const amount = toMinorUnits(item.tax_amount);
    if (amount !== 0) byRate.set(item.tax_rate_bp, (byRate.get(item.tax_rate_bp) ?? 0) + amount);
  }
  const lines: AdminTaxLine[] = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rateBp, amount]) => ({ rateBp, amount }));
  const shipping = toMinorUnits(row.tax_amount) - lines.reduce((sum, l) => sum + l.amount, 0);
  if (shipping > 0) lines.push({ rateBp: null, amount: shipping });
  return lines;
}

/**
 * The history the rows can vouch for, oldest first. Every event carries the
 * date of the fact itself — never `orders.updated_at`, which moves with any
 * edit. A fact with no recorded date (an order marked "processing" by hand, a
 * status set without a parcel) has no event rather than an invented one.
 */
export function timelineOf(row: AdminOrderRow, captured: number): TimelineEvent[] {
  const events: TimelineEvent[] = [{ kind: "placed", at: row.created_at }];
  if (row.paid_at) events.push({ kind: "paymentConfirmed", at: row.paid_at });
  for (const p of row.payments) {
    // A payment row is closed as `failed` once and not touched again.
    if (p.provider !== "gift_card" && p.status === "failed") events.push({ kind: "paymentFailed", at: p.updated_at });
  }
  for (const s of row.shipments ?? []) {
    if (s.shipped_at) events.push({ kind: "shipped", at: s.shipped_at });
    if (s.delivered_at) events.push({ kind: "delivered", at: s.delivered_at });
  }
  if (row.cancelled_at) events.push({ kind: "cancelled", at: row.cancelled_at });

  let refunded = 0;
  const refunds = [...(row.refunds ?? [])].sort((a, b) => byTime(a.processed_at ?? a.created_at, b.processed_at ?? b.created_at));
  for (const r of refunds) {
    events.push({ kind: "refundRequested", at: r.created_at });
    if (!r.processed_at) continue;
    if (r.status === "succeeded") {
      refunded += toMinorUnits(r.amount);
      events.push({ kind: captured > 0 && refunded >= captured ? "refunded" : "partiallyRefunded", at: r.processed_at });
    } else if (r.status === "failed") {
      events.push({ kind: "refundFailed", at: r.processed_at });
    }
  }
  return events.sort((a, b) => byTime(a.at, b.at));
}

function buyerOf(row: AdminOrderRow): OrderBuyer {
  const address = row.billing_address ?? row.shipping_address ?? {};
  const first = address.first_name?.trim();
  return {
    id: row.user_id ?? `guest:${row.customer_email.toLowerCase()}`,
    firstName: first || row.customer_email.split("@")[0],
    lastName: first ? (address.last_name?.trim() ?? "") : "",
    email: row.customer_email,
    phone: (row.billing_address?.phone ?? row.shipping_address?.phone ?? "").trim(),
    // Filled in by `mapAdminOrders`, which sees the buyer's other orders.
    orderCount: 1,
    since: row.created_at.slice(0, 10),
    spend: [],
  };
}

function notesOf(row: AdminOrderRow, note: OrderNoteRow | undefined): AdminNote[] {
  // One text per order, each entry signed and dated inside it by whoever wrote it.
  if (!note?.body.trim()) return [];
  return [{ id: `${row.order_number}-notes`, author: "", at: note.updated_at, body: { fr: note.body, en: note.body } }];
}

export function mapAdminOrder(
  row: AdminOrderRow,
  findProduct: (slug: string) => Product | undefined,
  note?: OrderNoteRow,
): AdminOrder {
  const order = mapOrder(row, findProduct);
  const paymentStatus = PAYMENT_STATUS[row.payment_status] ?? "pending";
  const payment = mapPayment(row, paymentStatus);
  const status = (ORDER_STATUS as readonly string[]).includes(row.status) ? (row.status as AdminOrderStatus) : "pending";
  return {
    reference: row.order_number,
    placedAt: row.created_at,
    status,
    payment,
    fulfillment: FULFILLMENT[row.fulfillment_status] ?? "unfulfilled",
    attention: paymentStatus === "failed" && status !== "cancelled" ? "paymentFailed" : undefined,
    customer: buyerOf(row),
    lines: order.lines.map((line, index) => ({
      ...line,
      taxRateBp: row.order_items[index].tax_rate_bp,
      taxAmount: toMinorUnits(row.order_items[index].tax_amount),
    })),
    currency: row.currency,
    shippingMethod: order.ships ? "standard" : "digital",
    shippingMethodName: order.shippingMethod,
    amounts: order.amounts,
    discounts: order.discounts.map(
      (d, index): AdminDiscount => ({ ...d, source: row.order_discounts[index].source === "loyalty" ? "loyalty" : "promotion" }),
    ),
    giftCards: giftCardsOf(row),
    taxes: taxesOf(row),
    parcels: order.parcels,
    refunds: order.refunds,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    shipment: order.tracking,
    timeline: timelineOf(row, payment.captured),
    notes: notesOf(row, note),
    invoices: order.invoices,
  };
}

/**
 * Net spend per currency of a set of orders: the recorded totals of the paid
 * orders that stand, less what was refunded — the member area's rule
 * (`spentByCurrency`), restricted to orders whose money was received.
 */
export function spendOf(orders: AdminOrder[]): SpentTotal[] {
  const paid = orders.filter(
    (o) => o.payment.status === "paid" || o.payment.status === "partiallyRefunded" || o.payment.status === "refunded",
  );
  return spentByCurrency(paid);
}

/**
 * The whole book, with each buyer's order count, first order and spend
 * computed across it. `notes` are the staff notes by order id.
 */
export function mapAdminOrders(
  rows: AdminOrderRow[],
  findProduct: (slug: string) => Product | undefined,
  notes: Map<string, OrderNoteRow> = new Map(),
): AdminOrder[] {
  const orders = rows.map((row) => mapAdminOrder(row, findProduct, notes.get(row.id)));
  const byBuyer = new Map<string, AdminOrder[]>();
  for (const o of orders) byBuyer.set(o.customer.id, [...(byBuyer.get(o.customer.id) ?? []), o]);
  return orders.map((o) => {
    const mine = byBuyer.get(o.customer.id)!;
    return {
      ...o,
      customer: {
        ...o.customer,
        orderCount: mine.length,
        since: mine.reduce((min, x) => (x.placedAt < min ? x.placedAt : min), o.placedAt).slice(0, 10),
        spend: spendOf(mine),
      },
    };
  });
}
