import { describe, expect, it } from "vitest";
import { aggregateStock, localize, mapGemColor, mapProduct, mapTaxonomy, type ProductRow, type VariantRow } from "./mapping";
import { MULTICOLOR_SWATCH, colorSwatchFill, colorsInCatalog, type GemColorDef } from "../../data/products";

const url = (path: string) => `https://cdn.test/${path}`;

function variant(overrides: Partial<VariantRow>): VariantRow {
  return {
    id: "v1",
    name: "Cristal",
    price: null,
    compare_at_price: null,
    is_active: true,
    position: 0,
    product_variant_translations: [],
    inventory_items: [{ stock_status: "in_stock" }],
    ...overrides,
  };
}

function row(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "etoile-cristal",
    name: "Étoile Cristal",
    short_description: "Étoile cinq branches.",
    description: null,
    price: 32,
    compare_at_price: 38,
    currency: "EUR",
    is_featured: true,
    metadata: { material: "Cristal taillé", shape: "star", color: "crystal" },
    category: { slug: "gems", name: "Gems", category_translations: [] },
    product_translations: [
      {
        locale: "en",
        status: "published",
        name: "Crystal Star Tooth Gem",
        slug: "crystal-star-tooth-gem",
        short_description: "Five-point star.",
        description: null,
      },
    ],
    product_variants: [],
    product_media: [
      {
        id: "m2",
        storage_path: "products/etoile-cristal/02.jpg",
        media_type: "image",
        alt_text: "De profil",
        position: 2,
        is_primary: false,
        product_media_translations: [],
      },
      {
        id: "m1",
        storage_path: "products/etoile-cristal/01.jpg",
        media_type: "image",
        alt_text: "Sur une incisive",
        position: 0,
        is_primary: true,
        product_media_translations: [{ locale: "en", status: "published", alt_text: "On an incisor" }],
      },
    ],
    inventory_items: [{ stock_status: "low_stock" }],
    ...overrides,
  };
}

describe("localize", () => {
  it("uses published translations and falls back to the base column", () => {
    expect(localize("Bonjour", [{ locale: "en", status: "published", name: "Hello" }], (t) => t.name)).toEqual({
      fr: "Bonjour",
      en: "Hello",
    });
    expect(localize("Bonjour", [{ locale: "en", status: "draft", name: "Hello" }], (t) => t.name)).toEqual({
      fr: "Bonjour",
      en: "Bonjour",
    });
    expect(localize("Bonjour", [{ locale: "en", status: "published", name: "  " }], (t) => t.name).en).toBe("Bonjour");
  });
});

describe("aggregateStock", () => {
  it("is only out when every option is out", () => {
    expect(aggregateStock(["out_of_stock", "in_stock"])).toBeUndefined();
    expect(aggregateStock(["out_of_stock", "low_stock"])).toBe("low");
    expect(aggregateStock(["out_of_stock", "out_of_stock"])).toBe("out");
    expect(aggregateStock(["preorder"])).toBeUndefined();
    expect(aggregateStock([])).toBeUndefined();
  });
});

