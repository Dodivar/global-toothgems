import { describe, expect, it } from "vitest";
import {
  ADMIN_PRODUCTS,
  gemVariantStock,
  inventoryState,
  matchesStockState,
  needsRestock,
  stockState,
  variantAlerts,
  withGemStock,
  type AdminProduct,
  type VariantStock,
} from "../data/adminCatalog";
import { computeStats } from "./adminCatalogContext";
import { DEFAULT_FILTERS, filterProducts } from "./productFilters";
import { productEditPath } from "./adminProductLinks";

const base = ADMIN_PRODUCTS.find((p) => !p.gemOptions)!;

const option = (key: string, stock: number, lowStockThreshold = 5, extra: Partial<VariantStock> = {}): VariantStock => ({
  key,
  gemOption: true,
  name: { fr: key, en: key },
  trackInventory: true,
  stock,
  lowStockThreshold,
  availability: "in_stock",
  ...extra,
});

const withOptions = (...variantStock: VariantStock[]): AdminProduct => ({
  ...base,
  id: "gem",
  status: "active",
  trackInventory: true,
  variantCount: variantStock.length,
  variantStock,
  stock: variantStock.reduce((sum, v) => sum + v.stock, 0),
  lowStockThreshold: variantStock.reduce((sum, v) => sum + v.lowStockThreshold, 0),
});

describe("stock state with variants", () => {
  it("does not let a large total hide a sold-out option", () => {
    const product = withOptions(option("20:6", 200), option("50:6", 0), option("50:7", 200));
    expect(stockState(product)).toBe("low_stock");
    expect(matchesStockState(product, "out_of_stock")).toBe(true);
    expect(matchesStockState(product, "low_stock")).toBe(true);
    expect(matchesStockState(product, "in_stock")).toBe(false);
    expect(needsRestock(product)).toBe(true);
  });

  it("is out of stock only when every option is", () => {
    expect(stockState(withOptions(option("20:6", 0), option("50:6", 0)))).toBe("out_of_stock");
  });

  it("is in stock when every option is above its own threshold", () => {
    const product = withOptions(option("20:6", 6), option("50:6", 40, 30));
    expect(stockState(product)).toBe("in_stock");
    expect(needsRestock(product)).toBe(false);
    expect(variantAlerts(product)).toEqual([]);
  });

  it("lists alerts sold out first", () => {
    const product = withOptions(option("20:6", 2), option("50:6", 90), option("100:6", 0));
    expect(variantAlerts(product).map((a) => [a.key, a.state])).toEqual([
      ["100:6", "out_of_stock"],
      ["20:6", "low_stock"],
    ]);
  });

  it("does not sell units held by unpaid orders, like the database", () => {
    expect(inventoryState(option("x", 3, 1, { reserved: 3 }))).toBe("out_of_stock");
    expect(inventoryState(option("x", 10, 5, { reserved: 6 }))).toBe("low_stock");
    expect(inventoryState({ ...base, trackInventory: true, stock: 4, reserved: 4, lowStockThreshold: 1 })).toBe("out_of_stock");
  });

  it("reads untracked options from their manual availability", () => {
    expect(inventoryState(option("x", 0, 5, { trackInventory: false, availability: "preorder" }))).toBe("preorder");
    expect(stockState(withOptions(option("x", 0, 5, { trackInventory: false })))).toBe("in_stock");
  });
});

describe("one rule for the filter and the dashboard counts", () => {
  it("counts exactly what the availability filter lists", () => {
    const products = [
      withOptions(option("20:6", 50), option("50:6", 0)),
      { ...withOptions(option("20:6", 3)), id: "low" },
      { ...base, id: "plain-out", trackInventory: true, stock: 0 },
    ];
    const stats = computeStats(products);
    const out = filterProducts(products, { ...DEFAULT_FILTERS, availability: "out_of_stock" }, "fr");
    const low = filterProducts(products, { ...DEFAULT_FILTERS, availability: "low_stock" }, "fr");
    expect(out.map((p) => p.id).sort()).toEqual(["gem", "plain-out"]);
    expect(stats.outOfStock).toBe(out.length);
    expect(low.map((p) => p.id).sort()).toEqual(["gem", "low"]);
    expect(stats.lowStock).toBe(low.length);
  });

  it("sorts a product with options by its emptiest option", () => {
    const gem = withOptions(option("20:6", 500), option("50:6", 1));
    const plain = { ...base, id: "plain", trackInventory: true, stock: 20 };
    const sorted = filterProducts([plain, gem], { ...DEFAULT_FILTERS, sort: "stock-asc" }, "fr");
    expect(sorted.map((p) => p.id)).toEqual(["gem", "plain"]);
  });
});

describe("prototype catalogue", () => {
  it("derives each offered option's stock from the gem options", () => {
    const product = withGemStock({
      ...base,
      gemOptions: {
        enabled: true,
        packs: [20],
        sizes: [6],
        variants: [
          { pack: 20, ss: 6, trackInventory: true, stock: 4, lowStockThreshold: 5 },
          // Remembered but no longer ticked: not sold, not listed.
          { pack: 50, ss: 6, trackInventory: true, stock: 0, lowStockThreshold: 5 },
        ],
      },
    });
    expect(product.variantStock).toEqual([expect.objectContaining({ key: "20:6", stock: 4 })]);
    expect(stockState(product)).toBe("low_stock");
    expect(gemVariantStock({ enabled: false, packs: [20], sizes: [], variants: [] })).toEqual([]);
  });

  it("shows a fixture with an option to restock", () => {
    expect(ADMIN_PRODUCTS.some((p) => variantAlerts(p).length > 0)).toBe(true);
  });
});

describe("edit links", () => {
  it("opens the form on a pack/SS option, and on the product for anything else", () => {
    expect(productEditPath("p1")).toBe("/admin/produits/p1");
    expect(productEditPath("p1", option("50:-", 0))).toBe("/admin/produits/p1?option=50%3A-");
    expect(productEditPath("p1", option("uuid", 0, 5, { gemOption: false }))).toBe("/admin/produits/p1");
  });
});
