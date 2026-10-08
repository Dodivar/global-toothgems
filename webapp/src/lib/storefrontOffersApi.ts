import { requireSupabase } from "./supabase/client";
import type { OfferCampaignRow, OfferPromotionRow, OfferSources } from "./storefrontOffers";

/**
 * Reads what is running for visitors (no sign-in): live automatic promotions and live campaigns within their
 * dates, with their published English text, scope and products. Row-level security shows nothing else, and
 * codes never leave the database. One read per page load, cached for a few minutes.
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
  const [promotions, campaigns, categories, collections] = await Promise.all([
    client.from("promotions").select(PROMOTIONS).limit(200),
    client.from("campaigns").select(CAMPAIGNS).limit(100),
    client.from("categories").select("id, slug"),
    client.from("collections").select("id, collection_products ( product_id )"),
  ]);
  for (const result of [promotions, campaigns, categories, collections]) if (result.error) throw new Error(result.error.message);
  return {
    promotions: (promotions.data ?? []) as unknown as OfferPromotionRow[],
    campaigns: (campaigns.data ?? []) as unknown as OfferCampaignRow[],
    categoryIds: Object.fromEntries((categories.data ?? []).map((c) => [c.slug, c.id])),
    collections: (collections.data ?? []).map((c) => ({
      id: c.id,
      product_ids: ((c as unknown as { collection_products: { product_id: string }[] }).collection_products ?? []).map((p) => p.product_id),
    })),
  };
}
