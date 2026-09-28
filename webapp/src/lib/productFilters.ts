import {
  effectivePrice,
  matchesStockState,
  type AdminProduct,
  type CategoryId,
  type ProductStatus,
  type StockState,
} from "../data/adminCatalog";
import { GEM_SHAPES, type GemColor, type GemShape } from "../data/products";
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
  /** Gem cut and colour family, the two attributes gems are told apart by. */
  shape: GemShape | "all";
  color: GemColor | "all";
  sort: SortKey;
}

export const DEFAULT_FILTERS: ProductFilterState = {
  search: "",
  category: "all",
  status: "all",
  availability: "all",
  shape: "all",
  color: "all",
  sort: "newest",
};

/** The keys that narrow the list — everything but the sort order. */
export type FilterKey = Exclude<keyof ProductFilterState, "sort">;

/** True as soon as anything narrows the list, which is what enables "Clear". */
export function isFiltered(filters: ProductFilterState): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.category !== "all" ||
    filters.status !== "all" ||
    filters.availability !== "all" ||
    filters.shape !== "all" ||
    filters.color !== "all"
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

/** Every filter but `except`, so a facet can count what choosing each value would give. */
function matchesFilters(product: AdminProduct, filters: ProductFilterState, except?: FilterKey): boolean {
  if (except !== "search" && !matchesSearch(product, filters.search)) return false;
  if (except !== "category" && filters.category !== "all" && product.categoryId !== filters.category) return false;
  if (except !== "status" && filters.status !== "all" && product.status !== filters.status) return false;
  if (except !== "availability" && filters.availability !== "all" && !matchesStockState(product, filters.availability))
    return false;
  if (except !== "shape" && filters.shape !== "all" && product.shape !== filters.shape) return false;
  if (except !== "color" && filters.color !== "all" && product.color !== filters.color) return false;
  return true;
}

export interface FacetCount<T extends string> {
  value: T;
  /** Products the list would show with this value picked, the other filters unchanged. */
  count: number;
}

/**
 * The shapes and colours worth offering as filters, each with its count.
 *
 * Only values some product actually carries are listed — a chip that can only
 * ever empty the list is noise — and the list does not shrink as other filters
 * change, so the chips stay where the eye left them. The count, on the other
 * hand, follows the other filters: "Étoile 0" under "Outils" says why picking
 * it would empty the table before anyone clicks.
 *
 * Shapes come in `GEM_SHAPES` order and colours in the order of `colorOrder`
 * (the back-office order); a colour slug missing from it (a deleted colour
 * still on a product) goes last rather than disappearing.
 */
export function gemFacets(
  products: AdminProduct[],
  filters: ProductFilterState,
  colorOrder: GemColor[],
): { shapes: FacetCount<GemShape>[]; colors: FacetCount<GemColor>[] } {
  const count = <T extends string>(key: "shape" | "color", values: T[]): FacetCount<T>[] =>
    values.map((value) => ({
      value,
      count: products.filter((p) => p[key] === value && matchesFilters(p, filters, key)).length,
    }));

  const shapesUsed = new Set(products.map((p) => p.shape).filter((s): s is GemShape => s !== undefined));
  const colorsUsed = new Set(products.map((p) => p.color).filter((c): c is GemColor => c !== undefined));
  const orphanColors = [...colorsUsed].filter((slug) => !colorOrder.includes(slug)).sort();

  return {
    shapes: count("shape", GEM_SHAPES.filter((shape) => shapesUsed.has(shape))),
    colors: count("color", [...colorOrder.filter((slug) => colorsUsed.has(slug)), ...orphanColors]),
  };
}

export function filterProducts(
  products: AdminProduct[],
  filters: ProductFilterState,
  lang: string,
): AdminProduct[] {
  const result = products.filter((product) => matchesFilters(product, filters));

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

/**
 * Untracked products have no count; they sort after everything countable.
 * A product with variants sorts by its emptiest option: the total would put
 * a gem with one sold-out option far down the list.
 */
function stockValue(product: AdminProduct): number {
  const tracked = (product.variantStock ?? []).filter((variant) => variant.trackInventory);
  if (product.variantStock?.length) {
    return tracked.length > 0 ? Math.min(...tracked.map((v) => v.stock - (v.reserved ?? 0))) : Number.MAX_SAFE_INTEGER;
  }
  if (!product.trackInventory) return Number.MAX_SAFE_INTEGER;
  return product.stock - (product.reserved ?? 0);
}
