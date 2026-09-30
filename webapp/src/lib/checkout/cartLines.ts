/**
 * The cart's pure rules. Amounts are integer minor units (cents) and only
 * indicative: the order is priced by `create_order()` in the database, never
 * from these numbers (AGENTS.md §8).
 */

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

export function setLineQty(lines: CartLine[], id: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.id !== id);
  return lines.map((l) => (l.id === id ? { ...l, qty: Math.min(MAX_LINE_QTY, Math.floor(qty)) } : l));
}

export const cartCount = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.qty, 0);

/** Integer arithmetic only: unit prices are already in minor units. */
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);

export interface CheckoutItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
}

/**
 * What the checkout function receives: identifiers and quantities only. Null
 * when a line does not come from the Supabase catalogue (a mock line or a cart
 * kept from before the switch), which the database could not price.
 */
export function checkoutItems(lines: CartLine[]): CheckoutItem[] | null {
  const items: CheckoutItem[] = [];
  for (const line of lines) {
    if (!line.dbProductId) return null;
    items.push({ product_id: line.dbProductId, variant_id: line.variantId ?? null, quantity: line.qty });
  }
  return items;
}
