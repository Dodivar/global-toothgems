import type {
  CustomerOrderLine,
  Order,
  OrderAddress,
  OrderFulfilment,
  OrderParcel,
  OrderPaymentState,
  OrderRefund,
  OrderStatus,
  OrderTracking,
  ParcelStatus,
  RefundReason,
} from "../data/orders";
import type { Product } from "../data/products";
import { toMinorUnits } from "./catalog/money";

/**
 * Database rows → the member area's `Order` model. Pure, so it is unit-tested
 * without a Supabase client (`orderMapping.test.ts`).
 *
 * An order is a historical record: names, prices, discounts, VAT and totals
 * come from what was stored at purchase time (`orders`, `order_items`,
 * `order_discounts`), never from today's catalogue and never recomputed here.
 * The catalogue only lends the photo and the link. Amounts become integer
 * minor units of the order currency, formatted only at display time.
 */

type Amount = number | string;

export interface OrderItemRow {
  product_name: string;
  variant_name: string | null;
  /** The variant bought, to pick its own photo (null for a variant-less line or once deleted). */
  variant_id?: string | null;
  unit_price: Amount;
  quantity: number;
  /** The product as it is now, for the link and the photo. Null once deleted. */
  product: { slug: string } | null;
  /** The Academy course of a course line, for the link (null when not a course line, or not readable). */
  course?: { slug: string } | null;
}

export interface CustomerOrderItemRow extends OrderItemRow {
  id: string;
  discount_amount: Amount;
  /** The card sold by a gift card line (readable by its purchaser only). */
  gift_cards?: { design: string }[] | { design: string } | null;
}

export interface ShipmentRow {
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface CustomerShipmentRow extends ShipmentRow {
  id: string;
  service: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  shipment_items: { order_item_id: string; quantity: number }[];
}

export interface OrderDiscountRow {
  label: string;
  code: string | null;
  goods_amount: Amount;
  shipping_amount: Amount;
}

export interface RefundRow {
  /** Selected by the back office only. */
  id?: string;
  provider_refund_id?: string | null;
  amount: Amount;
  status: string;
  reason: string;
  created_at: string;
  processed_at: string | null;
  refund_items: { order_item_id: string; quantity: number }[];
}

/** Shape of `orders.billing_address` / `shipping_address` (database check: the first five keys are required). */
export interface AddressSnapshotRow {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  city?: string;
  region?: string;
  country_code?: string;
  phone?: string;
}

export interface OrderRow {
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  currency: string;
  subtotal_amount: Amount;
  discount_amount: Amount;
  shipping_amount: Amount;
  tax_amount: Amount;
  total_amount: Amount;
  gift_card_amount: Amount;
  /** Generated column: total − gift cards. */
  amount_due: Amount | null;
  prices_include_tax: boolean;
  shipping_method_name: string | null;
  billing_address: AddressSnapshotRow | null;
  shipping_address: AddressSnapshotRow | null;
  order_items: CustomerOrderItemRow[];
  order_discounts: OrderDiscountRow[];
  shipments: CustomerShipmentRow[];
  refunds: RefundRow[];
}

/**
 * What `lib/orders.tsx` selects: exactly the columns `OrderRow` maps. Never
 * the internal fields (`admin_note`, `cancellation_reason`, refund
 * `failure_reason`, staff ids) — the member area has no use for them.
 */
export const CUSTOMER_ORDER_SELECT = `
  order_number, created_at, status, payment_status, fulfillment_status, currency,
  subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount,
  gift_card_amount, amount_due, prices_include_tax, shipping_method_name,
  billing_address, shipping_address,
  order_items ( id, product_name, variant_name, variant_id, unit_price, quantity, discount_amount, product:products ( slug ),
                course:courses ( slug ), gift_cards ( design ) ),
  order_discounts ( label, code, goods_amount, shipping_amount ),
  shipments ( id, status, carrier, service, tracking_number, tracking_url, estimated_delivery,
              shipped_at, delivered_at, created_at, shipment_items ( order_item_id, quantity ) ),
  refunds ( amount, status, reason, created_at, processed_at, refund_items ( order_item_id, quantity ) )
`;

/**
 * Payment states under which an order exists for the customer. A checkout
 * left unpaid (`pending`, `failed`) is not an order they placed, and the
 * cancellation of such an abandoned checkout is not one they need to see.
 */
export const CUSTOMER_VISIBLE_PAYMENT_STATUSES = ["paid", "refunded", "partially_refunded"] as const;

export function isCustomerVisible(row: Pick<OrderRow, "payment_status">): boolean {
  return (CUSTOMER_VISIBLE_PAYMENT_STATUSES as readonly string[]).includes(row.payment_status);
}

/**
 * The commercial status as the member area words it. Paid but not yet
 * shipped (`pending` after a late payment, `confirmed`, `processing`) reads
 * as "in preparation" when there is something to ship, "confirmed"
 * otherwise. A refunded order stays "refunded" — it is not a cancellation.
 */
export function mapOrderStatus(status: string, ships: boolean): OrderStatus {
  switch (status) {
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    default:
      return ships ? "processing" : "confirmed";
  }
}

export function mapPaymentState(paymentStatus: string): OrderPaymentState {
  if (paymentStatus === "refunded") return "refunded";
  if (paymentStatus === "partially_refunded") return "partiallyRefunded";
  return "paid";
}

export function mapFulfilment(fulfillmentStatus: string): OrderFulfilment {
  switch (fulfillmentStatus) {
    case "preparing":
      return "preparing";
    case "partially_fulfilled":
      return "partiallyShipped";
    case "fulfilled":
      return "shipped";
    default:
      return "unfulfilled";
  }
}

const PARCEL_STATUSES: readonly ParcelStatus[] = ["preparing", "shipped", "delivered", "returned", "lost", "cancelled"];
const REFUND_STATUSES: readonly OrderRefund["status"][] = ["pending", "succeeded", "failed", "cancelled"];
const REFUND_REASONS: readonly RefundReason[] = [
  "requested_by_customer",
  "return",
  "defective",
  "not_received",
  "duplicate",
  "fraudulent",
  "goodwill",
  "other",
];

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** The date part of a timestamp or date column. */
function day(value: string | null | undefined): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function mapAddress(row: AddressSnapshotRow | null): OrderAddress | undefined {
  if (!row) return undefined;
  const name = [row.first_name, row.last_name].map(text).filter(Boolean).join(" ");
  return {
    name,
    company: text(row.company),
    lines: [row.address_line1, row.address_line2].map(text).filter((l): l is string => Boolean(l)),
    postalCode: text(row.postal_code),
    city: text(row.city) ?? "",
    region: text(row.region),
    countryCode: (text(row.country_code) ?? "").toUpperCase(),
    phone: text(row.phone),
  };
}

export function mapCustomerLine(
  row: CustomerOrderItemRow,
  findProduct: (slug: string) => Product | undefined,
): CustomerOrderLine {
  const slug = row.product?.slug;
  const product = slug ? findProduct(slug) : undefined;
  const unitAmount = toMinorUnits(row.unit_price);
  const card = Array.isArray(row.gift_cards) ? row.gift_cards[0] : row.gift_cards;
  return {
    id: row.id,
    giftCardDesign: card?.design,
    productId: product ? slug : undefined,
    courseId: row.course?.slug ?? undefined,
    name: { fr: row.product_name, en: row.product_name },
    variant: row.variant_name ? { fr: row.variant_name, en: row.variant_name } : undefined,
    // The photo of the variant bought, else the product's.
    image:
      (row.variant_id ? product?.variants?.find((v) => v.id === row.variant_id)?.image : undefined) ??
      product?.image ??
      "",
    qty: row.quantity,
    unitAmount,
    totalAmount: unitAmount * row.quantity,
    discountAmount: toMinorUnits(row.discount_amount),
  };
}

export function mapParcel(row: CustomerShipmentRow): OrderParcel {
  return {
    id: row.id,
    status: oneOf(row.status, PARCEL_STATUSES, "preparing"),
    carrier: text(row.carrier),
    service: text(row.service),
    trackingNumber: text(row.tracking_number),
    trackingUrl: row.tracking_url?.startsWith("https://") ? row.tracking_url : undefined,
    estimatedDelivery: day(row.estimated_delivery),
    shippedOn: day(row.shipped_at),
    deliveredOn: day(row.delivered_at),
    items: (row.shipment_items ?? []).map((i) => ({ lineId: i.order_item_id, qty: i.quantity })),
  };
}

export function mapRefund(row: RefundRow): OrderRefund {
  return {
    ...(row.id ? { id: row.id, sentToProvider: Boolean(row.provider_refund_id) } : {}),
    amount: toMinorUnits(row.amount),
    status: oneOf(row.status, REFUND_STATUSES, "pending"),
    reason: oneOf(row.reason, REFUND_REASONS, "other"),
    requestedOn: row.created_at.slice(0, 10),
    processedOn: day(row.processed_at),
    items: (row.refund_items ?? []).map((i) => ({ lineId: i.order_item_id, qty: i.quantity })),
  };
}

/** The parcel to follow: the latest one that has a carrier and a number. */
export function trackingOf(shipments: ShipmentRow[]): OrderTracking | undefined {
  const parcel = [...shipments]
    .filter((s) => s.carrier && s.tracking_number && s.status !== "cancelled")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!parcel) return undefined;
  const url = (parcel as Partial<CustomerShipmentRow>).tracking_url;
  return {
    carrier: parcel.carrier!,
    number: parcel.tracking_number!,
    url: url?.startsWith("https://") ? url : undefined,
    estimatedDelivery: parcel.delivered_at?.slice(0, 10) ?? parcel.estimated_delivery ?? "",
  };
}

