import { toMinorUnits } from "../catalog/money";
import type { CartLine } from "./cartLines";

/**
 * What the gift card codes typed in the cart would pay (`quote_gift_cards()`), so
 * the summary shows the deduction and what is left to pay before the payment
 * step. The database applies the same rules as `create_order()` and answers the
 * total only (capped at the amount asked), never a card's balance, plus the codes
 * that cannot be used. A preview: the order applies the cards for real.
 */

export type GiftCardQuote = { applied: number; refused: string[] };
export const GIFT_CARD_QUOTE_ERRORS = ["too_many_attempts", "unavailable"] as const;
export type GiftCardQuoteError = (typeof GIFT_CARD_QUOTE_ERRORS)[number];
export type GiftCardQuoteResult = { ok: true; quote: GiftCardQuote } | { ok: false; error: GiftCardQuoteError };

/** What gift cards may pay for (minor units): the order total, except the gift cards bought in it. */
export const giftCardPayable = (lines: CartLine[], total: number): number =>
  Math.max(0, total - lines.reduce((sum, l) => (l.giftCard ? sum + l.unitPrice * l.qty : sum), 0));

/** The function's answer, read defensively: anything unexpected is "unavailable", never a made-up deduction. */
export function readGiftCardQuote(data: unknown): GiftCardQuoteResult {
  const body = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!body) return { ok: false, error: "unavailable" };
  if (body.ok !== true) {
    const error = (GIFT_CARD_QUOTE_ERRORS as readonly unknown[]).includes(body.error) ? (body.error as GiftCardQuoteError) : "unavailable";
    return { ok: false, error };
  }
  if (typeof body.applied !== "number" && typeof body.applied !== "string") return { ok: false, error: "unavailable" };
  try {
    const applied = toMinorUnits(body.applied);
    if (applied < 0) return { ok: false, error: "unavailable" };
    const refused = (Array.isArray(body.refused) ? body.refused : []).filter((c): c is string => typeof c === "string");
    return { ok: true, quote: { applied, refused } };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/** The codes the customer typed that the database refused (it answers them normalised: trimmed, upper case). */
export const refusedGiftCodes = (codes: string[], refused: string[]): string[] =>
  codes.filter((code) => refused.includes(code.trim().toUpperCase()));
