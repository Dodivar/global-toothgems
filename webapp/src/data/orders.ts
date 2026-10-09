import type { Localized } from "./types";
import { getProduct } from "./products";
import { getCourse } from "./courses";
import { toMinorUnits } from "../lib/catalog/money";
import type { OrderInvoice } from "../lib/invoiceMapping";

/**
 * Order history of the member area.
 *
 * The model mirrors what the database records for an order (`orders`,
 * `order_items`, `order_discounts`, `shipments`, `refunds`): every amount is
 * the one stored at purchase time, in integer minor units (cents) of the
 * order's own currency, and is only turned into major units when displayed.
 * Nothing here recomputes a total — discounts, gift cards and VAT are not
 * something the browser can rebuild.
 *
 * `SEED_ORDERS` is the mock-mode history (no Supabase configured); it is built
 * with the same shape so the screens have a single path.
 */

/**
 * The order's commercial status as the member area words it — one of the
 * three independent axes of an order (supabase/README.md, "Order states").
 * `confirmed` is a paid order with nothing to ship (digital only);
 * `accessGranted` is a mock course order.
 */
export type OrderStatus =
  | "processing"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "accessGranted"
  | "cancelled"
  | "refunded";

/** Money axis. Unpaid checkouts are not orders the customer placed, so they never reach the member area. */
export type OrderPaymentState = "paid" | "partiallyRefunded" | "refunded";

/** Physical axis: how much of the order has left the workshop. */
export type OrderFulfilment = "unfulfilled" | "preparing" | "partiallyShipped" | "shipped";

/** What a line is, whatever the screen: enough to name it, show it and link it. */
export interface PurchasedItem {
  /** Set for catalogue items still in the shop, so the history can link back to the product page. */
  productId?: string;
  /** Set for courses, so the history can link back to the course. */
  courseId?: string;
  /** Set for a gift card purchase: the design the buyer chose, so the history draws that card. */
  giftCardDesign?: string;
  name: Localized;
  variant?: Localized;
  image: string;
  qty: number;
}

/**
 * A line in the back office's prototype model (`data/adminOrders.ts`):
 * `unitPrice` in major units. The member area uses `CustomerOrderLine`.
 */
export interface OrderLine extends PurchasedItem {
  /** Unit price charged at the time of the order, not today's catalogue price. */
  unitPrice: number;
}

/** A line of a member's order. Amounts in minor units of the order currency. */
export interface CustomerOrderLine extends PurchasedItem {
  /** Stable key within the order (the `order_items` id with Supabase). */
  id: string;
  /** Unit price charged at the time of the order. */
  unitAmount: number;
  /** unitAmount × qty, before the line's discount. */
  totalAmount: number;
  /** Share of the order's discounts carried by this line. */
  discountAmount: number;
}

/** Everything the order cost, as recorded. Integer minor units of `Order.currency`. */
export interface OrderAmounts {
  /** Goods before discounts. */
  subtotal: number;
  /** Discounts on the goods (promotions, loyalty reward). */
  discount: number;
  /** Shipping actually charged (after a free-shipping promotion). */
  shipping: number;
  /** VAT; contained in the total when `taxIncluded`. */
  tax: number;
  taxIncluded: boolean;
  /** subtotal − discount + shipping (+ tax when not included). */
  total: number;
  /** Part of the total paid with gift cards. */
  giftCard: number;
  /** Part of the total paid by card (total − gift cards). */
  charged: number;
  /** Refunds that succeeded. */
  refunded: number;
}

/** A discount the order received, as named at purchase time. */
export interface OrderDiscount {
  label: string;
  code?: string;
  /** Off the goods. */
  goodsAmount: number;
  /** Off the shipping. */
  shippingAmount: number;
}

export type ParcelStatus = "preparing" | "shipped" | "delivered" | "returned" | "lost" | "cancelled";

/** One parcel of the order (an order can ship in several). */
export interface OrderParcel {
  id: string;
  status: ParcelStatus;
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  /** Carrier page for this parcel, https only (database check). */
  trackingUrl?: string;
  /** ISO dates (YYYY-MM-DD). */
  estimatedDelivery?: string;
  shippedOn?: string;
  deliveredOn?: string;
  /** Which lines, how many units. */
  items: { lineId: string; qty: number }[];
}

