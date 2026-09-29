import { describe, expect, it } from "vitest";
import type { Product } from "../data/products";
import { FALLBACK_TAXONOMY } from "../data/taxonomy";
import {
  NO_FILTERS,
  activeFilterCount,
  facetCount,
  filterProducts,
  materialsInCatalog,
  matchesPriceBand,
  matchesStockBand,
  normalizeTaxonomy,
  readFilters,
  readSort,
  sortProducts,
  taxonomyNodeCount,
  withFilter,
  withTaxonomyNode,
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
    cat: "gems",
    family: null,
    material: "",
    ...overrides,
  };
}

const catalogue: Product[] = [
  product({ id: "heart", family: "swarovski", price: 29, shape: "heart", color: "crystal", material: "Swarovski", rating: 4.2, reviewCount: 10 }),
  product({ id: "star", family: "bijoux-or-18ct", price: 30, shape: "star", color: "gold", material: "Or 18k", stock: "low", rating: 4.9, reviewCount: 3 }),
  product({ id: "kit", cat: "kits", family: "kit-professionnel", price: 60, stock: "out", rating: 4.5, reviewCount: 40, isFeatured: true }),
  product({ id: "loupe", cat: "materiel", price: 61, rating: 3.8, reviewCount: 80 }),
];

describe("URL state", () => {
  it("reads the parameters /boutique already uses", () => {
    const params = new URLSearchParams("categorie=gems&famille=swarovski&forme=heart&couleur=crystal&prix=under30&stock=in&matiere=Swarovski");
    expect(readFilters(params)).toEqual({
      category: "gems",
      family: "swarovski",
      shape: "heart",
      color: "crystal",
      price: "under30",
      stock: "in",
      material: "Swarovski",
    });
    expect(readFilters(new URLSearchParams())).toEqual(NO_FILTERS);
  });

  it("ignores a shape or colour paired with a type that has none", () => {
    expect(readFilters(new URLSearchParams("categorie=materiel&forme=heart&couleur=gold"))).toEqual({
      ...NO_FILTERS,
      category: "materiel",
    });
  });

  it("drops defaults and the page number, and keeps the sort", () => {
    const next = writeFilters(new URLSearchParams("tri=priceAsc&page=3&forme=star"), { ...NO_FILTERS, color: "gold" });
    expect(next.get("tri")).toBe("priceAsc");
    expect(next.get("couleur")).toBe("gold");
    expect(next.has("forme")).toBe(false);
    expect(next.has("page")).toBe(false);
    expect(next.has("categorie")).toBe(false);
    expect(next.has("famille")).toBe(false);
  });

  it("writes a family with its category", () => {
    const next = writeFilters(new URLSearchParams(), withTaxonomyNode(NO_FILTERS, "gems", "swarovski"));
    expect(next.toString()).toBe("categorie=gems&famille=swarovski");
  });

  it("falls back to the default sort for an unknown value", () => {
    expect(readSort(new URLSearchParams("tri=bestSellers"))).toBe("bestSellers");
    expect(readSort(new URLSearchParams("tri=cheapest"))).toBe("new");
  });

  it("counts only the filters that narrow the list", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, category: "kits", price: "over60" })).toBe(2);
    // A family and its category are one choice of the product-type filter.
    expect(activeFilterCount(withTaxonomyNode(NO_FILTERS, "gems", "swarovski"))).toBe(1);
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
    const ids = filterProducts(catalogue, { ...NO_FILTERS, category: "gems", stock: "in", price: "30to60" }).map((p) => p.id);
    expect(ids).toEqual(["star"]);
  });

  it("narrows a category to one of its families", () => {
    expect(filterProducts(catalogue, withTaxonomyNode(NO_FILTERS, "gems", "swarovski")).map((p) => p.id)).toEqual(["heart"]);
    expect(filterProducts(catalogue, withTaxonomyNode(NO_FILTERS, "gems")).map((p) => p.id)).toEqual(["heart", "star"]);
  });

  it("returns the whole catalogue with no filter", () => {
    expect(filterProducts(catalogue, NO_FILTERS)).toHaveLength(catalogue.length);
  });
});

