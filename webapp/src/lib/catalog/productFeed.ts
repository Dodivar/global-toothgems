import type { GemColorDef, Product, StockStatus } from "../../data/products";
import type { ShopCategoryDef } from "../../data/taxonomy";
import { pick } from "../../data/types";
import type { Locale } from "../localeRoutes";
import { productAddresses, PRODUCT_BRAND, richTextToPlain } from "./productMeta";
import { decimalText, productItemOffers, variantPath, type ItemOffer, type PriceBook } from "./productOffers";

/**
 * The product feeds read by Google Merchant Center (free listings) and the
 * Meta catalogue (`/feeds/google-fr.xml`, `/feeds/google-en.xml`; owner's
 * decisions of 2026-11-13, `docs/product-feeds.md`): one item per variant,
 * priced exactly as its page shows it (`productOffers.ts`), in the feed's
 * language, as RSS 2.0 with Google's `g:` namespace. Pure, unit-tested; the
 * Route Handler only reads the catalogue and calls `renderProductFeed`.
 */

/** The languages a feed exists in. German comes later, once its products and pages are translated. */
export const FEED_LOCALES = ["fr", "en"] as const satisfies readonly Locale[];
export type FeedLocale = (typeof FEED_LOCALES)[number];

/**
 * Categories left out of the feeds (owner's decision, 2026-11-13, to confirm):
 * the application products (adhesives, composites, etching, curing lamps…)
 * risk a health / medical-device review at Google and Meta. "materiel" also
 * holds the tools; empty this list to put them back. A kit holding a product
 * of these categories is left out too.
 */
export const FEED_EXCLUDED_CATEGORIES: readonly string[] = ["materiel"];

/**
 * Packs that also open an Academy course or months of the 3D Studio
 * (decision 139) are left out (to confirm): they mix a service sold by
 * another seller (the Studio, decision 135) with the goods, and Shopping
 * listings are for physical goods.
 */
export const FEED_EXCLUDES_PACKS_WITH_ACCESS = true;

/**
 * A preorder variant is left out (to confirm): Google requires an
 * `availability_date` with `preorder`, and the catalogue holds no such date.
 */
export const FEED_EXCLUDES_PREORDER = true;

const GOOGLE_AVAILABILITY: Record<Exclude<StockStatus, "preorder">, string> = {
  in_stock: "in_stock",
  low_stock: "in_stock",
  out_of_stock: "out_of_stock",
};

/** Google's limits on free-text attributes. */
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;
const ADDITIONAL_IMAGES_MAX = 10;

export interface FeedContext {
  locale: FeedLocale;
  /** The site's origin, for absolute links. */
  base: URL;
  prices: PriceBook;
  taxonomy: ShopCategoryDef[];
  colors: GemColorDef[];
  /** Kit product id → its components' product ids (`product_bundle_items`). */
  bundles: ReadonlyMap<string, readonly string[]>;
}

export type FeedExclusion = "not_physical" | "excluded_category" | "kit_with_excluded_product" | "pack_with_access" | "no_image";

/** Why a product is not in the feeds, or null when it is. `byId`: every public product by row id. */
export function feedExclusion(product: Product, ctx: Pick<FeedContext, "bundles">, byId: ReadonlyMap<string, Product>): FeedExclusion | null {
  if (product.productType !== "physical" || !product.dbId) return "not_physical";
  if (product.cat && FEED_EXCLUDED_CATEGORIES.includes(product.cat)) return "excluded_category";
  const components = ctx.bundles.get(product.dbId);
  if (components?.some((id) => {
    const component = byId.get(id);
    // A component the public cannot read (inactive) is unknown: the kit is left out rather than guessed.
    return !component || (component.cat !== null && FEED_EXCLUDED_CATEGORIES.includes(component.cat));
  })) {
    return "kit_with_excluded_product";
  }
  if (FEED_EXCLUDES_PACKS_WITH_ACCESS && product.inclusions?.length) return "pack_with_access";
  if (!product.image && !product.gallery?.length && !product.variants?.some((v) => v.image)) return "no_image";
  return null;
}

/** One `<item>` of the feed: Google's attribute names without the `g:` prefix, in output order. */
export interface FeedItem {
  id: string;
  item_group_id?: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string[];
  availability: string;
  price: string;
  sale_price?: string;
  sale_price_effective_date?: string;
  brand: string;
  identifier_exists: "no";
  condition: "new";
  product_type?: string;
  color?: string;
  size?: string;
  shipping_weight?: string;
}