export type RefundReason =
  | "requested_by_customer"
  | "return"
  | "defective"
  | "not_received"
  | "duplicate"
  | "fraudulent"
  | "goodwill"
  | "other";

export interface OrderRefund {
  /** The refund row id; read by the back office only (the member's query does not select it). */
  id?: string;
  /** The payment provider already holds this refund: it can no longer be cancelled here. */
  sentToProvider?: boolean;
  /** Minor units of the order currency. */
  amount: number;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  reason: RefundReason;
  /** ISO date the refund was requested. */
  requestedOn: string;
  /** ISO date it was confirmed by the payment provider. */
  processedOn?: string;
  items: { lineId: string; qty: number }[];
}

/** Address snapshot taken at purchase time. */
export interface OrderAddress {
  name: string;
  company?: string;
  lines: string[];
  postalCode?: string;
  city: string;
  region?: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  phone?: string;
}

/** Carrier details of the parcel to follow. Absent until a parcel leaves. */
export interface OrderTracking {
  carrier: string;
  /** Carrier tracking number, shown as-is. */
  number: string;
  url?: string;
  /** ISO date (YYYY-MM-DD): delivered on, else announced by the carrier; empty if unknown. */
  estimatedDelivery: string;
}

export interface Order {
  /** Customer-facing reference, also the React key and the detail page's address. */
  reference: string;
  /** ISO date (YYYY-MM-DD) the order was placed. */
  placedOn: string;
  status: OrderStatus;
  payment: OrderPaymentState;
  fulfilment: OrderFulfilment;
  /** Something to deliver (a shipping address was given). */
  ships: boolean;
  /** ISO 4217. */
  currency: string;
  amounts: OrderAmounts;
  discounts: OrderDiscount[];
  lines: CustomerOrderLine[];
  parcels: OrderParcel[];
  refunds: OrderRefund[];
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  shippingMethod?: string;
  /** The latest parcel with a carrier and a number. */
  tracking?: OrderTracking;
  /** The legal invoice issued when the order was paid, then its credit notes. Absent in mock mode. */
  invoices?: OrderInvoice[];
}

/** Whether the order stands: cancelled and fully refunded orders no longer do. */
export function isActiveOrder(order: Pick<Order, "status">): boolean {
  return order.status !== "cancelled" && order.status !== "refunded";
}

/** Whether the order has a parcel journey to show. */
export function isShipment(order: Order): boolean {
  return order.ships && isActiveOrder(order);
}

/** Position of the order on the confirmed -> shipped -> delivered timeline. */
export function shipmentStep(order: Order): number {
  if (order.status === "delivered") return 2;
  if (order.status === "shipped" || order.fulfilment === "partiallyShipped" || order.fulfilment === "shipped") return 1;
  return 0;
}

export function orderItemCount(order: { lines: { qty: number }[] }): number {
  return order.lines.reduce((sum, l) => sum + l.qty, 0);
}

/** Lifetime spend in one currency, minor units. */
export interface SpentTotal {
  currency: string;
  amount: number;
}

/**
 * What the account has spent, per currency (amounts in different currencies
 * are never added): the recorded totals of the orders that stand, less what
 * was refunded. Sorted by currency code.
 */
export function spentByCurrency(
  orders: { status: string; currency: string; amounts: Pick<OrderAmounts, "total" | "refunded"> }[],
): SpentTotal[] {
  const totals = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const net = order.amounts.total - order.amounts.refunded;
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + net);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount }));
}

/* ------------------------------------------------------------------ */
/* Mock history                                                       */
/* ------------------------------------------------------------------ */

/** A catalogue product as it was bought (back office prototype). `unitPrice` defaults to the price it still has. */
export function productLine(id: string, qty: number, unitPrice?: number): OrderLine {
  const product = getProduct(id);
  if (!product) throw new Error(`Unknown product in order history: ${id}`);
  return {
    productId: id,
    name: product.name,
    variant: product.subtitle,
    image: product.image,
    unitPrice: unitPrice ?? product.price,
    qty,
  };
}

/** A course as it was bought (back office prototype). Courses are digital: one seat, no shipping. */
export function courseLine(id: string, unitPrice?: number): OrderLine {
  const course = getCourse(id);
  if (!course) throw new Error(`Unknown course in order history: ${id}`);
  return {
    courseId: id,
    name: course.title,
    variant: course.level,
    image: course.image,
    unitPrice: unitPrice ?? course.price,
    qty: 1,
  };
}

