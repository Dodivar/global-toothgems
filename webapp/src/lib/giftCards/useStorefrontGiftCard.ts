import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "../supabase/client";
import { fetchStorefrontGiftCard, type GiftCardProductText } from "./api";
import type { GiftCardConfig } from "./giftCardMapping";

/**
 * The gift card as visitors may buy it, read in the browser once the page is
 * hydrated (the server and the first render both show "loading", so public
 * pages hydrate cleanly).
 *
 * - `ready`: published settings and the product's text;
 * - `unavailable`: not published, or local mock mode (nothing is invented);
 * - `error`: the read failed — never shown as "not on sale".
 */
export type StorefrontGiftCardState =
  | { status: "loading" }
  | { status: "ready"; config: GiftCardConfig; product: GiftCardProductText }
  | { status: "unavailable" }
  | { status: "error"; retry: () => void };

export function useStorefrontGiftCard(locale: "fr" | "en"): StorefrontGiftCardState {
  // `isSupabaseConfigured` is the same on the server and in the browser: no hydration difference.
  const [state, setState] = useState<StorefrontGiftCardState>(isSupabaseConfigured ? { status: "loading" } : { status: "unavailable" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let current = true;
    fetchStorefrontGiftCard(locale)
      .then(({ config, product }) => {
        if (!current) return;
        setState(config && product ? { status: "ready", config, product } : { status: "unavailable" });
      })
      .catch((error: unknown) => {
        console.error("[gift card] settings read failed", error instanceof Error ? error.message : error);
        if (!current) return;
        setState({
          status: "error",
          retry: () => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          },
        });
      });
    return () => {
      current = false;
    };
  }, [locale, attempt]);

  return state;
}
