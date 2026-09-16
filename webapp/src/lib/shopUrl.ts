import type { GemColor, GemShape } from "../data/products";

/**
 * Shop URLs for a cut or a colour.
 *
 * Five surfaces link into a filtered collection — the home carousel, the two
 * header carousels and the two full-page selectors — and every one of them was
 * about to hand-write the same query string. Building them here keeps the
 * parameter names and the `categorie=Gems` scoping decision in one place.
 *
 * Gems are the only products carrying a cut or a colour, so the category is
 * pinned: landing on "heart" with tools and kits still in the result count
 * would read as a broken filter.
 */
export const shapeHref = (shape: GemShape) => `/boutique?categorie=Gems&forme=${shape}`;

export const colorHref = (color: GemColor) => `/boutique?categorie=Gems&couleur=${color}`;
