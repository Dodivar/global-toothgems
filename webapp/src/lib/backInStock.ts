import { isSupabaseConfigured } from "./supabase/env";
import { requireSupabase } from "./supabase/client";

/**
 * Back-in-stock alerts (decision 90 in supabase/README.md): the single persistence
 * boundary of the "Tell me when it's back" form on a product page. One call to
 * `request_back_in_stock_alert()`, which checks that the product (or option) is
 * out of stock right now, uses the account's address for a member and throttles
 * visitors. The e-mail itself is sent once by the `send-pending-emails` sweep when
 * the stock comes back.
 */

/** Answers of the database function, plus the client's own. Each has a message under `product.restock.errors`. */
export const BACK_IN_STOCK_ERRORS = [
  "invalid_email",
  "unavailable",
  "variant_required",
  "in_stock",
  "too_many_requests",
  "network",
] as const;
export type BackInStockError = (typeof BACK_IN_STOCK_ERRORS)[number];

export type BackInStockResult = { ok: true } | { ok: false; error: BackInStockError };

export interface BackInStockRequest {
  /** `products.id`. */
  productId: string;
  /** `product_variants.id`, for a product sold in options. */
  variantId?: string;
  /** The visitor's address; ignored for a signed-in member (the account's is used). */
  email?: string;
  locale: "fr" | "en";
}

/** Reads the function's `{ok, error}` answer; anything unexpected is "unavailable". */
export function backInStockResult(data: unknown): BackInStockResult {
  if (data && typeof data === "object") {
    const answer = data as { ok?: unknown; error?: unknown };
    if (answer.ok === true) return { ok: true };
    if ((BACK_IN_STOCK_ERRORS as readonly unknown[]).includes(answer.error)) {
      return { ok: false, error: answer.error as BackInStockError };
    }
  }
  return { ok: false, error: "unavailable" };
}

export async function requestBackInStockAlert(request: BackInStockRequest): Promise<BackInStockResult> {
  // Never a pretend success: without the backend nobody would ever be told.
  if (!isSupabaseConfigured) return { ok: false, error: "unavailable" };
  const { data, error } = await requireSupabase().rpc("request_back_in_stock_alert", {
    p_product_id: request.productId,
    p_variant_id: request.variantId,
    p_email: request.email?.trim() || undefined,
    p_locale: request.locale,
  });
  if (error) return { ok: false, error: "network" };
  return backInStockResult(data);
}