const DEMO_ADDRESS: OrderAddress = {
  name: "Camille Roussel",
  lines: ["12 rue des Lilas"],
  postalCode: "69003",
  city: "Lyon",
  countryCode: "FR",
};

/**
 * Mock mode only: a demo order built from display lines. There is no
 * database to record amounts, so they are derived here — VAT-inclusive
 * prices, no discount, VAT not itemised.
 */
export function mockOrder(input: {
  reference: string;
  placedOn: string;
  status: OrderStatus;
  shipping: number;
  lines: OrderLine[];
  tracking?: OrderTracking;
}): Order {
  const lines: CustomerOrderLine[] = input.lines.map((line, i) => {
    const unitAmount = toMinorUnits(line.unitPrice);
    const { unitPrice: _unitPrice, ...item } = line;
    return { ...item, id: `${input.reference}-${i + 1}`, unitAmount, totalAmount: unitAmount * line.qty, discountAmount: 0 };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.totalAmount, 0);
  const shipping = toMinorUnits(input.shipping);
  const ships = input.lines.some((l) => !l.courseId);
  const shipped = input.status === "shipped" || input.status === "delivered";
  const total = subtotal + shipping;
  const cancelled = input.status === "cancelled";
  return {
    reference: input.reference,
    placedOn: input.placedOn,
    status: input.status,
    payment: cancelled ? "refunded" : "paid",
    fulfilment: shipped ? "shipped" : ships && input.status === "processing" ? "preparing" : "unfulfilled",
    ships,
    currency: "EUR",
    amounts: { subtotal, discount: 0, shipping, tax: 0, taxIncluded: true, total, giftCard: 0, charged: total, refunded: cancelled ? total : 0 },
    discounts: [],
    lines,
    parcels:
      shipped && input.tracking
        ? [
            {
              id: `${input.reference}-P1`,
              status: input.status === "delivered" ? "delivered" : "shipped",
              carrier: input.tracking.carrier,
              trackingNumber: input.tracking.number,
              estimatedDelivery: input.tracking.estimatedDelivery,
              deliveredOn: input.status === "delivered" ? input.tracking.estimatedDelivery : undefined,
              items: lines.map((l) => ({ lineId: l.id, qty: l.qty })),
            },
          ]
        : [],
    refunds: [],
    shippingAddress: ships ? DEMO_ADDRESS : undefined,
    billingAddress: DEMO_ADDRESS,
    shippingMethod: ships ? (input.tracking?.carrier ?? "Colissimo") : undefined,
    tracking: input.tracking,
  };
}

/**
 * Seeded history, newest first. The two course orders are the counterpart of
 * the seeded enrolments in `lib/progress.tsx`: the Business kit was bought and
 * finished in the spring, the Foundation was bought in August and is under way.
 */
export const SEED_ORDERS: Order[] = [
  mockOrder({
    reference: "GT-2026-0151",
    placedOn: "2026-09-09",
    status: "shipped",
    shipping: 0,
    tracking: { carrier: "Colissimo", number: "6A214930571FR", estimatedDelivery: "2026-09-17" },
    lines: [productLine("aurora-heart", 2), productLine("aftercare", 1)],
  }),
  mockOrder({
    reference: "GT-2026-0143",
    placedOn: "2026-08-28",
    status: "accessGranted",
    shipping: 0,
    lines: [courseLine("fondation")],
  }),
  mockOrder({
    reference: "GT-2026-0129",
    placedOn: "2026-07-02",
    status: "delivered",
    shipping: 0,
    tracking: { carrier: "Chronopost", number: "XY884170023FR", estimatedDelivery: "2026-07-04" },
    // Bought during the summer offer: 169 €, not the 189 € it costs today.
    lines: [productLine("starter-kit", 1, 169), productLine("gants", 1)],
  }),
  mockOrder({
    reference: "GT-2026-0107",
    placedOn: "2026-05-18",
    status: "cancelled",
    shipping: 6.9,
    lines: [productLine("etoile", 1)],
  }),
  mockOrder({
    reference: "GT-2026-0061",
    placedOn: "2026-03-02",
    status: "accessGranted",
    shipping: 0,
    lines: [courseLine("business")],
  }),
];
