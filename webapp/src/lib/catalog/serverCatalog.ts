import "server-only";
import { cache } from "react";
import { PRODUCTS, type Product } from "../../data/products";
import { isSupabaseConfigured } from "../supabase/env";
import { createPublicServerSupabase } from "../supabase/publicServer";
import { fetchProductByKey, fetchProductSlugs } from "./api";
import { findProductByKey, type SluggedProduct } from "./productSlugs";

/*
 * The catalogue as the server reads it for public pages: from Supabase with
 * the publishable key (anonymous visitor, RLS), or from the mock fixtures when
 * Supabase is not configured, like the browser's `CatalogProvider`.
 */

/** The product a URL key names (any language's slug, or its row id); null when the shop does not sell it. Once per request. */
export const findPublicProduct = cache(async (key: string): Promise<Product | null> => {
  if (!isSupabaseConfigured) return findProductByKey(PRODUCTS, key) ?? null;
  return fetchProductByKey(createPublicServerSupabase(), key);
});

/** Every product's slugs, for the sitemap. */
export async function listPublicProductSlugs(): Promise<SluggedProduct[]> {
  if (!isSupabaseConfigured) return PRODUCTS;
  return fetchProductSlugs(createPublicServerSupabase());
}
