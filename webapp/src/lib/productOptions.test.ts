import { describe, expect, it } from "vitest";
import type { ProductOption, ProductVariant } from "../data/products";
import { cardVariants, hasOptionPicker, optionValueState, pickOptionVariant } from "./productOptions";

const options: ProductOption[] = [
  {
    id: "o-colour",
    name: { fr: "Couleur", en: "Colour" },
    values: [
      { id: "silver", name: { fr: "Argent", en: "Silver" }, swatch: "#d9d9d9" },
      { id: "black", name: { fr: "Noir", en: "Black" }, swatch: "#0d0d0d" },
    ],
  },
  {
    id: "o-plug",
    name: { fr: "Prise", en: "Plug" },
    values: [
      { id: "eu", name: { fr: "Prise EU", en: "EU plug" } },
      { id: "us", name: { fr: "Prise US", en: "US plug" } },
    ],
  },
];

const v = (id: string, optionValues: string[], stock?: "low" | "out", price = 89.9): ProductVariant => ({
  id,
  name: { fr: id, en: id },
  price,
  optionValues,
  ...(stock ? { stock } : {}),
});

// Silver US is sold out; black US does not exist.
const variants = [v("silver-eu", ["silver", "eu"]), v("silver-us", ["silver", "us"], "out"), v("black-eu", ["black", "eu"], "low")];

describe("hasOptionPicker", () => {
  it("needs every variant to have a value of each option", () => {
    expect(hasOptionPicker(options, variants)).toBe(true);
    expect(hasOptionPicker(options, [...variants, { id: "x", name: { fr: "", en: "" }, price: 1 }])).toBe(false);
    expect(hasOptionPicker(undefined, variants)).toBe(false);
    expect(hasOptionPicker(options, [])).toBe(false);
  });
});

describe("pickOptionVariant", () => {
  it("keeps the other choices when that combination can be bought", () => {
    expect(pickOptionVariant(variants, 0, "black", variants[0])?.id).toBe("black-eu");
  });

  it("moves the other choices to a combination that can be bought", () => {
    // Black with the US plug does not exist: black EU.
    expect(pickOptionVariant(variants, 0, "black", { ...variants[1], stock: undefined })?.id).toBe("black-eu");
    // The US plug in silver is sold out, in black it does not exist: the sold-out one, nothing better.
    expect(pickOptionVariant(variants, 1, "us", variants[0])?.id).toBe("silver-us");
  });
});

describe("optionValueState", () => {
  it("tells available, available with other choices, and sold out apart", () => {
    expect(optionValueState(variants, 0, "black", variants[0])).toBe("available");
    expect(optionValueState(variants, 0, "black", variants[1])).toBe("elsewhere");
    expect(optionValueState(variants, 1, "us", variants[0])).toBe("out");
  });
});

describe("cardVariants", () => {
  it("summarises a colour option once per colour", () => {
    expect(cardVariants({ variants, options })).toEqual([
      { id: "silver", name: { fr: "Argent", en: "Silver" }, price: 89.9, swatch: "#d9d9d9" },
      { id: "black", name: { fr: "Noir", en: "Black" }, price: 89.9, swatch: "#0d0d0d" },
    ]);
    const allOut = variants.map((variant) => (variant.optionValues?.[0] === "black" ? { ...variant, stock: "out" as const } : variant));
    expect(cardVariants({ variants: allOut, options })?.[1].stock).toBe("out");
  });

  it("leaves plain variants as they are", () => {
    const plain = [{ id: "a", name: { fr: "A", en: "A" }, price: 1 }];
    expect(cardVariants({ variants: plain })).toBe(plain);
  });
});
