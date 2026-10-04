import { describe, expect, it } from "vitest";
import { PRODUCTS, type Product } from "../data/products";
import { FALLBACK_TAXONOMY } from "../data/taxonomy";
import { FIXTURE_COURSES } from "./academy/fixtures";
import { normalizeQuery, scoreMatch, SEARCH_LIMITS, searchCourses, searchPages, searchProducts } from "./siteSearch";

const product = (id: string, name: string, overrides: Partial<Product> = {}): Product => ({
  id,
  name: { fr: name, en: name },
  subtitle: { fr: "", en: "" },
  price: 10,
  rating: 0,
  reviewCount: 0,
  image: "/x.jpg",
  cat: "gems",
  family: null,
  material: "",
  ...overrides,
});

describe("normalizeQuery", () => {
  it("ignores case, accents, ligatures and punctuation", () => {
    expect(normalizeQuery("  Étoile  CŒUR ")).toBe("etoile coeur");
    expect(normalizeQuery("2.0mm anti-reflet")).toBe("2 0mm anti reflet");
  });
});

describe("scoreMatch", () => {
  it("needs every word somewhere", () => {
    expect(scoreMatch("aurora heart", ["Aurora Heart"], [])).toBeGreaterThan(0);
    expect(scoreMatch("aurora star", ["Aurora Heart"], [])).toBe(0);
  });

  it("matches part of a name but only word starts in longer texts", () => {
    expect(scoreMatch("solit", ["Crystal Solitaire"], [])).toBeGreaterThan(0);
    expect(scoreMatch("or", ["Kit"], ["Parfait pour débuter"])).toBe(0);
    expect(scoreMatch("debut", ["Kit"], ["Parfait pour débuter"])).toBeGreaterThan(0);
  });

  it("ranks an exact name above a prefix, a prefix above a description match", () => {
    const exact = scoreMatch("aurora", ["Aurora"], []);
    const prefix = scoreMatch("aurora", ["Aurora Heart"], []);
    const inside = scoreMatch("aurora", ["Heart"], ["Aurora collection"]);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(0);
  });

  it("returns 0 for an empty query", () => {
    expect(scoreMatch("   ", ["Anything"], [])).toBe(0);
  });
});

describe("searchProducts", () => {
  it("finds a product by its name in either language, case-insensitively", () => {
    const hits = searchProducts(PRODUCTS, FALLBACK_TAXONOMY, "CRYSTAL SOLI", "fr");
    expect(hits[0]?.key).toBe("solitaire");
    expect(hits[0]?.title).toBe("Solitaire Cristal");
    expect(hits[0]?.to).toBe("/boutique/solitaire");
  });

  it("finds a product by its brand (the family)", () => {
    const products = [product("a", "Diamond", { family: "swarovski" }), product("b", "Ruby", { family: "preciosa" })];
    expect(searchProducts(products, FALLBACK_TAXONOMY, "swarov", "fr").map((h) => h.key)).toEqual(["a"]);
  });

  it("puts the name match first and caps the list", () => {
    const products = Array.from({ length: 12 }, (_, i) => product(`p${i}`, `Gem ${i}`, { subtitle: { fr: "Star", en: "Star" } }));
    products.push(product("star", "Star"));
    const hits = searchProducts(products, FALLBACK_TAXONOMY, "star", "en");
    expect(hits).toHaveLength(SEARCH_LIMITS.product);
    expect(hits[0]?.key).toBe("star");
  });

  it("returns nothing for an unknown word", () => {
    expect(searchProducts(PRODUCTS, FALLBACK_TAXONOMY, "zzqx", "fr")).toEqual([]);
  });
});

describe("searchCourses", () => {
  it("finds a published course and links to its page in the current language", () => {
    const course = FIXTURE_COURSES[0]!;
    const word = course.title.en.split(" ")[0]!;
    const hits = searchCourses(FIXTURE_COURSES, word, "en", () => "");
    expect(hits.some((hit) => hit.key === course.id)).toBe(true);
    expect(hits.every((hit) => hit.to.startsWith("/academy/formation/"))).toBe(true);
  });

  it("searches the theme label", () => {
    const hits = searchCourses(FIXTURE_COURSES.slice(0, 1), "qwertytheme", "fr", () => "Qwertytheme");
    expect(hits).toHaveLength(1);
  });
});

describe("searchPages", () => {
  it("finds the legal and help pages by their heading, in both languages", () => {
    expect(searchPages("mentions", "fr")[0]?.to).toBe("/mentions-legales");
    expect(searchPages("legal notice", "fr")[0]?.to).toBe("/mentions-legales");
    expect(searchPages("livraison", "fr").map((h) => h.to)).toContain("/livraison");
    expect(searchPages("contact", "en")[0]?.to).toBe("/contact");
  });

  it("titles the page in the reading language", () => {
    expect(searchPages("privacy", "en")[0]?.title.toLowerCase()).toContain("privacy");
    expect(searchPages("privacy", "fr")[0]?.title.toLowerCase()).toContain("confidentialit");
  });
});
