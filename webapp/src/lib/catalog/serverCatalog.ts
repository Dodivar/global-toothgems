import "server-only";
import { cache } from "react";
import { PRODUCTS, type Product } from "../../data/products";
import { isSupabaseConfigured } from "../supabase/env";
import { createPublicServerSupabase } from "../supabase/publicServer";
import type { PublicRouteId } from "../localeRoutes";
import { fetchCatalog, fetchGemColors, fetchProductByKey, fetchProductSlugs, fetchTaxonomy } from "./api";
import type { CatalogSeed } from "./CatalogProvider";
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

/** Pages that show products: the server reads the whole catalogue for them. The others get the taxonomy (header menu). */
const CATALOGUE_PAGES: ReadonlySet<PublicRouteId> = new Set(["home", "shop", "product", "shapes", "colours", "cart"]);

/**
 * What a server-rendered public page needs of the catalogue, read with the
 * publishable key; undefined in mock mode. A part that fails to load is left
 * out and the browser loads it, as before (never a fallback to the fixtures).
 */
export const loadCatalogSeed = cache(async (route: PublicRouteId): Promise<CatalogSeed | undefined> => {
  if (!isSupabaseConfigured) return undefined;
  const db = createPublicServerSupabase();
  const full = CATALOGUE_PAGES.has(route);
  const [products, colors, taxonomy] = await Promise.allSettled([
    full ? fetchCatalog(undefined, db) : Promise.resolve(undefined),
    full ? fetchGemColors(undefined, db) : Promise.resolve(undefined),
    fetchTaxonomy(undefined, db),
  ]);
  const value = <T>(result: PromiseSettledResult<T | undefined>, part: string): T | undefined => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[catalog] server read of the ${part} failed; the browser loads it`, result.reason);
    return undefined;
  };
  return { products: value(products, "products"), colors: value(colors, "colours"), taxonomy: value(taxonomy, "taxonomy") };
});
