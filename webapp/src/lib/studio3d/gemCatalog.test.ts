import { describe, expect, it } from "vitest";
import type { GemColorDef, Product } from "../../data/products";
import { DEFAULT_ROUND_SIZES, DEFAULT_SHAPED_SIZES, sanitizeJewels, scaleForSize } from "../../data/studioEditor";
import { stoneSizeMmApprox, type GemSize } from "../gemOptions";
import { buildStudioGems, coverPieces, defaultSize, estimateComposition, fallbackLook, nearestSize, pieceSpec, swapPatch, type GemAppearanceRow } from "./gemCatalog";

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
    { id: "v1", name: { fr: "", en: "" }, price: 9.95, pack: 10, size: { mm: [3, 6] } },
    { id: "v2", name: { fr: "", en: "" }, price: 18.95, pack: 25, size: { mm: [2, 4] } },
    { id: "v3", name: { fr: "", en: "" }, price: 9.95, pack: 10, size: { mm: [2, 4] } },
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

  it("offers the sizes the shop sells, else SS sizes for a round stone and millimetres for any other cut", () => {
    expect(byKey("p-baguette")?.sizes).toEqual([{ mm: [2, 4] }, { mm: [3, 6] }]);
    expect(byKey("p-heart")?.sizes).toEqual(DEFAULT_SHAPED_SIZES);
    const round = buildStudioGems([product({ id: "rond", dbId: "p-round", shape: "round" })], [], colors)[0];
    expect(round.sizes).toEqual(DEFAULT_ROUND_SIZES);
    expect(defaultSize({ sizes: DEFAULT_ROUND_SIZES })).toEqual({ ss: 5 });
    const baguettes: GemSize[] = [{ mm: [2, 4] }, { mm: [3, 6] }];
    // nearest by longest side: SS16 ≈ 3.9 mm → 2 × 4; 5.5 mm → 3 × 6; its own size kept
    expect(nearestSize({ sizes: baguettes }, { ss: 16 })).toEqual({ mm: [2, 4] });
    expect(nearestSize({ sizes: baguettes }, { mm: [5.5] })).toEqual({ mm: [3, 6] });
    expect(nearestSize({ sizes: baguettes }, { mm: [3, 6] })).toEqual({ mm: [3, 6] });
  });

  it("draws a piece at its size's longest side", () => {
    expect(scaleForSize({ mm: [2, 4] })).toBe(2);
    expect(scaleForSize({ mm: [3] })).toBe(1.5);
    expect(scaleForSize({ ss: 5 })).toBe(0.9);
  });

  it("builds a new piece and swaps a placed one to another gem, keeping the closest size", () => {
    const spec = pieceSpec(byKey("p-heart")!);
    expect(spec).toEqual({ productId: "p-heart", size: { mm: [4] }, scale: 2, look: byKey("p-heart")!.finishes[0].look });
    const cherry = byKey("p-cherry")!;
    expect(swapPatch({ size: { ss: 6 } }, byKey("p-baguette")!, byKey("p-baguette")!.finishes[0])).toMatchObject({
      productId: "p-baguette",
      size: { mm: [2, 4] },
      scale: 2,
    });
    expect(swapPatch({ size: { mm: [5] } }, cherry, cherry.finishes[1])).toMatchObject({ productId: "p-cherry", variantId: "v-white", size: { mm: [5] } });
  });

  it("values a composition at shop prices: one item per crystal and colour without packs, a charm per piece", () => {
    const crystal = { productId: "p-heart", look: byKey("p-heart")!.finishes[0].look };
    const gold = { productId: "p-cherry", variantId: "v-gold", look: byKey("p-cherry")!.finishes[0].look };
    const value = estimateComposition([crystal, crystal, crystal, gold, gold, { ...crystal, productId: "gone" }], byKey);
    expect(value.totalMinor).toBe(995 + 2 * 4495);
    expect(value.unavailable).toBe(1);
    expect(value.lines.map((l) => [l.pieces, l.quantity, l.offer.variantId])).toEqual([
      [3, 1, null],
      [2, 2, "v-gold"],
    ]);
  });

  it("buys a crystal in the pieces' size, in the cheapest pack that covers them, in stock first", () => {
    const look = byKey("p-baguette")!.finishes[0].look;
    const piece = (size: GemSize) => ({ productId: "p-baguette", size, look });
    const small: GemSize = { mm: [2, 4] };
    // 2 pieces in 2 × 4 → the pack of 10 (not 25); 1 piece in 3 × 6 → its own pack of 10
    const value = estimateComposition([piece(small), piece(small), piece({ mm: [3, 6] })], byKey);
    expect(value.lines.map((l) => [l.size, l.offer.variantId, l.quantity])).toEqual([
      [small, "v3", 1],
      [{ mm: [3, 6] }, "v1", 1],
    ]);
    expect(value.totalMinor).toBe(995 + 995);
    // 30 pieces in 2 × 4: 3 × pack of 10 (29.85) beats 2 × pack of 25 (37.90)
    expect(estimateComposition(Array.from({ length: 30 }, () => piece(small)), byKey).lines[0]).toMatchObject({ offer: { variantId: "v3" }, quantity: 3 });
    // a size the shop does not sell is not counted
    expect(estimateComposition([piece({ mm: [5] })], byKey)).toMatchObject({ lines: [], unavailable: 1 });
  });

  it("covers pieces with one offer: in stock first, out of stock only when nothing else is", () => {
    const offer = (variantId: string, pack: number, priceMinor: number, stock?: "out") => ({ variantId, name: null, pack, size: null, colour: false, priceMinor, ...(stock ? { stock } : {}) });
    const ten = offer("p10", 10, 500, "out");
    const tf = offer("p25", 25, 1000);
    expect(coverPieces([ten, tf], 2, false)).toMatchObject({ offer: { variantId: "p25" }, quantity: 1 });
    expect(coverPieces([ten], 2, false)).toMatchObject({ offer: { variantId: "p10", stock: "out" }, quantity: 1 });
    expect(coverPieces([offer("a", 10, 500), offer("b", 25, 1000)], 26, false)).toMatchObject({ offer: { variantId: "a" }, quantity: 3 });
    expect(coverPieces([], 1, false)).toBeNull();
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
    expect(piece).toMatchObject({ productId: "p-heart", size: { ss: 5 }, rotation: 10, scale: 0.9, look: { color: "#aabbcc" } });
    expect(piece).not.toHaveProperty("ss");
  });

  it("reads a design saved before millimetre sizes (a bare `ss`) at the very scale it had", () => {
    // Before decision 107 a piece was drawn at stoneSizeMmApprox(ss) / 2.
    for (const ss of [2, 5, 7, 11]) {
      expect(sanitizeJewels([{ ...good, ss }])[0].scale).toBe(stoneSizeMmApprox(ss) / 2);
    }
  });

  it("reads a millimetre size, preferred over a stray `ss`", () => {
    expect(sanitizeJewels([{ ...good, ss: undefined, size: { mm: [4, 2] } }])[0]).toMatchObject({ size: { mm: [2, 4] }, scale: 2 });
    expect(sanitizeJewels([{ ...good, size: { mm: [3] } }])[0]).toMatchObject({ size: { mm: [3] }, scale: 1.5 });
  });

  it("drops pieces with an unknown shape, size or reference", () => {
    expect(sanitizeJewels([{ ...good, look: { ...good.look, shape: "hexagon" } }])).toEqual([]);
    expect(sanitizeJewels([{ ...good, ss: 2.5 }])).toEqual([]);
    expect(sanitizeJewels([{ ...good, size: { mm: [40] } }])).toEqual([]);
    expect(sanitizeJewels([{ ...good, size: "2x4" }])).toEqual([]);
    expect(sanitizeJewels([{ ...good, productId: "<script>" }])).toEqual([]);
  });

  it("knows every stone size, between and beyond the table", () => {
    expect(stoneSizeMmApprox(2)).toBe(1.3);
    expect(stoneSizeMmApprox(11)).toBeCloseTo(2.95, 2);
    expect(stoneSizeMmApprox(1)).toBeGreaterThanOrEqual(0.8);
    expect(scaleForSize({ ss: 5 })).toBe(0.9);
  });
});
