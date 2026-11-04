import { describe, expect, it } from "vitest";
import { PRODUCTS, shapeName, shapesInCatalog, sortByShapeLabel, type Product } from "./products";

const base = PRODUCTS.find((p) => p.shape)!;
function gem(over: Partial<Product>): Product {
  return { ...base, shape: "flower", color: "crystal", image: "/x.jpg", ...over };
}

describe("shapeName", () => {
  it("names cuts in English whatever the language", () => {
    expect(shapeName("flower")).toBe("Starflower");
    expect(shapeName("drop")).toBe("Raindrop");
    expect(shapeName("rivoli-star")).toBe("Rivoli Star");
  });

  it("shows an unknown slug as-is", () => {
    expect(shapeName("hand-typed")).toBe("hand-typed");
  });
});

describe("shapesInCatalog", () => {
  it("pictures a cut with its plain Crystal gem, not the Crystal AB", () => {
    const [group] = shapesInCatalog([gem({ color: "crystal-ab", image: "/ab.jpg" }), gem({ image: "/clear.jpg" })]);
    expect(group).toEqual({ shape: "flower", count: 2, image: "/clear.jpg" });
  });

  it("recognises a plain Crystal gem without a colour by its name", () => {
    const [group] = shapesInCatalog([
      gem({ color: undefined, name: { fr: "Diamond Shape - Crystal AB", en: "Diamond Shape - Crystal AB" }, image: "/ab.jpg" }),
      gem({ color: undefined, name: { fr: "Diamond Shape - Crystal Shimmer", en: "Diamond Shape - Crystal Shimmer" }, image: "/shimmer.jpg" }),
      gem({ color: undefined, name: { fr: "Diamond Shape - Crystal", en: "Diamond Shape - Crystal" }, image: "/clear.jpg" }),
    ]);
    expect(group.image).toBe("/clear.jpg");
  });

  it("leaves the picture out when the cut has no plain Crystal gem", () => {
    const [group] = shapesInCatalog([gem({ color: "crystal-ab" })]);
    expect(group.image).toBeUndefined();
  });
});

describe("sortByShapeLabel", () => {
  it("orders cuts by their English name", () => {
    expect(sortByShapeLabel(["drop", "flower", "baguette"] as const, (s) => s, shapeName, "fr")).toEqual(["baguette", "drop", "flower"]);
  });
});