describe("mapProduct", () => {
  it("maps a product row to the storefront model", () => {
    const p = mapProduct(row(), { product_id: "x", average_rating: 4.5, review_count: 12 }, url);
    expect(p.id).toBe("etoile-cristal");
    expect(p.dbId).toBe("00000000-0000-0000-0000-000000000001");
    expect(p.aliases).toEqual(["crystal-star-tooth-gem"]);
    expect(p.slugs).toEqual({ en: "crystal-star-tooth-gem" });
    expect(p.name).toEqual({ fr: "Étoile Cristal", en: "Crystal Star Tooth Gem" });
    expect(p.description).toEqual({ fr: "Étoile cinq branches.", en: "Five-point star." });
    expect(p.price).toBe(32);
    expect(p.compareAtPrice).toBe(38);
    expect(p.cat).toBe("gems");
    expect(p.family).toBeNull();
    expect(p.shape).toBe("star");
    expect(p.color).toBe("crystal");
    expect(p.material).toBe("Cristal taillé");
    expect(p.stock).toBe("low");
    expect(p.rating).toBe(4.5);
    expect(p.reviewCount).toBe(12);
    expect(p.isFeatured).toBe(true);
  });

  it("puts the primary image first and resolves Storage URLs", () => {
    const p = mapProduct(row(), undefined, url);
    expect(p.image).toBe("https://cdn.test/products/etoile-cristal/01.jpg");
    expect(p.gallery?.map((g) => g.src)).toEqual([
      "https://cdn.test/products/etoile-cristal/01.jpg",
      "https://cdn.test/products/etoile-cristal/02.jpg",
    ]);
    expect(p.gallery?.[0].alt).toEqual({ fr: "Sur une incisive", en: "On an incisor" });
  });

  it("has no image and no rating when the catalogue has none", () => {
    const p = mapProduct(row({ product_media: [] }), undefined, url);
    expect(p.image).toBe("");
    expect(p.gallery).toBeUndefined();
    expect(p.reviewCount).toBe(0);
  });

  it("ignores unknown shapes and colours, and keeps any category slug", () => {
    const p = mapProduct(
      row({ metadata: { shape: "hexagon", color: 3 }, category: { slug: "nouveautes", name: "Nouveautés", category_translations: [] } }),
      undefined,
      url,
    );
    expect(p.shape).toBeUndefined();
    expect(p.color).toBeUndefined();
    // The taxonomy is data: the shop decides what a slug means, not the mapping.
    expect(p.cat).toBe("nouveautes");
    expect(p.subtitle).toEqual({ fr: "Nouveautés", en: "Nouveautés" });
  });

  it("reads the family, and no category as none", () => {
    expect(mapProduct(row({ family: { slug: "swarovski" } }), undefined, url).family).toBe("swarovski");
    const loose = mapProduct(row({ category: null, family: undefined }), undefined, url);
    expect(loose.cat).toBeNull();
    expect(loose.family).toBeNull();
  });
  it("maps active variants with inherited or overridden prices and derives stock from them", () => {
    const p = mapProduct(
      row({
        inventory_items: [],
        product_variants: [
          variant({ id: "b", name: "3 mm", price: 109, position: 1, inventory_items: [{ stock_status: "out_of_stock" }] }),
          variant({
            id: "a",
            name: "2 mm",
            position: 0,
            product_variant_translations: [{ locale: "en", status: "published", name: "2mm" }],
          }),
          variant({ id: "c", name: "Retiré", is_active: false }),
        ],
      }),
      undefined,
      url,
    );
    expect(p.variants?.map((v) => v.id)).toEqual(["a", "b"]);
    expect(p.variants?.[0]).toMatchObject({ price: 32, name: { fr: "2 mm", en: "2mm" }, stock: undefined });
    expect(p.variants?.[1]).toMatchObject({ price: 109, stock: "out" });
    expect(p.stock).toBeUndefined();
  });

  it("drops a compare-at price that is not above the price", () => {
    const p = mapProduct(row({ compare_at_price: 32 }), undefined, url);
    expect(p.compareAtPrice).toBeUndefined();
  });
});

describe("mapTaxonomy", () => {
  const family = (slug: string, position: number, isActive = true) => ({
    slug,
    name: slug,
    image_path: null,
    position,
    is_active: isActive,
    category_family_translations: [],
  });

  it("orders categories and families, drops hidden families and translates names", () => {
    const taxonomy = mapTaxonomy(
      [
        { slug: "kits", name: "Kits", position: 3, category_translations: [], category_families: [] },
        {
          slug: "materiel",
          name: "Matériel",
          position: 2,
          category_translations: [{ locale: "en", status: "published", name: "Equipment" }],
          category_families: [family("accessoires", 1), family("essentiels", 0), family("old", 2, false)],
        },
      ],
      url,
    );
    expect(taxonomy.map((c) => c.slug)).toEqual(["materiel", "kits"]);
    expect(taxonomy[0].name).toEqual({ fr: "Matériel", en: "Equipment" });
    expect(taxonomy[0].families.map((f) => f.slug)).toEqual(["essentiels", "accessoires"]);
  });

  it("reads a category without its families from an older database", () => {
    expect(mapTaxonomy([{ slug: "gems", name: "Toothgems", position: 1, category_translations: [] }], url)[0].families).toEqual([]);
  });
});

