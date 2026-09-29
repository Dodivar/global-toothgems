import type {
  AdminCustomer,
  AdminOrder,
  AdminOrderStatus,
  AdminPayment,
  FulfillmentStatus,
  PaymentMethod,
  PaymentStatus,
  TimelineEvent,
} from "../data/adminOrders";
import { orderTotal } from "../data/adminOrders";
import type { Product } from "../data/products";
import { mapOrderLine, money, type OrderItemRow, type ShipmentRow } from "./orderMapping";

/**
 * `orders` rows → the back office's `AdminOrder`. Pure, so it is unit-tested
 * without a Supabase client (`adminOrderMapping.test.ts`).
 *
 * Customer details come from the order's own snapshot (addresses, email),
 * never from the live profile: an order shows who it was sent to.
 */

export interface AddressSnapshot {
  first_name?: string;
  last_name?: string;
  address_line1?: string;
  postal_code?: string;
  city?: string;
  country_code?: string;
  phone?: string;
}

export interface PaymentRow {
  provider_payment_id: string | null;
  provider_checkout_id: string | null;
  status: string;
  amount: number | string;
  amount_refunded: number | string;
  payment_method_type: string | null;
  card_brand: string | null;
  card_last4: string | null;
  created_at: string;
}

export interface AdminOrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_email: string;
  billing_address: AddressSnapshot;
  shipping_address: AddressSnapshot | null;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  discount_amount: number | string;
  shipping_amount: number | string;
  currency: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItemRow[];
  shipments: (ShipmentRow & { shipped_at: string | null })[];
  payments: PaymentRow[];
}

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

/** Back-office fulfilment value → database column. */
export function fulfillmentToDb(value: FulfillmentStatus): string {
  return value === "partiallyFulfilled" ? "partially_fulfilled" : value;
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
      return "bankTransfer";
    case "card":
      return "card";
    default:
      return "other";
  }
}

function mapPayment(order: AdminOrderRow, status: PaymentStatus): AdminPayment {
  const row = [...order.payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const captured = row && (row.status === "succeeded" || row.status.includes("refunded")) ? money(row.amount) : 0;
  const refunded = row ? money(row.amount_refunded) : 0;
  return {
    method: paymentMethod(row),
    last4: row?.card_last4 ?? undefined,
    status,
    reference: row?.provider_payment_id ?? row?.provider_checkout_id ?? "—",
    capturedAt: captured > 0 ? row!.created_at : undefined,
    captured,
    refunded: refunded > 0 ? refunded : undefined,
  };
}

/** The history the row's own dates can vouch for. */
function timelineOf(order: AdminOrderRow, payment: AdminPayment): TimelineEvent[] {
  const events: TimelineEvent[] = [{ kind: "placed", at: order.created_at }];
  if (payment.capturedAt) events.push({ kind: "paymentConfirmed", at: payment.capturedAt });
  if (order.payment_status === "failed") events.push({ kind: "paymentFailed", at: order.updated_at });
  for (const s of order.shipments) {
    if (s.shipped_at) events.push({ kind: "shipped", at: s.shipped_at });
    if (s.delivered_at) events.push({ kind: "delivered", at: s.delivered_at });
  }
  if (order.status === "cancelled") events.push({ kind: "cancelled", at: order.updated_at });
  if (order.payment_status === "refunded") events.push({ kind: "refunded", at: order.updated_at });
  if (order.payment_status === "partially_refunded") events.push({ kind: "partiallyRefunded", at: order.updated_at });
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

function customerOf(order: AdminOrderRow): AdminCustomer {
  const address = order.shipping_address ?? order.billing_address;
  return {
    id: order.user_id ?? `guest:${order.customer_email.toLowerCase()}`,
    firstName: address.first_name?.trim() || order.customer_email.split("@")[0],
    lastName: address.last_name?.trim() ?? "",
    email: order.customer_email,
    phone: address.phone ?? "",
    // Filled in by `mapAdminOrders`, which sees the customer's other orders.
    orderCount: 1,
    since: order.created_at.slice(0, 10),
    lifetimeValue: 0,
    addressLine: address.address_line1 ?? "",
    postalCode: address.postal_code ?? "",
    city: address.city ?? "",
    country: (address.country_code ?? "").toLowerCase(),
  };
}

export function mapAdminOrder(row: AdminOrderRow, findProduct: (slug: string) => Product | undefined): AdminOrder {
  const paymentStatus = PAYMENT_STATUS[row.payment_status] ?? "pending";
  const payment = mapPayment(row, paymentStatus);
  const parcel = [...row.shipments]
    .filter((s) => s.carrier && s.tracking_number && s.status !== "cancelled")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return {
    reference: row.order_number,
    placedAt: row.created_at,
    status: row.status as AdminOrderStatus,
    payment,
    fulfillment: FULFILLMENT[row.fulfillment_status] ?? "unfulfilled",
    attention: paymentStatus === "failed" && row.status !== "cancelled" ? "paymentFailed" : undefined,
    customer: customerOf(row),
    lines: row.order_items.map((item) => mapOrderLine(item, findProduct)),
    currency: row.currency,
    shippingMethod: row.shipping_address ? "standard" : "digital",
    shippingCost: money(row.shipping_amount),
    discount: money(row.discount_amount),
    shipment: parcel
      ? {
          carrier: parcel.carrier!,
          number: parcel.tracking_number!,
          estimatedDelivery: parcel.estimated_delivery ?? parcel.delivered_at?.slice(0, 10) ?? "",
        }
      : undefined,
    timeline: timelineOf(row, payment),
    // One free-text column holds the team's notes for now.
    notes: row.admin_note
      ? [{ id: `${row.order_number}-note`, author: "Global Toothgems", at: row.updated_at, body: { fr: row.admin_note, en: row.admin_note } }]
      : [],
  };
}

/**
 * The whole book, with each customer's order count, first order and lifetime
 * value computed across it. Lifetime value counts paid money that stayed paid.
 */
export function mapAdminOrders(rows: AdminOrderRow[], findProduct: (slug: string) => Product | undefined): AdminOrder[] {
  const orders = rows.map((row) => mapAdminOrder(row, findProduct));
  const byCustomer = new Map<string, AdminOrder[]>();
  for (const o of orders) byCustomer.set(o.customer.id, [...(byCustomer.get(o.customer.id) ?? []), o]);
  return orders.map((o) => {
    const mine = byCustomer.get(o.customer.id)!;
    return {
      ...o,
      customer: {
        ...o.customer,
        orderCount: mine.length,
        since: mine.reduce((min, x) => (x.placedAt < min ? x.placedAt : min), o.placedAt).slice(0, 10),
        lifetimeValue: mine
          .filter((x) => x.payment.status === "paid" && x.status !== "cancelled" && x.status !== "refunded")
          .reduce((sum, x) => sum + orderTotal(x), 0),
      },
    };
  });
}
