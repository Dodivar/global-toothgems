import { describe, expect, it } from "vitest";
import {
  groupToPayload,
  groupsShownOn,
  isTranslated,
  newGroup,
  newItem,
  readErrorOf,
  rowToGroup,
  sortGroups,
  validateGroup,
  type AdminFaqGroup,
  type FaqGroupRow,
} from "./adminFaqMapping";

const row: FaqGroupRow = {
  id: "g1",
  name: "Gems",
  status: "published",
  position: 2,
  updated_at: "2026-10-25T09:00:00Z",
  faq_items: [
    { id: "i2", question: "Q2", answer: "A2", position: 1, faq_item_translations: [] },
    { id: "i1", question: "Q1", answer: "A1", position: 0, faq_item_translations: [{ locale: "en", question: "Q1 en", answer: "A1 en" }] },
  ],
  product_faq_groups: [{ product_id: "p1" }],
  category_faq_groups: [{ category_id: "c1" }],
};

function group(overrides: Partial<AdminFaqGroup>): AdminFaqGroup {
  return { ...rowToGroup(row), ...overrides };
}

describe("rowToGroup", () => {
  it("orders the questions and reads English and assignments", () => {
    const g = rowToGroup(row);
    expect(g.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(g.items[0]).toEqual({ id: "i1", question: { fr: "Q1", en: "Q1 en" }, answer: { fr: "A1", en: "A1 en" } });
    expect(g.items[1].question.en).toBe("");
    expect(g.productIds).toEqual(["p1"]);
    expect(g.categoryIds).toEqual(["c1"]);
  });

  it("reads an unknown status as a draft", () => {
    expect(rowToGroup({ ...row, status: "archived" }).status).toBe("draft");
  });
});

describe("groupToPayload", () => {
  it("trims texts and removes duplicate assignments", () => {
    const g = group({ name: " Gems ", productIds: ["p1", "p1"], items: [{ id: "i1", question: { fr: " Q ", en: " " }, answer: { fr: "A", en: "B" } }] });
    expect(groupToPayload(g)).toEqual({
      id: "g1",
      name: "Gems",
      status: "published",
      items: [{ id: "i1", question: "Q", answer: "A", question_en: "", answer_en: "B" }],
      product_ids: ["p1"],
      category_ids: ["c1"],
    });
  });
});

describe("validateGroup", () => {
  it("accepts a complete group", () => {
    expect(validateGroup(group({}))).toEqual({ group: [], items: {} });
  });

  it("needs a name, and a question once published", () => {
    expect(validateGroup({ ...newGroup("x"), status: "published" }).group).toEqual(["name", "noQuestion"]);
    expect(validateGroup({ ...newGroup("x"), name: "Brouillon" }).group).toEqual([]);
  });

  it("flags the questions with a missing French text", () => {
    const g = group({ items: [newItem("blank")] });
    expect(validateGroup(g)).toEqual({ group: ["question", "answer"], items: { blank: ["question", "answer"] } });
  });

  it("refuses texts over the database limits", () => {
    const g = group({ items: [{ id: "long", question: { fr: "Q", en: "x".repeat(301) }, answer: { fr: "A", en: "" } }] });
    expect(validateGroup(g).items).toEqual({ long: ["question"] });
  });
});

describe("isTranslated", () => {
  it("needs both English texts", () => {
    expect(isTranslated({ id: "a", question: { fr: "Q", en: "Q" }, answer: { fr: "A", en: " " } })).toBe(false);
    expect(isTranslated({ id: "a", question: { fr: "Q", en: "Q" }, answer: { fr: "A", en: "A" } })).toBe(true);
  });
});

describe("groupsShownOn", () => {
  const cat = group({ id: "cat", name: "Catégorie", position: 0, productIds: [], categoryIds: ["c1"] });
  const own = group({ id: "own", name: "Propre", position: 1, productIds: ["p1"], categoryIds: [] });
  const draft = group({ id: "draft", name: "Brouillon", status: "draft", productIds: ["p2"], categoryIds: [] });

  it("shows a product's own published groups instead of its category's", () => {
    expect(groupsShownOn([cat, own], { id: "p1", categoryId: "c1" })).toEqual({ groups: [own], source: "product" });
  });

  it("falls back to the category, and ignores drafts", () => {
    expect(groupsShownOn([cat, own, draft], { id: "p2", categoryId: "c1" })).toEqual({ groups: [cat], source: "category" });
    expect(groupsShownOn([draft], { id: "p2", categoryId: "c9" })).toEqual({ groups: [], source: "none" });
  });
});

describe("sortGroups", () => {
  it("orders by position, then name", () => {
    const list = [group({ id: "b", name: "B", position: 1 }), group({ id: "z", name: "Z", position: 0 }), group({ id: "a", name: "A", position: 1 })];
    expect(sortGroups(list).map((g) => g.id)).toEqual(["z", "a", "b"]);
  });
});

describe("readErrorOf", () => {
  it("tells a refused read from a failure", () => {
    expect(readErrorOf({ code: "42501" })).toBe("forbidden");
    expect(readErrorOf({ code: "PGRST000" })).toBe("error");
  });
});
