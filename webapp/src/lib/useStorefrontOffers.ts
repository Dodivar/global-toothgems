import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "./supabase/client";
import { buildOfferBook, type OfferBook, type OfferProduct, type ProductOffer } from "./storefrontOffers";
import type { Product } from "../data/products";
import { fetchOfferSources } from "./storefrontOffersApi";

/**
 * The running offers of the shop window, read once hydrated (never during the server render, so the page and
 * its first browser render match) and shared by every card on the page. Without Supabase (mock mode) there
 * are none: the mock shop never shows invented promotions.
 */
const TTL_MS = 5 * 60_000;
let cache: { book: OfferBook; at: number } | null = null;
let inflight: Promise<OfferBook | null> | null = null;

function load(): Promise<OfferBook | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.book);
  inflight ??= fetchOfferSources()
    .then((sources) => {
      cache = { book: buildOfferBook(sources), at: Date.now() };
      return cache.book;
    })
    .catch((error: unknown) => {
      console.error("[offers] read failed", error instanceof Error ? error.message : error);
      return cache?.book ?? null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The offer of one shop product (null until the offers are read, and when none applies). */
export function useProductOffer(product: Pick<Product, "dbId" | "cat" | "currency" | "compareAtPrice">): ProductOffer | null {
  const { offerFor } = useStorefrontOffers();
  return offerFor({ dbId: product.dbId, cat: product.cat, currency: product.currency ?? "EUR", compareAtPrice: product.compareAtPrice });
}

export function useStorefrontOffers(): { offerFor: (product: OfferProduct) => ProductOffer | null } {
  const [book, setBook] = useState<OfferBook | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let current = true;
    void load().then((loaded) => current && setBook(loaded));
    return () => {
      current = false;
    };
  }, []);
  return { offerFor: (product) => (book ? book.offerFor(product) : null) };
}
