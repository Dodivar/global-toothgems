import { describe, expect, it } from "vitest";
import { ADMIN_PRODUCTS, type AdminProduct } from "../data/adminCatalog";
import { DEFAULT_FILTERS, filterProducts, gemFacets, isFiltered, type ProductFilterState } from "./productFilters";

const base = ADMIN_PRODUCTS[0];

const product = (id: string, extra: Partial<AdminProduct>): AdminProduct => ({
  ...base,
  id,
  sku: id.toUpperCase(),
  name: { fr: id, en: id },
  categoryId: "gems",
  status: "active",
  shape: undefined,
  color: undefined,
  ...extra,
});

const catalogue = [
  product("star-aqua", { shape: "star", color: "aquamarine" }),
  product("star-crystal", { shape: "star", color: "crystal" }),
  product("heart-aqua", { shape: "heart", color: "aquamarine", status: "draft" }),
  product("legacy", { shape: "round", color: "retired-shade" }),
  product("mirror", { categoryId: "tools" }),
];

const filters = (extra: Partial<ProductFilterState>): ProductFilterState => ({ ...DEFAULT_FILTERS, ...extra });
const ids = (list: AdminProduct[]) => list.map((p) => p.id).sort();

describe("shape and colour filters", () => {
  it("keeps only the products of the picked cut", () => {
    expect(ids(filterProducts(catalogue, filters({ shape: "star" }), "fr"))).toEqual(["star-aqua", "star-crystal"]);
  });

  it("keeps only the products of the picked colour", () => {
    expect(ids(filterProducts(catalogue, filters({ color: "aquamarine" }), "fr"))).toEqual(["heart-aqua", "star-aqua"]);
  });

  it("combines with the other filters", () => {
    expect(ids(filterProducts(catalogue, filters({ color: "aquamarine", status: "active" }), "fr"))).toEqual([
      "star-aqua",
    ]);
  });

  it("counts as filtering, so Clear shows up", () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered(filters({ shape: "heart" }))).toBe(true);
    expect(isFiltered(filters({ color: "crystal" }))).toBe(true);
  });
});

describe("gemFacets", () => {
  const order = ["crystal", "aquamarine", "sapphire"];

  it("lists only the values some product carries, shapes in catalogue order and colours in back-office order", () => {
    const { shapes, colors } = gemFacets(catalogue, DEFAULT_FILTERS, order);
    expect(shapes.map((f) => f.value)).toEqual(["round", "heart", "star"]);
    // Unused "sapphire" is left out; a slug missing from the list goes last.
    expect(colors.map((f) => f.value)).toEqual(["crystal", "aquamarine", "retired-shade"]);
  });

  it("counts each value under the other filters, ignoring its own", () => {
    const { shapes, colors } = gemFacets(catalogue, filters({ shape: "star", status: "active" }), order);
    // The shape facet ignores the picked shape, so the other cuts still show what they would give.
    expect(Object.fromEntries(shapes.map((f) => [f.value, f.count]))).toEqual({ round: 1, heart: 0, star: 2 });
    // The colour facet does apply the picked shape.
    expect(Object.fromEntries(colors.map((f) => [f.value, f.count]))).toEqual({
      crystal: 1,
      aquamarine: 1,
      "retired-shade": 0,
    });
  });

  it("keeps the list steady when another filter empties it", () => {
    const { shapes } = gemFacets(catalogue, filters({ category: "tools" }), order);
    expect(shapes.map((f) => f.value)).toEqual(["round", "heart", "star"]);
    expect(shapes.every((f) => f.count === 0)).toBe(true);
  });
});
