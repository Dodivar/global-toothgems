import { describe, expect, it } from "vitest";
import type { AdminProduct } from "../data/adminCatalog";
import {
  amountFromDb,
  amountToDb,
  catalogErrorKind,
  gemColorToPayload,
  productToPayload,
  readGemOptions,
  rowToCategory,
  rowToGemColor,
  rowToProduct,
  slugify,
  type GemColorRow,
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
    // Only removed ones: an empty list the form edits, and no variant stock.
    expect(product).toMatchObject({ customVariants: [], variantCount: 0 });
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
      expect.objectContaining({ key: "50:6", sku: "GEM-P50-SS6", price: 45, stock: 0 }),
      expect.objectContaining({ key: "c", name: { fr: "Saphir", en: "Sapphire" }, stock: 5, reserved: 2 }),
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

  it("round-trips packs of any size set on the product", () => {
    const options = readGemOptions([
      { id: "a", attributes: { pack: 35 }, price: "12.50", is_active: true, position: 0, inventory_items: [inv(9)] },
      { id: "b", attributes: { pack: 250 }, price: "70.00", is_active: true, position: 1, inventory_items: [inv(2)] },
    ]);
    expect(options).toMatchObject({ enabled: true, packs: [35, 250], sizes: [] });
    const payload = productToPayload({ ...rowToProduct(row, url), gemOptions: options }) as { variants: unknown[] };
    expect(payload.variants).toEqual([
      { pack: 35, ss: null, price: "12.50", track_inventory: true, quantity_on_hand: 9, low_stock_threshold: 3 },
      { pack: 250, ss: null, price: "70.00", track_inventory: true, quantity_on_hand: 2, low_stock_threshold: 3 },
    ]);
  });

  it("sends an empty list to remove options, and nothing when never used", () => {
    const base = rowToProduct(row, url);
    const off = productToPayload({ ...base, gemOptions: { enabled: false, packs: [20], sizes: [], variants: [] } }) as Record<string, unknown>;
    expect(off.variants).toEqual([]);
    expect(productToPayload(base)).not.toHaveProperty("variants");
  });
});

describe("other variants (colours, boxes…)", () => {
  const inv = (quantity_on_hand: number, low_stock_threshold = 5) => ({
    track_inventory: true,
    quantity_on_hand,
    quantity_reserved: 0,
    low_stock_threshold,
    availability: "in_stock",
  });
  const mirror: ProductRow = {
    ...row,
    product_variants: [
      {
        id: "v-pink",
        name: "Rose",
        attributes: { swatch: "#F3C9D6", quantity: 1 },
        price: "14.50",
        is_active: true,
        position: 1,
        product_variant_translations: [{ locale: "en", name: "Pink" }],
        inventory_items: [inv(4, 2)],
      },
      { id: "v-old", name: "Cristal", attributes: { colour: "cristal" }, is_active: false, position: 0, inventory_items: [inv(99)] },
      { id: "v-blue", name: "Bleu", attributes: { swatch: "not-a-colour" }, is_active: true, position: 0, inventory_items: [inv(0)] },
    ],
    product_media: [
      { id: "m1", storage_path: "products/x/1.jpg", alt_text: null, position: 0, variant_id: "v-blue", product_media_translations: [] },
      { id: "m2", storage_path: "products/x/2.jpg", alt_text: null, position: 1, variant_id: "v-pink", product_media_translations: [] },
    ],
  };

  it("reads the active variants in order, with swatch, price, stock and photos", () => {
    const product = rowToProduct(mirror, url);
    expect(product.gemOptions).toBeUndefined();
    expect(product.customVariants).toEqual([
      expect.objectContaining({ id: "v-blue", name: { fr: "Bleu", en: "" }, swatch: undefined, price: undefined, stock: 0 }),
      expect.objectContaining({ id: "v-pink", name: { fr: "Rose", en: "Pink" }, swatch: "#f3c9d6", price: 14.5, stock: 4, lowStockThreshold: 2 }),
    ]);
    expect(product.media.map((image) => image.variantId)).toEqual(["v-blue", "v-pink"]);
    expect(product.variantStock?.map((v) => v.key)).toEqual(["v-blue", "v-pink"]);
    expect(product).toMatchObject({ variantCount: 2, stock: 4 });
  });

  it("sends the complete list with exact prices, and each photo's variant", () => {
    const product = rowToProduct(mirror, url);
    const payload = productToPayload({
      ...product,
      customVariants: [
        { ...product.customVariants![1], name: { fr: " Rose ", en: " Pink " }, price: 19.9 },
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: { fr: "Vert", en: "Green" },
          swatch: "#A8D5BA",
          trackInventory: true,
          stock: 3,
          lowStockThreshold: 1,
          availability: "in_stock",
        },
      ],
    }) as { custom_variants: unknown[]; media: { variant_id?: string | null }[] };
    expect(payload.custom_variants).toEqual([
      { id: "v-pink", name: "Rose", name_en: "Pink", swatch: "#f3c9d6", price: "19.90", track_inventory: true, quantity_on_hand: 4, low_stock_threshold: 2 },
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Vert",
        name_en: "Green",
        swatch: "#a8d5ba",
        price: null,
        track_inventory: true,
        quantity_on_hand: 3,
        low_stock_threshold: 1,
      },
    ]);
    // "Bleu" left the list: its photo no longer points at it.
    expect(payload.media.map((m) => m.variant_id)).toEqual([null, "v-pink"]);
  });

  it("leaves variants and photo links alone when the list is not edited", () => {
    const payload = productToPayload(rowToProduct(row, url)) as { media: Record<string, unknown>[] };
    expect(payload).not.toHaveProperty("custom_variants");
    expect(payload.media[0]).not.toHaveProperty("variant_id");
  });
});

describe("gem colours", () => {
  const colorRow: GemColorRow = {
    id: "c1",
    slug: "rose-poudre",
    name: "Rose poudré",
    hex: "#e8b4c0",
    is_multicolor: false,
    is_active: true,
    position: 3,
    gem_color_translations: [{ locale: "en", name: "Powder pink" }],
  };

  it("reads both names, and never a shade for the multicolour entry", () => {
    expect(rowToGemColor(colorRow)).toEqual({
      id: "c1",
      slug: "rose-poudre",
      name: { fr: "Rose poudré", en: "Powder pink" },
      hex: "#e8b4c0",
      isMulticolor: false,
      isActive: true,
      position: 3,
    });
    const multi = rowToGemColor({ ...colorRow, hex: "#000000", is_multicolor: true, gem_color_translations: null });
    expect(multi).toMatchObject({ hex: null, isMulticolor: true, name: { en: "" } });
  });

  it("sends trimmed names, a lowercase shade and a URL-safe slug wish", () => {
    const payload = gemColorToPayload({
      name: { fr: "  Rose poudré ", en: " Powder pink " },
      hex: "#E8B4C0",
      isActive: false,
    }) as Record<string, unknown>;
    expect(payload).toEqual({
      id: null,
      slug: "rose-poudre",
      name: "Rose poudré",
      name_en: "Powder pink",
      hex: "#e8b4c0",
      is_active: false,
    });
  });
});
