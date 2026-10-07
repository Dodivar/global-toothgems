import { describe, expect, it } from "vitest";
import type { GemColorDef, Product } from "../../data/products";
import { sanitizeJewels, scaleForSs } from "../../data/studioEditor";
import { stoneSizeMmApprox } from "../gemOptions";
import { buildStudioGems, defaultSize, estimateComposition, fallbackLook, nearestSize, pieceSpec, swapPatch, type GemAppearanceRow } from "./gemCatalog";

const product = (over: Partial<Product>): Product => ({
  id: "slug",
  dbId: "00000000-0000-4000-a000-000000000001",
  name: { fr: "Gemme", en: "Gem" },
  subtitle: { fr: "", en: "" },
  price: 9.95,
  currency: "EUR",
  rating: 0,
  reviewCount: 0,
  image: "/x.webp",
  cat: "gems",
  family: "swarovski",
  material: "",
  ...over,
});

const colors: GemColorDef[] = [
  { slug: "aquamarine", name: { fr: "Aigue-marine", en: "Aquamarine" }, hex: "#6FB3C9", isMulticolor: false },
  { slug: "multicolor", name: { fr: "Multicolore", en: "Multicolour" }, hex: null, isMulticolor: true },
];

const heart = product({ id: "coeur", dbId: "p-heart", shape: "heart", color: "aquamarine" });
const charm = product({
  id: "cerises",
  dbId: "p-cherry",
  family: "bijoux-or-18ct",
  price: 44.95,
  variants: [
    { id: "v-gold", name: { fr: "Or jaune", en: "Yellow gold" }, price: 44.95, swatch: "#dbc11a" },
    { id: "v-white", name: { fr: "Or blanc", en: "White gold" }, price: 44.95, swatch: "#d9d9d9", image: "/white.webp" },
  ],
});
const sized = product({
  id: "baguette",
  dbId: "p-baguette",
  shape: "baguette",
  variants: [
    { id: "v1", name: { fr: "", en: "" }, price: 9.95, pack: 10, ss: 7 },
    { id: "v2", name: { fr: "", en: "" }, price: 18.95, pack: 25, ss: 3 },
    { id: "v3", name: { fr: "", en: "" }, price: 9.95, pack: 10, ss: 3 },
  ],
});
const tool = product({ id: "pince", dbId: "p-tool", cat: "materiel" });

const rows: GemAppearanceRow[] = [
  { product_id: "p-cherry", variant_id: null, shape: "cherries", material: "metal", color: "#f2c25c", effect: "none" },
  { product_id: "p-cherry", variant_id: "v-white", shape: null, material: "metal", color: "#e3e6ea", effect: "none" },
  { product_id: "p-baguette", variant_id: null, shape: "baguette", material: "crystal", color: "#f1f3ff", effect: "iridescent" },
];