describe("facetCount", () => {
  it("counts what picking a value would show, the other filters unchanged", () => {
    const filters = { ...NO_FILTERS, category: "gems" };
    expect(facetCount(catalogue, filters, "price", "under30")).toBe(1);
    expect(facetCount(catalogue, filters, "price", "over60")).toBe(0);
    // Replaces the current value of the same key rather than stacking on it.
    expect(facetCount(catalogue, filters, "category", "materiel")).toBe(1);
  });

  it("counts a node of the product-type tree", () => {
    const filters = withTaxonomyNode(NO_FILTERS, "gems", "swarovski");
    expect(taxonomyNodeCount(catalogue, filters, "gems")).toBe(2);
    expect(taxonomyNodeCount(catalogue, filters, "gems", "bijoux-or-18ct")).toBe(1);
    expect(taxonomyNodeCount(catalogue, filters, "kits", "kit-diy")).toBe(0);
  });

  it("counts a product type as it would really apply, shape and colour cleared", () => {
    expect(facetCount(catalogue, { ...NO_FILTERS, shape: "heart" }, "category", "materiel")).toBe(1);
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

describe("withFilter", () => {
  const gems = { ...NO_FILTERS, category: "gems", shape: "heart", color: "crystal" };

  it("clears shape and colour when the product type cannot have them", () => {
    expect(withFilter(gems, "category", "materiel")).toEqual({ ...NO_FILTERS, category: "materiel" });
  });

  it("keeps them for all products and for gems", () => {
    expect(withFilter(gems, "category", "Tout")).toEqual({ ...gems, category: "Tout" });
    expect(withFilter({ ...gems, category: "Tout" }, "category", "gems")).toEqual(gems);
    expect(withTaxonomyNode(gems, "gems", "opales")).toEqual({ ...gems, family: "opales" });
  });

  it("clears the family when the category changes", () => {
    const swarovski = withTaxonomyNode(NO_FILTERS, "gems", "swarovski");
    expect(withFilter(swarovski, "category", "kits")).toEqual({ ...NO_FILTERS, category: "kits" });
    expect(withFilter(swarovski, "category", "Tout")).toEqual(NO_FILTERS);
  });

  it("changes only the given key otherwise", () => {
    expect(withFilter(gems, "price", "under30")).toEqual({ ...gems, price: "under30" });
  });
});

describe("normalizeTaxonomy", () => {
  const read = (query: string) => normalizeTaxonomy(readFilters(new URLSearchParams(query)), FALLBACK_TAXONOMY);

  it("maps the former category names of shared links", () => {
    expect(read("categorie=Gems&forme=heart")).toEqual({ ...NO_FILTERS, category: "gems", shape: "heart" });
    expect(read("categorie=Outils")).toEqual({ ...NO_FILTERS, category: "materiel" });
    expect(read("categorie=Suivi")).toEqual({ ...NO_FILTERS, category: "materiel" });
    expect(read("categorie=Kits")).toEqual({ ...NO_FILTERS, category: "kits" });
  });

  it("brings the category of a family given alone, or paired with another category", () => {
    expect(read("famille=essentiels")).toEqual({ ...NO_FILTERS, category: "materiel", family: "essentiels" });
    expect(read("categorie=kits&famille=swarovski")).toEqual({ ...NO_FILTERS, category: "gems", family: "swarovski" });
  });

  it("drops a family or a category the shop does not have", () => {
    expect(read("categorie=gems&famille=nope")).toEqual({ ...NO_FILTERS, category: "gems" });
    expect(read("categorie=nope")).toEqual(NO_FILTERS);
  });

  it("clears the gem filters of a former category that has none", () => {
    expect(read("categorie=Outils&forme=heart")).toEqual({ ...NO_FILTERS, category: "materiel" });
  });

  it("only maps former names until the taxonomy has loaded", () => {
    expect(normalizeTaxonomy(readFilters(new URLSearchParams("categorie=Outils&famille=essentiels")), [])).toEqual({
      ...NO_FILTERS,
      category: "materiel",
      family: "essentiels",
    });
  });

  it("returns the same object when nothing changes", () => {
    const filters = withTaxonomyNode(NO_FILTERS, "gems", "swarovski");
    expect(normalizeTaxonomy(filters, FALLBACK_TAXONOMY)).toBe(filters);
  });
});
