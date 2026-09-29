import type { GemColorDef, Product } from "../../data/products";
import type { ShopCategoryDef } from "../../data/taxonomy";
import { requireSupabase } from "../supabase/client";
import { productMediaUrl } from "../supabase/storage";
import {
  mapGemColor,
  mapProduct,
  mapTaxonomy,
  type GemColorRow,
  type ProductRow,
  type ReviewStatsRow,
  type TaxonomyRow,
} from "./mapping";

/**
 * Everything a product card or page needs, in one request: translations,
 * category, active variants with their stock, media and the product's own
 * stock. RLS already limits visitors to active products, published
 * translations and active variants; the filters below say the same thing
 * explicitly so a signed-in admin browsing the shop sees what customers see.
 */
const PRODUCT_SELECT_BASE = `
  id, slug, name, short_description, description, price, compare_at_price, currency, is_featured, metadata,
  category:categories ( slug, name, category_translations ( locale, name, status ) ),
  product_translations ( locale, name, slug, short_description, description, status ),
  product_variants ( id, name, attributes, price, compare_at_price, is_active, position,
    product_variant_translations ( locale, name, status ),
    inventory_items ( stock_status ) ),
  product_media ( id, storage_path, media_type, alt_text, position, is_primary, variant_id,
    product_media_translations ( locale, alt_text, status ) ),
  inventory_items ( stock_status )
`;

const PRODUCT_SELECT = `${PRODUCT_SELECT_BASE},
  family:category_families!products_family_fkey ( slug )
`;

/**
 * The front end may ship before `…_category_families` is applied, and the
 * error a missing relation gives depends on the PostgREST version. So any
 * failure of a query reading the families is retried once without them: the
 * shop then keeps working on categories alone instead of going down, and a
 * real outage still surfaces through the second query.
 */
function retryWithoutFamilies(error: { message?: string } | null, signal?: AbortSignal): boolean {
  if (!error || signal?.aborted) return false;
  console.warn("[catalog] product families unavailable", error.message);
  return true;
}

/**
 * The storefront catalogue: active, physical/digital products (gift cards
 * have their own page), newest first, with their public review stats.
 */
export async function fetchCatalog(signal?: AbortSignal): Promise<Product[]> {
  const db = requireSupabase();

  const productsQuery = (select: string) => {
    const query = db
      .from("products")
      .select(select)
      .eq("status", "active")
      .neq("product_type", "gift_card")
      .order("created_at", { ascending: false });
    return signal ? query.abortSignal(signal) : query;
  };
  let statsQuery = db.from("product_review_stats").select("product_id, average_rating, review_count");
  if (signal) statsQuery = statsQuery.abortSignal(signal);

  const [withFamilies, stats] = await Promise.all([productsQuery(PRODUCT_SELECT), statsQuery]);
  let products = withFamilies;
  if (retryWithoutFamilies(products.error, signal)) products = await productsQuery(PRODUCT_SELECT_BASE);
  if (products.error) throw products.error;
  // Ratings are secondary: a failing stats view must not take the shop down.
  if (stats.error) console.warn("[catalog] review stats unavailable", stats.error.message);

  const statsByProduct = new Map<string, ReviewStatsRow>();
  for (const row of stats.data ?? []) {
    if (row.product_id) statsByProduct.set(row.product_id, row);
  }

  const rows = products.data as unknown as ProductRow[];
  return rows.map((row) =>
    mapProduct(row, statsByProduct.get(row.id), productMediaUrl),
  );
}

/**
 * The colour filter's entries, in the order the team set in the back office.
 * Active colours only; `is_active` is repeated here for the same reason as the
 * product filters above.
 */
export async function fetchGemColors(signal?: AbortSignal): Promise<GemColorDef[]> {
  const db = requireSupabase();
  let query = db
    .from("gem_colors")
    .select("slug, name, hex, is_multicolor, gem_color_translations ( locale, name, status )")
    .eq("is_active", true)
    .order("position");
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data as GemColorRow[]).map(mapGemColor);
}

const TAXONOMY_SELECT_BASE = "slug, name, position, category_translations ( locale, name, status )";
const TAXONOMY_SELECT = `${TAXONOMY_SELECT_BASE},
  category_families ( slug, name, image_path, position, is_active,
    category_family_translations ( locale, name, status ) )`;

/**
 * The shop taxonomy (header menu, the shop's product-type tree, home tiles):
 * active categories and their active families, in back-office order.
 */
export async function fetchTaxonomy(signal?: AbortSignal): Promise<ShopCategoryDef[]> {
  const db = requireSupabase();
  const query = (select: string) => {
    const q = db.from("categories").select(select).eq("is_active", true).order("position");
    return signal ? q.abortSignal(signal) : q;
  };
  let result = await query(TAXONOMY_SELECT);
  if (retryWithoutFamilies(result.error, signal)) result = await query(TAXONOMY_SELECT_BASE);
  if (result.error) throw result.error;
  return mapTaxonomy(result.data as unknown as TaxonomyRow[], productMediaUrl);
}
