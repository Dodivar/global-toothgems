import { describe, expect, it } from "vitest";
import type { StudioGem } from "./gemCatalog";
import { colorCounts, filterSections, librarySections, type LibraryLabels } from "./librarySections";

const gem = (key: string, name: string, shopShape: StudioGem["shopShape"], family: string | null = "swarovski"): StudioGem =>
  ({ key, slug: key, name: { fr: name, en: name }, image: "", family, shopShape, colorSlug: null, shape: "round", finishes: [], sizes: [{ ss: 5 }], currency: "EUR", offers: [] }) as StudioGem;

const labels: LibraryLabels = {
  shape: (s) => ({ heart: "Cœur", baguette: "Baguette", square: "Carré" })[s] ?? s,
  family: (f) => ({ "bijoux-or-18ct": "Bijoux or 18ct" })[f] ?? f,
  other: "Autres bijoux",
  gemName: (g) => g.name.fr,
};

const gems = [
  gem("h1", "Coeur - Péridot", "heart"),
  gem("b1", "Baguette - Fuchsia", "baguette"),
  gem("c1", "Cerises", null, "bijoux-or-18ct"),
  gem("b2", "Baguette - Violet", "baguette"),
  gem("x1", "Mystère", null, null),
  gem("s1", "Square - Rose clair", "square"),
];

describe("librarySections", () => {
  it("groups by cut, alphabetically, then the families of gems without a cut", () => {
    const sections = librarySections(gems, labels, "");
    expect(sections.map((s) => s.label)).toEqual(["Baguette", "Carré", "Cœur", "Autres bijoux", "Bijoux or 18ct"]);
    expect(sections[0].items.map((g) => g.key)).toEqual(["b1", "b2"]);
    expect(sections.find((s) => s.id === "family-other")?.items.map((g) => g.key)).toEqual(["x1"]);
  });

  it("searches gem names and section names, ignoring case, and drops empty sections", () => {
    expect(librarySections(gems, labels, "  VIOLET ").map((s) => [s.id, s.items.map((g) => g.key)])).toEqual([["shape-baguette", ["b2"]]]);
    expect(librarySections(gems, labels, "carré").map((s) => s.items.map((g) => g.key))).toEqual([["s1"]]);
    expect(librarySections(gems, labels, "nothing like it")).toEqual([]);
  });
});

describe("colour filter", () => {
  const coloured = [
    { ...gem("h1", "Coeur - Péridot", "heart"), colorSlug: "peridot" },
    { ...gem("h2", "Coeur - Rose", "heart"), colorSlug: "rose" },
    { ...gem("b1", "Baguette - Rose", "baguette"), colorSlug: "rose" },
    { ...gem("c1", "Cerises", null, "bijoux-or-18ct"), colorSlug: null },
  ] as StudioGem[];

  it("combines with the cut and the search", () => {
    const rose = librarySections(coloured, labels, "", "rose");
    expect(rose.map((s) => [s.id, s.items.map((g) => g.key)])).toEqual([
      ["shape-baguette", ["b1"]],
      ["shape-heart", ["h2"]],
    ]);
    expect(librarySections(coloured, labels, "baguette", "rose").map((s) => s.id)).toEqual(["shape-baguette"]);
    expect(librarySections(coloured, labels, "", "peridot").map((s) => s.id)).toEqual(["shape-heart"]);
  });

  it("counts the colours left by the search and the cut, in the shop's order", () => {
    const defs = [{ slug: "rose" }, { slug: "peridot" }, { slug: "unused" }];
    const all = librarySections(coloured, labels, "");
    expect(colorCounts(all, defs)).toEqual([
      { color: defs[0], count: 2 },
      { color: defs[1], count: 1 },
    ]);
    expect(colorCounts(filterSections(all, "shape-baguette"), defs)).toEqual([{ color: defs[0], count: 1 }]);
  });
});

describe("filterSections", () => {
  const sections = librarySections(gems, labels, "");
  it("keeps every section without a chip, the chosen one with it", () => {
    expect(filterSections(sections, null)).toHaveLength(5);
    expect(filterSections(sections, "shape-heart").map((s) => s.id)).toEqual(["shape-heart"]);
  });
  it("leaves nothing when the chosen section has no match for the search", () => {
    expect(filterSections(librarySections(gems, labels, "violet"), "shape-heart")).toEqual([]);
  });
});
