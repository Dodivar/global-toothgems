import { describe, expect, it } from "vitest";
import type { Product } from "../../data/products";
import { jsonLdScript, productAddresses, productDescription, productJsonLd, productTitle, richTextToPlain, truncate } from "./productMeta";

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

  it("cuts long descriptions at a word", () => {
    const long = "mot ".repeat(60).trim();
    const cut = truncate(long);
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut.endsWith("mot…")).toBe(true);
    expect(truncate("court")).toBe("court");
  });
});

describe("productJsonLd", () => {
  it("describes the product, its offer and its rating", () => {
    expect(productJsonLd(product, "en", base)).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Chrome Heart",
      description: "A chrome heart.",
      image: ["https://cdn.example/coeur.jpg"],
      url: "https://www.example.com/en/shop/chrome-heart-tooth-gem",
      offers: {
        "@type": "Offer",
        price: "29.00",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
        url: "https://www.example.com/en/shop/chrome-heart-tooth-gem",
      },
      aggregateRating: { "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 2 },
    });
  });

  it("gives a price range for variants, the stock state, and no rating without reviews", () => {
    const data = productJsonLd(
      {
        ...product,
        stock: "out",
        reviewCount: 0,
        variants: [
          { id: "a", name: { fr: "a", en: "a" }, price: 19.9 },
          { id: "b", name: { fr: "b", en: "b" }, price: 24.5 },
        ],
      },
      "fr",
      base,
    );
    expect(data.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: "19.90", highPrice: "24.50", offerCount: 2, availability: "https://schema.org/OutOfStock" });
    expect(data).not.toHaveProperty("aggregateRating");
  });

  it("cannot close its script tag", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
