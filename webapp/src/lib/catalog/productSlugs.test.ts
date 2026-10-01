import { describe, expect, it } from "vitest";
import { alternates, parsePath, toAddress } from "../localeRoutes";
import { productSlug, productSlugTranslator, resolveProductAddress, type SluggedProduct } from "./productSlugs";

const heart: SluggedProduct = {
  id: "coeur-chrome",
  dbId: "00000000-0000-0000-0000-000000000001",
  aliases: ["chrome-heart-tooth-gem"],
  slugs: { en: "chrome-heart-tooth-gem" },
};
// A mock fixture: one id, no translated slug.
const fixture: SluggedProduct = { id: "aurora-heart" };
const products = [heart, fixture];

describe("productSlug", () => {
  it("uses the published slug of the language, else the French one", () => {
    expect(productSlug(heart, "fr")).toBe("coeur-chrome");
    expect(productSlug(heart, "en")).toBe("chrome-heart-tooth-gem");
    expect(productSlug(fixture, "en")).toBe("aurora-heart");
  });
});

describe("resolveProductAddress", () => {
  it("finds the product at its own address", () => {
    expect(resolveProductAddress(products, "coeur-chrome", "fr")).toEqual({ kind: "found", product: heart });
    expect(resolveProductAddress(products, "chrome-heart-tooth-gem", "en")).toEqual({ kind: "found", product: heart });
    expect(resolveProductAddress(products, "aurora-heart", "en")).toEqual({ kind: "found", product: fixture });
  });

  it("moves another language's slug, or the row id, to the right slug", () => {
    expect(resolveProductAddress(products, "chrome-heart-tooth-gem", "fr")).toEqual({ kind: "moved", product: heart, slug: "coeur-chrome" });
    expect(resolveProductAddress(products, "coeur-chrome", "en")).toEqual({ kind: "moved", product: heart, slug: "chrome-heart-tooth-gem" });
    expect(resolveProductAddress(products, heart.dbId!, "en")).toMatchObject({ kind: "moved", slug: "chrome-heart-tooth-gem" });
  });

  it("does not know other keys", () => {
    expect(resolveProductAddress(products, "nope", "fr")).toEqual({ kind: "unknown" });
    expect(resolveProductAddress([], "coeur-chrome", "fr")).toEqual({ kind: "unknown" });
  });
});

describe("addresses with translated product slugs", () => {
  const translate = productSlugTranslator(products);

  it("writes the app's French paths with the slug of the language", () => {
    expect(toAddress("/boutique/coeur-chrome", "en", translate)).toBe("/en/shop/chrome-heart-tooth-gem");
    expect(toAddress("/boutique/coeur-chrome", "fr", translate)).toBe("/fr/boutique/coeur-chrome");
    expect(toAddress("/boutique/aurora-heart", "en", translate)).toBe("/en/shop/aurora-heart");
  });

  it("switches an address to the other language (language switch, hreflang)", () => {
    expect(toAddress("/en/shop/chrome-heart-tooth-gem", "fr", translate)).toBe("/fr/boutique/coeur-chrome");
    expect(alternates(parsePath("/en/shop/chrome-heart-tooth-gem"), translate)).toEqual({
      fr: "/fr/boutique/coeur-chrome",
      en: "/en/shop/chrome-heart-tooth-gem",
    });
  });

  it("reads an English address back to the app's French path", () => {
    expect(parsePath("/en/shop/chrome-heart-tooth-gem", translate).internal).toBe("/boutique/coeur-chrome");
    expect(parsePath("/en/shop/unknown", translate).internal).toBe("/boutique/unknown");
  });

  it("leaves other routes alone", () => {
    expect(toAddress("/academy/formation/fondation", "en", translate)).toBe("/en/academy/course/fondation");
  });
});
