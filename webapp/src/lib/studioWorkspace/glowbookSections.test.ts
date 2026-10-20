import { describe, expect, it } from "vitest";
import {
  certifiedTitles,
  GLOWBOOK_MAX_SECTIONS,
  moveSection,
  normalizeSectionName,
  sectionCounts,
  sortSections,
  toCertifiedCourses,
  toGlowbookSection,
  toPublicSections,
  validateSectionName,
  visibleCreations,
  type GlowbookSection,
} from "./glowbookSections";

const sec = (id: string, name: string, position: number): GlowbookSection => ({ id, name, position });
const sections = [sec("b", "Minimaliste", 1), sec("a", "Mariage", 0), sec("c", "Fêtes", 2)];

describe("section names (mirror studio_save_showcase_section)", () => {
  it("normalises like the database", () => {
    expect(normalizeSectionName("  Mariage   de   rêve ")).toBe("Mariage de rêve");
  });
  it("refuses empty, too long, duplicate (any case) names and a 13th section", () => {
    expect(validateSectionName("   ", sections)).toBe("required");
    expect(validateSectionName("x".repeat(41), sections)).toBe("length");
    expect(validateSectionName(" mariage ", sections)).toBe("taken");
    expect(validateSectionName("Bohème", sections)).toBeNull();
    const full = Array.from({ length: GLOWBOOK_MAX_SECTIONS }, (_, i) => sec(`s${i}`, `S${i}`, i));
    expect(validateSectionName("One more", full)).toBe("full");
  });
  it("lets a section keep its own name when renamed, and renaming never counts as adding", () => {
    expect(validateSectionName("MARIAGE", sections, "a")).toBeNull();
    expect(validateSectionName("Mariage", sections, "b")).toBe("taken");
    const full = Array.from({ length: GLOWBOOK_MAX_SECTIONS }, (_, i) => sec(`s${i}`, `S${i}`, i));
    expect(validateSectionName("Renamed", full, "s0")).toBeNull();
  });
});

describe("order", () => {
  it("sorts by position and moves within bounds", () => {
    expect(sortSections(sections).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(moveSection(sections, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveSection(sections, "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveSection(sections, "zz", 1)).toEqual(["a", "b", "c"]);
  });
  it("maps a row and counts creations per section", () => {
    expect(
      toGlowbookSection({ id: "a", name: "Mariage", position: 0, user_id: "u", created_at: "t", updated_at: "t" }),
    ).toEqual({ id: "a", name: "Mariage", position: 0 });
    expect([...sectionCounts([{ sectionId: "a" }, { sectionId: "a" }, { sectionId: null }, { sectionId: "b" }])]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});

describe("visibleCreations (public page)", () => {
  const items = [
    { id: "1", sectionId: "a" },
    { id: "2", sectionId: null },
    { id: "3", sectionId: "b" },
    { id: "4", sectionId: "a" },
  ];
  const pub = [{ id: "a" }, { id: "b" }];
  it("shows everything under 'all', the spotlight first", () => {
    const v = visibleCreations(items, pub, "3", "all");
    expect(v.featured?.id).toBe("3");
    expect(v.others.map((i) => i.id)).toEqual(["1", "2", "4"]);
    expect(visibleCreations(items, pub, null, "all").others).toHaveLength(4);
  });
  it("shows one section's creations, without the spotlight", () => {
    const v = visibleCreations(items, pub, "3", "a");
    expect(v.featured).toBeUndefined();
    expect(v.others.map((i) => i.id)).toEqual(["1", "4"]);
  });
  it("falls back to 'all' for an unknown section", () => {
    expect(visibleCreations(items, pub, null, "gone")).toMatchObject({ filter: "all" });
  });
  it("reads the public sections defensively", () => {
    expect(toPublicSections([{ id: "a", name: "Mariage" }, { id: "b" }, null, 4])).toEqual([{ id: "a", name: "Mariage" }]);
    expect(toPublicSections(null)).toEqual([]);
  });
});

describe("certified badge", () => {
  it("reads course titles and picks the page's language", () => {
    const courses = toCertifiedCourses([{ fr: "Pose experte", en: "Expert placement" }, { fr: "Hygiène", en: "" }, { en: 2 }, null]);
    expect(courses).toEqual([
      { fr: "Pose experte", en: "Expert placement" },
      { fr: "Hygiène", en: "Hygiène" },
    ]);
    expect(certifiedTitles(courses, "en")).toEqual(["Expert placement", "Hygiène"]);
    expect(certifiedTitles([...courses, courses[0]], "fr")).toEqual(["Pose experte", "Hygiène"]);
    expect(toCertifiedCourses("nope")).toEqual([]);
  });
});