describe("studio gems from the shop catalogue", () => {
  const gems = buildStudioGems([heart, charm, sized, tool], rows, colors);
  const byKey = (key: string) => gems.find((g) => g.key === key);

  it("offers every gem of the shop, and nothing else", () => {
    expect(gems.map((g) => g.key)).toEqual(["p-heart", "p-cherry", "p-baguette"]);
  });

  it("draws a gem from its appearance row, else from its shop shape and colour", () => {
    expect(byKey("p-baguette")?.finishes[0].look).toEqual({ shape: "baguette", material: "crystal", color: "#f1f3ff", effect: "iridescent" });
    expect(byKey("p-heart")?.finishes[0].look).toEqual({ shape: "heart", material: "crystal", color: "#6fb3c9", effect: "none" });
    expect(fallbackLook({ shape: "diamond", color: "multicolor" }, colors)).toEqual({
      shape: "kite",
      material: "crystal",
      color: "#f1f3ff",
      effect: "iridescent",
    });
    expect(fallbackLook({}, colors)).toMatchObject({ shape: "round", color: "#ffffff" });
  });

  it("gives one colour per colour variant, with the variant's own look when it has one", () => {
    const finishes = byKey("p-cherry")!.finishes;
    expect(finishes.map((f) => f.variantId)).toEqual(["v-gold", "v-white"]);
    expect(finishes[1]).toMatchObject({ look: { shape: "cherries", material: "metal", color: "#e3e6ea" }, image: "/white.webp" });
    // no row for the yellow-gold variant: the product's look in the swatch's colour
    expect(finishes[0].look).toMatchObject({ shape: "cherries", material: "metal", color: "#dbc11a" });
    expect(finishes[0].priceMinor).toBe(4495);
  });

  it("offers the gem's SS options, else SS2, SS5 and SS7", () => {
    expect(byKey("p-baguette")?.sizes).toEqual([3, 7]);
    expect(byKey("p-heart")?.sizes).toEqual([2, 5, 7]);
    expect(defaultSize({ sizes: [2, 5, 7] })).toBe(5);
    expect(nearestSize({ sizes: [3, 7] }, 5)).toBe(3);
    expect(nearestSize({ sizes: [3, 7] }, 6)).toBe(7);
  });

  it("builds a new piece and swaps a placed one to another gem, keeping the closest size", () => {
    const spec = pieceSpec(byKey("p-heart")!);
    expect(spec).toEqual({ productId: "p-heart", ss: 5, scale: scaleForSs(5), look: byKey("p-heart")!.finishes[0].look });
    const cherry = byKey("p-cherry")!;
    expect(swapPatch({ ss: 6 }, byKey("p-baguette")!, byKey("p-baguette")!.finishes[0])).toMatchObject({ productId: "p-baguette", ss: 7 });
    expect(swapPatch({ ss: 5 }, cherry, cherry.finishes[1])).toMatchObject({ productId: "p-cherry", variantId: "v-white", ss: 5 });
  });

  it("values a composition at shop prices: a pack per crystal and colour, a charm per piece", () => {
    const crystal = { productId: "p-heart", look: byKey("p-heart")!.finishes[0].look };
    const gold = { productId: "p-cherry", variantId: "v-gold", look: byKey("p-cherry")!.finishes[0].look };
    const value = estimateComposition([crystal, crystal, crystal, gold, gold, { ...crystal, productId: "gone" }], byKey);
    expect(value.totalMinor).toBe(995 + 2 * 4495);
    expect(value.unavailable).toBe(1);
    expect(value.lines.map((l) => [l.pieces, l.quantity])).toEqual([
      [3, 1],
      [2, 2],
    ]);
  });
});

describe("placed pieces read back", () => {
  const good = {
    id: "a",
    productId: "p-heart",
    ss: 5,
    look: { shape: "heart", material: "crystal", color: "#AABBCC", effect: "none" },
    toothId: "11",
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    rotation: 370,
    scale: 99,
  };

  it("keeps a well-formed piece whether or not its gem is still sold, and derives its size", () => {
    const [piece] = sanitizeJewels([good]);
    expect(piece).toMatchObject({ productId: "p-heart", ss: 5, rotation: 10, scale: scaleForSs(5), look: { color: "#aabbcc" } });
  });

  it("drops pieces with an unknown shape, size or reference", () => {
    expect(sanitizeJewels([{ ...good, look: { ...good.look, shape: "hexagon" } }])).toEqual([]);
    expect(sanitizeJewels([{ ...good, ss: 2.5 }])).toEqual([]);
    expect(sanitizeJewels([{ ...good, productId: "<script>" }])).toEqual([]);
  });

  it("knows every stone size, between and beyond the table", () => {
    expect(stoneSizeMmApprox(2)).toBe(1.3);
    expect(stoneSizeMmApprox(11)).toBeCloseTo(2.95, 2);
    expect(stoneSizeMmApprox(1)).toBeGreaterThanOrEqual(0.8);
    expect(scaleForSs(5)).toBe(0.9);
  });
});
