import { describe, expect, it } from "vitest";
import type { AdminProduct, VariantStock } from "../data/adminCatalog";
import {
  BUNDLE_QUANTITY_MAX,
  bundleCapacity,
  bundleError,
  bundlePayload,
  componentKey,
  isBundle,
  kitsContaining,
  rowsToBundles,
  sameBundle,
} from "./productBundles";

const product = (id: string, patch: Partial<AdminProduct> = {}): AdminProduct => ({
  id,
  sku: id.toUpperCase(),
  name: { fr: id, en: id },
  shortDescription: { fr: "", en: "" },
  description: { fr: "", en: "" },
  categoryId: "lip-gloss",
  type: "single",
  price: 8.9,
  media: [],
  trackInventory: true,
  stock: 0,
  lowStockThreshold: 5,
  availability: "in_stock",
  status: "active",
  material: { fr: "", en: "" },
  tags: [],
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
  ...patch,
});

const variant = (variantId: string, stock: number, reserved = 0): VariantStock => ({
  key: variantId,
  variantId,
  name: { fr: variantId, en: variantId },
  trackInventory: true,
  stock,
  reserved,
  lowStockThreshold: 2,
  availability: "in_stock",
});

describe("product bundles", () => {
  it("groups composition rows by kit, in their saved order", () => {
    const bundles = rowsToBundles([
      { bundle_product_id: "trio", component_product_id: "cleo", component_variant_id: null, quantity: 1, position: 1 },
      { bundle_product_id: "trio", component_product_id: "aurora", component_variant_id: null, quantity: 1, position: 0 },
      { bundle_product_id: "kit", component_product_id: "gems", component_variant_id: "red", quantity: 20, position: 0 },
    ]);
    expect(bundles.get("trio")).toEqual([
      { productId: "aurora", quantity: 1 },
      { productId: "cleo", quantity: 1 },
    ]);
    expect(bundles.get("kit")).toEqual([{ productId: "gems", variantId: "red", quantity: 20 }]);
  });

  it("makes as many kits as the scarcest component allows, reservations deducted", () => {
    const products = [
      product("aurora", { stock: 33 }),
      product("cleo", { stock: 33, reserved: 5 }),
      product("bad-habit", { stock: 33 }),
    ];
    const capacity = bundleCapacity(
      [
        { productId: "aurora", quantity: 1 },
        { productId: "cleo", quantity: 1 },
        { productId: "bad-habit", quantity: 1 },
      ],
      products,
    );
    expect(capacity.buildable).toBe(28);
    expect(capacity.limiting.map((row) => row.product?.id)).toEqual(["cleo"]);
    expect(capacity.components.map((row) => row.makes)).toEqual([33, 28, 33]);
  });

  it("divides by the units per kit and reads an option's own stock", () => {
    const gems = product("gems", { variantCount: 2, variantStock: [variant("red", 45), variant("blue", 100, 90)] });
    const capacity = bundleCapacity(
      [
        { productId: "gems", variantId: "red", quantity: 20 },
        { productId: "gems", variantId: "blue", quantity: 3 },
      ],
      [gems],
    );
    // red: 45 / 20 = 2; blue: (100 − 90) / 3 = 3.
    expect(capacity.buildable).toBe(2);
    expect(capacity.limiting).toHaveLength(1);
  });

  it("ignores untracked components unless they are out of stock; an unknown one makes none", () => {
    const tracked = product("aurora", { stock: 4 });
    const free = product("box", { trackInventory: false, availability: "in_stock" });
    const gone = product("lamp", { trackInventory: false, availability: "out_of_stock" });
    expect(bundleCapacity([{ productId: "box", quantity: 1 }], [free]).buildable).toBeUndefined();
    expect(bundleCapacity([{ productId: "aurora", quantity: 1 }, { productId: "box", quantity: 1 }], [tracked, free]).buildable).toBe(4);
    expect(bundleCapacity([{ productId: "aurora", quantity: 1 }, { productId: "lamp", quantity: 1 }], [tracked, gone]).buildable).toBe(0);
    expect(bundleCapacity([{ productId: "missing", quantity: 1 }], [tracked]).buildable).toBe(0);
    // A product sold per option, named without one, makes none.
    const gems = product("gems", { variantCount: 1, variantStock: [variant("red", 45)] });
    expect(bundleCapacity([{ productId: "gems", quantity: 1 }], [gems]).buildable).toBe(0);
  });

  it("compares compositions, builds the payload and finds the kits holding a product", () => {
    const a = [{ productId: "aurora", quantity: 1 }, { productId: "gems", variantId: "red", quantity: 2 }];
    expect(sameBundle(a, [...a])).toBe(true);
    expect(sameBundle(a, [a[1], a[0]])).toBe(false);
    expect(sameBundle(a, [a[0], { ...a[1], quantity: 3 }])).toBe(false);
    expect(sameBundle(undefined, [])).toBe(true);
    expect(bundlePayload(a)).toEqual([
      { product_id: "aurora", variant_id: null, quantity: 1 },
      { product_id: "gems", variant_id: "red", quantity: 2 },
    ]);
    expect(bundlePayload(undefined)).toEqual([]);
    expect(componentKey(a[1])).toBe("gems/red");
    const trio = product("trio", { bundle: [{ productId: "aurora", quantity: 1 }] });
    expect(isBundle(trio)).toBe(true);
    expect(isBundle(product("aurora"))).toBe(false);
    expect(isBundle(product("draft-kit", { bundle: [] }))).toBe(false);
    expect(kitsContaining("aurora", [trio, product("aurora")]).map((p) => p.id)).toEqual(["trio"]);
  });

  it("refuses an empty kit and quantities outside 1 to 1000 in the form", () => {
    const t = (key: string) => key;
    expect(bundleError(undefined, t)).toBeUndefined();
    expect(bundleError([], t)).toBe("admin.form.errors.bundleEmpty");
    expect(bundleError([{ productId: "a", quantity: 0 }], t)).toBe("admin.form.errors.bundleQuantity");
    expect(bundleError([{ productId: "a", quantity: 1.5 }], t)).toBe("admin.form.errors.bundleQuantity");
    expect(bundleError([{ productId: "a", quantity: BUNDLE_QUANTITY_MAX + 1 }], t)).toBe("admin.form.errors.bundleQuantity");
    expect(bundleError([{ productId: "a", quantity: 3 }], t)).toBeUndefined();
  });
});
