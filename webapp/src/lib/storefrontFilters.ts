import { pick } from "../data/types";
import type { Product } from "../data/products";
import { GEMS_CATEGORY, LEGACY_CATEGORIES, findCategory, findFamily, type ShopCategoryDef } from "../data/taxonomy";

/**
 * Filtering and sorting of the storefront collection (/boutique).
 *
 * Pure functions on plain state, like `productFilters.ts` does for the
 * back office's list, so the page only renders what it is handed and the
 * rules can be tested without a browser.
 *
 * The URL parameters and their values are the ones /boutique already uses,
 * so a filtered link (`shapeHref`, `colorHref`, a shared URL) means the same
 * thing on both pages. Every filter is single-choice, as it is there.
 *
 * The product type is one choice over two levels: a whole category
 * (`categorie=gems`) or one of its families (`categorie=gems&famille=swarovski`).
 * `family` is never set without its category; `normalizeTaxonomy` repairs a
 * URL that says otherwise.
 */

export interface StorefrontFilters {
  category: string;
  family: string;
  material: string;
  shape: string;
  color: string;
  price: string;
  stock: string;
}

export type FilterKey = keyof StorefrontFilters;

/** URL parameter and "no filter" value of each key, as /boutique reads them. */
export const FILTER_PARAMS: Record<FilterKey, { param: string; fallback: string }> = {
  category: { param: "categorie", fallback: "Tout" },
  family: { param: "famille", fallback: "all" },
  material: { param: "matiere", fallback: "all" },
  shape: { param: "forme", fallback: "all" },
  color: { param: "couleur", fallback: "all" },
  price: { param: "prix", fallback: "all" },
  stock: { param: "stock", fallback: "all" },
};

export const FILTER_KEYS = Object.keys(FILTER_PARAMS) as FilterKey[];

export const NO_FILTERS: StorefrontFilters = {
  category: "Tout",
  family: "all",
  material: "all",
  shape: "all",
  color: "all",
  price: "all",
  stock: "all",
};

export const PRICE_BANDS = ["under30", "30to60", "over60"] as const;
export const STOCK_BANDS = ["in", "low", "out"] as const;

/**
 * "new" keeps the catalogue order, which the API returns newest first.
 * "bestSellers" is featured products first, then the most reviewed — the rule
 * the home page's best sellers already use; there are no sales figures to
 * rank on in the storefront.
 */
export const SORT_KEYS = ["new", "bestSellers", "priceAsc", "priceDesc", "rating", "name"] as const;
export type StorefrontSort = (typeof SORT_KEYS)[number];
export const DEFAULT_SORT: StorefrontSort = "new";

/** A former category name (`Outils`, `Suivi`…) as today's category; any other value unchanged. */
function currentCategory(value: string): string {
  return value === FILTER_PARAMS.category.fallback ? value : LEGACY_CATEGORIES[value.toLowerCase()] ?? value;
}

export function readFilters(params: URLSearchParams): StorefrontFilters {
  const read = (key: FilterKey) => params.get(FILTER_PARAMS[key].param) ?? FILTER_PARAMS[key].fallback;
  const filters = {
    category: currentCategory(read("category")),
    family: read("family"),
    material: read("material"),
    shape: read("shape"),
    color: read("color"),
    price: read("price"),
    stock: read("stock"),
  };
  // A hand-edited URL can pair a cut with tools; drop what the panel cannot show.
  return withoutHiddenGemFilters(filters);
}

/**
 * The product type of a URL made to match the taxonomy: a former category
 * name (`Outils`, `Suivi`…) becomes today's (as `readFilters` does), a family
 * alone brings its category, and a family or category the shop does not have
 * is dropped. Until the taxonomy has loaded, only the former names are mapped.
 */
export function normalizeTaxonomy(filters: StorefrontFilters, taxonomy: ShopCategoryDef[]): StorefrontFilters {
  const { fallback: allCategories } = FILTER_PARAMS.category;
  const { fallback: allFamilies } = FILTER_PARAMS.family;
  let category = currentCategory(filters.category);
  let family = filters.family;
  if (taxonomy.length > 0) {
    const match = family === allFamilies ? undefined : findFamily(taxonomy, family);
    if (match) category = match.category.slug;
    else family = allFamilies;
    if (category !== allCategories && !findCategory(taxonomy, category)) category = allCategories;
  }
  if (category === filters.category && family === filters.family) return filters;
  return withoutHiddenGemFilters({ ...filters, category, family });
}

/** An unknown `tri` from a hand-edited URL falls back to the default order. */
export function readSort(params: URLSearchParams): StorefrontSort {
  const value = params.get("tri");
  return (SORT_KEYS as readonly string[]).includes(value ?? "") ? (value as StorefrontSort) : DEFAULT_SORT;
}

/**
 * The query string for a set of filters. The sort and any unrelated parameter
 * are kept; the page number is dropped, since a new filter invalidates it.
 */
