import { useEffect, useState } from "react";
import { fetchGiftCardQuote } from "./api";
import type { GiftCardQuote, GiftCardQuoteError } from "./giftCardQuote";

/**
 * The database's preview of what the gift card codes pay, kept in step with the
 * cart: asked again (after a short pause, newest answer wins) whenever a code or
 * the amount they may pay for changes. `quote` is only set for the exact codes
 * and amount it answers.
 */
export type GiftCardQuoteState =
  | { status: "idle" }
  | { status: "loading" }
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
  const [answer, setAnswer] = useState<{ key: string; state: GiftCardQuoteState } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const [requestCodes, requestAmount, requestCurrency] = JSON.parse(key) as [string[], number, string];
    const timer = setTimeout(() => {
      void fetchGiftCardQuote({ codes: requestCodes, amount: requestAmount, currency: requestCurrency }).then((result) => {
        if (current) setAnswer({ key, state: result.ok ? { status: "ready", quote: result.quote } : { status: "error", error: result.error } });
      });
    }, PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [enabled, key]);

  if (!enabled) return { status: "idle" };
  return answer && answer.key === key ? answer.state : { status: "loading" };
}
