import { comboKey } from "./gemOptions";
import type { AdminProduct } from "../data/adminCatalog";
import { isBundle } from "./productBundles";

/**
 * The quick stock change of the product list (decision 91 in
 * `supabase/README.md`): what the pop-up computes before anything is sent.
 *
 * Two ways to say the same thing: "I received 20" (`add`, the usual restock)
 * or "there are 37 on the shelf" (`set`, after a stocktake). Both become a
 * relative change for `admin_adjust_stock()`, which adds it atomically; `set`
 * also sends the count it started from, so a sale paid meanwhile makes the
 * database refuse rather than be erased.
 */
export type StockChangeMode = "add" | "set";

export type StockChangeError = "empty" | "invalid" | "unchanged" | "belowReserved" | "tooLarge";

export interface StockChange {
  /** Units added to the shelf (negative when a correction lowers it). */
  delta: number;
  /** Count on the shelf once the change is saved. */
  next: number;
  error?: StockChangeError;
}

/** Same ceiling as the database function. */
export const MAX_STOCK_CHANGE = 1_000_000;

/** Reads what the administrator typed into a change of the current count. */
export function stockChange(mode: StockChangeMode, current: number, reserved: number, input: string): StockChange {
  const text = input.trim();
  if (text === "") return { delta: 0, next: current, error: "empty" };
  if (!/^\d+$/.test(text)) return { delta: 0, next: current, error: "invalid" };
  const value = Number(text);
  const next = mode === "add" ? current + value : value;
  const delta = next - current;
  if (delta === 0) return { delta, next, error: "unchanged" };
  if (Math.abs(delta) > MAX_STOCK_CHANGE) return { delta, next, error: "tooLarge" };
  if (next < reserved) return { delta, next, error: "belowReserved" };
  return { delta, next };
}

/**
 * The same change applied in memory, for the prototype store: on the
 * product's own count, or on one variant found by its list key (the
 * `comboKey()` of a pack/SS option, the id of any other variant). The caller
 * recomputes the totals (`withVariantStock()`).
 */
export function applyStockDelta(product: AdminProduct, variantKey: string | null, delta: number): AdminProduct {
  if (variantKey === null) return { ...product, stock: product.stock + delta };
  if (product.gemOptions) {
    return {
      ...product,
      gemOptions: {
        ...product.gemOptions,
        variants: product.gemOptions.variants.map((variant) =>
          comboKey(variant) === variantKey ? { ...variant, stock: variant.stock + delta } : variant,
        ),
      },
    };
  }
  return {
    ...product,
    customVariants: product.customVariants?.map((variant) =>
      variant.id === variantKey ? { ...variant, stock: variant.stock + delta } : variant,
    ),
  };
}

/**
 * Whether the product has a count the quick stock pop-up can change. A kit
 * has none of its own: its components' stock makes it (decision 117).
 */
export function hasAdjustableStock(product: AdminProduct): boolean {
  if (isBundle(product)) return false;
  return product.variantStock?.length
    ? product.variantStock.some((variant) => variant.trackInventory)
    : product.trackInventory && !product.variantCount;
}
