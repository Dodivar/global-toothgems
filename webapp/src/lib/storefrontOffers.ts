import type { Localized } from "../data/types";

/**
 * What the shop window shows of promotions and campaigns: pure rules, unit-tested.
 *
 * Visitors read only what is running (row-level security: live, automatic, within
 * its dates). From those rows this module answers, for one product, "which
 * campaign is it part of, which promotion applies to it, and what price do I
 * show?". It is a display of the offer, never a price: the basket is quoted by
 * the database (`quote_basket`) and the order priced by `create_order()`.
 *
 * - The unit price is changed only for a **percentage** promotion with no
 *   minimum basket or quantity and no cap (the only kind that is the same for every
 *   purchase); the other kinds (x + y offered, bundle, gift, amount off, a
 *   percentage that needs a minimum) only show their badge and wording.
 * - Promotions for a type of customer (new, existing, segments) are not shown
 *   in the shop window: a visitor cannot tell whether they qualify.
 * - A product already on sale (`compareAtPrice`) is skipped by promotions that
 *   exclude discounted products, as the engine does.
 */

export type OfferPromotionType = "percentage" | "fixed_amount" | "buy_x_get_y" | "free_shipping" | "bundle" | "gift";

export interface OfferPromotionRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  currency: string;
  percent_off: number | null;
  max_discount_amount: number | string | null;
  amount_off: number | string | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  bundle_price: number | string | null;
  applies_to: string;
  customer_eligibility: string;
  min_subtotal_amount: number | string | null;
  min_quantity: number | null;
  exclude_discounted_products: boolean;
  starts_at: string;
  ends_at: string | null;
  promotion_translations: { locale: string; title: string; description: string | null }[];
  promotion_products: { product_id: string; role: string }[];
  promotion_categories: { category_id: string }[];
  promotion_collections: { collection_id: string }[];
}

export interface OfferCampaignRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  theme: string;
  campaign_translations: { locale: string; title: string; description: string | null }[];
  campaign_products: { product_id: string }[];
}

export interface OfferSources {
  promotions: OfferPromotionRow[];
  campaigns: OfferCampaignRow[];
  /** `categories.id` by slug (a shop product carries its category's slug). */
  categoryIds: Record<string, string>;
  /** Product ids of each running collection. */
  collections: { id: string; product_ids: string[] }[];
}

export interface OfferCampaign {
  id: string;
  title: Localized;
  theme: string;
}

export interface OfferPromotion {
  id: string;
  type: OfferPromotionType;
  title: Localized;
  description: Localized;
  endsAt: string | null;
  /** Wording values for the badge (`promo.discount.badge.<type>`). */
  percent: number | null;
  /** Minor units. */
  amountCents: number | null;
  bundleCents: number | null;
  buy: number | null;
  get: number | null;
  /** The unit price drops by this percentage (null: the badge only). */
  priceOffPercent: number | null;
  /** True when the promotion needs a minimum basket or quantity. */
  conditional: boolean;
}

export interface ProductOffer {
  campaign: OfferCampaign | null;
  promotion: OfferPromotion | null;
}

export interface OfferProduct {
  dbId?: string;
  /** Category slug. */
  cat?: string | null;
  currency?: string;
  /** The "was" price, when the product is already on sale. */
  compareAtPrice?: number;
}

const cents = (value: number | string | null): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const localized = (fr: string, translations: { locale: string; title?: string; description?: string | null }[], key: "title" | "description"): Localized => {
  const en = translations.find((t) => t.locale === "en")?.[key];
  return { fr, en: en && en.trim() ? en : fr };
};

const running = (startsAt: string, endsAt: string | null, now: number) =>
  Date.parse(startsAt) <= now && (endsAt === null || Date.parse(endsAt) > now);

/** Which kind of offer is worth showing when several apply: a cheaper unit first, then the others. */
const KIND_ORDER: OfferPromotionType[] = ["percentage", "buy_x_get_y", "bundle", "gift", "fixed_amount"];

