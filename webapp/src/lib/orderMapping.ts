import type { Order, OrderLine, OrderStatus, OrderTracking } from "../data/orders";
import type { Product } from "../data/products";
import { toMajorUnits, toMinorUnits } from "./catalog/money";

/**
 * Database rows → the member area's `Order` model. Pure, so it is unit-tested
 * without a Supabase client (`orderMapping.test.ts`).
 *
 * An order is a historical record: names and prices come from the snapshot
 * taken at purchase time (`order_items.product_name`, `unit_price`), never from
 * today's catalogue. The catalogue only lends the photo and the link.
 */

export interface OrderItemRow {
  product_name: string;
  variant_name: string | null;
  unit_price: number | string;
  quantity: number;
  /** The product as it is now, for the link and the photo. Null once deleted. */
  product: { slug: string } | null;
}

export interface ShipmentRow {
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface OrderRow {
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  currency: string;
  shipping_amount: number | string;
  order_items: OrderItemRow[];
  shipments: ShipmentRow[];
}

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
 * The commercial status as the member area words it. Paid but not yet shipped
 * (`confirmed`, `processing`) reads as "in preparation"; a refunded order is
 * no longer on its way, like a cancelled one.
 */
export function mapOrderStatus(status: string): OrderStatus {
  switch (status) {
    case "shipped":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
    case "refunded":
      return "cancelled";
    default:
      return "processing";
  }
}

export function money(value: number | string): number {
  return toMajorUnits(toMinorUnits(value));
}

/** The parcel to follow: the latest one that has a carrier and a number. */
function trackingOf(shipments: ShipmentRow[]): OrderTracking | undefined {
  const parcel = [...shipments]
    .filter((s) => s.carrier && s.tracking_number && s.status !== "cancelled")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!parcel) return undefined;
  return {
    carrier: parcel.carrier!,
    number: parcel.tracking_number!,
    estimatedDelivery: parcel.estimated_delivery ?? parcel.delivered_at?.slice(0, 10) ?? "",
  };
}

export function mapOrderLine(row: OrderItemRow, findProduct: (slug: string) => Product | undefined): OrderLine {
  const slug = row.product?.slug;
  const product = slug ? findProduct(slug) : undefined;
  return {
    // Linked only while the product is still in the shop; the name stays the snapshot.
    productId: product ? slug : undefined,
    name: { fr: row.product_name, en: row.product_name },
    variant: row.variant_name ? { fr: row.variant_name, en: row.variant_name } : undefined,
    image: product?.image ?? "",
    unitPrice: money(row.unit_price),
    qty: row.quantity,
  };
}

export function mapOrder(row: OrderRow, findProduct: (slug: string) => Product | undefined): Order {
  return {
    reference: row.order_number,
    placedOn: row.created_at.slice(0, 10),
    status: mapOrderStatus(row.status),
    currency: row.currency,
    shipping: money(row.shipping_amount),
    tracking: trackingOf(row.shipments),
    lines: row.order_items.map((item) => mapOrderLine(item, findProduct)),
  };
}
