import type { GemColor, GemShape } from "../data/products";
import { GEMS_CATEGORY, shopHref } from "../data/taxonomy";

/**
 * Shop URLs for a cut or a colour.
 *
 * Five surfaces link into a filtered collection — the home carousel, the two
 * header carousels and the two full-page selectors — and every one of them was
 * about to hand-write the same query string. Building them here keeps the
 * parameter names and the `categorie=gems` scoping decision in one place.
 *
 * Gems are the only products carrying a cut or a colour, so the category is
 * pinned: landing on "heart" with tools and kits still in the result count
 * would read as a broken filter.
 */
export const shapeHref = (shape: GemShape, family?: string) =>
  `/boutique?categorie=${GEMS_CATEGORY}${family ? `&famille=${family}` : ""}&forme=${shape}`;

export const colorHref = (color: GemColor) => `/boutique?categorie=${GEMS_CATEGORY}&couleur=${color}`;

/** Families whose entry points ask for a cut first, on /formes, before the products. */
const SHAPE_FIRST_FAMILIES = ["swarovski"];

export const isShapeFirstFamily = (category: string, family: string | null | undefined) =>
  category === GEMS_CATEGORY && family != null && SHAPE_FIRST_FAMILIES.includes(family);

/** Where a menu or home entry for a family leads: the cut chooser for Swarovski, the family's products otherwise. */
export const familyEntryHref = (category: string, family: string) =>
  isShapeFirstFamily(category, family) ? `/formes?famille=${family}` : shopHref(category, family);