export function buildOfferBook(sources: OfferSources) {
  const collectionProducts = new Map(sources.collections.map((c) => [c.id, new Set(c.product_ids)]));
  const categoryOf = (slug: string | null | undefined) => (slug ? sources.categoryIds[slug] : undefined);

  const applies = (row: OfferPromotionRow, product: OfferProduct): boolean => {
    const id = product.dbId;
    if (!id) return false;
    const roles = row.promotion_products;
    if (roles.some((r) => r.role === "excluded" && r.product_id === id)) return false;
    if (row.type === "bundle") return roles.some((r) => r.role === "bundle" && r.product_id === id);
    switch (row.applies_to) {
      case "all":
        return true;
      case "products":
        return roles.some((r) => r.role === "eligible" && r.product_id === id);
      case "categories": {
        const category = categoryOf(product.cat);
        return !!category && row.promotion_categories.some((c) => c.category_id === category);
      }
      case "collections":
        return row.promotion_collections.some((c) => collectionProducts.get(c.collection_id)?.has(id));
      default:
        return false;
    }
  };

  const toPromotion = (row: OfferPromotionRow): OfferPromotion => {
    const conditional = row.min_subtotal_amount !== null || row.min_quantity !== null;
    const percent = row.type === "percentage" ? row.percent_off : null;
    return {
      id: row.id,
      type: row.type as OfferPromotionType,
      title: localized(row.title, row.promotion_translations, "title"),
      description: localized(row.description ?? "", row.promotion_translations, "description"),
      endsAt: row.ends_at,
      percent,
      amountCents: cents(row.amount_off),
      bundleCents: cents(row.bundle_price),
      buy: row.buy_quantity,
      get: row.get_quantity,
      // A cap limits the whole basket, not a unit: with one, the unit price is left alone.
      priceOffPercent: percent !== null && !conditional && cents(row.max_discount_amount) === null ? percent : null,
      conditional,
    };
  };

  return {
    /** The campaign and the promotion to show on a product, as of `now` (ms). */
    offerFor(product: OfferProduct, now: number = Date.now()): ProductOffer | null {
      if (!product.dbId) return null;
      const campaign = sources.campaigns
        .filter((c) => running(c.starts_at, c.ends_at, now) && c.campaign_products.some((p) => p.product_id === product.dbId))
        .sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at))[0];
      const candidates = sources.promotions.filter(
        (row) =>
          running(row.starts_at, row.ends_at, now) &&
          row.customer_eligibility === "all" &&
          row.type !== "free_shipping" &&
          (!product.currency || row.currency === product.currency) &&
          !(row.exclude_discounted_products && product.compareAtPrice !== undefined) &&
          applies(row, product),
      );
      const best = candidates
        .map(toPromotion)
        .sort((a, b) => {
          const rank = KIND_ORDER.indexOf(a.type) - KIND_ORDER.indexOf(b.type);
          // Among the cheaper-unit promotions, the biggest cut.
          return rank !== 0 ? rank : (b.priceOffPercent ?? 0) - (a.priceOffPercent ?? 0);
        })[0];
      if (!campaign && !best) return null;
      return {
        campaign: campaign ? { id: campaign.id, title: localized(campaign.title, campaign.campaign_translations, "title"), theme: campaign.theme } : null,
        promotion: best ?? null,
      };
    },
  };
}

export type OfferBook = ReturnType<typeof buildOfferBook>;

/**
 * The price to show for a unit price (major units) under an offer: the new price, and the struck-out one when
 * there is something to strike — the product's own "was" price when it has one, else the price before the cut.
 */
export function offerPrice(price: number, compareAt: number | undefined, offer: ProductOffer | null | undefined): { price: number; was: number | undefined } {
  const promotion = offer?.promotion;
  if (!promotion || promotion.priceOffPercent === null) return { price, was: compareAt };
  const unit = Math.round(price * 100);
  const off = Math.round((unit * promotion.priceOffPercent) / 100);
  const net = Math.max(0, unit - off);
  if (net >= unit) return { price, was: compareAt };
  return { price: net / 100, was: compareAt !== undefined && compareAt > price ? compareAt : price };
}
