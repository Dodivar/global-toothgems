import { describe, expect, it } from "vitest";
import { isNewTemplate, searchTemplates, sortTemplates, TEMPLATE_NEW_DAYS, toTemplate, type TemplateRow } from "./templates";

const piece = (id: string) => ({
  id,
  productId: "solitaire",
  ss: 5,
  look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
  toothId: "11",
  position: { x: -4, y: 0.5, z: 3 },
  normal: { x: -0.2, y: 0, z: 0.98 },
  rotation: 0,
  scale: 0.9,
});

const row = (over: Partial<TemplateRow> = {}): TemplateRow => ({
  id: "t1",
  name: "Constellation",
  description: "Étoiles sur les incisives",
  tags: ["minimal", "Minimal", "  "],
  scene_data: { version: 2, model: "dentition", lightPreset: "studio", camera: null, pieces: [piece("a"), piece("b")], groups: [] },
  element_count: 99,
  estimated_price_minor: 4500,
  currency: "EUR",
  thumbnail_path: "staff/t1.jpg",
  published_at: "2026-10-10T10:00:00Z",
  updated_at: "2026-10-12T10:00:00Z",
  ...over,
});

describe("toTemplate", () => {
  it("maps a row, counting the pieces of the scene as read back", () => {
    const t = toTemplate(row(), "https://signed");
    expect(t).toMatchObject({
      id: "t1",
      name: "Constellation",
      elementCount: 2,
      estimatedPriceMinor: 4500,
      currency: "EUR",
      thumbnailPath: "staff/t1.jpg",
      thumbnailUrl: "https://signed",
      publishedAt: "2026-10-10T10:00:00Z",
    });
    expect(t.scene.pieces).toHaveLength(2);
  });

  it("survives a malformed scene and a missing render", () => {
    const t = toTemplate(row({ scene_data: { version: 1, pieces: "nope" } as never, thumbnail_path: null as never }));
    expect(t.elementCount).toBe(0);
    expect(t.thumbnailPath).toBeNull();
    expect(t.thumbnailUrl).toBeNull();
  });
});

describe("isNewTemplate", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  it("is new for the first days after publication only", () => {
    expect(isNewTemplate("2026-10-18T12:00:00Z", now)).toBe(true);
    expect(isNewTemplate(new Date(now - (TEMPLATE_NEW_DAYS - 1) * 86_400_000).toISOString(), now)).toBe(true);
    expect(isNewTemplate(new Date(now - TEMPLATE_NEW_DAYS * 86_400_000).toISOString(), now)).toBe(false);
    expect(isNewTemplate("2026-01-01T00:00:00Z", now)).toBe(false);
  });
  it("is never new for an unreadable date", () => {
    expect(isNewTemplate("not a date", now)).toBe(false);
  });
});

describe("sortTemplates and searchTemplates", () => {
  const list = [
    toTemplate(row({ id: "a", name: "Aurore", published_at: "2026-09-01T00:00:00Z" })),
    toTemplate(row({ id: "b", name: "Comète", published_at: "2026-10-15T00:00:00Z" })),
    toTemplate(row({ id: "c", name: "Bulle", published_at: "2026-10-15T00:00:00Z", description: "" })),
  ];
  it("puts the newest first, ties by name", () => {
    expect(sortTemplates(list).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
  it("searches names and descriptions, ignoring case and accents", () => {
    expect(searchTemplates(list, "comete").map((t) => t.id)).toEqual(["b"]);
    expect(searchTemplates(list, "etoiles").map((t) => t.id)).toEqual(["a", "b"]);
    expect(searchTemplates(list, "  ")).toHaveLength(3);
  });
});
