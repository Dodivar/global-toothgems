import { describe, expect, it } from "vitest";
import {
  combinations,
  comboKey,
  comboName,
  comboSkuSuffix,
  compareSizes,
  formatSize,
  formatSizeDetail,
  gemAxes,
  isGemOptionSet,
  isValidPack,
  longestSkuSuffix,
  packAvailable,
  parseGemAttributes,
  parsePackCount,
  parseSizeInput,
  pickGemVariant,
  sanitizeSize,
  sizeAvailable,
  sizeLongestMm,
  sizeRangeLabel,
  type GemPickable,
} from "./gemOptions";

describe("parseGemAttributes", () => {
  it("reads pack and size, either one optional", () => {
    expect(parseGemAttributes({ pack: 50, ss: 6 })).toEqual({ pack: 50, size: { ss: 6 } });
    expect(parseGemAttributes({ pack: 20 })).toEqual({ pack: 20, size: null });
    expect(parseGemAttributes({ ss: "8" })).toEqual({ pack: null, size: { ss: 8 } });
    expect(parseGemAttributes({ pack: 10, mm: [2, 4] })).toEqual({ pack: 10, size: { mm: [2, 4] } });
    expect(parseGemAttributes({ mm: [3] })).toEqual({ pack: null, size: { mm: [3] } });
  });

  it("rejects any other kind of variant", () => {
    expect(parseGemAttributes({ colour: "saphir" })).toBeNull();
    expect(parseGemAttributes({ pack: 20, colour: "saphir" })).toBeNull();
    expect(parseGemAttributes({ quantity: 50 })).toBeNull();
    expect(parseGemAttributes({})).toBeNull();
    expect(parseGemAttributes({ pack: 2.5 })).toBeNull();
    expect(parseGemAttributes(null)).toBeNull();
    // A free-text size of the generic variant list stays a generic variant.
    expect(parseGemAttributes({ size: "2mm" })).toBeNull();
    expect(parseGemAttributes({ ss: 6, mm: [2] })).toBeNull();
    expect(parseGemAttributes({ mm: [2, 4, 6] })).toBeNull();
    expect(parseGemAttributes({ mm: [0.2] })).toBeNull();
  });
});

describe("free pack sizes", () => {
  it("reads a typed pack within 1..10 000 stones", () => {
    expect(parsePackCount("30")).toBe(30);
    expect(parsePackCount(" 1 ")).toBe(1);
    expect(parsePackCount("10000")).toBe(10000);
  });

  it("refuses anything else", () => {
    for (const input of ["", "0", "10001", "2.5", "-5", "1e3", "abc"]) {
      expect(parsePackCount(input)).toBeNull();
    }
    expect(isValidPack(35)).toBe(true);
    expect(isValidPack(0)).toBe(false);
    expect(isValidPack(2.5)).toBe(false);
    expect(isValidPack(10001)).toBe(false);
  });

  it("names and suffixes any pack like the database does", () => {
    expect(combinations([250, 35], [{ ss: 6 }])).toEqual([
      { pack: 35, size: { ss: 6 } },
      { pack: 250, size: { ss: 6 } },
    ]);
    expect(comboName({ pack: 35, size: { ss: 6 } })).toEqual({ fr: "Pack de 35 · SS6", en: "Pack of 35 · SS6" });
    expect(comboSkuSuffix({ pack: 10000, size: { ss: 60 } })).toBe("-P10000-SS60");
  });
});

describe("free millimetre sizes", () => {
  it("reads what an administrator types", () => {
    expect(parseSizeInput("2x4", "mm")).toEqual({ mm: [2, 4] });
    expect(parseSizeInput("4 × 2 mm", "mm")).toEqual({ mm: [2, 4] });
    expect(parseSizeInput("2,5*5", "mm")).toEqual({ mm: [2.5, 5] });
    expect(parseSizeInput(" 3 mm ", "mm")).toEqual({ mm: [3] });
    expect(parseSizeInput("1.8X3.6MM", "mm")).toEqual({ mm: [1.8, 3.6] });
  });

  it("refuses what is not one or two dimensions within bounds, to a tenth", () => {
    for (const input of ["", "abc", "0.4", "31", "2.55", "2x4x6", "SS6", "-2", "2x"]) {
      expect(parseSizeInput(input, "mm")).toBeNull();
    }
  });

  it("reads SS gauges in SS mode only", () => {
    expect(parseSizeInput("SS6", "ss")).toEqual({ ss: 6 });
    expect(parseSizeInput("12", "ss")).toEqual({ ss: 12 });
    expect(parseSizeInput("2x4", "ss")).toBeNull();
    expect(parseSizeInput("SS61", "ss")).toBeNull();
  });

  it("names, suffixes and measures them like the database and the Studio do", () => {
    expect(comboName({ pack: 10, size: { mm: [2.5, 5] } })).toEqual({ fr: "Pack de 10 · 2,5 × 5 mm", en: "Pack of 10 · 2.5 × 5 mm" });
    expect(comboName({ pack: null, size: { mm: [3] } })).toEqual({ fr: "3 mm", en: "3 mm" });
    expect(comboSkuSuffix({ pack: 10, size: { mm: [2.5, 5] } })).toBe("-P10-2P5X5MM");
    expect(comboKey({ pack: 10, size: { mm: [2, 4] } })).toBe("10:mm2x4");
    expect(sizeLongestMm({ mm: [2, 4] })).toBe(4);
    expect(sizeLongestMm({ ss: 6 })).toBe(2);
    expect(formatSizeDetail({ mm: [2, 4] }, "fr")).toBe("");
  });

  it("reads back only sizes the editor could have written", () => {
    expect(sanitizeSize({ mm: [4, 2] })).toEqual({ mm: [2, 4] });
    expect(sanitizeSize({ ss: 6 })).toEqual({ ss: 6 });
    expect(sanitizeSize({ ss: 6.5 })).toBeNull();
    expect(sanitizeSize({ mm: "2x4" })).toBeNull();
    expect(sanitizeSize(6)).toBeNull();
  });

  it("orders sizes by their longest side, whichever way they are written", () => {
    const sorted = [{ mm: [3, 6] }, { ss: 6 }, { mm: [2, 4] }, { mm: [4] }].sort(compareSizes);
    expect(sorted).toEqual([{ ss: 6 }, { mm: [2, 4] }, { mm: [4] }, { mm: [3, 6] }]);
  });
});

