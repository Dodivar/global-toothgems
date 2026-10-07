/**
 * The cart's pure rules. Amounts are integer minor units (cents) and only
 * indicative: the order is priced by `create_order()` in the database, never
 * from these numbers (AGENTS.md §8).
 */

/**
 * A gift card being bought: what the buyer typed on /carte-cadeau. The amount
 * is the line's `unitPrice` (minor units); create_order() checks it against
 * the shop's settings and creates the card, usable only once the order is paid.
 */
export interface CartGiftCard {
  recipientEmail: string;
  recipientName?: string;
  senderName?: string;
  message?: string;
  design: string;
  /** ISO date-time; absent: sent as soon as the payment is confirmed. */
  deliverAt?: string;
}

export interface CartLine {
  id: string;
  /** Storefront product id (the slug), for links and the mock catalogue. */
  productId: string;
  /** `products.id` of the Supabase catalogue: what the checkout sends. Absent on mock lines. */
  dbProductId?: string;
  /** `product_variants.id`, when the product has options. */
  variantId?: string;
  name: string;
  variant?: string;
  image: string;
  /** Indicative unit price in minor units. */
  unitPrice: number;
  currency: string;
  qty: number;
  /** Present on a gift card line: one card per line (quantity 1), several lines allowed. */
  giftCard?: CartGiftCard;
  /**
   * `courses.id` on an Academy course line (`productId` then holds the
   * course's French slug). A course is not a product: one seat (quantity 1),
   * nothing shipped, sold to a signed-in account only; access is granted by
   * the database once the order is paid.
   */
  courseId?: string;
}

/** Same bounds as the checkout (create_order accepts 1–1000 per line). */
export const MAX_LINE_QTY = 1000;

export const lineKey = (line: Pick<CartLine, "productId" | "variantId" | "variant">) =>
  `${line.productId}::${line.variantId ?? line.variant ?? ""}`;

export function addToLines(lines: CartLine[], line: Omit<CartLine, "id">): CartLine[] {
  const id = lineKey(line);
  const existing = lines.find((l) => l.id === id);
  if (existing) {
    return lines.map((l) => (l.id === id ? { ...l, qty: Math.min(MAX_LINE_QTY, l.qty + line.qty) } : l));
  }
  return [...lines, { ...line, id, qty: Math.min(MAX_LINE_QTY, line.qty) }];
}

/** How many units an addition really put on its line: merging is capped at `MAX_LINE_QTY`. */
export function addedQty(before: CartLine[], after: CartLine[], id: string): number {
  const qty = (lines: CartLine[]) => lines.find((l) => l.id === id)?.qty ?? 0;
  return qty(after) - qty(before);
}

/** Takes back the units an addition put on a line, removing the line once none is left. */
export function undoAddition(lines: CartLine[], id: string, added: number): CartLine[] {
  return lines.flatMap((l) => {
    if (l.id !== id) return [l];
    const qty = l.qty - added;
    return qty > 0 ? [{ ...l, qty }] : [];
  });
}

/** Gift cards and courses are bought one per line. */
const singleUnit = (line: CartLine) => Boolean(line.giftCard || line.courseId);

export function setLineQty(lines: CartLine[], id: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.id !== id);
  return lines.map((l) => (l.id === id ? { ...l, qty: singleUnit(l) ? 1 : Math.min(MAX_LINE_QTY, Math.floor(qty)) } : l));
}

/** A gift card line under its own id (one per recipient: never merged with another). */
export function addGiftCardToLines(lines: CartLine[], line: Omit<CartLine, "id" | "qty">, id: string): CartLine[] {
  return [...lines, { ...line, id: `gift-card::${id}`, qty: 1 }];
}

export const courseLineId = (courseId: string) => `course::${courseId}`;

/** A course, once: adding a course already in the basket leaves the basket as it is. */
export function addCourseToLines(lines: CartLine[], line: Omit<CartLine, "id" | "qty"> & { courseId: string }): CartLine[] {
  const id = courseLineId(line.courseId);
  if (lines.some((l) => l.id === id)) return lines;
  return [...lines, { ...line, id, qty: 1 }];
}

export const hasCourse = (lines: CartLine[]) => lines.some((l) => l.courseId);

/** Whether something in the basket is shipped (gift cards are sent by e-mail, courses open online). */
export const needsShipping = (lines: CartLine[]) => lines.some((l) => !l.giftCard && !l.courseId);

/** Goods that count for delivery rates and free-shipping thresholds: gift cards and courses excluded, as in create_order(). */
export const shippableSubtotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => (l.giftCard || l.courseId ? sum : sum + l.unitPrice * l.qty), 0);

export const cartCount = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.qty, 0);

/** Integer arithmetic only: unit prices are already in minor units. */
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);

export interface CheckoutGiftCard {
  amount_minor: number;
  recipient_email: string;
  recipient_name: string | null;
  sender_name: string | null;
  message: string | null;
  design: string | null;
  deliver_at: string | null;
}

export interface CheckoutProductItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  gift_card?: CheckoutGiftCard;
}

/** A course seat: the course's id only, the database prices it. */
export interface CheckoutCourseItem {
  course_id: string;
  quantity: 1;
}

export type CheckoutItem = CheckoutProductItem | CheckoutCourseItem;

/**
 * What the checkout function receives: identifiers and quantities only. Null
 * when a line does not come from the Supabase catalogue (a mock line or a cart
 * kept from before the switch), which the database could not price.
 */
export function checkoutItems(lines: CartLine[]): CheckoutItem[] | null {
  const items: CheckoutItem[] = [];
  for (const line of lines) {
    if (line.courseId) {
      items.push({ course_id: line.courseId, quantity: 1 });
      continue;
    }
    if (!line.dbProductId) return null;
    if (line.giftCard) {
      const card = line.giftCard;
      items.push({
        product_id: line.dbProductId,
        variant_id: null,
        quantity: 1,
        gift_card: {
          amount_minor: line.unitPrice,
          recipient_email: card.recipientEmail,
          recipient_name: card.recipientName || null,
          sender_name: card.senderName || null,
          message: card.message || null,
          design: card.design,
          deliver_at: card.deliverAt ?? null,
        },
      });
      continue;
    }
    items.push({ product_id: line.dbProductId, variant_id: line.variantId ?? null, quantity: line.qty });
  }
  return items;
}
