import type { Localized } from "../../data/types";
import type { Product, ProductInclusion, StockStatus } from "../../data/products";
import { NO_PRICE_CUTS, productItemOffers, type PriceBook } from "../catalog/productOffers";

/**
 * The ways a course's sales page offers to buy it (owner's request, 2026-11-17):
 * the course alone, the course with the professional kit (two cart lines, each
 * at its own price), and every published pack that opens the course (decision
 * 139: course + kit + months of the 3D Studio, one product).
 *
 * Read from the shop's catalogue, never invented: a pack is a product whose
 * included access names this course; the kit is the pack component the owner
 * pairs with the course (`COURSE_KIT_SLUG`), offered only while a pack of this
 * course holds it and the shop sells it on its own. Prices are the product
 * pages' (`productItemOffers`, Omnibus reference included); indicative only —
 * the checkout prices every line again in the database.
 *
 * The Studio is never offered on its own here: its subscriptions are sold by
 * another seller with their own checkout (decision 135), so the shop's cart
 * only carries Studio months inside a pack.
 */

/** The professional kit paired with the course (agent's reading, to confirm by the owner). */
export const COURSE_KIT_SLUG = "global-pro-studio-kit";

/** One product of an offer, as the course page shows and adds it. */
export interface CourseOfferProduct {
  /** Storefront id (French slug): links and the cart line key. */
  id: string;
  dbId: string;
  name: Localized;
  image: string;
  /** Page price now, in minor units. */
  priceCents: number;
  currency: string;
  availability: StockStatus;
}

export interface CoursePackOffer extends CourseOfferProduct {
  /** The articles the pack holds (its kit composition), in catalogue order. */
  components: CourseOfferProduct[];
  /** Studio months the pack opens, when it does. */
  studio: Extract<ProductInclusion, { kind: "studio" }> | null;
}

export interface CourseOffers {
  kit: CourseOfferProduct | null;
  packs: CoursePackOffer[];
}

export const NO_COURSE_OFFERS: CourseOffers = { kit: null, packs: [] };

/** A product without variants, priced as its page; null for a product with variants or no row id. */
function offerProduct(product: Product, book: PriceBook): CourseOfferProduct | null {
  if (!product.dbId || product.variants?.length) return null;
  const [item] = productItemOffers(product, book);
  if (!item) return null;
  return {
    id: product.id,
    dbId: product.dbId,
    name: product.name,
    image: product.image,
    priceCents: item.priceCents,
    currency: item.currency,
    availability: item.availability,
  };
}

/** Months of Studio the cheapest pack with Studio opens, for the page's headline; null when no pack opens the Studio. */
export function studioMonths(offers: CourseOffers): number | null {
  return offers.packs.find((pack) => pack.studio)?.studio?.months ?? null;
}

export const sellable = (item: Pick<CourseOfferProduct, "availability">) => item.availability !== "out_of_stock";

/**
 * The offers of the course `courseDbId` (`courses.id`) in `products`, with
 * `bundles` (kit id → component ids) and the shop's price cuts.
 */
export function buildCourseOffers(
  courseDbId: string,
  products: Product[],
  bundles: Map<string, string[]>,
  book: PriceBook = NO_PRICE_CUTS,
): CourseOffers {
  const byDbId = new Map(products.filter((p) => p.dbId).map((p) => [p.dbId!, p]));
  const packs: CoursePackOffer[] = [];
  for (const product of products) {
    if (!product.inclusions?.some((inclusion) => inclusion.kind === "course" && inclusion.courseId === courseDbId)) continue;
    const own = offerProduct(product, book);
    if (!own) continue;
    const components = (bundles.get(own.dbId) ?? [])
      .map((id) => byDbId.get(id))
      .filter((p): p is Product => Boolean(p))
      .map((p) => offerProduct(p, book))
      .filter((p): p is CourseOfferProduct => Boolean(p));
    const studio = product.inclusions.find((inclusion) => inclusion.kind === "studio") ?? null;
    packs.push({ ...own, components, studio: studio as CoursePackOffer["studio"] });
  }
  packs.sort((a, b) => a.priceCents - b.priceCents);

  const kitInPack = packs.flatMap((pack) => pack.components).find((component) => component.id === COURSE_KIT_SLUG);
  return { kit: kitInPack ?? null, packs };
}
