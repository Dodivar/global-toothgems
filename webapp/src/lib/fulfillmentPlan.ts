import type { AdminOrder } from "../data/adminOrders";

/**
 * What can still be shipped or refunded on an order, from what the database
 * recorded. These figures only pre-fill and bound the forms: the database
 * re-checks every quantity and every amount (`guard_shipment_item`,
 * `guard_refund`), and Stripe is the authority on money. Amounts are integer
 * minor units; no float ever touches money (AGENTS.md §8).
 */

type Line = AdminOrder["lines"][number];

/** A physical line: courses and gift cards are delivered, not shipped. */
export function isShippableLine(line: Pick<Line, "courseId" | "giftCardDesign">): boolean {
  return !line.courseId && !line.giftCardDesign;
}

/** Parcels in these states no longer hold units. */
const RELEASED_PARCELS = new Set(["cancelled", "returned", "lost"]);

export interface LineBalance {
  lineId: string;
  ordered: number;
  /** Units in a parcel that is preparing, shipped or delivered. */
  inParcels: number;
  /** Units refunded or being refunded. */
  refunded: number;
  /** What can still go into a new parcel. */
  toShip: number;
  /** What can still be refunded line-wise. */
  refundable: number;
}

export function lineBalances(order: AdminOrder): LineBalance[] {
  return order.lines.map((line) => {
    const inParcels = order.parcels
      .filter((p) => !RELEASED_PARCELS.has(p.status))
      .reduce((sum, p) => sum + p.items.filter((i) => i.lineId === line.id).reduce((s, i) => s + i.qty, 0), 0);
    const refunded = order.refunds
      .filter((r) => r.status === "pending" || r.status === "succeeded")
      .reduce((sum, r) => sum + r.items.filter((i) => i.lineId === line.id).reduce((s, i) => s + i.qty, 0), 0);
    const shippable = isShippableLine(line);
    return {
      lineId: line.id,
      ordered: line.qty,
      inParcels,
      refunded,
      toShip: shippable ? Math.max(line.qty - inParcels - refunded, 0) : 0,
      refundable: Math.max(line.qty - refunded, 0),
    };
  });
}

/** A parcel can be created while the order stands, is paid, and has a unit left to ship. */
export function canCreateParcel(order: AdminOrder): boolean {
  const paid = order.payment.status === "paid" || order.payment.status === "partiallyRefunded";
  const open = order.status !== "cancelled" && order.status !== "refunded";
  return paid && open && order.shippingMethod !== "digital" && lineBalances(order).some((b) => b.toShip > 0);
}

/**
 * What the card can still give back: collected, less refunded, less what
 * pending refunds already claim. Zero when nothing was paid by card (gift
 * cards are refunded another way).
 */
export function refundableMinor(order: AdminOrder): number {
  const pending = order.refunds.filter((r) => r.status === "pending").reduce((sum, r) => sum + r.amount, 0);
  return Math.max(order.payment.captured - order.payment.refunded - pending, 0);
}

export function canRefund(order: AdminOrder): boolean {
  return refundableMinor(order) > 0 && order.status !== "cancelled";
}

/** Integer division rounded half up, for non-negative integers. */
function roundedShare(amount: number, numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.floor((amount * numerator * 2 + denominator) / (denominator * 2));
}

/**
 * A starting amount for the lines picked: each line's net price (its total less
 * its share of the discounts) for the units picked, capped at what the card can
 * give back. Shipping is not included: the team adds it when it is refunded.
 */
export function suggestedRefundMinor(order: AdminOrder, picks: { lineId: string; qty: number }[]): number {
  let sum = 0;
  for (const pick of picks) {
    const line = order.lines.find((l) => l.id === pick.lineId);
    if (!line || pick.qty <= 0) continue;
    const net = Math.max(line.totalAmount - line.discountAmount, 0);
    sum += roundedShare(net, Math.min(pick.qty, line.qty), line.qty);
  }
  return Math.min(sum, refundableMinor(order));
}

/** `"12,50"`, `"12.5"`, `" 12 "` → 1250; null for anything that is not a positive amount with at most two decimals. */
export function parseAmountToMinor(text: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return minor > 0 ? minor : null;
}

/** 1250 → "12.50", the form field's text. */
export function minorToField(minor: number): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
