import { describe, expect, it } from "vitest";
import { filterQueue, queueCounts, queueMediaPaths, toQueueEntry, type GlowbookQueueRow } from "./adminGlowbookMapping";

const row = (over: Partial<GlowbookQueueRow>): GlowbookQueueRow => ({
  kind: "item",
  id: "i1",
  user_id: "u1",
  status: "pending",
  review_note: null as unknown as string,
  submitted_at: "2026-10-19T08:00:00Z",
  reviewed_at: null as unknown as string,
  handle: "lily.gems",
  display_name: "Lily",
  bio: null as unknown as string,
  instagram: null as unknown as string,
  showcase_status: "approved",
  creation_name: "Aurora",
  creation_description: "Two crystals",
  element_count: 2,
  thumbnail_path: "u1/a.jpg",
  creation_updated_at: "2026-10-19T08:00:00Z",
  details: null,
  ...over,
});

describe("toQueueEntry", () => {
  it("reads a page and a creation", () => {
    expect(toQueueEntry(row({ kind: "showcase", id: "u1", bio: "Hi", instagram: "lily" }))).toMatchObject({
      kind: "page",
      id: "u1",
      bio: "Hi",
      instagram: "lily",
      status: "pending",
    });
    expect(toQueueEntry(row({}))).toMatchObject({ kind: "creation", name: "Aurora", elementCount: 2, pageStatus: "approved" });
  });
});

describe("proposed pictures and links", () => {
  it("reads what waits beside what is approved, and lists the pictures to sign", () => {
    const entry = toQueueEntry(
      row({
        kind: "changes",
        id: "u1",
        details: { approved: { avatar_path: "u1/old.jpg", accent: "teal" }, pending: { avatar_path: "u1/new.jpg", tiktok: "lily" } },
      }),
    );
    expect(entry).toMatchObject({ kind: "changes", look: { pending: { avatarPath: "u1/new.jpg", tiktok: "lily" } } });
    expect(entry.kind === "changes" && entry.look.approved.accent).toBe("teal");
    expect(queueMediaPaths([entry, toQueueEntry(row({}))])).toEqual(["u1/old.jpg", "u1/new.jpg"]);
  });
});

describe("filterQueue", () => {
  const entries = [
    toQueueEntry(row({ id: "late", submitted_at: "2026-10-19T10:00:00Z" })),
    toQueueEntry(row({ id: "early", submitted_at: "2026-10-19T07:00:00Z" })),
    toQueueEntry(row({ id: "ok", status: "approved", creation_name: "Nova" })),
    toQueueEntry(row({ id: "no", status: "rejected" })),
  ];

  it("lists waiting entries first, oldest first", () => {
    expect(filterQueue(entries, "all", "").map((e) => e.id)).toEqual(["early", "late", "ok", "no"]);
    expect(filterQueue(entries, "pending", "").map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("searches handles, names and creations", () => {
    expect(filterQueue(entries, "all", "nova").map((e) => e.id)).toEqual(["ok"]);
    expect(filterQueue(entries, "all", "LILY")).toHaveLength(4);
  });

  it("counts by status", () => {
    expect(queueCounts(entries)).toEqual({ pending: 2, approved: 1, rejected: 1 });
  });
});
