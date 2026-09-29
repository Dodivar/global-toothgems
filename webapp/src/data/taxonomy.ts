import type { Localized } from "./types";

/**
 * The shop's two-level taxonomy: category › family.
 *
 * Both levels are data (`categories` and `category_families`, migration
 * `…_category_families`): their slugs are the `categorie` and `famille` URL
 * values, and their names come translated from the database. The list below
 * is only the prototype's copy, used when Supabase is not configured.
 */
export interface ShopFamilyDef {
  slug: string;
  name: Localized;
  /** Public image set in the back office; the menu has a photo per slug otherwise. */
  imageUrl?: string;
}

export interface ShopCategoryDef {
  slug: string;
  name: Localized;
  /** In display order; empty for a category that is not split (Global Lip Gloss). */
  families: ShopFamilyDef[];
}

/** The gems category: only its products have a cut and a colour. */
export const GEMS_CATEGORY = "gems";

const family = (slug: string, fr: string, en: string = fr): ShopFamilyDef => ({ slug, name: { fr, en } });

export const FALLBACK_TAXONOMY: ShopCategoryDef[] = [
  {
    slug: "gems",
    name: { fr: "Toothgems", en: "Toothgems" },
    families: [
      family("swarovski", "Swarovski"),
      family("preciosa", "Preciosa"),
      family("bijoux-or-18ct", "Bijoux en or 18ct", "18ct gold jewels"),
      family("opales", "Opales", "Opals"),
      family("micro-gems", "Micro gems"),
    ],
  },
  {
    slug: "materiel",
    name: { fr: "Matériel", en: "Equipment" },
    families: [family("essentiels", "Essentiels", "Essentials"), family("accessoires", "Accessoires", "Accessories")],
  },
  {
    slug: "kits",
    name: { fr: "Kits", en: "Kits" },
    families: [family("kit-professionnel", "Kit professionnel", "Professional kit"), family("kit-diy", "Kit DIY", "DIY kit")],
  },
  { slug: "lip-gloss", name: { fr: "Global Lip Gloss", en: "Global Lip Gloss" }, families: [] },
];

/**
 * `categorie` values of the former taxonomy, still found in shared links and
 * bookmarks, mapped onto today's categories. Matched case-insensitively.
 */
export const LEGACY_CATEGORIES: Record<string, string> = {
  gems: "gems",
  outils: "materiel",
  suivi: "materiel",
  accessoires: "materiel",
  kits: "kits",
};

/** The shop URL for a category, or one of its families. */
export function shopHref(category: string, family?: string): string {
  const params = new URLSearchParams({ categorie: category });
  if (family) params.set("famille", family);
  return `/boutique?${params.toString()}`;
}

export function findCategory(taxonomy: ShopCategoryDef[], slug: string | null | undefined): ShopCategoryDef | undefined {
  return slug ? taxonomy.find((c) => c.slug === slug) : undefined;
}

/** A family and the category it belongs to. */
export function findFamily(
  taxonomy: ShopCategoryDef[],
  slug: string | null | undefined,
): { category: ShopCategoryDef; family: ShopFamilyDef } | undefined {
  if (!slug) return undefined;
  for (const category of taxonomy) {
    const match = category.families.find((f) => f.slug === slug);
    if (match) return { category, family: match };
  }
  return undefined;
}
