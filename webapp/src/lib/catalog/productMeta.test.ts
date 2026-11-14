import { describe, expect, it } from "vitest";
import type { Product } from "../../data/products";
import { buildPriceBook } from "./productOffers";
import { jsonLdScript, productAddresses, productDescription, productJsonLd, productMetaDescription, productTitle, richTextToPlain, truncate } from "./productMeta";

const product: Product = {
  id: "coeur-chrome",
  slugs: { en: "chrome-heart-tooth-gem" },
  name: { fr: "Cœur Chrome", en: "Chrome Heart" },
  subtitle: { fr: "Chrome", en: "Chrome" },
  price: 29,
  currency: "EUR",
  rating: 4.5,
  reviewCount: 2,
  image: "https://cdn.example/coeur.jpg",
  cat: "gems",
  family: null,
  material: "Chrome",
  description: { fr: "Un **cœur** chromé.\n\n- poli miroir", en: "A **chrome** heart." },
};

const base = new URL("https://www.example.com");

describe("product page head", () => {
  it("titles and addresses the page in each language", () => {
    expect(productTitle(product, "en")).toBe("Chrome Heart · Global Toothgems");
    expect(productAddresses(product)).toEqual({ fr: "/fr/boutique/coeur-chrome", en: "/en/shop/chrome-heart-tooth-gem" });
  });

  it("describes it with its own text, as plain text", () => {
    expect(richTextToPlain("Un **cœur** chromé.\n\n- poli miroir")).toBe("Un cœur chromé. poli miroir");
    expect(productDescription(product, "fr")).toBe("Un cœur chromé. poli miroir");
    // Without a description: the line the page shows instead.
    expect(productDescription({ ...product, description: undefined }, "en")).toBe("Chrome Heart — Chrome.");
  });

  it("prefers the catalogue's search title and description when it sets them", () => {
    const seo: Product = {
      ...product,
      metaTitle: { fr: "Strass dentaire Cœur Chrome", en: "Chrome Heart Tooth Gem" },
      metaDescription: { fr: "Un cœur chromé pour la dent.", en: "A chrome heart for your tooth." },
    };
    expect(productTitle(seo, "en")).toBe("Chrome Heart Tooth Gem · Global Toothgems");
    expect(productMetaDescription(seo, "fr")).toBe("Un cœur chromé pour la dent.");
    // The structured data keeps describing the product itself.
    expect(productDescription(seo, "en")).toBe("A chrome heart.");
    // Without them, the name and the description are used.
    expect(productMetaDescription(product, "en")).toBe("A chrome heart.");
  });

  it("cuts long descriptions at a word", () => {
    const long = "mot ".repeat(60).trim();
    const cut = truncate(long);
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut.endsWith("mot…")).toBe(true);
    expect(truncate("court")).toBe("court");
  });
});

describe("productJsonLd", () => {
  it("describes the product, its brand, its offer and its rating", () => {
    expect(productJsonLd({ ...product, sku: "GEM-HEART-CHROME" }, "en", base)).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Chrome Heart",
      description: "A chrome heart.",
      image: ["https://cdn.example/coeur.jpg"],
      url: "https://www.example.com/en/shop/chrome-heart-tooth-gem",
      brand: { "@type": "Brand", name: "Global Toothgems" },
      sku: "GEM-HEART-CHROME",
      offers: {
        "@type": "Offer",
        price: "29.00",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        url: "https://www.example.com/en/shop/chrome-heart-tooth-gem",
      },
      aggregateRating: { "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 2 },
    });
  });

  const withVariants: Product = {
    ...product,
    dbId: "p1",
    stock: "out",
    reviewCount: 0,
    variants: [
      { id: "a", name: { fr: "SS5 · 20", en: "SS5 · 20" }, price: 19.9, stock: "out", availability: "out_of_stock", sku: "A-1", image: "https://cdn.example/a.jpg" },
      { id: "b", name: { fr: "SS7 · 20", en: "SS7 · 20" }, price: 24.5, availability: "preorder" },
    ],
  };

  it("gives each variant its own offer, stock state and address, and no rating without reviews", () => {
    const data = productJsonLd(withVariants, "fr", base);
    expect(data).toMatchObject({ "@type": "ProductGroup", productGroupID: "p1", brand: { name: "Global Toothgems" } });
    expect(data.hasVariant).toEqual([
      {
        "@type": "Product",
        name: "Cœur Chrome – SS5 · 20",
        sku: "A-1",
        image: "https://cdn.example/a.jpg",
        offers: {
          "@type": "Offer",
          url: "https://www.example.com/fr/boutique/coeur-chrome?variant=a",
          price: "19.90",
          priceCurrency: "EUR",
          availability: "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
        },
      },
      {
        "@type": "Product",
        name: "Cœur Chrome – SS7 · 20",
        image: "https://cdn.example/coeur.jpg",
        offers: {
          "@type": "Offer",
          url: "https://www.example.com/fr/boutique/coeur-chrome?variant=b",
          price: "24.50",
          priceCurrency: "EUR",
          availability: "https://schema.org/PreOrder",
          itemCondition: "https://schema.org/NewCondition",
        },
      },
    ]);
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data).not.toHaveProperty("offers");
  });

  it("states the page's price while a cut runs, struck only when the database says reduced", () => {
    const ref = (variant: string, state: string, price: string, reference: string | null) => ({
      product_id: "p1",
      variant_id: variant,
      course_id: null,
      currency: "EUR",
      list_price: "24.50",
      price,
      reference_price: reference,
      discount_percent: state === "reduced" ? 20 : null,
      reduction_started_at: "2026-11-01T00:00:00Z",
      state,
    });
    const book = buildPriceBook({
      references: [ref("a", "not_lower", "15.92", "15.00"), ref("b", "reduced", "19.60", "24.50")],
      promotions: [
        {
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
          promotion_products: [{ product_id: "p1", role: "eligible" }],
        },
      ],
    }, Date.parse("2026-11-13T12:00:00Z"));
    const [a, b] = productJsonLd(withVariants, "en", base, book).hasVariant as { offers: Record<string, unknown> }[];
    expect(a.offers).toMatchObject({ price: "15.92" });
    expect(a.offers).not.toHaveProperty("priceSpecification");
    expect(b.offers).toMatchObject({
      price: "19.60",
      priceValidUntil: "2026-11-30",
      priceSpecification: { "@type": "UnitPriceSpecification", priceType: "https://schema.org/StrikethroughPrice", price: "24.50", priceCurrency: "EUR" },
    });
  });

  it("cannot close its script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
