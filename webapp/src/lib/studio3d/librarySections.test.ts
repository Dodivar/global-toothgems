import { describe, expect, it } from "vitest";
import type { StudioGem } from "./gemCatalog";
import { filterSections, librarySections, type LibraryLabels } from "./librarySections";

const gem = (key: string, name: string, shopShape: StudioGem["shopShape"], family: string | null = "swarovski"): StudioGem =>
  ({ key, slug: key, name: { fr: name, en: name }, image: "", family, shopShape, shape: "round", finishes: [], sizes: [5], currency: "EUR" }) as StudioGem;

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
