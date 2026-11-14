import { describe, expect, it } from "vitest";
import type { Product } from "../../data/products";
import { feedExclusion, feedItems, renderProductFeed, xmlText, type FeedContext } from "./productFeed";
import { buildPriceBook, NO_PRICE_CUTS } from "./productOffers";

const base = new URL("https://www.example.com");

const gem: Product = {
  id: "coeur-chrome",
  dbId: "p-gem",
  slugs: { en: "chrome-heart" },
  productType: "physical",
  name: { fr: "Cœur Chrome", en: "Chrome Heart" },
  subtitle: { fr: "Chrome", en: "Chrome" },
  price: 29,
  currency: "EUR",
  rating: 0,
  reviewCount: 0,
  image: "https://cdn.example/coeur.jpg",
  gallery: [
    { src: "https://cdn.example/coeur.jpg", alt: { fr: "", en: "" } },
    { src: "/media/coeur-2.jpg", alt: { fr: "", en: "" } },
  ],
  cat: "gems",
  family: "swarovski",
  material: "",
  color: "crystal",
  description: { fr: "Un **cœur** & chromé.", en: "A **chrome** heart <3." },
  variants: [
    { id: "v-20", name: { fr: "SS5 · 20 pièces", en: "SS5 · 20 pieces" }, price: 19.9, availability: "in_stock", weightGrams: 4, image: "https://cdn.example/v20.jpg" },
    { id: "v-100", name: { fr: "SS5 · 100 pièces", en: "SS5 · 100 pieces" }, price: 59, availability: "out_of_stock", stock: "out" },
    { id: "v-pre", name: { fr: "SS7 · 20 pièces", en: "SS7 · 20 pieces" }, price: 24, availability: "preorder" },
  ],
};

const glue: Product = { ...gem, id: "colle", dbId: "p-glue", cat: "materiel", family: null, variants: undefined, color: undefined, availability: "in_stock" };
const kit: Product = { ...gem, slugs: undefined, id: "kit", dbId: "p-kit", cat: "kits", family: null, variants: undefined, color: undefined, availability: "low_stock", sku: "KIT-1", weightGrams: 250 };
const gemKit: Product = { ...kit, id: "kit-gems", dbId: "p-kit-gems" };
const pack: Product = { ...kit, id: "pack", dbId: "p-pack", inclusions: [{ kind: "studio", plan: "artist", months: 3 }] };
const digital: Product = { ...kit, id: "ebook", dbId: "p-ebook", productType: "digital" };

function context(overrides: Partial<FeedContext> = {}): FeedContext {
  return {
    locale: "en",
    base,
    prices: NO_PRICE_CUTS,
    taxonomy: [
      { slug: "gems", name: { fr: "Gems", en: "Gems" }, families: [{ slug: "swarovski", name: { fr: "Swarovski", en: "Swarovski" } }] },
      { slug: "kits", name: { fr: "Kits", en: "Kits" }, families: [] },
    ],
    colors: [{ slug: "crystal", name: { fr: "Cristal", en: "Crystal" }, hex: "#ffffff", isMulticolor: false }],
    bundles: new Map([
      ["p-kit", ["p-glue", "p-gem"]],
      ["p-kit-gems", ["p-gem"]],
    ]),
    ...overrides,
  };
}

describe("feedExclusion", () => {
  const byId = new Map([gem, glue, kit, gemKit, pack, digital].map((p) => [p.dbId as string, p]));
  it("leaves out application products, kits holding one, packs with access and non-physical products", () => {
    const ctx = context();
    expect(feedExclusion(gem, ctx, byId)).toBeNull();
    expect(feedExclusion(gemKit, ctx, byId)).toBeNull();
    expect(feedExclusion(glue, ctx, byId)).toBe("excluded_category");
    expect(feedExclusion(kit, ctx, byId)).toBe("kit_with_excluded_product");
    expect(feedExclusion(pack, ctx, byId)).toBe("pack_with_access");
    expect(feedExclusion(digital, ctx, byId)).toBe("not_physical");
    expect(feedExclusion({ ...gem, dbId: undefined }, ctx, byId)).toBe("not_physical");
  });
  it("leaves out a kit whose component the public cannot read", () => {
    expect(feedExclusion(gemKit, context({ bundles: new Map([["p-kit-gems", ["p-unknown"]]]) }), byId)).toBe("kit_with_excluded_product");
  });
});

