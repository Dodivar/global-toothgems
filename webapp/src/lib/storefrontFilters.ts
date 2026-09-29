import { pick } from "../data/types";
import type { Product } from "../data/products";

/**
 * Filtering and sorting of the storefront collection (/boutique-b).
 *
 * Pure functions on plain state, like `productFilters.ts` does for the
 * back office's list, so the page only renders what it is handed and the
 * rules can be tested without a browser.
 *
 * The URL parameters and their values are the ones /boutique already uses,
 * so a filtered link (`shapeHref`, `colorHref`, a shared URL) means the same
 * thing on both pages. Every filter is single-choice, as it is there.
 */

export interface StorefrontFilters {
  category: string;
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
  material: { param: "matiere", fallback: "all" },
  shape: { param: "forme", fallback: "all" },
  color: { param: "couleur", fallback: "all" },
  price: { param: "prix", fallback: "all" },
  stock: { param: "stock", fallback: "all" },
};

export const FILTER_KEYS = Object.keys(FILTER_PARAMS) as FilterKey[];

export const NO_FILTERS: StorefrontFilters = {
  category: "Tout",
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

export function readFilters(params: URLSearchParams): StorefrontFilters {
  const read = (key: FilterKey) => params.get(FILTER_PARAMS[key].param) ?? FILTER_PARAMS[key].fallback;
  return {
    category: read("category"),
    material: read("material"),
    shape: read("shape"),
    color: read("color"),
    price: read("price"),
    stock: read("stock"),
  };
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

export function activeFilterCount(filters: StorefrontFilters): number {
  return FILTER_KEYS.filter((key) => filters[key] !== FILTER_PARAMS[key].fallback).length;
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
 * unchanged — so an option can say it would empty the grid before anyone
 * clicks it.
 */
export function facetCount(products: Product[], filters: StorefrontFilters, key: FilterKey, value: string): number {
  return products.filter((p) => matches(p, { ...filters, [key]: value })).length;
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
