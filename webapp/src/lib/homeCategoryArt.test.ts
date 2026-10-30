import { describe, expect, it } from "vitest";
import type { Product } from "../data/products";
import { pickBurstImages, pickFeaturedProduct } from "./homeCategoryArt";

const product = (id: string, cat: string | null, family: string | null, image: string, extra: Partial<Product> = {}): Product =>
  ({
    id,
    name: { fr: id, en: id },
    subtitle: { fr: "", en: "" },
    price: 1000,
    rating: 0,
    reviewCount: 0,
    image,
    cat,
    family,
    material: "",
    ...extra,
  }) as Product;

const CATALOGUE = [
  product("diy", "kits", "kit-diy", "diy.png"),
  product("premium", "kits", "kit-professionnel", "premium.jpg"),
  product("pro-studio", "kits", "kit-professionnel", "pro.png", { aliases: ["pro-studio-en"] }),
  product("pince", "materiel", "accessoires", "pince.png"),
  product("godet", "materiel", "accessoires", "godet.png"),
  product("godet-bis", "materiel", "accessoires", "godet.png"),
  product("lampe", "materiel", "essentiels", "lampe.png", { stock: "out" }),
  product("strass", "gems", "swarovski", "strass.jpg"),
];

describe("pickFeaturedProduct", () => {
  it("prefers the named slugs, then the family, then the category", () => {
    expect(pickFeaturedProduct(CATALOGUE, { cat: "kits", family: "kit-professionnel", slugs: ["pro-studio"] })?.id).toBe("pro-studio");
    expect(pickFeaturedProduct(CATALOGUE, { cat: "kits", family: "kit-professionnel", slugs: ["gone"] })?.id).toBe("premium");
    expect(pickFeaturedProduct(CATALOGUE, { cat: "kits", family: "none" })?.id).toBe("diy");
  });

  it("matches a slug through its aliases and never crosses categories", () => {
    expect(pickFeaturedProduct(CATALOGUE, { cat: "kits", slugs: ["pro-studio-en"] })?.id).toBe("pro-studio");
    expect(pickFeaturedProduct(CATALOGUE, { cat: "kits", slugs: ["strass"] })?.id).toBe("diy");
  });

  it("skips products out of stock or without a picture", () => {
    const list = [product("a", "kits", null, "", {}), product("b", "kits", null, "b.png", { stock: "out" }), product("c", "kits", null, "c.png")];
    expect(pickFeaturedProduct(list, { cat: "kits", slugs: ["a", "b"] })?.id).toBe("c");
    expect(pickFeaturedProduct([], { cat: "kits" })).toBeUndefined();
  });
});

describe("pickBurstImages", () => {
  it("returns distinct in-stock pictures of the category, capped", () => {
    expect(pickBurstImages(CATALOGUE, "materiel", 5).map((i) => i.key)).toEqual(["pince", "godet"]);
    expect(pickBurstImages(CATALOGUE, "materiel", 1)).toEqual([{ key: "pince", src: "pince.png" }]);
    expect(pickBurstImages(CATALOGUE, "lip-gloss", 5)).toEqual([]);
  });
});
