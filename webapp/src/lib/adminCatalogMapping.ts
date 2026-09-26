import type {
  AdminProduct,
  Availability,
  Category,
  ProductImage,
  ProductRecommendation,
  ProductStatus,
  ProductType,
  RecommendationKind,
} from "../data/adminCatalog";
import type { Localized } from "../data/types";
import type { Json } from "./supabase/database.types";
import { toMinorUnits } from "./catalog/money";

/**
 * Pure translation between the Supabase catalogue and the admin model.
 *
 * Kept free of any client or React so the rules that touch money, language
 * fallback and media order are unit-tested (`adminCatalogMapping.test.ts`).
 *
 * Database shape (migrations 002 and 007):
 * - base columns of `products` / `product_media` hold French, the default
 *   language; English lives in `*_translations` rows (`locale = 'en'`);
 * - `metadata` holds presentation-only fields: type, material, tags;
 * - stock lives in the product's single `inventory_items` row.
 */

/** Columns the admin reads, with the relations it embeds. */
export const ADMIN_PRODUCT_SELECT = `
  id, sku, slug, name, short_description, description, category_id,
  price, compare_at_price, currency, status, metadata, created_at, updated_at,
  product_translations ( locale, name, short_description, description ),
  product_media ( id, storage_path, alt_text, position, product_media_translations ( locale, alt_text ) ),
  inventory_items ( track_inventory, quantity_on_hand, quantity_reserved, low_stock_threshold, availability ),
  product_variants ( id, inventory_items ( track_inventory, quantity_on_hand, quantity_reserved, low_stock_threshold, availability ) )
`;

export const ADMIN_CATEGORY_SELECT = `
  id, slug, name, description, position,
  category_translations ( locale, name, description )
`;

interface TranslationRow {
  locale: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
}

interface InventoryRow {
  track_inventory: boolean;
  quantity_on_hand: number;
  quantity_reserved: number;
  low_stock_threshold: number;
  availability: string;
}

export interface ProductRow {
  id: string;
  sku: string | null;
  slug: string;
  name: string;
  short_description: string | null;
  description: string | null;
  category_id: string | null;
  /** PostgREST sends numeric as a JSON number, occasionally as a string. */
  price: number | string;
  compare_at_price: number | string | null;
  currency: string;
  status: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
  product_translations: TranslationRow[] | null;
  product_media:
    | {
        id: string;
        storage_path: string;
        alt_text: string | null;
        position: number;
        product_media_translations: { locale: string; alt_text: string }[] | null;
      }[]
    | null;
  /** One row per product without variants; PostgREST embeds it as a list. */
  inventory_items: InventoryRow[] | InventoryRow | null;
  /** Variants, each with its own stock row. */
  product_variants?: { id: string; inventory_items: InventoryRow[] | InventoryRow | null }[] | null;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  position: number;
  category_translations: TranslationRow[] | null;
}

export interface RecommendationRow {
  product_id: string;
  recommended_product_id: string;
  kind: string;
  position: number;
}

const PRODUCT_TYPES: ProductType[] = ["single", "set", "kit", "tool", "care", "course-material"];
const STATUSES: ProductStatus[] = ["active", "draft", "archived"];
const AVAILABILITIES: Availability[] = ["in_stock", "out_of_stock", "preorder"];

/** Public bucket holding catalogue images (migration 006). */
export const PRODUCT_MEDIA_BUCKET = "product-media";

/** Same limits as the bucket; checked in the browser to fail fast. */
export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Media ids given to files uploaded in the form but not saved yet. */
export const UNSAVED_MEDIA_PREFIX = "upload-";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function english<T extends { locale: string }>(rows: T[] | null | undefined): T | undefined {
  return rows?.find((row) => row.locale === "en");
}