export function mapOrder(row: OrderRow, findProduct: (slug: string) => Product | undefined): Order {
  const ships = row.shipping_address !== null;
  const refunds = (row.refunds ?? []).map(mapRefund).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));
  const total = toMinorUnits(row.total_amount);
  const giftCard = toMinorUnits(row.gift_card_amount);
  return {
    reference: row.order_number,
    placedOn: row.created_at.slice(0, 10),
    status: mapOrderStatus(row.status, ships),
    payment: mapPaymentState(row.payment_status),
    fulfilment: mapFulfilment(row.fulfillment_status),
    ships,
    currency: row.currency,
    amounts: {
      subtotal: toMinorUnits(row.subtotal_amount),
      discount: toMinorUnits(row.discount_amount),
      shipping: toMinorUnits(row.shipping_amount),
      tax: toMinorUnits(row.tax_amount),
      taxIncluded: row.prices_include_tax,
      total,
      giftCard,
      charged: row.amount_due === null ? total - giftCard : toMinorUnits(row.amount_due),
      refunded: refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amount, 0),
    },
    discounts: (row.order_discounts ?? []).map((d) => ({
      label: d.label,
      code: text(d.code),
      goodsAmount: toMinorUnits(d.goods_amount),
      shippingAmount: toMinorUnits(d.shipping_amount),
    })),
    lines: row.order_items.map((item) => mapCustomerLine(item, findProduct)),
    parcels: (row.shipments ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(mapParcel),
    refunds,
    shippingAddress: mapAddress(row.shipping_address),
    billingAddress: mapAddress(row.billing_address),
    shippingMethod: text(row.shipping_method_name),
    tracking: trackingOf(row.shipments ?? []),
  };
}
