import { describe, expect, it } from "vitest";
import type { AdminProduct } from "../data/adminCatalog";
import {
  amountFromDb,
  amountToDb,
  catalogErrorKind,
  productToPayload,
  readGemOptions,
  rowToCategory,
  rowToProduct,
  slugify,
  type ProductRow,
} from "./adminCatalogMapping";

const url = (path: string) => `https://cdn.test/${path}`;

const row: ProductRow = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "GEM-STAR-001",
  slug: "etoile-cristal",
  name: "Étoile Cristal",
  short_description: "Courte",
  description: null,
  category_id: "22222222-2222-4222-8222-222222222222",
  price: 32,
  compare_at_price: "38.00",
  currency: "EUR",
  status: "active",
  metadata: { material: "Cristal taillé", tags: ["best-seller", 3], type: "set" },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  product_translations: [{ locale: "en", name: "Crystal Star", short_description: "Short", description: "Long" }],
  product_media: [
    { id: "m2", storage_path: "products/x/2.jpg", alt_text: "Deux", position: 1, product_media_translations: [] },
    { id: "m1", storage_path: "products/x/1.jpg", alt_text: null, position: 0, product_media_translations: [{ locale: "en", alt_text: "One" }] },
  ],
  inventory_items: [{ track_inventory: true, quantity_on_hand: 12, quantity_reserved: 2, low_stock_threshold: 4, availability: "in_stock" }],
};

describe("money", () => {
  it("sends exact decimal strings", () => {
    expect(amountToDb(19.99)).toBe("19.99");
    expect(amountToDb(0.1 + 0.2)).toBe("0.30");
    expect(amountToDb(32)).toBe("32.00");
    expect(amountToDb(1234567.5)).toBe("1234567.50");
  });

  it("rejects negative amounts", () => {
    expect(() => amountToDb(-1)).toThrow();
  });

  it("reads numbers and strings through cents", () => {
    expect(amountFromDb("249.00")).toBe(249);
    expect(amountFromDb(19.99)).toBe(19.99);
  });
});

