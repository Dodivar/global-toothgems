import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  catalogFacets,
  DEFAULT_CATALOG_FILTERS,
  featuredCourse,
  filterCatalog,
  isNewCourse,
  orderForPathway,
  suitsPathway,
} from "./catalog";
import type { PublicCourse } from "./publicCourse";

function course(id: string, overrides: Partial<PublicCourse> = {}): PublicCourse {
  const price = { minor: 30000, currency: "EUR" };
  return {
    id,
    title: { fr: `Formation ${id}`, en: `Course ${id}` },
    summary: null,
    description: null,
    level: "beginner",
    category: "technique",
    publishedAt: "2026-06-01T09:00:00Z",
    minutes: 90,
    objectives: [],
    requirements: [],
    minScore: 75,
    issuesCertificate: true,
    price,
    currentPrice: price,
    promotionEndsAt: null,
    cover: null,
    modules: [],
    enrolment: "sale",
    ...overrides,
  };
}

const base = course("base", { title: { fr: "Pose essentielle", en: "Essential placement" }, summary: { fr: "Hygiène et préparation", en: "Hygiene and prep" } });
const pro = course("pro", { level: "all", category: "business", publishedAt: "2026-09-20T09:00:00Z", currentPrice: { minor: 19900, currency: "EUR" }, minutes: 0 });
const art = course("art", { level: "advanced", category: "creative", publishedAt: "2026-08-01T09:00:00Z", currentPrice: { minor: 45000, currency: "EUR" }, minutes: 45 });
const all = [base, pro, art];
const ids = (courses: PublicCourse[]) => courses.map((c) => c.id);

describe("academy catalogue", () => {
  it("keeps the curated order by default", () => {
    expect(ids(filterCatalog(all, DEFAULT_CATALOG_FILTERS, "fr"))).toEqual(["base", "pro", "art"]);
  });

  it("searches titles and summaries in both languages, ignoring accents", () => {
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, search: "hygiene" }, "fr"))).toEqual(["base"]);
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, search: "ESSENTIAL" }, "fr"))).toEqual(["base"]);
  });

  it("filters by theme and level", () => {
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, category: "creative" }, "fr"))).toEqual(["art"]);
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, level: "all" }, "fr"))).toEqual(["pro"]);
    expect(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, level: "intermediate" }, "fr")).toEqual([]);
  });

  it("sorts by newest, price and length, unknown lengths last", () => {
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, sort: "newest" }, "fr"))).toEqual(["pro", "art", "base"]);
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, sort: "price-asc" }, "fr"))).toEqual(["pro", "base", "art"]);
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, sort: "price-desc" }, "fr"))).toEqual(["art", "base", "pro"]);
    expect(ids(filterCatalog(all, { ...DEFAULT_CATALOG_FILTERS, sort: "duration-asc" }, "fr"))).toEqual(["art", "base", "pro"]);
  });

  it("never reorders the caller's array", () => {
    const input = [...all];
    filterCatalog(input, { ...DEFAULT_CATALOG_FILTERS, sort: "newest" }, "fr");
    expect(ids(input)).toEqual(["base", "pro", "art"]);
  });

  it("counts the filters that narrow the list, not the sort", () => {
    expect(activeFilterCount(DEFAULT_CATALOG_FILTERS)).toBe(0);
    expect(activeFilterCount({ search: " x ", category: "hygiene", level: "all", sort: "newest" })).toBe(3);
    expect(activeFilterCount({ ...DEFAULT_CATALOG_FILTERS, search: "   " })).toBe(0);
  });

  it("offers only the themes and levels in use, in canonical order", () => {
    expect(catalogFacets(all)).toEqual({ categories: ["technique", "business", "creative"], levels: ["beginner", "advanced", "all"] });
    expect(catalogFacets([])).toEqual({ categories: [], levels: [] });
  });

  it("features the most recently published course", () => {
    expect(featuredCourse(all)?.id).toBe("pro");
    expect(featuredCourse([course("a", { publishedAt: null }), course("b", { publishedAt: null })])?.id).toBe("a");
    expect(featuredCourse([])).toBeUndefined();
  });

  it("labels a course new for sixty days after it goes online", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(isNewCourse(pro, now)).toBe(true);
    expect(isNewCourse({ publishedAt: "2026-08-04T12:00:00Z" }, now)).toBe(true);
    expect(isNewCourse({ publishedAt: "2026-08-02T12:00:00Z" }, now)).toBe(false);
    expect(isNewCourse({ publishedAt: null }, now)).toBe(false);
    expect(isNewCourse({ publishedAt: "2026-12-01T00:00:00Z" }, now)).toBe(false);
  });
});

describe("starting points", () => {
  it("matches each starting point to the courses authored for it", () => {
    expect(suitsPathway(base, "new")).toBe(true);
    expect(suitsPathway(pro, "new")).toBe(true);
    expect(suitsPathway(pro, "improve")).toBe(true);
    expect(suitsPathway(base, "improve")).toBe(false);
    expect(suitsPathway(pro, "professional")).toBe(true);
    expect(suitsPathway(art, "refine")).toBe(true);
    expect(suitsPathway(course("x", { level: "intermediate", category: "creative" }), "refine")).toBe(true);
  });

  it("puts the matching courses first and hides none", () => {
    expect(ids(orderForPathway(all, "refine"))).toEqual(["art", "base", "pro"]);
    expect(ids(orderForPathway(all, "improve"))).toEqual(["pro", "base", "art"]);
    expect(ids(orderForPathway(all, null))).toEqual(["base", "pro", "art"]);
  });
});
