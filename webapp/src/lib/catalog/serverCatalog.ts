import "server-only";
import { unstable_cache } from "next/cache";
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
 *
 * Supabase reads are cached across requests (Next.js data cache, shared by
 * every instance on Vercel): what an anonymous visitor may read is the same
 * for everyone, so one read serves every page for `CATALOGUE_TTL_SECONDS`.
 * A back-office change therefore shows on server-rendered pages within that
 * delay (the browser keeps what the page was rendered with). Prices shown are
 * indicative anyway: checkout recomputes every amount in the database. A
 * failed read throws and is not cached. Everything is tagged `catalog`, so a
 * later on-demand invalidation (`revalidateTag`) can clear it at once.
 */

/** How long a server read of the catalogue is reused (decided default, see docs/migration-nextjs.md). */
export const CATALOGUE_TTL_SECONDS = 60;
export const CATALOGUE_CACHE_TAG = "catalog";

function cached<A extends string[], T>(name: string, read: (...args: A) => Promise<T>) {
  return unstable_cache(read, ["catalog", name], { revalidate: CATALOGUE_TTL_SECONDS, tags: [CATALOGUE_CACHE_TAG] });
}

const readProductByKey = cached("product-by-key", (key: string) => fetchProductByKey(createPublicServerSupabase(), key));
const readProductSlugs = cached("product-slugs", () => fetchProductSlugs(createPublicServerSupabase()));
const readProducts = cached("products", () => fetchCatalog(undefined, createPublicServerSupabase()));
const readColors = cached("colours", () => fetchGemColors(undefined, createPublicServerSupabase()));
const readTaxonomy = cached("taxonomy", () => fetchTaxonomy(undefined, createPublicServerSupabase()));

/** The product a URL key names (any language's slug, or its row id); null when the shop does not sell it. */
export const findPublicProduct = cache(async (key: string): Promise<Product | null> => {
  if (!isSupabaseConfigured) return findProductByKey(PRODUCTS, key) ?? null;
  return readProductByKey(key);
});

/** Every product's slugs, for the sitemap. */
export async function listPublicProductSlugs(): Promise<SluggedProduct[]> {
  if (!isSupabaseConfigured) return PRODUCTS;
  return readProductSlugs();
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
  const full = CATALOGUE_PAGES.has(route);
  const [products, colors, taxonomy] = await Promise.allSettled([
    full ? readProducts() : Promise.resolve(undefined),
    full ? readColors() : Promise.resolve(undefined),
    readTaxonomy(),
  ]);
  const value = <T>(result: PromiseSettledResult<T | undefined>, part: string): T | undefined => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[catalog] server read of the ${part} failed; the browser loads it`, result.reason);
    return undefined;
  };
  return { products: value(products, "products"), colors: value(colors, "colours"), taxonomy: value(taxonomy, "taxonomy") };
});
