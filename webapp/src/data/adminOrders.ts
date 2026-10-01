import type { Localized } from "./types";
import type {
  CustomerOrderLine,
  OrderAddress,
  OrderAmounts,
  OrderDiscount,
  OrderParcel,
  OrderRefund,
  SpentTotal,
} from "./orders";

/**
 * The order book of the administration area: what `lib/adminOrders.tsx`
 * reads from Supabase (`orders` and their lines, discounts, payments,
 * shipments, refunds and staff notes) and `lib/adminOrderMapping.ts` turns
 * into this model.
 *
 * A separate model from the member's `Order` (`data/orders.ts`), because the
 * back office adds payment references, fulfilment, internal notes and the
 * buyer's history — `AGENTS.md` §6 keeps administration its own domain. The
 * pieces that are the same fact seen from both sides are shared: amounts,
 * lines, discounts, parcels, refunds and address snapshots.
 *
 * Money is what the database recorded at purchase time, in integer minor
 * units (cents) of `AdminOrder.currency`, formatted only at display time.
 * Nothing here recomputes a total, a tax or a refund: discounts, gift cards
 * and VAT per line and per country are not something the browser can rebuild
 * (`AGENTS.md` §8).
 */

export type AdminOrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentStatus = "paid" | "pending" | "failed" | "refunded" | "partiallyRefunded";

export type FulfillmentStatus = "unfulfilled" | "preparing" | "fulfilled" | "partiallyFulfilled";

/**
 * Why an order was flagged for the administrator. At most one reason per order.
 * The database records only failed payments today; the other reasons are kept
 * for the flags the back office will record (badges and copy exist).
 */
export type AttentionReason =
  | "paymentFailed"
  | "addressIncomplete"
  | "delayed"
  | "lowStock"
  | "refundRequested"
  | "fulfillmentIssue";

/** `digital`: nothing to ship (no shipping address); `standard`: any delivery method. */
export type ShippingMethod = "standard" | "express" | "pickup" | "digital";

/** `card` is a card whose brand the provider did not report; `other` any method not listed. */
export type PaymentMethod = "visa" | "mastercard" | "paypal" | "applePay" | "bankTransfer" | "card" | "other";

export const ORDER_STATUSES: AdminOrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

export const PAYMENT_STATUSES: PaymentStatus[] = ["paid", "pending", "failed", "refunded", "partiallyRefunded"];

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "unfulfilled",
  "preparing",
  "partiallyFulfilled",
  "fulfilled",
];

/** The delivery kinds an order records: something to ship, or nothing (digital). */
export const SHIPPING_METHODS: ShippingMethod[] = ["standard", "digital"];

/**
 * Who placed the order, from the order's own snapshot (e-mail, address
 * names), never from the live profile. Count, first order and spend are
 * computed across the book that was read.
 */
export interface OrderBuyer {
  /** The account id, or `guest:<email>` for a guest checkout. */
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Orders of this buyer in the book, the one being viewed included. */
  orderCount: number;
  /** ISO date (YYYY-MM-DD) of the first order in the book. */
  since: string;
  /** Net spend per currency (`spentByCurrency` rule), never added across currencies. */
  spend: SpentTotal[];
}

export interface AdminShipment {
  carrier: string;
  /** Tracking number, shown as-is. */
  number: string;
  /** https carrier page for this parcel, when recorded. */
  url?: string;
  /** ISO date (YYYY-MM-DD): delivered on, else announced; empty when unknown. */
  estimatedDelivery: string;
}

export interface AdminPayment {
  method: PaymentMethod;
  /** Last four digits for card payments, as the provider reported them. */
  last4?: string;
  /** The order's payment axis (`orders.payment_status`). */
  status: PaymentStatus;
  /** Provider reference (PaymentIntent, else Checkout Session), shown shortened. */
  reference?: string;
  /** ISO datetime the order was paid (`orders.paid_at`). */
  capturedAt?: string;
  /** Collected by the card provider, minor units. Zero while pending or failed. */
  captured: number;
  /** Given back by the card provider, minor units. */
  refunded: number;
}

/** A gift card spent on the order (a payment, not a discount). */
export interface AdminGiftCardUse {
  /** Last four characters of the code: the code itself is never readable. */
  last4?: string;
  /** Minor units taken from the card. */
  amount: number;
  /** Payment row status: `succeeded`, or `refunded` once credited back. */
  status: string;
}

