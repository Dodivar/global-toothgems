import { describe, expect, it } from "vitest";
import {
  collectionCounts,
  collectionIdsOf,
  creationIdsIn,
  sortCollections,
  studioCollectionPath,
  toCollection,
  toCollectionColor,
  toMembership,
  withMemberships,
  withoutMemberships,
} from "./collections";
import { queryCreations } from "./library";
import { createLocalRepositories, type KeyValueStorage } from "./localRepository";
import { createScene } from "./scene";
import type { CollectionMembership, Creation, StudioCollection } from "./types";
import { validateCollection } from "./validation";

const collection = (id: string, name: string, over: Partial<StudioCollection> = {}): StudioCollection => ({
  id,
  userId: "u1",
  name,
  color: null,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  ...over,
});

const creation = (id: string, name: string, over: Partial<Creation> = {}): Creation => ({
  id,
  userId: "u1",
  name,
  description: "",
  scene: createScene({ pieces: [] }),
  thumbnailUrl: null,
  elementCount: 0,
  estimatedPriceMinor: 0,
  currency: "EUR",
  tags: [],
  isFavorite: false,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  lastOpenedAt: null,
  ...over,
});

const m = (collectionId: string, creationId: string): CollectionMembership => ({ collectionId, creationId });

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("collection mapping", () => {
  it("maps a row and keeps only a known colour", () => {
    expect(
      toCollection({
        id: "k1",
        user_id: "u1",
        name: "Mariages",
        color: "fuchsia",
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-02T10:00:00Z",
      }),
    ).toEqual({ id: "k1", userId: "u1", name: "Mariages", color: "fuchsia", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z" });
    expect(toCollectionColor("#ff00ff")).toBeNull();
    expect(toCollectionColor(null)).toBeNull();
    expect(toMembership({ collection_id: "k1", creation_id: "c1" })).toEqual(m("k1", "c1"));
  });

  it("sorts collections by name, ignoring case and accents", () => {
    const sorted = sortCollections([collection("1", "été"), collection("2", "Bridal"), collection("3", "atelier")], "fr");
    expect(sorted.map((c) => c.name)).toEqual(["atelier", "Bridal", "été"]);
  });

  it("links the library to one collection", () => {
    expect(studioCollectionPath(null)).toBe("/studio-3d/atelier/mes-creations");
    expect(studioCollectionPath("a b")).toBe("/studio-3d/atelier/mes-creations?collection=a%20b");
  });
});

describe("collection membership", () => {
  const memberships = [m("k1", "c1"), m("k1", "c2"), m("k2", "c1"), m("k2", "gone")];

  it("reads a collection's creations and a creation's collections (many-to-many)", () => {
    expect([...creationIdsIn("k1", memberships)]).toEqual(["c1", "c2"]);
    expect([...collectionIdsOf("c1", memberships)]).toEqual(["k1", "k2"]);
  });

  it("counts only creations present in the library", () => {
    const counts = collectionCounts([collection("k1", "A"), collection("k2", "B"), collection("k3", "C")], memberships, ["c1", "c2"]);
    expect(counts).toEqual({ k1: 2, k2: 1, k3: 0 });
  });

  it("adds without duplicates and removes only the given links", () => {
    expect(withMemberships(memberships, [m("k1", "c1"), m("k3", "c1")])).toEqual([...memberships, m("k3", "c1")]);
    expect(withoutMemberships(memberships, "k1", ["c1"])).toEqual([m("k1", "c2"), m("k2", "c1"), m("k2", "gone")]);
  });

  it("narrows the library to a collection, combined with search and filter", () => {
    const list = [
      creation("c1", "Butterfly", { isFavorite: true }),
      creation("c2", "Butterfly wings"),
      creation("c3", "Butterfly star", { isFavorite: true }),
    ];
    const inK1 = creationIdsIn("k1", memberships);
    const base = { query: "", filter: "all" as const, sort: "name" as const, locale: "en" };
    expect(queryCreations(list, { ...base, inCollection: inK1 }).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(queryCreations(list, { ...base, inCollection: inK1, filter: "favorites" }).map((c) => c.id)).toEqual(["c1"]);
    expect(queryCreations(list, { ...base, inCollection: inK1, query: "wings" }).map((c) => c.id)).toEqual(["c2"]);
    expect(queryCreations(list, { ...base, inCollection: null }).map((c) => c.id)).toEqual(["c1", "c3", "c2"]);
  });
});

describe("collection validation", () => {
  it("needs a name of at most 40 characters, unique ignoring case", () => {
    expect(validateCollection({ name: "  ", color: null })).toBe("nameMissing");
    expect(validateCollection({ name: "x".repeat(41), color: null })).toBe("nameTooLong");
    expect(validateCollection({ name: " Mariages ", color: null }, ["mariages"])).toBe("nameTaken");
    expect(validateCollection({ name: "Mariages", color: "teal" as never })).toBe("colorInvalid");
    expect(validateCollection({ name: "Mariages 2027", color: "blue" }, ["Mariages"])).toBeNull();
  });
});

describe("local collections repository", () => {
  const scene = createScene({ pieces: [] });

  it("creates, renames and deletes collections without touching the creations", async () => {
    const repo = createLocalRepositories("u1", { storage: memoryStorage() });
    const a = await repo.creations.create({ name: "A", description: "", tags: [], scene, thumbnail: null });
    const b = await repo.creations.create({ name: "B", description: "", tags: [], scene, thumbnail: null });
    const k1 = await repo.collections.create({ name: "  Bridal  ", color: "fuchsia" });
    const k2 = await repo.collections.create({ name: "Clients", color: null });
    expect(k1).toMatchObject({ name: "Bridal", color: "fuchsia", userId: "u1" });
    await expect(repo.collections.create({ name: "bridal", color: null })).rejects.toMatchObject({ code: "duplicate" });
    await expect(repo.collections.update(k2.id, { name: "BRIDAL", color: null })).rejects.toMatchObject({ code: "duplicate" });
    expect(await repo.collections.update(k1.id, { name: "Bridal", color: "blue" })).toMatchObject({ color: "blue" });

    await repo.collections.addCreations(k1.id, [a.id, b.id]);
    await repo.collections.addCreations(k1.id, [a.id]); // already there: no error, no duplicate
    await repo.collections.addCreations(k2.id, [a.id]);
    expect((await repo.collections.list()).memberships).toHaveLength(3);

    await repo.collections.removeCreations(k1.id, [b.id]);
    await repo.collections.remove(k2.id);
    const after = await repo.collections.list();
    expect(after.collections.map((c) => c.id)).toEqual([k1.id]);
    expect(after.memberships).toEqual([m(k1.id, a.id)]);
    expect((await repo.creations.list()).map((c) => c.id).sort()).toEqual([a.id, b.id].sort());

    // Deleting a creation removes its memberships.
    await repo.creations.remove(a.id);
    expect((await repo.collections.list()).memberships).toEqual([]);
  });

  it("refuses unknown creations and keeps each account's collections to itself", async () => {
    const storage = memoryStorage();
    const mine = createLocalRepositories("u1", { storage });
    const theirs = createLocalRepositories("u2", { storage });
    const k = await mine.collections.create({ name: "Mine", color: null });
    await expect(mine.collections.addCreations(k.id, ["nope"])).rejects.toMatchObject({ code: "notFound" });
    expect((await theirs.collections.list()).collections).toEqual([]);
    await expect(theirs.collections.remove(k.id)).rejects.toMatchObject({ code: "notFound" });
  });
});