function asObject(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * `metadata.material` was seeded as a plain French string; the admin writes
 * `{ fr, en }`. Both are read.
 */
function readLocalized(value: Json | undefined): Localized {
  if (typeof value === "string") return { fr: value, en: "" };
  const obj = asObject(value);
  return {
    fr: typeof obj.fr === "string" ? obj.fr : "",
    en: typeof obj.en === "string" ? obj.en : "",
  };
}

/** Major units for the form, read through integer cents so no float drift is introduced. */
export function amountFromDb(value: number | string): number {
  return toMinorUnits(value) / 100;
}

/**
 * Exact decimal string for `numeric(12,2)`: `19.99` becomes `"19.99"`, never
 * `19.989999…`. Throws on a value that is not a valid amount.
 */
export function amountToDb(value: number): string {
  const cents = toMinorUnits(value);
  if (cents < 0) throw new Error(`Negative amount: ${value}`);
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** URL slug from a product name: lower-case ASCII words joined by hyphens. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Ligatures do not decompose under NFD ("Cœur" would become "c-ur").
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function rowToCategory(row: CategoryRow): Category {
  const en = english(row.category_translations);
  return {
    id: row.id,
    name: { fr: row.name, en: en?.name ?? row.name },
    description: { fr: row.description ?? "", en: en?.description ?? row.description ?? "" },
  };
}

export function rowToProduct(row: ProductRow, publicUrl: (path: string) => string): AdminProduct {
  const en = english(row.product_translations);
  const metadata = asObject(row.metadata);
  const variants = row.product_variants ?? [];
  const variantStock = variants
    .map((variant) => (Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items))
    .filter((item): item is InventoryRow => Boolean(item));
  // With variants, the product reads as the sum of its variants' stock.
  const inventory: InventoryRow | null | undefined =
    variants.length > 0
      ? {
          track_inventory: true,
          quantity_on_hand: variantStock.reduce((sum, item) => sum + item.quantity_on_hand, 0),
          quantity_reserved: variantStock.reduce((sum, item) => sum + item.quantity_reserved, 0),
          low_stock_threshold: variantStock.reduce((sum, item) => sum + item.low_stock_threshold, 0),
          availability: "in_stock",
        }
      : Array.isArray(row.inventory_items)
        ? row.inventory_items[0]
        : row.inventory_items;
  const tags = Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === "string") : [];

  const media: ProductImage[] = [...(row.product_media ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.id,
      storagePath: item.storage_path,
      src: publicUrl(item.storage_path),
      alt: { fr: item.alt_text ?? "", en: english(item.product_media_translations)?.alt_text ?? "" },
    }));

  return {
    id: row.id,
    sku: row.sku ?? "",
    name: { fr: row.name, en: en?.name ?? "" },
    shortDescription: { fr: row.short_description ?? "", en: en?.short_description ?? "" },
    description: { fr: row.description ?? "", en: en?.description ?? "" },
    categoryId: row.category_id ?? "",
    type: oneOf(metadata.type, PRODUCT_TYPES, "single"),
    price: amountFromDb(row.price),
    compareAtPrice: row.compare_at_price == null ? undefined : amountFromDb(row.compare_at_price),
    media,
    trackInventory: inventory?.track_inventory ?? true,
    // Units on the shelf. Reservations held by unpaid orders are not
    // subtracted here: the form edits what is physically in stock.
    stock: inventory?.quantity_on_hand ?? 0,
    lowStockThreshold: inventory?.low_stock_threshold ?? 5,
    availability: oneOf(inventory?.availability, AVAILABILITIES, "in_stock"),
    status: oneOf(row.status, STATUSES, "draft"),
    variantCount: variants.length,
    material: readLocalized(metadata.material),
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToRecommendation(row: RecommendationRow): ProductRecommendation {
  return {
    productId: row.product_id,
    recommendedProductId: row.recommended_product_id,
    kind: row.kind as RecommendationKind,
    position: row.position,
  };
}

/**
 * Payload of `admin_save_product()` (migration `…_admin_product_management`).
 *
 * `promoPrice` is deliberately not sent: the database has no column for it and
 * discounts belong to the promotions domain, not to the product.
 */
export function productToPayload(product: AdminProduct): Json {
  const name = { fr: product.name.fr.trim(), en: product.name.en.trim() };
  return {
    id: product.id,
    category_id: product.categoryId,
    sku: product.sku.trim(),
    // Only used on creation; the database keeps an existing product's URL.
    slug: slugify(name.fr) || slugify(product.sku) || "produit",
    name: name.fr,
    short_description: product.shortDescription.fr.trim(),
    description: product.description.fr.trim(),
    price: amountToDb(product.price),
    compare_at_price: product.compareAtPrice == null ? null : amountToDb(product.compareAtPrice),
    status: product.status,
    metadata: {
      type: product.type,
      material: { fr: product.material.fr.trim(), en: product.material.en.trim() },
      tags: product.tags,
    },
    translations: {
      en: {
        name: name.en,
        slug: slugify(name.en) || null,
        short_description: product.shortDescription.en.trim(),
        description: product.description.en.trim(),
      },
    },
    inventory: {
      track_inventory: product.trackInventory,
      quantity_on_hand: product.stock,
      low_stock_threshold: product.lowStockThreshold,
      availability: product.availability,
    },
    media: product.media
      .filter((image) => image.storagePath)
      .map((image) => ({
        // Saved rows keep their id; new uploads (and a duplicate's copies) get a row.
        id: isUuid(image.id) ? image.id : null,
        storage_path: image.storagePath!,
        // An image without its own description is described by the product.
        alt_fr: image.alt.fr.trim() || name.fr,
        alt_en: image.alt.en.trim() || name.en,
      })),
  };
}

/** Categories of failure the admin tells apart, keyed like `admin.errors.*`. */
export type CatalogErrorKind = "permission" | "duplicate" | "inUse" | "invalid" | "notFound" | "network" | "generic";

/** Maps a PostgREST / Postgres / Storage error to a message the screen can show. */
export function catalogErrorKind(error: { code?: string; message?: string; status?: number | string } | null | undefined): CatalogErrorKind {
  if (!error) return "generic";
  switch (error.code) {
    case "42501":
    case "PGRST301":
      return "permission";
    case "23505":
      return "duplicate";
    case "23503":
      return "inUse";
    case "23514":
    case "22023":
    case "22P02":
    case "23502":
      return "invalid";
    case "P0002":
    case "PGRST116":
      return "notFound";
  }
  const status = Number(error.status);
  if (status === 401 || status === 403) return "permission";
  if (/failed to fetch|network/i.test(error.message ?? "")) return "network";
  return "generic";
}
