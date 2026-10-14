import { useEffect, useState } from "react";
import { fetchGiftCardQuote } from "./api";
import type { GiftCardQuote, GiftCardQuoteError } from "./giftCardQuote";

/**
 * The database's preview of what the gift card codes pay, kept in step with the
 * cart: asked again (after a short pause, newest answer wins) whenever a code or
 * the amount they may pay for changes. `quote` is only set for the exact codes
 * and amount it answers; while a new answer is on its way, `previous` keeps the
 * last one so the summary does not jump.
 */
export type GiftCardQuoteState =
  | { status: "idle" }
  | { status: "loading"; previous: GiftCardQuote | null }
  | { status: "ready"; quote: GiftCardQuote }
  | { status: "error"; error: GiftCardQuoteError };

const PAUSE_MS = 250;

export function useGiftCardQuote(params: {
  /** False in mock mode, with no code, or while the amount is not settled yet. */
  enabled: boolean;
  codes: string[];
  /** What the cards may pay for, minor units. */
  amount: number;
  currency: string;
}): GiftCardQuoteState {
  const { enabled, codes, amount, currency } = params;
  const key = JSON.stringify([codes, amount, currency]);
  // The newest answer, with the last good quote it leaves (whatever amount it was for).
  const [answer, setAnswer] = useState<{ key: string; state: GiftCardQuoteState; last: GiftCardQuote | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const [requestCodes, requestAmount, requestCurrency] = JSON.parse(key) as [string[], number, string];
    const timer = setTimeout(() => {
      void fetchGiftCardQuote({ codes: requestCodes, amount: requestAmount, currency: requestCurrency }).then((result) => {
        if (!current) return;
        setAnswer(
          result.ok
            ? { key, state: { status: "ready", quote: result.quote }, last: result.quote }
            : { key, state: { status: "error", error: result.error }, last: null },
        );
      });
    }, PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [enabled, key]);

  // Only for the same codes: a deduction is never shown for a card the customer no longer has (or not yet confirmed).
  const sameCodes = answer !== null && JSON.stringify((JSON.parse(answer.key) as [string[]])[0]) === JSON.stringify(codes);
  const previous = sameCodes ? answer.last : null;
  // Codes waiting for the total to settle (a basket quote on its way): the last answer stands in meanwhile.
  if (!enabled) return previous ? { status: "loading", previous } : { status: "idle" };
  return answer && answer.key === key ? answer.state : { status: "loading", previous };
}
