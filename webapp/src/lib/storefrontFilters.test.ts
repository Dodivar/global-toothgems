import { describe, expect, it } from "vitest";
import type { Product } from "../data/products";
import {
  NO_FILTERS,
  activeFilterCount,
  facetCount,
  filterProducts,
  materialsInCatalog,
  matchesPriceBand,
  matchesStockBand,
  readFilters,
  readSort,
  sortProducts,
  writeFilters,
} from "./storefrontFilters";

function product(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: { fr: overrides.id, en: overrides.id },
    subtitle: { fr: "", en: "" },
    price: 10,
    rating: 0,
    reviewCount: 0,
    image: "",
    cat: "Gems",
    material: "",
    ...overrides,
  };
}

const catalogue: Product[] = [
  product({ id: "heart", price: 29, shape: "heart", color: "crystal", material: "Swarovski", rating: 4.2, reviewCount: 10 }),
  product({ id: "star", price: 30, shape: "star", color: "gold", material: "Or 18k", stock: "low", rating: 4.9, reviewCount: 3 }),
  product({ id: "kit", cat: "Kits", price: 60, stock: "out", rating: 4.5, reviewCount: 40, isFeatured: true }),
  product({ id: "loupe", cat: "Outils", price: 61, rating: 3.8, reviewCount: 80 }),
];

describe("URL state", () => {
  it("reads the parameters /boutique already uses", () => {
    const params = new URLSearchParams("categorie=Gems&forme=heart&couleur=crystal&prix=under30&stock=in&matiere=Swarovski");
    expect(readFilters(params)).toEqual({
      category: "Gems",
      shape: "heart",
      color: "crystal",
      price: "under30",
      stock: "in",
      material: "Swarovski",
    });
    expect(readFilters(new URLSearchParams())).toEqual(NO_FILTERS);
  });

  it("drops defaults and the page number, and keeps the sort", () => {
    const next = writeFilters(new URLSearchParams("tri=priceAsc&page=3&forme=star"), { ...NO_FILTERS, color: "gold" });
    expect(next.get("tri")).toBe("priceAsc");
    expect(next.get("couleur")).toBe("gold");
    expect(next.has("forme")).toBe(false);
    expect(next.has("page")).toBe(false);
    expect(next.has("categorie")).toBe(false);
  });

  it("falls back to the default sort for an unknown value", () => {
    expect(readSort(new URLSearchParams("tri=bestSellers"))).toBe("bestSellers");
    expect(readSort(new URLSearchParams("tri=cheapest"))).toBe("new");
  });

  it("counts only the filters that narrow the list", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, category: "Kits", price: "over60" })).toBe(2);
  });
});

describe("bands", () => {
  it("puts 30 and 60 in the middle price band", () => {
    expect(matchesPriceBand(29.99, "under30")).toBe(true);
    expect(matchesPriceBand(30, "30to60")).toBe(true);
    expect(matchesPriceBand(60, "30to60")).toBe(true);
    expect(matchesPriceBand(60.01, "over60")).toBe(true);
    expect(matchesPriceBand(60, "over60")).toBe(false);
  });

  it("counts last pieces as in stock", () => {
    expect(matchesStockBand(undefined, "in")).toBe(true);
    expect(matchesStockBand("low", "in")).toBe(true);
    expect(matchesStockBand("out", "in")).toBe(false);
    expect(matchesStockBand("low", "low")).toBe(true);
    expect(matchesStockBand(undefined, "out")).toBe(false);
  });
});

describe("filterProducts", () => {
  it("combines every active filter", () => {
    const ids = filterProducts(catalogue, { ...NO_FILTERS, category: "Gems", stock: "in", price: "30to60" }).map((p) => p.id);
    expect(ids).toEqual(["star"]);
  });

  it("returns the whole catalogue with no filter", () => {
    expect(filterProducts(catalogue, NO_FILTERS)).toHaveLength(catalogue.length);
  });
});

describe("facetCount", () => {
  it("counts what picking a value would show, the other filters unchanged", () => {
    const filters = { ...NO_FILTERS, category: "Gems" };
    expect(facetCount(catalogue, filters, "price", "under30")).toBe(1);
    expect(facetCount(catalogue, filters, "price", "over60")).toBe(0);
    // Replaces the current value of the same key rather than stacking on it.
    expect(facetCount(catalogue, filters, "category", "Outils")).toBe(1);
  });
});

describe("materialsInCatalog", () => {
  it("lists each material once, alphabetically, without blanks", () => {
    expect(materialsInCatalog(catalogue, "fr")).toEqual(["Or 18k", "Swarovski"]);
  });
});

describe("sortProducts", () => {
  it("keeps catalogue order for newest", () => {
    expect(sortProducts(catalogue, "new", "fr").map((p) => p.id)).toEqual(["heart", "star", "kit", "loupe"]);
  });

  it("puts featured products first, then the most reviewed, for best sellers", () => {
    expect(sortProducts(catalogue, "bestSellers", "fr").map((p) => p.id)).toEqual(["kit", "loupe", "heart", "star"]);
  });

  it("sorts by price both ways and by name", () => {
    expect(sortProducts(catalogue, "priceAsc", "fr").map((p) => p.price)).toEqual([29, 30, 60, 61]);
    expect(sortProducts(catalogue, "priceDesc", "fr").map((p) => p.price)).toEqual([61, 60, 30, 29]);
    expect(sortProducts(catalogue, "name", "en").map((p) => p.id)).toEqual(["heart", "kit", "loupe", "star"]);
  });

  it("does not reorder the caller's array", () => {
    const before = catalogue.map((p) => p.id);
    sortProducts(catalogue, "priceDesc", "fr");
    expect(catalogue.map((p) => p.id)).toEqual(before);
  });
});
