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
 * - A promotion is shown on a product only when that product was chosen specifically
 *   (scope "products", or a bundle's products); promotions on everything, a category
 *   or a collection never put a badge or a price cut on the product cards.
 * - Promotions for a type of customer (new, existing, segments) are not shown
 *   in the shop window: a visitor cannot tell whether they qualify.
 * - The price shown and the struck-out price come from the database
 *   (`storefront_price_references()`, decision 129, Omnibus): a struck-out price
 *   is shown only when the price now is strictly below the reference price (the
 *   lowest price of the 30 days before the reduction started), it is always that
 *   reference, and the percentage is computed on it. A percentage promotion that
 *   cuts the unit price shows its badge with that percentage, or no percentage at
 *   all when the database says there is no reduction to announce.
 */

type OfferPromotionType = "percentage" | "fixed_amount" | "buy_x_get_y" | "free_shipping" | "bundle" | "gift";

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
  /** `storefront_price_references()` rows (decision 129). */
  references?: PriceReferenceRow[];
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

/**
 * One row of `storefront_price_references()`: an active product, variant or published course with a price cut
 * running now. Amounts are decimal (major units) as Postgres returns them.
 */
export interface PriceReferenceRow {
  product_id: string | null;
  variant_id: string | null;
  course_id: string | null;
  currency: string;
  list_price: number | string;
  price: number | string;
  reference_price: number | string | null;
  discount_percent: number | null;
  reduction_started_at: string | null;
  state: string;
}

export type PriceReferenceState = "reduced" | "not_lower" | "no_history" | "no_reduction";

/** What the database says about the price of one item now (minor units). */
export interface PriceReference {
  currency: string;
  listCents: number;
  /** The price to show now (the cut price while a cut runs). */
  priceCents: number;
  /** The struck-out price: set only when the price now is strictly below the reference (state `reduced`). */
  struckCents: number | null;
  /** The reduction, computed on the struck-out price, rounded down. */
  percent: number | null;
  state: PriceReferenceState;
}

export interface ProductOffer {
  campaign: OfferCampaign | null;
  promotion: OfferPromotion | null;
  /** The database's price now and reference price, when a cut runs on this item. */
  reference: PriceReference | null;
}

export interface OfferProduct {
  dbId?: string;
  /** The variant shown, when the product has options (its own price and history). */
  variantId?: string | null;
  /** Category slug. */
  cat?: string | null;
  currency?: string;
}

const cents = (value: number | string | null): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const STATES: readonly PriceReferenceState[] = ["reduced", "not_lower", "no_history", "no_reduction"];

/**
 * A database row as the shop shows it. Defensive: a struck-out price only for a `reduced` row whose figures agree
 * (reference strictly above the price), never one computed here.
 */
export function mapPriceReference(row: PriceReferenceRow): PriceReference | null {
  const listCents = cents(row.list_price);
  const priceCents = cents(row.price);
  if (listCents === null || priceCents === null) return null;
  const state = (STATES as readonly string[]).includes(row.state) ? (row.state as PriceReferenceState) : "not_lower";
  const reference = cents(row.reference_price);
  const reduced = state === "reduced" && reference !== null && priceCents < reference;
  return {
    currency: row.currency,
    listCents,
    priceCents,
    struckCents: reduced ? reference : null,
    percent: reduced && row.discount_percent !== null && row.discount_percent > 0 ? row.discount_percent : null,
    state: reduced ? "reduced" : state === "reduced" ? "not_lower" : state,
  };
}

/** The references by item: products and variants by `productId:variantId` (empty for the product), courses by id. */
export function indexPriceReferences(rows: readonly PriceReferenceRow[]) {
  const products = new Map<string, PriceReference>();
  const courses = new Map<string, PriceReference>();
  for (const row of rows) {
    const reference = mapPriceReference(row);
    if (!reference) continue;
    if (row.course_id) courses.set(row.course_id, reference);
    else if (row.product_id) products.set(`${row.product_id}:${row.variant_id ?? ""}`, reference);
  }
  return {
    product: (productId: string, variantId?: string | null): PriceReference | null =>
      products.get(`${productId}:${variantId ?? ""}`) ?? null,
    course: (courseId: string): PriceReference | null => courses.get(courseId) ?? null,
  };
}

const localized = (fr: string, translations: { locale: string; title?: string; description?: string | null }[], key: "title" | "description"): Localized => {
  const en = translations.find((t) => t.locale === "en")?.[key];
  return { fr, en: en && en.trim() ? en : fr };
};

const running = (startsAt: string, endsAt: string | null, now: number) =>
  Date.parse(startsAt) <= now && (endsAt === null || Date.parse(endsAt) > now);

/** Which kind of offer is worth showing when several apply: a cheaper unit first, then the others. */
const KIND_ORDER: OfferPromotionType[] = ["percentage", "buy_x_get_y", "bundle", "gift", "fixed_amount"];

export function buildOfferBook(sources: OfferSources) {
  const references = indexPriceReferences(sources.references ?? []);
  const applies = (row: OfferPromotionRow, product: OfferProduct): boolean => {
    const id = product.dbId;
    if (!id) return false;
    const roles = row.promotion_products;
    if (roles.some((r) => r.role === "excluded" && r.product_id === id)) return false;
    if (row.type === "bundle") return roles.some((r) => r.role === "bundle" && r.product_id === id);
    // Product cards carry a badge only for products chosen one by one; promotions on the
    // whole shop, a category or a collection are announced elsewhere (not on every card).
    return row.applies_to === "products" && roles.some((r) => r.role === "eligible" && r.product_id === id);
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
          applies(row, product),
      );
      const best = candidates
        .map(toPromotion)
        .sort((a, b) => {
          const rank = KIND_ORDER.indexOf(a.type) - KIND_ORDER.indexOf(b.type);
          // Among the cheaper-unit promotions, the biggest cut.
          return rank !== 0 ? rank : (b.priceOffPercent ?? 0) - (a.priceOffPercent ?? 0);
        })[0];
      const reference = references.product(product.dbId, product.variantId);
      if (!campaign && !best && !reference) return null;
      // A promotion that cuts the unit price announces the database's reduction, never its own percentage.
      const promotion = best && best.priceOffPercent !== null ? { ...best, percent: reference?.percent ?? null } : (best ?? null);
      return {
        campaign: campaign ? { id: campaign.id, title: localized(campaign.title, campaign.campaign_translations, "title"), theme: campaign.theme } : null,
        promotion,
        reference,
      };
    },
    /** The database's price now and reference price of a published course (null without a running cut). */
    courseReference(courseId: string | undefined): PriceReference | null {
      return courseId ? references.course(courseId) : null;
    },
  };
}

