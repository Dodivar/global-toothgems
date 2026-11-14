import type { Product, ProductVariant, StockStatus } from "../../data/products";
import { indexPriceReferences, type PriceReference, type PriceReferenceRow } from "../storefrontOffers";
import { toMinorUnits } from "./money";

/**
 * What each sellable item of a product costs and whether it can be bought,
 * exactly as its product page shows it once the offers are read: the page
 * price is the database's price now while a cut runs (`storefront_price_references()`,
 * decision 129), else the list price; a struck-out price exists only when the
 * database says `reduced`, and it is then the Omnibus reference price.
 *
 * Shared by the product page's structured data (`productMeta.ts`) and the
 * product feeds (`productFeed.ts`), so search engines, Merchant Center and
 * Meta read the same price as the page. Pure, unit-tested.
 */

/**
 * A live automatic promotion as a visitor reads it (RLS: running automatic
 * ones only), for the end date of a price cut: the database cuts a unit price
 * only for a percentage promotion on chosen products, for everyone, with no
 * minimum and no cap (`private.refresh_promotion_price_cuts`).
 */
export interface PriceCutPromotionRow {
  id: string;
  type: string;
  currency: string;
  percent_off: number | null;
  max_discount_amount: number | string | null;
  applies_to: string;
  customer_eligibility: string;
  min_subtotal_amount: number | string | null;
  min_quantity: number | null;
  starts_at: string;
  ends_at: string | null;
  promotion_products: { product_id: string; role: string }[];
}

export interface PriceCutSources {
  references: PriceReferenceRow[];
  promotions: PriceCutPromotionRow[];
}

/** The database's price now of one item, with the period of its cut when it is announced as a reduction. */
export interface ItemPriceCut {
  reference: PriceReference;
  /** When the reduction (series of cuts) started; null when unknown. */
  startedAt: string | null;
  /** When the best running cut ends; null when it has no end or is unknown. */
  endsAt: string | null;
}

export interface PriceBook {
  item(productId: string | undefined, variantId?: string | null): ItemPriceCut | null;
}

/** No offers read (mock mode, a failed read): every item at its list price. */
export const NO_PRICE_CUTS: PriceBook = { item: () => null };

const cuttingPromotion = (row: PriceCutPromotionRow, productId: string, now: number) =>
  row.type === "percentage" &&
  row.percent_off !== null &&
  row.percent_off > 0 &&
  row.applies_to === "products" &&
  row.customer_eligibility === "all" &&
  row.min_subtotal_amount === null &&
  row.min_quantity === null &&
  row.max_discount_amount === null &&
  Date.parse(row.starts_at) <= now &&
  (row.ends_at === null || Date.parse(row.ends_at) > now) &&
  row.promotion_products.some((p) => p.role === "eligible" && p.product_id === productId) &&
  !row.promotion_products.some((p) => p.role === "excluded" && p.product_id === productId);

export function buildPriceBook(sources: PriceCutSources, now: number = Date.now()): PriceBook {
  const references = indexPriceReferences(sources.references);
  const started = new Map<string, string | null>();
  for (const row of sources.references) {
    if (row.product_id) started.set(`${row.product_id}:${row.variant_id ?? ""}`, row.reduction_started_at);
  }
  /** The end of the best cut running on a product: the biggest percentage, then the earliest end. */
  const endOf = (productId: string): string | null => {
    const best = sources.promotions
      .filter((row) => cuttingPromotion(row, productId, now))
      .sort((a, b) => (b.percent_off ?? 0) - (a.percent_off ?? 0) || (Date.parse(a.ends_at ?? "9999") - Date.parse(b.ends_at ?? "9999")))[0];
    return best?.ends_at ?? null;
  };
  return {
    item(productId, variantId) {
      if (!productId) return null;
      const reference = references.product(productId, variantId);
      if (!reference) return null;
      return { reference, startedAt: started.get(`${productId}:${variantId ?? ""}`) ?? null, endsAt: endOf(productId) };
    },
  };
}

/** One sellable item of a product: a variant, or the product itself when it has none. */
export interface ItemOffer {
  /** Stable id: the variant's row id, else the product's row id (its slug for a mock product). */
  id: string;
  variant?: ProductVariant;
  currency: string;
  /** The page price now, in minor units. */
  priceCents: number;
  /** The struck-out (Omnibus reference) price, only when the database says `reduced`. */
  struckCents: number | null;
  /** The reduction's period, only with a struck-out price. */
  saleStartedAt: string | null;
  saleEndsAt: string | null;
  availability: StockStatus;
}

function availabilityOf(item: Pick<Product, "availability" | "stock">): StockStatus {
  if (item.availability) return item.availability;
  return item.stock === "out" ? "out_of_stock" : item.stock === "low" ? "low_stock" : "in_stock";
}

/** Every sellable item of a product, in the page's order, priced as the page shows them. */
export function productItemOffers(product: Product, book: PriceBook = NO_PRICE_CUTS): ItemOffer[] {
  const currency = product.currency ?? "EUR";
  const offer = (variant: ProductVariant | undefined): ItemOffer => {
    const cut = book.item(product.dbId, variant ? variant.id : null);
    const reference = cut?.reference ?? null;
    const struck = reference?.struckCents ?? null;
    return {
      id: variant?.id ?? product.dbId ?? product.id,
      ...(variant ? { variant } : {}),
      currency,
      priceCents: reference ? reference.priceCents : toMinorUnits(variant?.price ?? product.price),
      struckCents: struck,
      saleStartedAt: struck !== null ? (cut?.startedAt ?? null) : null,
      saleEndsAt: struck !== null ? (cut?.endsAt ?? null) : null,
      availability: availabilityOf(variant ?? product),
    };
  };
  return product.variants?.length ? product.variants.map(offer) : [offer(undefined)];
}

/** Exact decimal string of an amount in minor units ("49.00"). */
export function decimalText(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * The query parameter that opens a product page on one variant
 * (`ProductDetail`): feeds and structured data link each variant to the page
 * showing its own price and stock.
 */
export const VARIANT_PARAM = "variant";

/** A product page address opened on a variant (when the product has several). */
export function variantPath(path: string, product: Product, item: ItemOffer): string {
  return item.variant && (product.variants?.length ?? 0) > 1 ? `${path}?${VARIANT_PARAM}=${encodeURIComponent(item.variant.id)}` : path;
}
