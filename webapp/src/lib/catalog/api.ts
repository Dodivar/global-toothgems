import type { Product } from "../../data/products";
import { requireSupabase } from "../supabase/client";
import { productMediaUrl } from "../supabase/storage";
import { mapProduct, type ProductRow, type ReviewStatsRow } from "./mapping";

/**
 * Everything a product card or page needs, in one request: translations,
 * category, active variants with their stock, media and the product's own
 * stock. RLS already limits visitors to active products, published
 * translations and active variants; the filters below say the same thing
 * explicitly so a signed-in admin browsing the shop sees what customers see.
 */
const PRODUCT_SELECT = `
  id, slug, name, short_description, description, price, compare_at_price, currency, is_featured, metadata,
  category:categories ( slug, name, category_translations ( locale, name, status ) ),
  product_translations ( locale, name, slug, short_description, description, status ),
  product_variants ( id, name, attributes, price, compare_at_price, is_active, position,
    product_variant_translations ( locale, name, status ),
    inventory_items ( stock_status ) ),
  product_media ( id, storage_path, media_type, alt_text, position, is_primary,
    product_media_translations ( locale, alt_text, status ) ),
  inventory_items ( stock_status )
`;

/**
 * The storefront catalogue: active, physical/digital products (gift cards
 * have their own page), newest first, with their public review stats.
 */
export async function fetchCatalog(signal?: AbortSignal): Promise<Product[]> {
  const db = requireSupabase();

  let productsQuery = db
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .neq("product_type", "gift_card")
    .order("created_at", { ascending: false });
  let statsQuery = db.from("product_review_stats").select("product_id, average_rating, review_count");
  if (signal) {
    productsQuery = productsQuery.abortSignal(signal);
    statsQuery = statsQuery.abortSignal(signal);
  }

  const [products, stats] = await Promise.all([productsQuery, statsQuery]);
  if (products.error) throw products.error;
  // Ratings are secondary: a failing stats view must not take the shop down.
  if (stats.error) console.warn("[catalog] review stats unavailable", stats.error.message);

  const statsByProduct = new Map<string, ReviewStatsRow>();
  for (const row of stats.data ?? []) {
    if (row.product_id) statsByProduct.set(row.product_id, row);
  }

  const rows: ProductRow[] = products.data;
  return rows.map((row) =>
    mapProduct(row, statsByProduct.get(row.id), productMediaUrl),
  );
}