describe("mapProduct gem options", () => {
  it("exposes the pack and stone size of pack/SS variants", () => {
    const p = mapProduct(
      row({
        product_variants: [
          variant({ id: "a", name: "Pack de 20 · SS6", attributes: { pack: 20, ss: 6 } }),
          variant({ id: "b", name: "Cristal", attributes: { colour: "cristal" }, position: 1 }),
        ],
      }),
      undefined,
      url,
    );
    expect(p.variants?.[0]).toMatchObject({ pack: 20, ss: 6 });
    expect(p.variants?.[1]).not.toHaveProperty("pack");
  });
});

describe("gem colours", () => {
  it("localizes published names only and drops the shade of the multicolour entry", () => {
    const color = mapGemColor({
      slug: "multicolor",
      name: "Multicolore",
      hex: null,
      is_multicolor: true,
      gem_color_translations: [{ locale: "en", status: "published", name: "Multicolour" }],
    });
    expect(color).toEqual({ slug: "multicolor", name: { fr: "Multicolore", en: "Multicolour" }, hex: null, isMulticolor: true });
    const draft = mapGemColor({
      slug: "capri",
      name: "Bleu Capri",
      hex: "#1f6dab",
      is_multicolor: false,
      gem_color_translations: [{ locale: "en", status: "draft", name: "Capri blue" }],
    });
    expect(draft.name).toEqual({ fr: "Bleu Capri", en: "Bleu Capri" });
  });

  it("keeps any colour slug on the product; the filter decides what is shown", () => {
    const p = mapProduct(row({ metadata: { color: "rose-poudre" } }), undefined, url);
    expect(p.color).toBe("rose-poudre");
  });

  it("lists only colours with gems behind them, in the back-office order", () => {
    const colors: GemColorDef[] = [
      { slug: "multicolor", name: { fr: "Multicolore", en: "Multicolour" }, hex: null, isMulticolor: true },
      { slug: "capri", name: { fr: "Bleu Capri", en: "Capri blue" }, hex: "#1f6dab", isMulticolor: false },
      { slug: "gold", name: { fr: "Or", en: "Gold" }, hex: "#c8992f", isMulticolor: false },
    ];
    const products = [
      mapProduct(row({ metadata: { color: "capri" } }), undefined, url),
      mapProduct(row({ metadata: { color: "multicolor" } }), undefined, url),
      mapProduct(row({ metadata: { color: "multicolor" } }), undefined, url),
    ];
    expect(colorsInCatalog(products, colors).map((g) => [g.color.slug, g.count])).toEqual([
      ["multicolor", 2],
      ["capri", 1],
    ]);
  });

  it("paints a shade as a tint-to-shade gradient and the multicolour entry as a fixed iridescent fill", () => {
    expect(colorSwatchFill({ hex: "#1f6dab", isMulticolor: false })).toContain("#1f6dab");
    expect(colorSwatchFill({ hex: null, isMulticolor: true })).toBe(MULTICOLOR_SWATCH);
  });
});

describe("colour variants", () => {
  it("carries each variant's swatch and the first photo that shows it", () => {
    const media = row().product_media;
    const product = mapProduct(
      row({
        product_variants: [
          variant({ id: "v-pink", name: "Rose", attributes: { swatch: "#F3C9D6" }, position: 1 }),
          variant({ id: "v-blue", name: "Bleu", attributes: { swatch: "#c6d6e3", quantity: 1 }, position: 0 }),
          variant({ id: "v-none", name: "Sans photo", attributes: { swatch: "blue" }, position: 2 }),
        ],
        product_media: [
          { ...media[0], variant_id: "v-pink" },
          { ...media[1], variant_id: "v-blue" },
        ],
      }),
      undefined,
      url,
    );
    expect(product.variants?.map((v) => [v.id, v.swatch, v.image])).toEqual([
      ["v-blue", "#c6d6e3", url("products/etoile-cristal/01.jpg")],
      ["v-pink", "#f3c9d6", url("products/etoile-cristal/02.jpg")],
      ["v-none", undefined, undefined],
    ]);
    expect(product.variants?.[0]).not.toHaveProperty("pack");
  });
});
