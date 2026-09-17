import {
  effectivePrice,
  stockState,
  type AdminProduct,
  type CategoryId,
  type ProductStatus,
  type StockState,
} from "../data/adminCatalog";
import { pick } from "../data/types";

/**
 * Search, filtering and sorting of the product list.
 *
 * Pure functions on plain state, kept out of the components: the table only
 * renders what it is handed, and this is the part a server-side query would
 * eventually replace without any screen noticing.
 */

export type SortKey = "newest" | "oldest" | "price-desc" | "price-asc" | "name-asc" | "stock-asc";

export const SORT_KEYS: SortKey[] = ["newest", "oldest", "price-desc", "price-asc", "name-asc", "stock-asc"];

export interface ProductFilterState {
  search: string;
  category: CategoryId | "all";
  status: ProductStatus | "all";
  availability: StockState | "all";
  sort: SortKey;
}

export const DEFAULT_FILTERS: ProductFilterState = {
  search: "",
  category: "all",
  status: "all",
  availability: "all",
  sort: "newest",
};

/** True as soon as anything narrows the list, which is what enables "Clear". */
export function isFiltered(filters: ProductFilterState): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.category !== "all" ||
    filters.status !== "all" ||
    filters.availability !== "all"
  );
}

/** Ignores case and accents, so "etoile" finds "Étoile". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Matches the query against both languages of the name plus the SKU and tags.
 * Searching in one language while the interface is in the other is a normal
 * thing to do on a bilingual catalogue, and failing it would look broken.
 */
function matchesSearch(product: AdminProduct, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = [
    product.name.fr,
    product.name.en,
    product.sku,
    product.shortDescription.fr,
    product.shortDescription.en,
    ...product.tags,
  ]
    .map(normalize)
    .join(" ");
  return haystack.includes(needle);
}

export function filterProducts(
  products: AdminProduct[],
  filters: ProductFilterState,
  lang: string,
): AdminProduct[] {
  const result = products.filter((product) => {
    if (!matchesSearch(product, filters.search)) return false;
    if (filters.category !== "all" && product.categoryId !== filters.category) return false;
    if (filters.status !== "all" && product.status !== filters.status) return false;
    if (filters.availability !== "all" && stockState(product) !== filters.availability) return false;
    return true;
  });

  const collator = new Intl.Collator(lang.startsWith("en") ? "en" : "fr", { sensitivity: "base" });

  // A copy: `filter` already returned one, but sorting the caller's array would
  // reorder the store's state in place.
  return [...result].sort((a, b) => {
    switch (filters.sort) {
      case "oldest":
        return a.updatedAt.localeCompare(b.updatedAt);
      case "price-desc":
        return effectivePrice(b) - effectivePrice(a);
      case "price-asc":
        return effectivePrice(a) - effectivePrice(b);
      case "name-asc":
        return collator.compare(pick(a.name, lang), pick(b.name, lang));
      case "stock-asc":
        // Lowest first: this sort exists to surface what needs restocking.
        return stockValue(a) - stockValue(b);
      case "newest":
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });
}

/** Untracked products have no count; they sort after everything countable. */
function stockValue(product: AdminProduct): number {
  if (!product.trackInventory) return Number.MAX_SAFE_INTEGER;
  return product.stock;
}
