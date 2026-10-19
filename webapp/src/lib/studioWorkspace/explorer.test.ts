import { describe, expect, it } from "vitest";
import { toPreferences } from "./collections";
import { explorerFolderContents, explorerFolders, explorerRoot, FOLDER_PREVIEWS } from "./explorer";
import { createLocalRepositories, type KeyValueStorage } from "./localRepository";
import { createScene } from "./scene";
import type { CollectionMembership, Creation, StudioCollection } from "./types";

const collection = (id: string, name: string): StudioCollection => ({
  id,
  userId: "u1",
  name,
  color: null,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
});

const creation = (id: string, name: string, updatedAt: string, over: Partial<Creation> = {}): Creation => ({
  id,
  userId: "u1",
  name,
  description: "",
  scene: createScene({ pieces: [] }),
  thumbnailUrl: null,
  elementCount: 0,
  estimatedPriceMinor: 0,
  currency: "EUR",
  isFavorite: false,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt,
  lastOpenedAt: null,
  ...over,
});

const m = (collectionId: string, creationId: string): CollectionMembership => ({ collectionId, creationId });

const creations = [
  creation("c1", "Butterfly", "2026-10-05T10:00:00Z", { isFavorite: true }),
  creation("c2", "Crystal smile", "2026-10-04T10:00:00Z"),
  creation("c3", "Bridal pearl", "2026-10-03T10:00:00Z"),
  creation("c4", "Loose star", "2026-10-02T10:00:00Z", { isFavorite: true }),
];
const collections = [collection("k2", "Wedding"), collection("k1", "Bridal")];
const memberships = [m("k1", "c1"), m("k1", "c3"), m("k2", "c1"), m("k2", "c2"), m("k2", "gone")];
const base = { query: "", filter: "all" as const, sort: "name" as const, locale: "en" };

describe("explorer folders", () => {
  it("lists every collection by name, with its count and its latest creations as cover", () => {
    const folders = explorerFolders(creations, collections, memberships, "en");
    expect(folders.map((f) => [f.collection.id, f.count, f.previews.map((c) => c.id)])).toEqual([
      ["k1", 2, ["c1", "c3"]],
      ["k2", 2, ["c1", "c2"]], // "gone" is not in the library: not counted
    ]);
  });

  it("caps the cover", () => {
    const many = Array.from({ length: 6 }, (_, i) => creation(`x${i}`, `X${i}`, `2026-10-0${i + 1}T10:00:00Z`));
    const [folder] = explorerFolders(many, [collection("k", "All")], many.map((c) => m("k", c.id)));
    expect(folder.count).toBe(6);
    expect(folder.previews).toHaveLength(FOLDER_PREVIEWS);
    expect(folder.previews[0].id).toBe("x5");
  });
});

describe("explorer top level", () => {
  it("shows the folders, then only the creations filed nowhere", () => {
    const root = explorerRoot(creations, collections, memberships, base);
    expect(root.searching).toBe(false);
    expect(root.folders).toHaveLength(2);
    expect(root.creations.map((c) => c.id)).toEqual(["c4"]);
  });

  it("searches the whole library: matching folders by name, matching creations wherever they are filed", () => {
    const byWord = explorerRoot(creations, collections, memberships, { ...base, query: "bridal" });
    expect(byWord.searching).toBe(true);
    expect(byWord.folders.map((f) => f.collection.id)).toEqual(["k1"]);
    expect(byWord.creations.map((c) => c.id)).toEqual(["c3"]);

    const byFilter = explorerRoot(creations, collections, memberships, { ...base, filter: "favorites" });
    expect(byFilter.folders).toEqual([]);
    expect(byFilter.creations.map((c) => c.id)).toEqual(["c1", "c4"]);
  });
});

describe("explorer folder", () => {
  it("shows the folder's creations, with search and filter applied", () => {
    expect(explorerFolderContents(creations, "k2", memberships, base).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(explorerFolderContents(creations, "k2", memberships, { ...base, filter: "favorites" }).map((c) => c.id)).toEqual(["c1"]);
    expect(explorerFolderContents(creations, "k2", memberships, { ...base, query: "crystal" }).map((c) => c.id)).toEqual(["c2"]);
  });
});

describe("library view preference", () => {
  it("reads an unknown or missing value as the grid", () => {
    expect(toPreferences(null)).toEqual({ libraryView: "grid" });
    expect(toPreferences({ library_view: "list" })).toEqual({ libraryView: "grid" });
    expect(toPreferences({ library_view: "explorer" })).toEqual({ libraryView: "explorer" });
  });

  it("is kept per account in the local store", async () => {
    const data = new Map<string, string>();
    const storage: KeyValueStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
    const mine = createLocalRepositories("u1", { storage });
    const theirs = createLocalRepositories("u2", { storage });
    expect(await mine.preferences.get()).toEqual({ libraryView: "grid" });
    expect(await mine.preferences.update({ libraryView: "explorer" })).toEqual({ libraryView: "explorer" });
    expect(await mine.preferences.get()).toEqual({ libraryView: "explorer" });
    expect(await theirs.preferences.get()).toEqual({ libraryView: "grid" });
    // Saving a creation keeps the preference (one file per account).
    await mine.creations.create({ name: "A", description: "", scene: createScene({ pieces: [] }), thumbnail: null });
    expect(await mine.preferences.get()).toEqual({ libraryView: "explorer" });
  });
});
