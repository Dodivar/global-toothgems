import { describe, expect, it } from "vitest";
import { blankCustomVariant, type CustomVariant, type ProductImage, type VariantOption } from "../data/adminCatalog";
import {
  addCombination,
  allCombinations,
  combinationName,
  missingCombinations,
  optionFromVariants,
  optionsProblem,
  pruneMediaLinks,
  syncVariants,
} from "./variantOptions";

function ids(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const colour: VariantOption = {
  id: "o-colour",
  name: { fr: "Couleur", en: "Colour" },
  values: [
    { id: "x-silver", name: { fr: "Argent", en: "Silver" }, swatch: "#d9d9d9" },
    { id: "x-black", name: { fr: "Noir", en: "Black" }, swatch: "#0d0d0d" },
  ],
};
const plug: VariantOption = {
  id: "o-plug",
  name: { fr: "Prise", en: "Plug" },
  values: [
    { id: "x-eu", name: { fr: "Prise EU", en: "EU plug" } },
    { id: "x-us", name: { fr: "Prise US", en: "" } },
  ],
};

const variant = (id: string, optionValues: string[] | undefined, stock: number, extra: Partial<CustomVariant> = {}): CustomVariant => ({
  ...blankCustomVariant(id),
  ...(optionValues ? { optionValues } : {}),
  stock,
  ...extra,
});

describe("combinations", () => {
  it("lists every combination in option then value order", () => {
    expect(allCombinations([colour, plug])).toEqual([
      ["x-silver", "x-eu"],
      ["x-silver", "x-us"],
      ["x-black", "x-eu"],
      ["x-black", "x-us"],
    ]);
    expect(allCombinations([])).toEqual([]);
  });

  it("names a combination like the database, English falling back to French", () => {
    expect(combinationName([colour, plug], ["x-black", "x-us"])).toEqual({ fr: "Noir · Prise US", en: "Black · Prise US" });
  });
});

describe("optionFromVariants", () => {
  it("turns plain colour variants into a first option, keeping ids, stock and photos", () => {
    const variants = [
      variant("v-silver", undefined, 15, { name: { fr: "Argent", en: "Silver" }, swatch: "#d9d9d9" }),
      variant("v-black", undefined, 12, { name: { fr: "Noir", en: "Black" }, swatch: "#0d0d0d" }),
    ];
    const media: ProductImage[] = [
      { id: "m1", src: "1.jpg", alt: { fr: "", en: "" }, variantId: "v-silver" },
      { id: "m2", src: "2.jpg", alt: { fr: "", en: "" } },
    ];
    const converted = optionFromVariants(variants, media, { fr: "Couleur", en: "Colour" }, ids("n"));
    expect(converted.option.values).toEqual([
      { id: "n-1", name: { fr: "Argent", en: "Silver" }, swatch: "#d9d9d9" },
      { id: "n-2", name: { fr: "Noir", en: "Black" }, swatch: "#0d0d0d" },
    ]);
    expect(converted.variants.map((v) => [v.id, v.optionValues, v.stock])).toEqual([
      ["v-silver", ["n-1"], 15],
      ["v-black", ["n-2"], 12],
    ]);
    expect(converted.media[0]).toEqual({ id: "m1", src: "1.jpg", alt: { fr: "", en: "" }, optionValueId: "n-1" });
    expect(converted.media[1]).toBe(media[1]);
  });
});

describe("syncVariants", () => {
  const silver = variant("v-silver", ["x-silver"], 15);
  const black = variant("v-black", ["x-black"], 12);

  it("gives existing variants the first value of a new option and creates the other combinations", () => {
    const next = syncVariants([colour], [colour, plug], [silver, black], ids("new"));
    expect(next.map((v) => [v.id, v.optionValues, v.stock, v.name.fr, v.swatch])).toEqual([
      ["v-silver", ["x-silver", "x-eu"], 15, "Argent · Prise EU", "#d9d9d9"],
      ["new-1", ["x-silver", "x-us"], 0, "Argent · Prise US", "#d9d9d9"],
      ["v-black", ["x-black", "x-eu"], 12, "Noir · Prise EU", "#0d0d0d"],
      ["new-2", ["x-black", "x-us"], 0, "Noir · Prise US", "#0d0d0d"],
    ]);
  });

  it("removes the combinations of a removed value and adds those of a new one", () => {
    const four = syncVariants([colour], [colour, plug], [silver, black], ids("new"));
    const gold = { id: "x-gold", name: { fr: "Or", en: "Gold" } };
    const next = syncVariants(
      [colour, plug],
      [{ ...colour, values: [colour.values[0], gold] }, plug],
      four,
      ids("more"),
    );
    expect(next.map((v) => v.optionValues)).toEqual([
      ["x-silver", "x-eu"],
      ["x-silver", "x-us"],
      ["x-gold", "x-eu"],
      ["x-gold", "x-us"],
    ]);
    expect(next.find((v) => v.optionValues?.[0] === "x-gold")?.swatch).toBeUndefined();
  });

  it("keeps the first of two combinations an option removal merges, and plain names with no option left", () => {
    const four = syncVariants([colour], [colour, plug], [silver, black], ids("new"));
    const merged = syncVariants([colour, plug], [colour], four, ids("x"));
    expect(merged.map((v) => [v.id, v.name.fr])).toEqual([
      ["v-silver", "Argent"],
      ["v-black", "Noir"],
    ]);
    const plain = syncVariants([colour, plug], [], four, ids("x"));
    expect(plain.map((v) => [v.name.fr, v.optionValues])).toEqual([
      ["Argent · Prise EU", undefined],
      ["Argent · Prise US", undefined],
      ["Noir · Prise EU", undefined],
      ["Noir · Prise US", undefined],
    ]);
  });

  it("renames every combination when a value is renamed, ids untouched", () => {
    const four = syncVariants([colour], [colour, plug], [silver, black], ids("new"));
    const renamed = { ...plug, values: [{ ...plug.values[0], name: { fr: "Europe", en: "Europe" } }, plug.values[1]] };
    const next = syncVariants([colour, plug], [colour, renamed], four, ids("x"));
    expect(next.map((v) => v.id)).toEqual(four.map((v) => v.id));
    expect(next[0].name).toEqual({ fr: "Argent · Europe", en: "Silver · Europe" });
  });

  it("offers a combination again after it was taken out", () => {
    const four = syncVariants([colour], [colour, plug], [silver, black], ids("new"));
    const three = four.filter((v) => v.id !== "new-2");
    expect(missingCombinations([colour, plug], three)).toEqual([["x-black", "x-us"]]);
    const back = addCombination([colour, plug], three, ["x-black", "x-us"], ids("back"));
    expect(back.map((v) => v.id)).toEqual(["v-silver", "new-1", "v-black", "back-1"]);
    expect(missingCombinations([colour, plug], back)).toEqual([]);
  });
});

describe("pruneMediaLinks", () => {
  it("drops links to values and variants that are gone", () => {
    const media: ProductImage[] = [
      { id: "m1", src: "1", alt: { fr: "", en: "" }, optionValueId: "x-gone" },
      { id: "m2", src: "2", alt: { fr: "", en: "" }, optionValueId: "x-silver" },
      { id: "m3", src: "3", alt: { fr: "", en: "" }, variantId: "v-gone" },
    ];
    expect(pruneMediaLinks(media, [colour], []).map((m) => [m.optionValueId, m.variantId])).toEqual([
      [undefined, undefined],
      ["x-silver", undefined],
      [undefined, undefined],
    ]);
  });
});

describe("optionsProblem", () => {
  it("wants every option and value named in both languages, once", () => {
    expect(optionsProblem([colour])).toBeNull();
    expect(optionsProblem([plug])).toBe("optionsNames");
    expect(optionsProblem([{ ...colour, values: [] }])).toBe("optionsNames");
    expect(optionsProblem([colour, { ...colour, id: "o-2", values: [{ id: "y", name: { fr: "A", en: "A" } }] }])).toBe("optionsDuplicate");
    expect(
      optionsProblem([{ ...colour, values: [colour.values[0], { id: "x-2", name: { fr: " argent ", en: "Silver 2" } }] }]),
    ).toBe("optionsDuplicate");
  });
});