/** VAT contained in the order at one rate. */
export interface AdminTaxLine {
  /** Basis points (2000 = 20 %). `null` for the shipping's VAT, whose rate is not recorded. */
  rateBp: number | null;
  /** Minor units. */
  amount: number;
}

export interface AdminDiscount extends OrderDiscount {
  /** `promotion` (automatic or code) or `loyalty` (a reward of the loyalty card). */
  source: "promotion" | "loyalty";
}

/** A line as sold. Amounts in minor units, from the line's own snapshot. */
export interface AdminOrderLine extends CustomerOrderLine {
  /** VAT rate applied to this line, basis points. */
  taxRateBp: number;
  /** VAT contained in this line, minor units. */
  taxAmount: number;
}

export type TimelineKind =
  | "placed"
  | "paymentConfirmed"
  | "paymentFailed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refundRequested"
  | "refunded"
  | "partiallyRefunded"
  | "refundFailed"
  | "addressFlagged"
  | "stockFlagged"
  | "delayFlagged"
  | "fulfillmentFlagged";

export interface TimelineEvent {
  kind: TimelineKind;
  /** ISO datetime, as recorded (with its offset). */
  at: string;
}

export interface AdminNote {
  id: string;
  author: string;
  /** ISO datetime. */
  at: string;
  body: Localized;
}

export interface AdminOrder {
  /** Back-office reference (`orders.order_number`), rendered with a leading `#`. */
  reference: string;
  /** ISO datetime the order was placed. */
  placedAt: string;
  status: AdminOrderStatus;
  payment: AdminPayment;
  fulfillment: FulfillmentStatus;
  /** Set only on the orders that need a human decision. */
  attention?: AttentionReason;
  customer: OrderBuyer;
  lines: AdminOrderLine[];
  /** ISO 4217 of every amount of the order. */
  currency: string;
  shippingMethod: ShippingMethod;
  /** The shipping rate's name at purchase time. */
  shippingMethodName?: string;
  amounts: OrderAmounts;
  discounts: AdminDiscount[];
  giftCards: AdminGiftCardUse[];
  /** VAT by rate, highest rate first; the shipping's VAT last. */
  taxes: AdminTaxLine[];
  /** Parcels, oldest first, with what each one contains. */
  parcels: OrderParcel[];
  /** Refunds of every status, newest first. */
  refunds: OrderRefund[];
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  /** The parcel to follow: the latest one with a carrier and a number. */
  shipment?: AdminShipment;
  /** What the recorded dates vouch for, oldest first. */
  timeline: TimelineEvent[];
  notes: AdminNote[];
}

/**
 * Orders the back office reads before it stops and says the book is
 * incomplete (`webapp/README.md`, Orders: filtering runs in the browser).
 */
export const BOOK_LIMIT = 10_000;

export function orderItemCount(order: { lines: { qty: number }[] }): number {
  return order.lines.reduce((sum, l) => sum + l.qty, 0);
}

export function customerName(customer: { firstName: string; lastName: string }): string {
  return `${customer.firstName} ${customer.lastName}`.trim();
}

export function customerInitials(customer: { firstName: string; lastName: string }): string {
  return `${customer.firstName.charAt(0)}${customer.lastName.charAt(0)}`.toUpperCase();
}

/** Whether the money of the order is held: paid, possibly in part refunded. */
export function holdsMoney(order: Pick<AdminOrder, "payment">): boolean {
  return order.payment.status === "paid" || order.payment.status === "partiallyRefunded";
}

/**
 * An ISO datetime as a `Date`. Database timestamps carry seconds and an
 * offset (`2026-09-30T10:04:05.123+00:00`); a bare `YYYY-MM-DDTHH:mm` is read
 * as local time.
 */
export function parseInstant(iso: string): Date {
  return new Date(/T\d{2}:\d{2}$/.test(iso) ? `${iso}:00` : iso);
}

/** A shortened provider reference: enough to find it in Stripe, short enough for a phone. */
export function shortReference(reference: string): string {
  return reference.length <= 18 ? reference : `${reference.slice(0, 8)}…${reference.slice(-6)}`;
}
