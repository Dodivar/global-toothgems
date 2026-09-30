import { describe, expect, it } from "vitest";
import { TRAINING_COURSES } from "../data/adminTrainingSeed";
import {
  MAX_UPLOAD_BYTES,
  displayName,
  filterMedia,
  formatBytes,
  mediaUsage,
  validateUpload,
  type TrainingMedia,
} from "./trainingMediaRules";

const item = (patch: Partial<TrainingMedia>): TrainingMedia => ({
  id: "m",
  src: "/a.jpg",
  name: "Image",
  alt: { fr: "", en: "" },
  category: "technique",
  tags: [],
  width: 100,
  height: 100,
  bytes: 1000,
  createdAt: "2026-09-01T00:00:00.000Z",
  origin: "library",
  ...patch,
});

describe("validateUpload", () => {
  it("accepts web images within the size limit", () => {
    expect(validateUpload({ type: "image/jpeg", size: 2_000_000 })).toBeNull();
    expect(validateUpload({ type: "image/webp", size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it("rejects other files, empty files and oversized files", () => {
    expect(validateUpload({ type: "application/pdf", size: 10 })).toBe("type");
    expect(validateUpload({ type: "image/svg+xml", size: 10 })).toBe("type");
    expect(validateUpload({ type: "image/png", size: 0 })).toBe("empty");
    expect(validateUpload({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 })).toBe("size");
  });
});

describe("filterMedia", () => {
  const items = [
    item({ id: "a", src: "/a.jpg", name: "Lampe", category: "materials", tags: ["polymérisation"], createdAt: "2026-09-01T00:00:00.000Z" }),
    item({ id: "b", src: "/b.jpg", name: "Registre", category: "hygiene", alt: { fr: "Registre d’hygiène", en: "Hygiene log" }, createdAt: "2026-09-03T00:00:00.000Z", origin: "upload" }),
    item({ id: "c", src: "/c.jpg", name: "Sourire", category: "results", createdAt: "2026-09-02T00:00:00.000Z" }),
  ];
  const usage = new Map([["/a.jpg", 2]]);
  const all = { query: "", category: "all" as const, usage: "all" as const };

  it("sorts newest first", () => {
    expect(filterMedia(items, all, usage, "fr").map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("searches names, descriptions and tags, ignoring accents and case", () => {
    expect(filterMedia(items, { ...all, query: "HYGIENE" }, usage, "fr").map((i) => i.id)).toEqual(["b"]);
    expect(filterMedia(items, { ...all, query: "polymerisation" }, usage, "fr").map((i) => i.id)).toEqual(["a"]);
  });

  it("filters by category and by usage", () => {
    expect(filterMedia(items, { ...all, category: "results" }, usage, "fr").map((i) => i.id)).toEqual(["c"]);
    expect(filterMedia(items, { ...all, usage: "unused" }, usage, "fr").map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterMedia(items, { ...all, usage: "uploads" }, usage, "fr").map((i) => i.id)).toEqual(["b"]);
  });
});

describe("mediaUsage", () => {
  it("counts covers, image blocks, posters and question images", () => {
    const usage = mediaUsage(TRAINING_COURSES);
    const course = TRAINING_COURSES[0];
    expect(usage.get(course.cover)).toBeGreaterThan(0);
    const image = course.modules.flatMap((m) => m.steps.flatMap((s) => s.blocks)).find((b) => b.type === "image");
    if (image?.type === "image") expect(usage.get(image.src)).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("derives a readable name from a file name", () => {
    expect(displayName("pose_de-la-gem.JPG")).toBe("pose de la gem");
  });

  it("formats sizes per language", () => {
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(2048, "fr")).toBe("2 Ko");
    expect(formatBytes(1.5 * 1024 * 1024, "fr")).toBe("1,5 Mo");
  });
});