describe("combinations", () => {
  it("crosses packs and sizes, smallest first (SS6 before SS10)", () => {
    expect(combinations([50, 20], [{ ss: 10 }, { ss: 6 }])).toEqual([
      { pack: 20, size: { ss: 6 } },
      { pack: 20, size: { ss: 10 } },
      { pack: 50, size: { ss: 6 } },
      { pack: 50, size: { ss: 10 } },
    ]);
  });

  it("treats an empty axis as absent", () => {
    expect(combinations([20, 100], [])).toEqual([{ pack: 20, size: null }, { pack: 100, size: null }]);
    expect(combinations([], [{ ss: 6 }])).toEqual([{ pack: null, size: { ss: 6 } }]);
    expect(combinations([], [])).toEqual([]);
  });
});

describe("names and SKUs", () => {
  it("names options like the database does", () => {
    expect(comboName({ pack: 50, size: { ss: 6 } })).toEqual({ fr: "Pack de 50 · SS6", en: "Pack of 50 · SS6" });
    expect(comboName({ pack: null, size: { ss: 6 } })).toEqual({ fr: "SS6", en: "SS6" });
  });

  it("builds the SKU suffix and its longest length", () => {
    expect(comboSkuSuffix({ pack: 100, size: { ss: 10 } })).toBe("-P100-SS10");
    expect(comboSkuSuffix({ pack: 20, size: null })).toBe("-P20");
    expect(longestSkuSuffix(combinations([20, 100], [{ ss: 6 }, { ss: 10 }]))).toBe(10);
  });

  it("formats an approximate diameter per language", () => {
    expect(formatSizeDetail({ ss: 6 }, "fr")).toBe("≈ 2,0 mm");
    expect(formatSizeDetail({ ss: 6 }, "en")).toBe("≈ 2.0 mm");
    expect(formatSizeDetail({ ss: 42 }, "en")).toBe("");
    expect(formatSize({ ss: 6 }, "fr")).toBe("SS6");
  });
});

describe("storefront picker", () => {
  const variants: GemPickable[] = [
    { id: "20-6", pack: 20, size: { ss: 6 } },
    { id: "20-8", pack: 20, size: { ss: 8 }, stock: "out" },
    { id: "50-6", pack: 50, size: { ss: 6 }, stock: "out" },
    { id: "50-8", pack: 50, size: { ss: 8 } },
    { id: "100-6", pack: 100, size: { ss: 6 }, stock: "out" },
  ];

  it("recognises a pack/size variant set", () => {
    expect(isGemOptionSet(variants)).toBe(true);
    expect(isGemOptionSet([{ id: "x" }])).toBe(false);
    expect(isGemOptionSet([])).toBe(false);
    expect(gemAxes(variants)).toEqual({ packs: [20, 50, 100], sizes: [{ ss: 6 }, { ss: 8 }] });
  });

  it("keeps the other axis when that combination can be bought", () => {
    // On 20-8 (sold out), picking pack 50 keeps SS8: 50-8 is in stock.
    expect(pickGemVariant(variants, { pack: 50 }, variants[1])?.id).toBe("50-8");
  });

  it("moves the other axis to the nearest buyable option", () => {
    // Pack 50 while on SS6: 50-6 is sold out, so SS8.
    expect(pickGemVariant(variants, { pack: 50 }, variants[0])?.id).toBe("50-8");
    // SS8 while on pack 20: 20-8 is sold out, so pack 50.
    expect(pickGemVariant(variants, { size: { ss: 8 } }, variants[0])?.id).toBe("50-8");
  });

  it("still selects something when everything on that axis is sold out", () => {
    expect(pickGemVariant(variants, { pack: 100 }, variants[0])?.id).toBe("100-6");
  });

  it("tells which packs and sizes can be bought", () => {
    expect(packAvailable(variants, 20)).toBe(true);
    expect(packAvailable(variants, 100)).toBe(false);
    expect(sizeAvailable(variants, { ss: 8 }, 20)).toBe(false);
    expect(sizeAvailable(variants, { ss: 8 }, 50)).toBe(true);
  });

  it("works the same on millimetre sizes", () => {
    const baguettes: GemPickable[] = [
      { id: "10-2x4", pack: 10, size: { mm: [2, 4] } },
      { id: "10-3x6", pack: 10, size: { mm: [3, 6] }, stock: "out" },
      { id: "25-3x6", pack: 25, size: { mm: [3, 6] } },
    ];
    expect(gemAxes(baguettes).sizes).toEqual([{ mm: [2, 4] }, { mm: [3, 6] }]);
    expect(pickGemVariant(baguettes, { size: { mm: [3, 6] } }, baguettes[0])?.id).toBe("25-3x6");
    expect(sizeRangeLabel(gemAxes(baguettes).sizes, "fr", ({ from, to }) => `${from} à ${to}`)).toBe("2 × 4 mm à 3 × 6 mm");
    expect(sizeRangeLabel([{ ss: 5 }], "fr", () => "")).toBe("SS5");
  });
});
