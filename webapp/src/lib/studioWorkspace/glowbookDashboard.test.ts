import { describe, expect, it } from "vitest";
import type { Glowbook, GlowbookItem, ModerationStatus } from "./glowbook";
import { DEFAULT_LOOK } from "./glowbookLook";
import { glowbookCounts, glowbookTodos } from "./glowbookDashboard";

const page = (over: Partial<Glowbook> = {}): Glowbook => ({
  handle: "lea",
  displayName: "Léa",
  bio: "",
  instagram: null,
  status: "approved",
  reviewNote: null,
  submittedAt: "2026-10-01T00:00:00Z",
  look: DEFAULT_LOOK,
  pending: {},
  changesReviewNote: null,
  showCertification: true,
  ...over,
});
const item = (id: string, status: ModerationStatus, sectionId: string | null = null): GlowbookItem => ({
  id,
  creationId: `c-${id}`,
  position: 0,
  status,
  reviewNote: null,
  submittedAt: "2026-10-01T00:00:00Z",
  sectionId,
});

describe("glowbookCounts", () => {
  it("counts each moderation state", () => {
    expect(glowbookCounts([item("a", "approved"), item("b", "approved"), item("c", "pending"), item("d", "rejected")], 0)).toEqual({
      approved: 2,
      pending: 1,
      rejected: 1,
      unfiled: 0,
    });
  });

  it("counts unfiled creations only once the page has sections", () => {
    const items = [item("a", "approved", "s1"), item("b", "pending")];
    expect(glowbookCounts(items, 0).unfiled).toBe(0);
    expect(glowbookCounts(items, 1).unfiled).toBe(1);
  });
});

describe("glowbookTodos", () => {
  it("asks for a first creation on an empty page", () => {
    expect(glowbookTodos(page(), [], 0).map((t) => t.code)).toEqual(["noItems"]);
  });

  it("puts a refused page first, then refused creations", () => {
    const todos = glowbookTodos(page({ status: "rejected" }), [item("a", "rejected"), item("b", "rejected")], 0);
    expect(todos).toEqual([
      { code: "pageRejected", panel: "profile" },
      { code: "itemsRejected", panel: "creations", count: 2 },
    ]);
  });

  it("asks for a spotlight while none of the published creations is in it", () => {
    expect(glowbookTodos(page(), [item("a", "approved")], 0).map((t) => t.code)).toEqual(["noSpotlight"]);
    expect(glowbookTodos(page({ look: { ...DEFAULT_LOOK, featuredItemId: "a" } }), [item("a", "approved")], 0)).toEqual([]);
    // Only pending creations: nothing can be put forward yet.
    expect(glowbookTodos(page(), [item("a", "pending")], 0)).toEqual([]);
  });

  it("reports refused pictures or links only while nothing new waits", () => {
    const refused = page({ changesReviewNote: "", look: { ...DEFAULT_LOOK, featuredItemId: "a" } });
    expect(glowbookTodos(refused, [item("a", "approved")], 0).map((t) => t.code)).toEqual(["changesRejected"]);
    expect(glowbookTodos({ ...refused, pending: { tiktok: "lea" } }, [item("a", "approved")], 0)).toEqual([]);
  });

  it("lists creations left out of every section", () => {
    const todos = glowbookTodos(page({ look: { ...DEFAULT_LOOK, featuredItemId: "a" } }), [item("a", "approved", "s1"), item("b", "approved")], 1);
    expect(todos).toEqual([{ code: "unfiled", panel: "creations", count: 1 }]);
  });
});