export type OfferBook = ReturnType<typeof buildOfferBook>;

/**
 * Whether the promotion has a badge: a percentage promotion that cuts the unit price shows the database's
 * percentage (Omnibus, computed on the reference price), and no badge when there is no reduction to announce.
 */
export function promotionBadgeShown(promotion: ProductOffer["promotion"]): boolean {
  return promotion !== null && !(promotion.type === "percentage" && promotion.percent === null);
}

/**
 * The price to show for a unit price (major units): the database's price now when a cut runs on the item, and a
 * struck-out price only when the database says the price is strictly below the reference price (Omnibus) — then
 * that reference, with the percentage computed on it. Without a reference (no cut, offers not read yet, mock
 * mode) the list price, nothing struck.
 */
export function offerPrice(price: number, offer: Pick<ProductOffer, "reference"> | null | undefined): { price: number; was: number | undefined; percent: number | null } {
  const reference = offer?.reference;
  if (!reference) return { price, was: undefined, percent: null };
  return {
    price: reference.priceCents / 100,
    was: reference.struckCents !== null ? reference.struckCents / 100 : undefined,
    percent: reference.percent,
  };
}

/**
 * The struck-out amount of a basket line (minor units), next to its net total once the database's quote applied
 * discounts. A line whose item has a cut for everyone running (a reference row) follows the shop window's rule:
 * its reference price only when the database says it is a reduction (Omnibus), otherwise nothing struck. A line
 * discounted only by what this customer typed or holds (a code, the loyalty reward, a basket condition) shows its
 * total before that discount: the arithmetic of the customer's own order, not a price reduction announcement.
 */
export function basketLineStruck(line: { unitCents: number; qty: number; cutCents: number }, reference: PriceReference | null | undefined): number | null {
  if (line.cutCents <= 0) return null;
  if (reference) return reference.struckCents !== null ? reference.struckCents * line.qty : null;
  return line.unitCents * line.qty;
}
