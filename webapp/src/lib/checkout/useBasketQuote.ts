import { useEffect, useMemo, useState } from "react";
import { fetchBasketQuote } from "./api";
import { quoteKey, type BasketQuote, type QuoteError, type QuoteItem } from "./basketQuote";

/**
 * The database's preview of the basket's discounts, kept in step with the
 * cart: asked again (after a short pause, newest answer wins) whenever a line,
 * a code, the delivery rate or the loyalty request changes. While an answer is
 * on its way the previous one is not shown as current: `quote` is only set for
 * the exact basket it answers.
 */
export type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; quote: BasketQuote }
  | { status: "error"; error: QuoteError };

const PAUSE_MS = 250;

export function useBasketQuote(params: {
  /** False in mock mode, or with nothing the database could price. */
  enabled: boolean;
  items: QuoteItem[];
  codes: string[];
  rateId: string | null;
  useReward: boolean;
  currency: string;
  locale: "fr" | "en";
}): QuoteState {
  const { enabled, items, codes, rateId, useReward, currency, locale } = params;
  const key = quoteKey(items, codes, rateId, useReward, currency);
  const [answer, setAnswer] = useState<{ key: string; state: QuoteState } | null>(null);
  // The request is rebuilt only when `key` (or the language) changes, however often the caller's arrays are recreated.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo(() => ({ items, codes, rateId, useReward, currency, locale }), [key, locale]);

  useEffect(() => {
    if (!enabled || request.items.length === 0) return;
    let current = true;
    const timer = setTimeout(() => {
      void fetchBasketQuote(request).then((result) => {
        if (current) setAnswer({ key, state: result.ok ? { status: "ready", quote: result.quote } : { status: "error", error: result.error } });
      });
    }, PAUSE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [enabled, key, request]);

  if (!enabled || items.length === 0) return { status: "idle" };
  return answer && answer.key === key ? answer.state : { status: "loading" };
}
