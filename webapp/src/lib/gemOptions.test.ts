import { describe, expect, it } from "vitest";
import {
  combinations,
  comboName,
  comboSkuSuffix,
  formatSsMm,
  gemAxes,
  isGemOptionSet,
  longestSkuSuffix,
  packAvailable,
  parseGemAttributes,
  pickGemVariant,
  sizeAvailable,
  type GemPickable,
} from "./gemOptions";

describe("parseGemAttributes", () => {
  it("reads pack and stone size, either one optional", () => {
    expect(parseGemAttributes({ pack: 50, ss: 6 })).toEqual({ pack: 50, ss: 6 });
    expect(parseGemAttributes({ pack: 20 })).toEqual({ pack: 20, ss: null });
    expect(parseGemAttributes({ ss: "8" })).toEqual({ pack: null, ss: 8 });
  });

  it("rejects any other kind of variant", () => {
    expect(parseGemAttributes({ colour: "saphir" })).toBeNull();
    expect(parseGemAttributes({ pack: 20, colour: "saphir" })).toBeNull();
    expect(parseGemAttributes({ quantity: 50 })).toBeNull();
    expect(parseGemAttributes({})).toBeNull();
    expect(parseGemAttributes({ pack: 2.5 })).toBeNull();
    expect(parseGemAttributes(null)).toBeNull();
  });
});

describe("combinations", () => {
  it("crosses packs and sizes, sorted numerically (SS6 before SS10)", () => {
    expect(combinations([50, 20], [10, 6])).toEqual([
      { pack: 20, ss: 6 },
      { pack: 20, ss: 10 },
      { pack: 50, ss: 6 },
      { pack: 50, ss: 10 },
    ]);
  });

  it("treats an empty axis as absent", () => {
    expect(combinations([20, 100], [])).toEqual([{ pack: 20, ss: null }, { pack: 100, ss: null }]);
    expect(combinations([], [6])).toEqual([{ pack: null, ss: 6 }]);
    expect(combinations([], [])).toEqual([]);
  });
});

describe("names and SKUs", () => {
  it("names options like the database does", () => {
    expect(comboName({ pack: 50, ss: 6 })).toEqual({ fr: "Pack de 50 · SS6", en: "Pack of 50 · SS6" });
    expect(comboName({ pack: null, ss: 6 })).toEqual({ fr: "SS6", en: "SS6" });
  });

  it("builds the SKU suffix and its longest length", () => {
    expect(comboSkuSuffix({ pack: 100, ss: 10 })).toBe("-P100-SS10");
    expect(comboSkuSuffix({ pack: 20, ss: null })).toBe("-P20");
    expect(longestSkuSuffix(combinations([20, 100], [6, 10]))).toBe(10);
  });

  it("formats an approximate diameter per language", () => {
    expect(formatSsMm(6, "fr")).toBe("≈ 2,0 mm");
    expect(formatSsMm(6, "en")).toBe("≈ 2.0 mm");
    expect(formatSsMm(42, "en")).toBe("");
  });
});

describe("storefront picker", () => {
  const variants: GemPickable[] = [
    { id: "20-6", pack: 20, ss: 6 },
    { id: "20-8", pack: 20, ss: 8, stock: "out" },
    { id: "50-6", pack: 50, ss: 6, stock: "out" },
    { id: "50-8", pack: 50, ss: 8 },
    { id: "100-6", pack: 100, ss: 6, stock: "out" },
  ];

  it("recognises a pack/SS variant set", () => {
    expect(isGemOptionSet(variants)).toBe(true);
    expect(isGemOptionSet([{ id: "x" }])).toBe(false);
    expect(isGemOptionSet([])).toBe(false);
    expect(gemAxes(variants)).toEqual({ packs: [20, 50, 100], sizes: [6, 8] });
  });

  it("keeps the other axis when that combination can be bought", () => {
    // On 20-8 (sold out), picking pack 50 keeps SS8: 50-8 is in stock.
    expect(pickGemVariant(variants, { pack: 50 }, variants[1])?.id).toBe("50-8");
  });

  it("moves the other axis to the nearest buyable option", () => {
    // Pack 50 while on SS6: 50-6 is sold out, so SS8.
    expect(pickGemVariant(variants, { pack: 50 }, variants[0])?.id).toBe("50-8");
    // SS8 while on pack 20: 20-8 is sold out, so pack 50.
    expect(pickGemVariant(variants, { ss: 8 }, variants[0])?.id).toBe("50-8");
  });

  it("still selects something when everything on that axis is sold out", () => {
    expect(pickGemVariant(variants, { pack: 100 }, variants[0])?.id).toBe("100-6");
  });

  it("tells which packs and sizes can be bought", () => {
    expect(packAvailable(variants, 20)).toBe(true);
    expect(packAvailable(variants, 100)).toBe(false);
    expect(sizeAvailable(variants, 8, 20)).toBe(false);
    expect(sizeAvailable(variants, 8, 50)).toBe(true);
  });
});
