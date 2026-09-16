import type { Localized } from "./types";
import { getProduct } from "./products";
import { getCourse } from "./courses";

/**
 * Order history for the member dashboard.
 *
 * Mock data, like every other file in `data/`. Two rules from the project
 * guidelines are respected even here, because they shape the data model rather
 * than the backend: an order keeps the price actually charged at the time
 * (`unitPrice`) instead of reading today's catalogue price, and it carries its
 * own currency. Amounts stay plain euros with `formatPrice`, as everywhere else
 * in this prototype — the integer-minor-units rule belongs to the real backend,
 * and introducing it here alone would leave the app with two money
 * representations.
 */

export type OrderStatus = "processing" | "shipped" | "delivered" | "accessGranted" | "cancelled";

export interface OrderLine {
  /** Set for catalogue items, so the history can link back to the product page. */
  productId?: string;
  /** Set for courses, so the history can link back to the course. */
  courseId?: string;
  name: Localized;
  variant?: Localized;
  image: string;
  /** Unit price charged at the time of the order, not today's catalogue price. */
  unitPrice: number;
  qty: number;
}

export interface Order {
  /** Customer-facing reference, also the React key. */
  reference: string;
  /** ISO date (YYYY-MM-DD) the order was placed. */
  placedOn: string;
  status: OrderStatus;
  currency: string;
  shipping: number;
  lines: OrderLine[];
}

/** A catalogue product as it was bought. `unitPrice` defaults to the price it still has. */
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

/** A course as it was bought. Courses are digital: one seat, no shipping. */
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

export function orderSubtotal(order: Order): number {
  return order.lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
}

export function orderTotal(order: Order): number {
  return orderSubtotal(order) + order.shipping;
}

export function orderItemCount(order: Order): number {
  return order.lines.reduce((sum, l) => sum + l.qty, 0);
}

/**
 * Seeded history, newest first. The two course orders are the counterpart of
 * the seeded enrolments in `lib/progress.tsx`: the Business kit was bought and
 * finished in the spring, the Foundation was bought in August and is under way.
 */
export const SEED_ORDERS: Order[] = [
  {
    reference: "GT-2026-0151",
    placedOn: "2026-09-09",
    status: "shipped",
    currency: "EUR",
    shipping: 0,
    lines: [productLine("aurora-heart", 2), productLine("aftercare", 1)],
  },
  {
    reference: "GT-2026-0143",
    placedOn: "2026-08-28",
    status: "accessGranted",
    currency: "EUR",
    shipping: 0,
    lines: [courseLine("fondation")],
  },
  {
    reference: "GT-2026-0129",
    placedOn: "2026-07-02",
    status: "delivered",
    currency: "EUR",
    shipping: 0,
    // Bought during the summer offer: 169 €, not the 189 € it costs today.
    lines: [productLine("starter-kit", 1, 169), productLine("gants", 1)],
  },
  {
    reference: "GT-2026-0107",
    placedOn: "2026-05-18",
    status: "cancelled",
    currency: "EUR",
    shipping: 6.9,
    lines: [productLine("etoile", 1)],
  },
  {
    reference: "GT-2026-0061",
    placedOn: "2026-03-02",
    status: "accessGranted",
    currency: "EUR",
    shipping: 0,
    lines: [courseLine("business")],
  },
];
