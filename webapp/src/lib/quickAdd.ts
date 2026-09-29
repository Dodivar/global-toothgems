import type { Product } from "../data/products";

/**
 * Whether a card may add the product without opening its page: only where the
 * product page itself would add without a choice — one option at most, in
 * stock, and not a prototype fixture, whose page asks for a shade and a size.
 */
export function canQuickAdd(product: Product, source: "supabase" | "mock"): boolean {
  return source !== "mock" && (product.variants?.length ?? 0) <= 1 && product.stock !== "out";
}
