import { holdsMoney, parseInstant, type AdminOrder, type AdminOrderLine } from "../data/adminOrders";

/**
 * What the dashboard's sales chart is made of, computed from the order book
 * the back office already reads (`lib/adminOrders.tsx`). Pure: the screen
 * passes the book, the window and the clock.
 *
 * Rules (to confirm with the owner, `AGENTS.md` §15):
 * - an order counts when its money is held (`holdsMoney`: paid, possibly in
 *   part refunded), on the day it was paid (placed, when no payment date);
 * - revenue is the order total (VAT and shipping included) minus what was
 *   refunded, in minor units; only the shop currency is counted — amounts in
 *   different currencies are never added (§8);
 * - the average basket is revenue / orders of the day, and undefined (`null`)
 *   on a day without an order: a gap, not a zero;
 * - a line is a course when it has a `courseId`, a gift card when it has a
 *   `giftCardDesign` (neither is a "product bought"), a product otherwise —
 *   `productId` alone would miss products that left the shop.
 */

export const DASHBOARD_WINDOWS = [7, 14, 30] as const;
export type DashboardWindow = (typeof DASHBOARD_WINDOWS)[number];
export const DEFAULT_DASHBOARD_WINDOW: DashboardWindow = 7;

export function readDashboardWindow(value: string | null): DashboardWindow {
  const days = Number(value);
  return (DASHBOARD_WINDOWS as readonly number[]).includes(days) ? (days as DashboardWindow) : DEFAULT_DASHBOARD_WINDOW;
}

export interface SalesDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Minor units, net of refunds. */
  revenue: number;
  orders: number;
  /** Minor units, or `null` when no order was paid that day. */
  averageBasket: number | null;
  products: number;
  courses: number;
}

export interface SalesSeries {
  currency: string;
  days: SalesDay[];
  totals: {
    revenue: number;
    orders: number;
    averageBasket: number | null;
    products: number;
    courses: number;
  };
}

/** Local `YYYY-MM-DD` of a date (the shop's day is the administrator's day). */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export type LineKind = "product" | "course" | "giftCard";

export function lineKind(line: Pick<AdminOrderLine, "courseId" | "giftCardDesign">): LineKind {
  if (line.courseId) return "course";
  if (line.giftCardDesign) return "giftCard";
  return "product";
}

/** The currency the book is mostly sold in: where the chart's amounts come from. */
export function dominantCurrency(orders: Pick<AdminOrder, "currency">[], fallback = "EUR"): string {
  const counts = new Map<string, number>();
  for (const order of orders) counts.set(order.currency, (counts.get(order.currency) ?? 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

export function buildSalesSeries(orders: AdminOrder[], window: number, now: Date): SalesSeries {
  const currency = dominantCurrency(orders);
  const days: SalesDay[] = [];
  const byDay = new Map<string, SalesDay>();
  for (let offset = window - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const entry: SalesDay = { day: localDay(date), revenue: 0, orders: 0, averageBasket: null, products: 0, courses: 0 };
    days.push(entry);
    byDay.set(entry.day, entry);
  }

  for (const order of orders) {
    if (order.currency !== currency || !holdsMoney(order)) continue;
    const entry = byDay.get(localDay(parseInstant(order.payment.capturedAt ?? order.placedAt)));
    if (!entry) continue;
    entry.orders += 1;
    entry.revenue += Math.max(0, order.amounts.total - order.payment.refunded);
    for (const line of order.lines) {
      const kind = lineKind(line);
      if (kind === "product") entry.products += line.qty;
      else if (kind === "course") entry.courses += line.qty;
    }
  }

  const totals = { revenue: 0, orders: 0, averageBasket: null as number | null, products: 0, courses: 0 };
  for (const entry of days) {
    entry.averageBasket = entry.orders > 0 ? Math.round(entry.revenue / entry.orders) : null;
    totals.revenue += entry.revenue;
    totals.orders += entry.orders;
    totals.products += entry.products;
    totals.courses += entry.courses;
  }
  totals.averageBasket = totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : null;
  return { currency, days, totals };
}

/**
 * Orders to prepare: money held, something to ship, not shipped yet and not
 * cancelled. Digital-only orders have nothing to prepare.
 */
export function ordersToShip(orders: AdminOrder[]): AdminOrder[] {
  return orders.filter(
    (order) =>
      holdsMoney(order) &&
      order.shippingMethod !== "digital" &&
      (order.status === "confirmed" || order.status === "processing") &&
      order.fulfillment !== "fulfilled",
  );
}

/* ------------------------------------------------------------------ spline */

export interface Point {
  x: number;
  y: number;
}

/**
 * Smooth path through the points that never overshoots them: a monotone cubic
 * (Fritsch–Carlson), so a curve cannot dip below zero or peak between two
 * days where nothing happened. `null` y-values break the line into separate
 * segments (a day without an order is a gap, not a zero).
 */
export function splinePath(points: (Point | null)[]): string {
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (const point of points) {
    if (point) current.push(point);
    else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments.map(segmentPath).join(" ");
}

function segmentPath(p: Point[]): string {
  const f = (n: number) => n.toFixed(2);
  if (p.length === 1) return `M${f(p[0].x)},${f(p[0].y)}`;
  const n = p.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(p[i + 1].x - p[i].x);
    slope.push((p[i + 1].y - p[i].y) / (dx[i] || 1));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const norm = Math.hypot(a, b);
    if (norm > 3) {
      tangent[i] = (3 * a * slope[i]) / norm;
      tangent[i + 1] = (3 * b * slope[i]) / norm;
    }
  }
  let d = `M${f(p[0].x)},${f(p[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C${f(p[i].x + h)},${f(p[i].y + tangent[i] * h)} ${f(p[i + 1].x - h)},${f(p[i + 1].y - tangent[i + 1] * h)} ${f(p[i + 1].x)},${f(p[i + 1].y)}`;
  }
  return d;
}