describe("feedItems", () => {
  it("writes one item per variant, in the feed's language, without preorders", () => {
    const items = feedItems([gem, glue, kit, gemKit, pack, digital], context());
    expect(items.map((i) => i.id)).toEqual(["v-20", "v-100", "p-kit-gems"]);
    expect(items[0]).toEqual({
      id: "v-20",
      item_group_id: "p-gem",
      title: "Chrome Heart – SS5 · 20 pieces",
      description: "A chrome heart <3.",
      link: "https://www.example.com/en/shop/chrome-heart?variant=v-20",
      image_link: "https://cdn.example/v20.jpg",
      additional_image_link: ["https://cdn.example/coeur.jpg", "https://www.example.com/media/coeur-2.jpg"],
      availability: "in_stock",
      price: "19.90 EUR",
      brand: "Global Toothgems",
      identifier_exists: "no",
      condition: "new",
      product_type: "Gems > Swarovski",
      color: "Crystal",
      size: "SS5 · 20 pieces",
      shipping_weight: "4 g",
    });
    expect(items[1]).toMatchObject({ availability: "out_of_stock", price: "59.00 EUR", image_link: "https://cdn.example/coeur.jpg" });
    expect(items[1]).not.toHaveProperty("shipping_weight");
    // A product without variants: no group, the bare address, its own stock.
    expect(items[2]).toMatchObject({ id: "p-kit-gems", link: "https://www.example.com/en/shop/kit-gems", availability: "in_stock", product_type: "Kits", shipping_weight: "250 g" });
    expect(items[2]).not.toHaveProperty("item_group_id");
    expect(items[2]).not.toHaveProperty("size");
  });

  it("links French items to the French pages", () => {
    const [item] = feedItems([gem], context({ locale: "fr" }));
    expect(item).toMatchObject({ title: "Cœur Chrome – SS5 · 20 pièces", link: "https://www.example.com/fr/boutique/coeur-chrome?variant=v-20", color: "Cristal" });
  });

  it("prices like the page: the reference price struck only when the database says reduced (Omnibus)", () => {
    const ref = (variant: string, state: string, price: string, reference: string | null) => ({
      product_id: "p-gem",
      variant_id: variant,
      course_id: null,
      currency: "EUR",
      list_price: "19.90",
      price,
      reference_price: reference,
      discount_percent: state === "reduced" ? 20 : null,
      reduction_started_at: "2026-11-01T00:00:00Z",
      state,
    });
    const promotion = {
      id: "promo",
      type: "percentage",
      currency: "EUR",
      percent_off: 20,
      max_discount_amount: null,
      applies_to: "products",
      customer_eligibility: "all",
      min_subtotal_amount: null,
      min_quantity: null,
      starts_at: "2026-11-01T00:00:00Z",
      ends_at: "2026-11-30T23:00:00Z",
      promotion_products: [{ product_id: "p-gem", role: "eligible" }],
    };
    const prices = buildPriceBook(
      { references: [ref("v-20", "reduced", "15.92", "19.90"), ref("v-100", "not_lower", "47.20", "40.00")], promotions: [promotion] },
      Date.parse("2026-11-13T12:00:00Z"),
    );
    const [reduced, notLower] = feedItems([gem], context({ prices }));
    expect(reduced).toMatchObject({
      price: "19.90 EUR",
      sale_price: "15.92 EUR",
      sale_price_effective_date: "2026-11-01T00:00:00.000Z/2026-11-30T23:00:00.000Z",
    });
    expect(notLower).toMatchObject({ price: "47.20 EUR" });
    expect(notLower).not.toHaveProperty("sale_price");

    // A cut with no end: the sale price without a period.
    const open = buildPriceBook({ references: [ref("v-20", "reduced", "15.92", "19.90")], promotions: [{ ...promotion, ends_at: null }] });
    const [item] = feedItems([gem], context({ prices: open }));
    expect(item.sale_price).toBe("15.92 EUR");
    expect(item).not.toHaveProperty("sale_price_effective_date");
  });

  it("takes colour and size from the variant options", () => {
    const lamp: Product = {
      ...kit,
      id: "lampe",
      dbId: "p-lamp",
      cat: "kits",
      options: [
        { id: "o-col", name: { fr: "Couleur", en: "Colour" }, values: [{ id: "silver", name: { fr: "Argent", en: "Silver" } }] },
        { id: "o-plug", name: { fr: "Prise", en: "Plug" }, values: [{ id: "eu", name: { fr: "Prise EU", en: "EU plug" } }, { id: "uk", name: { fr: "Prise UK", en: "UK plug" } }] },
      ],
      variants: [
        { id: "l-eu", name: { fr: "Argent / EU", en: "Silver / EU" }, price: 89, optionValues: ["silver", "eu"] },
        { id: "l-uk", name: { fr: "Argent / UK", en: "Silver / UK" }, price: 89, optionValues: ["silver", "uk"] },
      ],
    };
    const items = feedItems([lamp], context({ bundles: new Map() }));
    expect(items.map((i) => [i.color, i.size])).toEqual([
      ["Silver", "EU plug"],
      ["Silver", "UK plug"],
    ]);
  });
});

describe("renderProductFeed", () => {
  it("writes RSS 2.0 with the g: namespace, escaped", () => {
    const xml = renderProductFeed(feedItems([gem], context()), { locale: "en", base });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')).toBe(true);
    expect(xml).toContain("<link>https://www.example.com/en/shop</link>");
    expect(xml).toContain("<g:id>v-20</g:id>");
    expect(xml).toContain("<title>Chrome Heart – SS5 · 20 pieces</title>");
    expect(xml).toContain("<description>A chrome heart &lt;3.</description>");
    expect(xml).toContain("<link>https://www.example.com/en/shop/chrome-heart?variant=v-20</link>");
    expect(xml.match(/<g:additional_image_link>/g)).toHaveLength(3);
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
    expect(xml.trimEnd().endsWith("</channel>\n</rss>")).toBe(true);
  });

  it("escapes text and drops control characters", () => {
    expect(xmlText(`a & b <c> "d" 'e'\u0001`)).toBe("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;");
  });
});
