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

  it("names the Swarovski 2058 round per language", () => {
    expect(shapeName("xilion-rose")).toBe("Round 2058");
    expect(shapeName("xilion-rose", "en")).toBe("Round 2058");
    expect(shapeName("xilion-rose", "fr")).toBe("2058 Rond");
  });

  it("shows an unknown slug as-is", () => {
    expect(shapeName("hand-typed")).toBe("hand-typed");
  });
});

describe("shapesInCatalog", () => {
  it("pictures a cut with its Aquamarine gem, not another colour", () => {
    const [group] = shapesInCatalog([gem({ color: "crystal", image: "/clear.jpg" }), gem({ color: "aquamarine", image: "/aqua.jpg" })]);
    expect(group).toEqual({ shape: "flower", count: 2, image: "/aqua.jpg" });
  });

  it("recognises an Aquamarine gem without a colour by its name", () => {
    const [group] = shapesInCatalog([
      gem({ color: undefined, name: { fr: "Diamond Shape - Crystal", en: "Diamond Shape - Crystal" }, image: "/clear.jpg" }),
      gem({ color: undefined, name: { fr: "Diamond Shape - Aquamarine Shimmer", en: "Diamond Shape - Aquamarine Shimmer" }, image: "/shimmer.jpg" }),
      gem({ color: undefined, name: { fr: "Diamond Shape - Aigue-marine", en: "Diamond Shape - Aquamarine" }, image: "/aqua.jpg" }),
    ]);
    expect(group.image).toBe("/aqua.jpg");
  });

  it("leaves the picture out when the cut has no Aquamarine gem", () => {
    const [group] = shapesInCatalog([gem({ color: "crystal" })]);
    expect(group.image).toBeUndefined();
  });
});

describe("sortByShapeLabel", () => {
  it("orders cuts by their English name", () => {
    expect(sortByShapeLabel(["drop", "flower", "baguette"] as const, (s) => s, shapeName, "fr")).toEqual(["baguette", "drop", "flower"]);
  });
});
