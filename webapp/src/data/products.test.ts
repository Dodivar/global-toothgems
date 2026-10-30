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
  it("pictures a cut with its Crystal AB gem", () => {
    const [group] = shapesInCatalog([gem({ image: "/clear.jpg" }), gem({ color: "crystal-ab", image: "/ab.jpg" })]);
    expect(group).toEqual({ shape: "flower", count: 2, image: "/ab.jpg" });
  });

  it("recognises a Crystal AB gem without a colour by its name", () => {
    const [group] = shapesInCatalog([gem({ color: undefined, name: { fr: "Diamond Shape - Crystal AB", en: "Diamond Shape - Crystal AB" }, image: "/ab.jpg" })]);
    expect(group.image).toBe("/ab.jpg");
  });

  it("leaves the picture out when the cut has no Crystal AB gem", () => {
    const [group] = shapesInCatalog([gem({})]);
    expect(group.image).toBeUndefined();
  });
});

describe("sortByShapeLabel", () => {
  it("orders cuts by their English name", () => {
    expect(sortByShapeLabel(["drop", "flower", "baguette"] as const, (s) => s, shapeName, "fr")).toEqual(["baguette", "drop", "flower"]);
  });
});