describe("rowToProduct", () => {
  const product = rowToProduct(row, url);

  it("keeps French in the base columns and English from the translation", () => {
    expect(product.name).toEqual({ fr: "Étoile Cristal", en: "Crystal Star" });
    expect(product.description).toEqual({ fr: "", en: "Long" });
  });

  it("orders media by position and resolves public URLs", () => {
    expect(product.media.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(product.media[0]).toMatchObject({ src: "https://cdn.test/products/x/1.jpg", alt: { fr: "", en: "One" } });
  });

  it("reads stock, prices and presentation metadata", () => {
    expect(product).toMatchObject({ stock: 12, lowStockThreshold: 4, price: 32, compareAtPrice: 38, type: "set" });
    expect(product.material).toEqual({ fr: "Cristal taillé", en: "" });
    expect(product.tags).toEqual(["best-seller"]);
  });

  it("sums variant stock for a product with variants", () => {
    const stock = (quantity_on_hand: number) => [
      { track_inventory: true, quantity_on_hand, quantity_reserved: 0, low_stock_threshold: 5, availability: "in_stock" },
    ];
    const withVariants = rowToProduct(
      { ...row, inventory_items: [], product_variants: [{ id: "v1", inventory_items: stock(10) }, { id: "v2", inventory_items: stock(4) }] },
      url,
    );
    expect(withVariants).toMatchObject({ variantCount: 2, stock: 14, lowStockThreshold: 10, trackInventory: true });
  });

  it("reads a gem's shape and colour, ignoring unknown values", () => {
    expect(rowToProduct({ ...row, metadata: { shape: "heart", color: "opal" } }, url)).toMatchObject({ shape: "heart", color: "opal" });
    const unknown = rowToProduct({ ...row, metadata: { shape: "oval", color: 3 } }, url);
    expect(unknown.shape).toBeUndefined();
    expect(unknown.color).toBeUndefined();
  });

  it("falls back safely when relations are missing", () => {
    const bare = rowToProduct({ ...row, product_translations: null, product_media: null, inventory_items: null, metadata: {} }, url);
    expect(bare).toMatchObject({ trackInventory: true, stock: 0, type: "single", media: [], name: { en: "" } });
  });
});

describe("productToPayload", () => {
  const product: AdminProduct = {
    ...rowToProduct(row, url),
    name: { fr: " Cœur Chrome ", en: "Chrome Heart" },
    promoPrice: 10,
    media: [
      { id: "m1", storagePath: "products/x/1.jpg", src: "", alt: { fr: "", en: "" } },
      { id: "upload-abc", storagePath: "products/x/3.jpg", src: "", alt: { fr: "Trois", en: "" } },
      { id: "media-9", src: "/bundled.jpg", alt: { fr: "", en: "" } },
    ],
  };
  const payload = productToPayload({ ...product, media: [{ ...product.media[0], id: "11111111-1111-4111-8111-111111111112" }, ...product.media.slice(1)] }) as Record<string, unknown>;

  it("never sends a promotional price or a float", () => {
    expect(payload).not.toHaveProperty("promo_price");
    expect(payload.price).toBe("32.00");
    expect(payload.compare_at_price).toBe("38.00");
  });

  it("sends shape and colour, as null when unset so the merge clears them", () => {
    expect(payload.metadata).toMatchObject({ shape: null, color: null });
    const gem = productToPayload({ ...product, shape: "star", color: "crystal" }) as { metadata: Record<string, unknown> };
    expect(gem.metadata).toMatchObject({ shape: "star", color: "crystal" });
  });

  it("builds slugs from the names", () => {
    expect(payload.slug).toBe("coeur-chrome");
    expect((payload.translations as { en: { slug: string } }).en.slug).toBe("chrome-heart");
  });

  it("sends stored media in order, new uploads without an id, alt text defaulting to the name", () => {
    expect(payload.media).toEqual([
      { id: "11111111-1111-4111-8111-111111111112", storage_path: "products/x/1.jpg", alt_fr: "Cœur Chrome", alt_en: "Chrome Heart" },
      { id: null, storage_path: "products/x/3.jpg", alt_fr: "Trois", alt_en: "Chrome Heart" },
    ]);
  });
});

describe("helpers", () => {
  it("slugifies accented names", () => {
    expect(slugify("Kit d’Application Premium")).toBe("kit-d-application-premium");
    expect(slugify("  ***  ")).toBe("");
  });

  it("uses the French name when a category has no English translation", () => {
    expect(rowToCategory({ id: "c", slug: "gems", name: "Gems", description: null, position: 1, category_translations: [] }).name).toEqual({
      fr: "Gems",
      en: "Gems",
    });
  });

  it("classifies database errors", () => {
    expect(catalogErrorKind({ code: "23505" })).toBe("duplicate");
    expect(catalogErrorKind({ code: "23503" })).toBe("inUse");
    expect(catalogErrorKind({ code: "42501" })).toBe("permission");
    expect(catalogErrorKind({ message: "TypeError: Failed to fetch" })).toBe("network");
    expect(catalogErrorKind(undefined)).toBe("generic");
  });
});

describe("gem options", () => {
  const inv = (quantity_on_hand: number) => ({
    track_inventory: true, quantity_on_hand, quantity_reserved: 0, low_stock_threshold: 3, availability: "in_stock",
  });

  it("reads pack/SS variants, ticking only the axes of active ones", () => {
    const options = readGemOptions([
      { id: "a", attributes: { pack: 20, ss: 6 }, price: null, is_active: true, position: 0, inventory_items: [inv(10)] },
      { id: "b", attributes: { pack: 50, ss: 6 }, price: "45.00", is_active: true, position: 1, inventory_items: [inv(4)] },
      { id: "c", attributes: { pack: 100, ss: 6 }, price: "80.00", is_active: false, position: 2, inventory_items: [inv(0)] },
    ]);
    expect(options).toMatchObject({ enabled: true, packs: [20, 50], sizes: [6] });
    expect(options?.variants).toHaveLength(3);
    expect(options?.variants[1]).toMatchObject({ pack: 50, ss: 6, price: 45, stock: 4, lowStockThreshold: 3 });
    expect(options?.variants[0].price).toBeUndefined();
  });

  it("leaves other kinds of variants to the database", () => {
    expect(readGemOptions([{ id: "a", attributes: { colour: "saphir" }, inventory_items: null }])).toBeUndefined();
    expect(readGemOptions([])).toBeUndefined();
    const product = rowToProduct(
      { ...row, product_variants: [{ id: "a", attributes: { colour: "saphir" }, is_active: false, inventory_items: null }] },
      url,
    );
    expect(product).toMatchObject({ otherVariants: true, variantCount: 0 });
    expect(product.gemOptions).toBeUndefined();
  });

  it("sums active option stock and ignores removed ones", () => {
    const product = rowToProduct(
      {
        ...row,
        product_variants: [
          { id: "a", attributes: { pack: 20 }, is_active: true, inventory_items: [inv(10)] },
          { id: "b", attributes: { pack: 50 }, is_active: false, inventory_items: [inv(99)] },
        ],
      },
      url,
    );
    expect(product.variantCount).toBe(1);
    expect(product.stock).toBe(10);
  });

  it("lists the stock of each active variant, keyed like the options grid", () => {
    const product = rowToProduct(
      {
        ...row,
        product_variants: [
          { id: "a", sku: "GEM-P50-SS6", attributes: { pack: 50, ss: 6 }, price: "45.00", is_active: true, inventory_items: [inv(0)] },
          { id: "b", attributes: { pack: 20, ss: 6 }, is_active: false, inventory_items: [inv(0)] },
          {
            id: "c",
            name: "Saphir",
            attributes: { colour: "saphir" },
            is_active: true,
            product_variant_translations: [{ locale: "en", name: "Sapphire" }],
            inventory_items: [{ ...inv(5), quantity_reserved: 2 }],
          },
        ],
      },
      url,
    );
    expect(product.variantStock).toEqual([
      expect.objectContaining({ key: "50:6", gemOption: true, sku: "GEM-P50-SS6", price: 45, stock: 0 }),
      expect.objectContaining({ key: "c", gemOption: false, name: { fr: "Saphir", en: "Sapphire" }, stock: 5, reserved: 2 }),
    ]);
    expect(product.variantStock?.[0].name.fr).toBe("Pack de 50 · SS6");
  });

  it("has no variant stock without variants", () => {
    expect(rowToProduct(row, url).variantStock).toBeUndefined();
  });

  it("sends the ticked combinations only, with exact prices", () => {
    const base = rowToProduct(row, url);
    const payload = productToPayload({
      ...base,
      gemOptions: {
        enabled: true,
        packs: [20],
        sizes: [6, 8],
        variants: [
          { pack: 20, ss: 8, price: 19.9, trackInventory: true, stock: 5, lowStockThreshold: 2 },
          { pack: 50, ss: 6, price: 40, trackInventory: true, stock: 7, lowStockThreshold: 2 },
        ],
      },
    }) as { variants: unknown[] };
    expect(payload.variants).toEqual([
      { pack: 20, ss: 6, price: null, track_inventory: true, quantity_on_hand: 0, low_stock_threshold: 5 },
      { pack: 20, ss: 8, price: "19.90", track_inventory: true, quantity_on_hand: 5, low_stock_threshold: 2 },
    ]);
  });

  it("sends an empty list to remove options, and nothing when never used", () => {
    const base = rowToProduct(row, url);
    const off = productToPayload({ ...base, gemOptions: { enabled: false, packs: [20], sizes: [], variants: [] } }) as Record<string, unknown>;
    expect(off.variants).toEqual([]);
    expect(productToPayload(base)).not.toHaveProperty("variants");
  });
});
