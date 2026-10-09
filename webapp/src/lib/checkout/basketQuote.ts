import { toMinorUnits } from "../catalog/money";
import type { CartLine } from "./cartLines";
import { EMAIL_RE } from "./checkoutForm";

/**
 * What the database says a shop basket would receive (`quote_basket()`): the
 * promotions and the loyalty reward, computed by the engine `create_order()`
 * uses, so the summary shows the discounts before the payment step. The
 * browser never computes a discount: it asks, and shows the answer. Amounts
 * are integer minor units here (the function answers decimals).
 *
 * The quote is a preview: the order is priced again, for real, when it is
 * created, and the payment step shows the amount Stripe will charge.
 */

/** Same shape and limit as the checkout function (`promotion_codes`: up to 3). */
export const MAX_PROMOTION_CODES = 3;
const PROMO_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

export const normalizePromotionCode = (input: string): string | null => {
  const code = input.trim().toUpperCase();
  return PROMO_CODE_RE.test(code) ? code : null;
};

export type AddPromotionCodeResult = { ok: true; codes: string[] } | { ok: false; reason: "format" | "duplicate" | "limit" };

export function addPromotionCode(codes: string[], input: string): AddPromotionCodeResult {
  const code = normalizePromotionCode(input);
  if (!code) return { ok: false, reason: "format" };
  if (codes.includes(code)) return { ok: false, reason: "duplicate" };
  if (codes.length >= MAX_PROMOTION_CODES) return { ok: false, reason: "limit" };
  return { ok: true, codes: [...codes, code] };
}

/** A line of the basket, as the quote function reads it: shop goods only (gift cards and courses take no discount). */
export type QuoteItem = {
  product_id: string;
  variant_id: string | null;
  quantity: number;
};

/** Null when a line cannot be priced by the database (a mock line): no quote then. */
export function quoteItems(lines: CartLine[]): QuoteItem[] | null {
  const items: QuoteItem[] = [];
  for (const line of lines) {
    if (line.giftCard || line.courseId) continue;
    if (!line.dbProductId) return null;
    items.push({ product_id: line.dbProductId, variant_id: line.variantId ?? null, quantity: line.qty });
  }
  return items;
}

export interface QuoteDiscount {
  label: string;
  /** The typed code, null for an automatic promotion or the loyalty reward. */
  code: string | null;
  /** The promotion's type, or `loyalty` for the reward. */
  type: string;
  goods: number;
  shipping: number;
}

export interface BasketQuote {
  goodsDiscount: number;
  shippingDiscount: number;
  discounts: QuoteDiscount[];
  /** What each basket line carries of the discount (minor units), for the lines the discount reaches. */
  lines: { productId: string; variantId: string | null; amount: number }[];
  /** Products added free by a "gift with purchase" promotion. */
  gifts: { name: string; variant: string | null }[];
  /**
   * Automatic promotions this basket would get but the customer (account, else the e-mail typed at the checkout)
   * has already had as often as allowed: said at the checkout, since the shop window still shows their price.
   */
  usedUp: { label: string; maxUses: number }[];
}

export const QUOTE_ERRORS = ["promotion_code_invalid", "loyalty_reward_unavailable", "too_many_attempts", "unavailable"] as const;
export type QuoteError = (typeof QUOTE_ERRORS)[number];

export type QuoteResult = { ok: true; quote: BasketQuote } | { ok: false; error: QuoteError };

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const minor = (value: unknown): number => (typeof value === "number" || typeof value === "string" ? toMinorUnits(value) : 0);

/** The function's answer, read defensively: anything unexpected is "unavailable", never a made-up discount. */
export function readQuote(data: unknown): QuoteResult {
  const body = object(data);
  if (!body) return { ok: false, error: "unavailable" };
  if (body.ok !== true) {
    const error = (QUOTE_ERRORS as readonly unknown[]).includes(body.error) ? (body.error as QuoteError) : "unavailable";
    return { ok: false, error };
  }
  try {
    const discounts: QuoteDiscount[] = [];
    for (const raw of Array.isArray(body.discounts) ? body.discounts : []) {
      const row = object(raw);
      if (!row || typeof row.label !== "string") return { ok: false, error: "unavailable" };
      discounts.push({
        label: row.label,
        code: typeof row.code === "string" ? row.code : null,
        type: typeof row.type === "string" ? row.type : "",
        goods: minor(row.goods_amount),
        shipping: minor(row.shipping_amount),
      });
    }
    const gifts = (Array.isArray(body.gift_lines) ? body.gift_lines : []).flatMap((raw) => {
      const row = object(raw);
      return row && typeof row.product_name === "string"
        ? [{ name: row.product_name, variant: typeof row.variant_name === "string" ? row.variant_name : null }]
        : [];
    });
    const lines = (Array.isArray(body.lines) ? body.lines : []).flatMap((raw) => {
      const row = object(raw);
      const amount = row ? minor(row.discount_amount) : 0;
      return row && typeof row.product_id === "string" && amount > 0
        ? [{ productId: row.product_id, variantId: typeof row.variant_id === "string" ? row.variant_id : null, amount }]
        : [];
    });
    // Absent from an older version of the function: nothing to say then.
    const usedUp = (Array.isArray(body.used_up) ? body.used_up : []).flatMap((raw) => {
      const row = object(raw);
      return row && typeof row.label === "string"
        ? [{ label: row.label, maxUses: typeof row.max_uses === "number" && row.max_uses >= 1 ? row.max_uses : 1 }]
        : [];
    });
    return {
      ok: true,
      quote: { goodsDiscount: minor(body.goods_discount), shippingDiscount: minor(body.shipping_discount), discounts, lines, gifts, usedUp },
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/**
 * What a quote depends on: when it changes, the previous answer no longer holds. `customer` is who is buying (the
 * account, else the guest's e-mail): per-customer promotion limits depend on it.
 */
export const quoteKey = (
  items: QuoteItem[],
  codes: string[],
  rateId: string | null,
  useReward: boolean,
  currency: string,
  customer: string | null = null,
) => JSON.stringify([items, codes, rateId, useReward, currency, customer]);

/** The guest's e-mail as the quote may use it: only once it is a complete address (never while it is being typed). */
export function guestQuoteEmail(signedIn: boolean, email: string): string | null {
  const value = email.trim().toLowerCase();
  return !signedIn && value.length <= 254 && EMAIL_RE.test(value) ? value : null;
}

/**
 * What a basket line carries of the discount (minor units). While a new answer is on its way (the customer just
 * ticked or unticked the loyalty reward, typed a code…) the line keeps what the previous answer gave it, so a
 * promotion never vanishes for the time of the round trip; a refused or unavailable quote shows nothing.
 */
export function lineDiscount(
  state: { status: string; quote?: BasketQuote; previous?: BasketQuote | null },
  productId: string | null | undefined,
  variantId: string | null | undefined,
): number {
  const quote = state.status === "ready" ? state.quote : state.status === "loading" ? state.previous : null;
  return quote?.lines.find((d) => d.productId === productId && d.variantId === (variantId ?? null))?.amount ?? 0;
}
