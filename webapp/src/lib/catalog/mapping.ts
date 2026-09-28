import {
  GEM_SHAPES,
  type GemColorDef,
  type GemShape,
  type Product,
  type ProductVariant,
  type ShopCategory,
} from "../../data/products";
import type { Localized } from "../../data/types";
import { toMajorUnits, toMinorUnits } from "./money";
import { parseGemAttributes } from "../gemOptions";

/**
 * Pure mapping from catalogue rows (as returned by `api.ts`) to the
 * storefront's `Product` model. No network, no React: unit-tested on its own.
 */

/** Language of the base columns (`languages.is_default` in the database). */
export const DEFAULT_CONTENT_LOCALE = "fr";

/** Languages the storefront UI offers, besides the default one. */
const TRANSLATED_LOCALES = ["en"] as const;

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface TranslationRow {
  locale: string;
  status: string;
}

export interface ProductTranslationRow extends TranslationRow {
  name: string;
  slug: string | null;
  short_description: string | null;
  description: string | null;
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "preorder";

interface InventoryRow {
  stock_status: string | null;
}

export interface VariantRow {
  id: string;
  name: string;
  /** Option values, e.g. `{ "pack": 50, "ss": 6 }` for a gem. */
  attributes?: Json;
  price: number | null;
  compare_at_price: number | null;
  is_active: boolean;
  position: number;
  product_variant_translations: (TranslationRow & { name: string })[];
  inventory_items: InventoryRow[];
}

export interface MediaRow {
  id: string;
  storage_path: string;
  media_type: string;
  alt_text: string | null;
  position: number;
  is_primary: boolean;
  /** The variant this photo shows; null = the whole product. */
  variant_id?: string | null;
  product_media_translations: (TranslationRow & { alt_text: string })[];
}

export interface CategoryRow {
  slug: string;
  name: string;
  category_translations: (TranslationRow & { name: string })[];
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  is_featured: boolean;
  metadata: Json;
  category: CategoryRow | null;
  product_translations: ProductTranslationRow[];
  product_variants: VariantRow[];
  product_media: MediaRow[];
  inventory_items: InventoryRow[];
}

export interface ReviewStatsRow {
  product_id: string | null;
  average_rating: number | null;
  review_count: number | null;
}

/** Database category slug → shop filter key. Unknown slugs stay unfiltered. */
const CATEGORY_BY_SLUG: Record<string, ShopCategory> = {
  gems: "Gems",
  outils: "Outils",
  kits: "Kits",
  entretien: "Suivi",
  accessoires: "Accessoires",
};

/**
 * Builds a `Localized` value from the base column and the published
 * translations. A missing or draft translation falls back to the default
 * language rather than showing an empty string.
 */
export function localize<T extends TranslationRow>(
  base: string,
  translations: T[],
  field: (row: T) => string | null | undefined,
): Localized {
  const value: Localized = { fr: base, en: base };
  for (const locale of TRANSLATED_LOCALES) {
    const row = translations.find((t) => t.locale === locale && t.status === "published");
    const text = row ? field(row)?.trim() : undefined;
    if (text) value[locale] = text;
  }
  return value;
}

/** Storefront badge from the database's stock status. In stock and preorder show no badge. */
function stockBadge(status: string | null | undefined): "low" | "out" | undefined {
  if (status === "low_stock") return "low";
  if (status === "out_of_stock") return "out";
  return undefined;
}

/**
 * Availability of a product with variants: the best of its variants, so a
 * product is only "out" when every option is.
 */
export function aggregateStock(statuses: (string | null | undefined)[]): "low" | "out" | undefined {
  const known = statuses.filter((s): s is string => Boolean(s));
  if (known.length === 0) return undefined;
  if (known.some((s) => s === "in_stock" || s === "preorder")) return undefined;
  if (known.some((s) => s === "low_stock")) return "low";
  return "out";
}

function metadataString(metadata: Json, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asShape(value: string | undefined): GemShape | undefined {
  return (GEM_SHAPES as string[]).includes(value ?? "") ? (value as GemShape) : undefined;
}

/**
 * One row of `gem_colors` with its translations. RLS already limits visitors
 * to active colours and published translations.
 */
export interface GemColorRow {
  slug: string;
  name: string;
  hex: string | null;
  is_multicolor: boolean;
  gem_color_translations: (TranslationRow & { name: string })[];
}

export function mapGemColor(row: GemColorRow): GemColorDef {
  return {
    slug: row.slug,
    name: localize(row.name, row.gem_color_translations, (t) => t.name),
    hex: row.is_multicolor ? null : row.hex,
    isMulticolor: row.is_multicolor,
  };
}

function displayPrice(value: number | string): number {
  return toMajorUnits(toMinorUnits(value));
}

/** Colour dot of a variant (`attributes.swatch`), when it is a valid `#rrggbb`. */
function swatchOf(attributes: Json | undefined): string | undefined {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return undefined;
  const swatch = attributes.swatch;
  return typeof swatch === "string" && /^#[0-9a-f]{6}$/i.test(swatch) ? swatch.toLowerCase() : undefined;
}

function mapVariant(row: VariantRow, productPrice: number | string, image: string | undefined): ProductVariant {
  const price = displayPrice(row.price ?? productPrice);
  const compareAt = row.compare_at_price != null ? displayPrice(row.compare_at_price) : undefined;
  const gem = parseGemAttributes(row.attributes);
  const swatch = swatchOf(row.attributes);
  return {
    id: row.id,
    name: localize(row.name, row.product_variant_translations, (t) => t.name),
    ...(gem ? { pack: gem.pack ?? undefined, ss: gem.ss ?? undefined } : {}),
    ...(swatch ? { swatch } : {}),
    ...(image ? { image } : {}),
    price,
    compareAtPrice: compareAt != null && compareAt > price ? compareAt : undefined,
    stock: stockBadge(row.inventory_items[0]?.stock_status),
  };
}

/**
 * Maps one product row to the storefront model.
 *
 * @param mediaUrl turns a Storage object path into a URL (injected so the
 *                 mapping stays testable without a Supabase client).
 */
export function mapProduct(
  row: ProductRow,
  stats: ReviewStatsRow | undefined,
  mediaUrl: (path: string) => string,
): Product {
  const name = localize(row.name, row.product_translations, (t) => t.name);
  const shortDescription = row.short_description
    ? localize(row.short_description, row.product_translations, (t) => t.short_description)
    : undefined;
  const longDescription = row.description
    ? localize(row.description, row.product_translations, (t) => t.description)
    : undefined;

  const material = metadataString(row.metadata, "material") ?? "";
  const categoryName = row.category
    ? localize(row.category.name, row.category.category_translations, (t) => t.name)
    : undefined;

  const imageRows = row.product_media
    .filter((m) => m.media_type === "image")
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
  const images = imageRows.map((m) => ({
    src: mediaUrl(m.storage_path),
    alt: m.alt_text
      ? localize(m.alt_text, m.product_media_translations, (t) => t.alt_text)
      : name,
  }));
  // A variant's photo is the first gallery image that shows it.
  const variantImage = (variantId: string) => {
    const index = imageRows.findIndex((m) => m.variant_id === variantId);
    return index >= 0 ? images[index].src : undefined;
  };

  const variants = row.product_variants
    .filter((v) => v.is_active)
    .sort((a, b) => a.position - b.position)
    .map((v) => mapVariant(v, row.price, variantImage(v.id)));

  const stock = variants.length > 0
    ? aggregateStock(row.product_variants.filter((v) => v.is_active).map((v) => v.inventory_items[0]?.stock_status))
    : stockBadge(row.inventory_items[0]?.stock_status);

  const price = displayPrice(row.price);
  const compareAtPrice = row.compare_at_price != null ? displayPrice(row.compare_at_price) : undefined;

  const aliases = row.product_translations
    .filter((t) => t.status === "published" && t.slug && t.slug !== row.slug)
    .map((t) => t.slug as string);

  return {
    id: row.slug,
    aliases,
    name,
    // Cards read best with a short spec line; the material is that line when
    // the product has one, else the category.
    subtitle: material ? { fr: material, en: material } : categoryName ?? { fr: "", en: "" },
    price,
    compareAtPrice: compareAtPrice != null && compareAtPrice > price ? compareAtPrice : undefined,
    rating: stats?.average_rating ?? 0,
    reviewCount: stats?.review_count ?? 0,
    stock,
    image: images[0]?.src ?? "",
    cat: row.category ? CATEGORY_BY_SLUG[row.category.slug] ?? null : null,
    material,
    shape: asShape(metadataString(row.metadata, "shape")),
    // Any slug: the colour list is data, and a slug with no matching colour
    // simply never shows up in the colour filter.
    color: metadataString(row.metadata, "color"),
    description: longDescription ?? shortDescription,
    gallery: images.length > 0 ? images : undefined,
    variants: variants.length > 0 ? variants : undefined,
    isFeatured: row.is_featured,
  };
}