export function writeFilters(params: URLSearchParams, filters: StorefrontFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) {
    const { param, fallback } = FILTER_PARAMS[key];
    if (filters[key] === fallback) next.delete(param);
    else next.set(param, filters[key]);
  }
  next.delete("page");
  return next;
}

/**
 * Only gems carry a cut or a colour, so those two filters exist only while the
 * product type is "all" or gems. Picking another type clears them: a hidden
 * filter that still narrowed the grid would be impossible to see or undo.
 */
export function gemFiltersApply(category: string): boolean {
  return category === FILTER_PARAMS.category.fallback || category === GEMS_CATEGORY;
}

function withoutHiddenGemFilters(filters: StorefrontFilters): StorefrontFilters {
  if (gemFiltersApply(filters.category)) return filters;
  return { ...filters, shape: FILTER_PARAMS.shape.fallback, color: FILTER_PARAMS.color.fallback };
}

/**
 * `filters` with one value changed, and the rule above applied. A new
 * category also clears the family, which belonged to the previous one.
 */
export function withFilter(filters: StorefrontFilters, key: FilterKey, value: string): StorefrontFilters {
  const next = { ...filters, [key]: value };
  if (key === "category") next.family = FILTER_PARAMS.family.fallback;
  return withoutHiddenGemFilters(next);
}

/** `filters` narrowed to one node of the product-type tree: a category, or one of its families. */
export function withTaxonomyNode(filters: StorefrontFilters, category: string, family?: string): StorefrontFilters {
  return { ...withFilter(filters, "category", category), family: family ?? FILTER_PARAMS.family.fallback };
}

/** A family is part of the product-type filter, so it does not count on its own. */
export function activeFilterCount(filters: StorefrontFilters): number {
  return FILTER_KEYS.filter((key) => key !== "family" && filters[key] !== FILTER_PARAMS[key].fallback).length;
}

/** Bands as /boutique defines them: 30 and 60 both fall in the middle band. */
export function matchesPriceBand(price: number, band: string): boolean {
  if (band === "under30") return price < 30;
  if (band === "30to60") return price >= 30 && price <= 60;
  if (band === "over60") return price > 60;
  return true;
}

/** "In stock" means orderable now, so it includes the last pieces. */
export function matchesStockBand(stock: Product["stock"], band: string): boolean {
  if (band === "in") return stock !== "out";
  if (band === "low") return stock === "low";
  if (band === "out") return stock === "out";
  return true;
}

function matches(product: Product, filters: StorefrontFilters): boolean {
  const active = (key: FilterKey) => filters[key] !== FILTER_PARAMS[key].fallback;
  if (active("category") && product.cat !== filters.category) return false;
  if (active("family") && product.family !== filters.family) return false;
  if (active("material") && product.material !== filters.material) return false;
  if (active("shape") && product.shape !== filters.shape) return false;
  if (active("color") && product.color !== filters.color) return false;
  if (active("price") && !matchesPriceBand(product.price, filters.price)) return false;
  if (active("stock") && !matchesStockBand(product.stock, filters.stock)) return false;
  return true;
}

export function filterProducts(products: Product[], filters: StorefrontFilters): Product[] {
  return products.filter((p) => matches(p, filters));
}

/**
 * How many products picking `value` for `key` would show, the other filters
 * unchanged (bar the ones `withFilter` clears with it) — so an option can say it would empty the grid before anyone
 * clicks it.
 */
export function facetCount(products: Product[], filters: StorefrontFilters, key: FilterKey, value: string): number {
  return countMatching(products, withFilter(filters, key, value));
}

/** `facetCount` for a node of the product-type tree. */
export function taxonomyNodeCount(products: Product[], filters: StorefrontFilters, category: string, family?: string): number {
  return countMatching(products, withTaxonomyNode(filters, category, family));
}

function countMatching(products: Product[], filters: StorefrontFilters): number {
  return products.filter((p) => matches(p, filters)).length;
}

/** Materials some product carries, alphabetical; an empty material is not an option. */
export function materialsInCatalog(products: Product[], locale: string): string[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return [...new Set(products.map((p) => p.material).filter(Boolean))].sort(collator.compare);
}

export function sortProducts(products: Product[], sort: StorefrontSort, lang: string): Product[] {
  const list = products.slice();
  switch (sort) {
    case "priceAsc":
      return list.sort((a, b) => a.price - b.price);
    case "priceDesc":
      return list.sort((a, b) => b.price - a.price);
    case "rating":
      return list.sort((a, b) => b.rating - a.rating);
    case "bestSellers":
      return list.sort(
        (a, b) => Number(b.isFeatured ?? false) - Number(a.isFeatured ?? false) || b.reviewCount - a.reviewCount,
      );
    case "name": {
      const collator = new Intl.Collator(lang.startsWith("en") ? "en" : "fr", { sensitivity: "base" });
      return list.sort((a, b) => collator.compare(pick(a.name, lang), pick(b.name, lang)));
    }
    case "new":
    default:
      return list;
  }
}
