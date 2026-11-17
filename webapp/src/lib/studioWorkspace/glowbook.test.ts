import { describe, expect, it } from "vitest";
import {
  exposureOf,
  moveItem,
  suggestHandle,
  toPublicGlowbook,
  validateGlowbook,
  type GlowbookItem,
} from "./glowbook";

const details = (over: Partial<Parameters<typeof validateGlowbook>[0]> = {}) => ({
  handle: "lily.gems",
  displayName: "Lily Gems",
  bio: "",
  ...over,
});

const item = (creationId: string, position: number, status: GlowbookItem["status"] = "approved"): GlowbookItem => ({
  id: `i-${creationId}`,
  creationId,
  position,
  status,
  reviewNote: null,
  submittedAt: "2026-10-19T08:00:00Z",
  sectionId: null,
});

describe("validateGlowbook (mirrors studio_save_showcase)", () => {
  it("accepts a valid page and the handle in any case", () => {
    expect(validateGlowbook(details())).toBeNull();
    expect(validateGlowbook(details({ handle: " Lily_Gems " }))).toBeNull();
  });

  it.each([
    ["ab", "handleLength"],
    ["a".repeat(31), "handleLength"],
    ["bad handle", "handleCharacters"],
    ["-lily", "handleCharacters"],
    ["lily.", "handleCharacters"],
    ["li..ly", "handleCharacters"],
    ["admin", "handleReserved"],
    ["glowbook", "handleReserved"],
  ])("refuses the handle %s (%s)", (handle, problem) => {
    expect(validateGlowbook(details({ handle }))).toBe(problem);
  });

  it("checks the name and the bio", () => {
    expect(validateGlowbook(details({ displayName: "  " }))).toBe("displayNameRequired");
    expect(validateGlowbook(details({ displayName: "x".repeat(61) }))).toBe("displayNameLength");
    expect(validateGlowbook(details({ bio: "x".repeat(301) }))).toBe("bioLength");
  });
});

describe("suggestHandle", () => {
  it("turns a display name into a valid handle", () => {
    expect(suggestHandle("Élodie Gems Studio")).toBe("elodie-gems-studio");
    expect(suggestHandle("  ✨ Lily  &  Co ✨ ")).toBe("lily-co");
    expect(validateGlowbook(details({ handle: suggestHandle("Lily Gems") }))).toBeNull();
  });
});

describe("moveItem", () => {
  const items = [item("b", 1), item("a", 0), item("c", 2)];
  it("swaps with the neighbour, in page order", () => {
    expect(moveItem(items, "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(items, "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("leaves the ends alone", () => {
    expect(moveItem(items, "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(items, "c", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("exposureOf (the warning before a save)", () => {
  it("names what a save makes public", () => {
    expect(exposureOf(item("a", 0, "approved"), null)).toBe("glowbookLive");
    expect(exposureOf(item("a", 0, "pending"), null)).toBe("glowbookPending");
    expect(exposureOf(null, "2026-10-19T08:00:00Z")).toBe("template");
  });
  it("says nothing for a private creation or a declined one", () => {
    expect(exposureOf(null, null)).toBeNull();
    expect(exposureOf(item("a", 0, "rejected"), null)).toBeNull();
  });
});

describe("toPublicGlowbook", () => {
  it("reads the public page", () => {
    const page = toPublicGlowbook({
      handle: "lily.gems",
      display_name: "Lily",
      bio: "Hi",
      // Not sent any more nor stored (decision 146); an older answer carrying it is ignored.
      instagram: "lily.gems",
      location: null,
      look: null,
      items: [{ id: "1", name: "Aurora", description: "", element_count: 3, thumbnail_path: "u/1.jpg", updated_at: "t" }, { name: "no id" }],
    });
    expect(page).toEqual({
      handle: "lily.gems",
      displayName: "Lily",
      bio: "Hi",
      location: null,
      look: null,
      spotlightVideo: null,
      sections: [],
      certification: null,
      items: [{ id: "1", name: "Aurora", description: "", elementCount: 3, thumbnailPath: "u/1.jpg", updatedAt: "t", sectionId: null }],
    });
  });
  it("reads the sections and the certified badge (decision 102)", () => {
    const page = toPublicGlowbook({
      handle: "lily.gems",
      display_name: "Lily",
      sections: [{ id: "s1", name: "Mariage" }, { id: "", name: "x" }, "junk"],
      certification: { courses: [{ fr: "Pose experte", en: "Expert placement" }, { fr: 3 }] },
      items: [
        { id: "1", name: "A", section_id: "s1" },
        { id: "2", name: "B", section_id: null },
        { id: "3", name: "C", section_id: "unknown" },
      ],
    });
    expect(page?.sections).toEqual([{ id: "s1", name: "Mariage" }]);
    expect(page?.certification).toEqual([{ fr: "Pose experte", en: "Expert placement" }]);
    expect(page?.items.map((i) => i.sectionId)).toEqual(["s1", null, null]);
    expect(toPublicGlowbook({ handle: "x.y", display_name: "X", certification: null, items: [] })?.certification).toBeNull();
    expect(toPublicGlowbook({ handle: "x.y", display_name: "X", certification: { courses: [] }, items: [] })?.certification).toBeNull();
  });
  it("reads the artist's look when the page carries one, without the former colour and layout (decision 150)", () => {
    const page = toPublicGlowbook({ handle: "lily.gems", display_name: "Lily", location: "Lyon", look: { accent: "rose", layout: "large", featured_item_id: "i1" }, items: [] });
    expect(page?.location).toBe("Lyon");
    expect(page?.look).toMatchObject({ featuredItemId: "i1" });
    expect(page?.look).not.toHaveProperty("accent");
    expect(page?.look).not.toHaveProperty("layout");
  });
  it("is null without a public page", () => {
    expect(toPublicGlowbook(null)).toBeNull();
    expect(toPublicGlowbook([])).toBeNull();
    expect(toPublicGlowbook({ handle: "x" })).toBeNull();
  });
});
