import { describe, expect, it } from "vitest";
import { ADMIN_PRODUCTS, withVariantStock, type AdminProduct } from "../data/adminCatalog";
import { applyStockDelta, stockChange } from "./stockAdjustment";

describe("stockChange", () => {
  it("adds the units received", () => {
    expect(stockChange("add", 3, 0, "20")).toEqual({ delta: 20, next: 23 });
  });

  it("turns an exact count into a relative change, up or down", () => {
    expect(stockChange("set", 12, 0, "37")).toEqual({ delta: 25, next: 37 });
    expect(stockChange("set", 12, 2, "4")).toEqual({ delta: -8, next: 4 });
  });

  it("refuses what cannot be saved", () => {
    expect(stockChange("add", 3, 0, " ").error).toBe("empty");
    expect(stockChange("add", 3, 0, "-2").error).toBe("invalid");
    expect(stockChange("add", 3, 0, "1.5").error).toBe("invalid");
    expect(stockChange("add", 3, 0, "0").error).toBe("unchanged");
    expect(stockChange("set", 3, 0, "3").error).toBe("unchanged");
    expect(stockChange("set", 10, 4, "3").error).toBe("belowReserved");
    expect(stockChange("add", 0, 0, "2000000").error).toBe("tooLarge");
  });
});

describe("applyStockDelta", () => {
  const simple: AdminProduct = { ...ADMIN_PRODUCTS.find((p) => !p.gemOptions && !p.customVariants)!, stock: 2 };

  it("changes the product's own count", () => {
    expect(applyStockDelta(simple, null, 5).stock).toBe(7);
  });

  it("changes one pack/SS option, found by its key, and the total follows", () => {
    const gem = ADMIN_PRODUCTS.find((p) => p.gemOptions)!;
    const key = gem.variantStock![0].key;
    const before = gem.variantStock![0].stock;
    const after = withVariantStock(applyStockDelta(gem, key, 10));
    expect(after.variantStock!.find((v) => v.key === key)!.stock).toBe(before + 10);
    expect(after.stock).toBe(gem.stock + 10);
  });

  it("changes one other variant, found by its id", () => {
    const product: AdminProduct = withVariantStock({
      ...simple,
      customVariants: [
        { id: "red", name: { fr: "Rouge", en: "Red" }, trackInventory: true, stock: 1, lowStockThreshold: 2, availability: "in_stock" },
        { id: "blue", name: { fr: "Bleu", en: "Blue" }, trackInventory: true, stock: 4, lowStockThreshold: 2, availability: "in_stock" },
      ],
    });
    const after = withVariantStock(applyStockDelta(product, "red", 9));
    expect(after.variantStock!.map((v) => v.stock)).toEqual([10, 4]);
  });
});