function money(minor: number, currency: string): string {
  return `${decimalText(minor)} ${currency}`;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

const COLOUR_OPTION = /^(couleur|colou?r|teinte)$/i;

/** The item's colour: a colour option's value, else a gem's colour. */
function colorOf(product: Product, item: ItemOffer, ctx: FeedContext): string | undefined {
  const values = item.variant?.optionValues;
  if (product.options && values) {
    const index = product.options.findIndex((option) => COLOUR_OPTION.test(option.name.fr.trim()));
    const value = index >= 0 ? product.options[index].values.find((v) => v.id === values[index]) : undefined;
    if (value) return pick(value.name, ctx.locale);
  }
  const gem = product.color ? ctx.colors.find((c) => c.slug === product.color) : undefined;
  return gem ? pick(gem.name, ctx.locale) : undefined;
}

/** What tells the variants apart besides the colour: the other options' values, else the variant's name. */
function sizeOf(product: Product, item: ItemOffer, ctx: FeedContext): string | undefined {
  const variant = item.variant;
  if (!variant || (product.variants?.length ?? 0) < 2) return undefined;
  if (product.options && variant.optionValues) {
    const parts = product.options
      .map((option, index) =>
        COLOUR_OPTION.test(option.name.fr.trim()) ? undefined : option.values.find((v) => v.id === variant.optionValues?.[index]),
      )
      .filter((value) => value !== undefined)
      .map((value) => pick(value.name, ctx.locale));
    if (parts.length > 0) return clip(parts.join(" / "), 100);
    if (colorOf(product, item, ctx)) return undefined;
  }
  return clip(pick(variant.name, ctx.locale), 100);
}

function productType(product: Product, ctx: FeedContext): string | undefined {
  const category = ctx.taxonomy.find((c) => c.slug === product.cat);
  if (!category) return undefined;
  const family = category.families.find((f) => f.slug === product.family);
  return [pick(category.name, ctx.locale), family ? pick(family.name, ctx.locale) : undefined].filter(Boolean).join(" > ");
}

/** The items of one product (none when it is excluded). */
export function productFeedItems(product: Product, ctx: FeedContext, byId: ReadonlyMap<string, Product>): FeedItem[] {
  if (feedExclusion(product, ctx, byId)) return [];
  const absolute = (path: string) => new URL(path, ctx.base).toString();
  const path = productAddresses(product)[ctx.locale];
  const name = pick(product.name, ctx.locale);
  const text = product.description != null ? richTextToPlain(pick(product.description, ctx.locale)) : "";
  const description = clip(text || `${name} — ${pick(product.subtitle, ctx.locale)}.`, DESCRIPTION_MAX);
  const gallery = (product.gallery?.map((g) => g.src) ?? [product.image]).filter(Boolean).map(absolute);
  const group = (product.variants?.length ?? 0) > 1;
  const type = productType(product, ctx);

  return productItemOffers(product, ctx.prices).flatMap((item): FeedItem[] => {
    if (item.availability === "preorder" && FEED_EXCLUDES_PREORDER) return [];
    const availability = item.availability === "preorder" ? "preorder" : GOOGLE_AVAILABILITY[item.availability];
    const image = item.variant?.image ? absolute(item.variant.image) : gallery[0];
    if (!image) return [];
    const weight = item.variant?.weightGrams ?? product.weightGrams;
    const color = colorOf(product, item, ctx);
    const size = sizeOf(product, item, ctx);
    const reduced = item.struckCents !== null;
    return [
      {
        id: item.id,
        ...(group ? { item_group_id: product.dbId ?? product.id } : {}),
        title: clip(group && item.variant ? `${name} – ${pick(item.variant.name, ctx.locale)}` : name, TITLE_MAX),
        description,
        link: absolute(variantPath(path, product, item)),
        image_link: image,
        additional_image_link: gallery.filter((src) => src !== image).slice(0, ADDITIONAL_IMAGES_MAX),
        availability,
        // Omnibus (decision 129): during a reduction, `price` is the reference price and `sale_price` the page price.
        price: money(reduced ? (item.struckCents as number) : item.priceCents, item.currency),
        ...(reduced ? { sale_price: money(item.priceCents, item.currency) } : {}),
        ...(reduced && item.saleStartedAt && item.saleEndsAt
          ? { sale_price_effective_date: `${new Date(item.saleStartedAt).toISOString()}/${new Date(item.saleEndsAt).toISOString()}` }
          : {}),
        brand: PRODUCT_BRAND,
        identifier_exists: "no",
        condition: "new",
        ...(type ? { product_type: type } : {}),
        ...(color ? { color } : {}),
        ...(size ? { size } : {}),
        ...(weight ? { shipping_weight: `${weight} g` } : {}),
      },
    ];
  });
}

/** Every item of the catalogue, in its order. */
export function feedItems(products: readonly Product[], ctx: FeedContext): FeedItem[] {
  const byId = new Map(products.filter((p) => p.dbId).map((p) => [p.dbId as string, p]));
  return products.flatMap((product) => productFeedItems(product, ctx, byId));
}

/** Text for XML: control characters dropped, the five special characters escaped. */
export function xmlText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const FEED_TITLE: Record<FeedLocale, string> = {
  fr: `${PRODUCT_BRAND} — boutique`,
  en: `${PRODUCT_BRAND} — shop`,
};

/** The whole feed: RSS 2.0 with the `g:` namespace (Google Merchant Center and Meta catalogue). */
export function renderProductFeed(items: readonly FeedItem[], ctx: Pick<FeedContext, "locale" | "base">): string {
  const shop = new URL(ctx.locale === "fr" ? "/fr/boutique" : "/en/shop", ctx.base).toString();
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${xmlText(FEED_TITLE[ctx.locale])}</title>`,
    `<link>${xmlText(shop)}</link>`,
    `<description>${xmlText(FEED_TITLE[ctx.locale])}</description>`,
  ];
  for (const item of items) {
    lines.push("<item>");
    for (const [key, value] of Object.entries(item) as [keyof FeedItem, FeedItem[keyof FeedItem]][]) {
      if (value === undefined) continue;
      // `title`, `link` and `description` are RSS's own elements; the rest are Google's.
      const tag = key === "title" || key === "link" || key === "description" ? key : `g:${key}`;
      for (const one of Array.isArray(value) ? value : [value]) lines.push(`<${tag}>${xmlText(one)}</${tag}>`);
    }
    lines.push("</item>");
  }
  lines.push("</channel>", "</rss>", "");
  return lines.join("\n");
}
