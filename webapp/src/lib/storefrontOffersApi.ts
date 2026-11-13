import { requireSupabase, type TypedSupabaseClient } from "./supabase/client";
import type { PriceCutPromotionRow, PriceCutSources } from "./catalog/productOffers";
import type { OfferCampaignRow, OfferPromotionRow, OfferSources, PriceReferenceRow } from "./storefrontOffers";

/**
 * Reads what is running for visitors (no sign-in): live automatic promotions and live campaigns within their
 * dates, with their published English text, scope and products. Row-level security shows nothing else, and
 * codes never leave the database. With them, the database's price now and reference price of every item with a
 * price cut running (`storefront_price_references()`, decision 129): the only source of a struck-out price.
 * One read per page load, cached for a few minutes.
 */

const PROMOTIONS = `
  id, title, description, type, currency, percent_off, max_discount_amount, amount_off, buy_quantity, get_quantity,
  bundle_price, applies_to, customer_eligibility, min_subtotal_amount, min_quantity, exclude_discounted_products,
  starts_at, ends_at,
  promotion_translations ( locale, title, description ),
  promotion_products ( product_id, role ),
  promotion_categories ( category_id ),
  promotion_collections ( collection_id )
`;
const CAMPAIGNS = `
  id, title, description, starts_at, ends_at, theme,
  campaign_translations ( locale, title, description ),
  campaign_products ( product_id )
`;

export async function fetchOfferSources(): Promise<OfferSources> {
  const client = requireSupabase();
  const [promotions, campaigns, categories, collections, references] = await Promise.all([
    client.from("promotions").select(PROMOTIONS).limit(200),
    client.from("campaigns").select(CAMPAIGNS).limit(100),
    client.from("categories").select("id, slug"),
    client.from("collections").select("id, collection_products ( product_id )"),
    client.rpc("storefront_price_references"),
  ]);
  for (const result of [promotions, campaigns, categories, collections, references]) if (result.error) throw new Error(result.error.message);
  return {
    references: (references.data ?? []) as PriceReferenceRow[],
    promotions: (promotions.data ?? []) as unknown as OfferPromotionRow[],
    campaigns: (campaigns.data ?? []) as unknown as OfferCampaignRow[],
    categoryIds: Object.fromEntries((categories.data ?? []).map((c) => [c.slug, c.id])),
    collections: (collections.data ?? []).map((c) => ({
      id: c.id,
      product_ids: ((c as unknown as { collection_products: { product_id: string }[] }).collection_products ?? []).map((p) => p.product_id),
    })),
  };
}

const PRICE_CUT_PROMOTIONS = `
  id, type, currency, percent_off, max_discount_amount, applies_to, customer_eligibility, min_subtotal_amount,
  min_quantity, starts_at, ends_at, promotion_products ( product_id, role )
`;

/**
 * What the server needs to price items like the shop window (structured data,
 * product feeds; `lib/catalog/productOffers.ts`): the database's price now and
 * reference price of every item with a cut running, and the running automatic
 * promotions for the end of each cut. `db` acts as an anonymous visitor.
 */
export async function fetchPriceCutSources(db: TypedSupabaseClient): Promise<PriceCutSources> {
  const [references, promotions] = await Promise.all([
    db.rpc("storefront_price_references"),
    db.from("promotions").select(PRICE_CUT_PROMOTIONS).limit(200),
  ]);
  if (references.error) throw new Error(references.error.message);
  if (promotions.error) throw new Error(promotions.error.message);
  return {
    references: (references.data ?? []) as PriceReferenceRow[],
    promotions: (promotions.data ?? []) as unknown as PriceCutPromotionRow[],
  };
}
