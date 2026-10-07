import { beforeAll, describe, expect, it } from "vitest";
import { FALLBACK_GEM_COLORS, PRODUCTS } from "../../data/products";
import type { PlacedJewelry } from "../../data/studioEditor";
import { buildStudioGems } from "../studio3d/gemCatalog";
import { setStudioGems } from "../studio3d/gemRegistry";
import { ARCH_FRAME_BY_ID } from "../studio3d/archLayout";
import { anchorToothOf, groupToWorld, piecesToGroup, sanitizeGroupData, type Frame } from "./gemGroup";
import { matchesFilter, matchesQuery, queryCreations, queryGroups, summarize } from "./library";
import { createLocalRepositories, type KeyValueStorage } from "./localRepository";
import { StudioStoreError } from "./repository";
import { createScene, isSymmetrical, piecesKey, sanitizeScene } from "./scene";
import { seedCreations, seedGroups } from "./seed";
import type { Creation } from "./types";
import { copyName, normalizeTags, parseTagList, validateDetails, validateFeedback } from "./validation";

const piece = (over: Partial<PlacedJewelry> = {}): PlacedJewelry => ({
  id: "a",
  productId: "solitaire",
  ss: 5,
  look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
  toothId: "11",
  position: { x: -4, y: 0.5, z: 3 },
  normal: { x: -0.2, y: 0, z: 0.98 },
  rotation: 0,
  scale: 0.9,
  ...over,
});

// Estimates are read at the prices of the gems last loaded: the prototype's mock shop here.
beforeAll(() => setStudioGems(buildStudioGems(PRODUCTS, [], FALLBACK_GEM_COLORS)));

function memoryStorage(): KeyValueStorage & { data: Map<string, string>; failWrites: boolean } {
  const data = new Map<string, string>();
  return {
    data,
    failWrites: false,
    getItem: (k) => data.get(k) ?? null,
    setItem(k, v) {
      if (this.failWrites) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

describe("scene", () => {
  it("survives a JSON round trip unchanged", () => {
    const scene = createScene({
      pieces: [piece(), piece({ id: "b", toothId: "21", position: { x: 4, y: 0.5, z: 3 } })],
      groups: [{ id: "g1", gemGroupId: "grp", name: "Pair", pieceIds: ["a", "b"] }],
      lightPreset: "lamp",
      camera: { position: [0, 9, 66], target: [0, 0.5, -6] },
    });
    expect(sanitizeScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
  });

  it("drops malformed pieces and prunes groups to surviving pieces", () => {
    const scene = sanitizeScene({
      model: "weird",
      lightPreset: 12,
      camera: { position: [1, 2], target: [0, 0, 0] },
      pieces: [piece(), { id: "x", productId: "solitaire", ss: 5, look: { shape: "hexagon", color: "#ffffff" }, toothId: "11", position: {}, normal: {} }],
      groups: [
        { id: "g", pieceIds: ["a", "x"], name: "G" },
        { id: "gone", pieceIds: ["x"] },
      ],
    });
    expect(scene.model).toBe("studio");
    expect(scene.lightPreset).toBe("studio");
    expect(scene.camera).toBeNull();
    expect(scene.pieces.map((p) => p.id)).toEqual(["a"]);
    expect(scene.groups).toEqual([{ id: "g", gemGroupId: null, name: "G", pieceIds: ["a"] }]);
  });

  it("keys designs by content, not identity", () => {
    expect(piecesKey([piece()])).toBe(piecesKey([structuredClone(piece())]));
    expect(piecesKey([piece()])).not.toBe(piecesKey([piece({ rotation: 90 })]));
    expect(piecesKey([piece()])).not.toBe(piecesKey([piece({ offset: 0.2 })]));
    expect(piecesKey([piece()])).not.toBe(piecesKey([piece({ ss: 7 })]));
    expect(piecesKey([piece()])).not.toBe(piecesKey([piece({ variantId: "v2" })]));
  });

  it("recognises a mirror-symmetric design", () => {
    const left = piece({ id: "l", position: { x: -4, y: 0.5, z: 3 } });
    const right = piece({ id: "r", toothId: "21", position: { x: 4.3, y: 0.4, z: 3 } });
    expect(isSymmetrical([left, right])).toBe(true);
    expect(isSymmetrical([left, { ...right, productId: "aquamarine" }])).toBe(false);
    expect(isSymmetrical([left, { ...right, ss: 7 }])).toBe(false);
    expect(isSymmetrical([left])).toBe(false);
  });
});

describe("gem groups", () => {
  const frameOf = (fdi: string): Frame => {
    const f = ARCH_FRAME_BY_ID[fdi];
    return { origin: f.center, tangent: f.tangent, up: { x: 0, y: 1, z: 0 }, outward: f.outward };
  };
  const pieces = [
    piece({ id: "1", position: { x: -3.2, y: 1, z: 2.9 } }),
    piece({ id: "2", position: { x: -5.1, y: -0.8, z: 2.7 }, rotation: 45, variantId: "white-gold" }),
    piece({ id: "3", position: { x: -1.4, y: 0.2, z: 3.1 }, productId: "etoile", ss: 2, look: { shape: "halo-star", material: "metal", color: "#f2c25c", effect: "none" } }),
  ];

  it("maps back onto its own frame exactly", () => {
    const frame = frameOf("11");
    const back = groupToWorld(piecesToGroup(pieces, frame), frame);
    back.forEach((b, i) => {
      expect(b.position.x).toBeCloseTo(pieces[i].position.x, 2);
      expect(b.position.y).toBeCloseTo(pieces[i].position.y, 2);
      expect(b.position.z).toBeCloseTo(pieces[i].position.z, 2);
    });
  });

  it("keeps the spacing, spin, gem, colour and size when moved to another tooth", () => {
    const moved = groupToWorld(piecesToGroup(pieces, frameOf("11")), frameOf("23"));
    const dist = (a: { x: number; y: number; z: number }, b: typeof a) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(dist(moved[0].position, moved[1].position)).toBeCloseTo(dist(pieces[0].position, pieces[1].position), 2);
    expect(dist(moved[1].position, moved[2].position)).toBeCloseTo(dist(pieces[1].position, pieces[2].position), 2);
    expect(moved[1].piece.rotation).toBe(45);
    expect(moved[1].piece.variantId).toBe("white-gold");
    expect(moved[2].piece).toMatchObject({ productId: "etoile", ss: 2, look: { shape: "halo-star", material: "metal" } });
  });

  it("anchors on the tooth holding most of the selection", () => {
    expect(anchorToothOf([{ toothId: "11" }, { toothId: "21" }, { toothId: "21" }])).toBe("21");
    expect(anchorToothOf([])).toBeNull();
  });

  it("refuses an arrangement with fewer than two usable pieces", () => {
    const one = {
      anchorToothId: "11",
      pieces: [{ productId: "solitaire", ss: 5, look: piece().look, at: { x: 0, y: 0, z: 0 }, facing: { x: 0, y: 0, z: 1 } }],
    };
    expect(sanitizeGroupData(one)).toBeNull();
    expect(sanitizeGroupData({ ...one, pieces: [...one.pieces, { ...one.pieces[0], at: { x: 400, y: 0, z: 0 } }] })).toBeNull();
    expect(sanitizeGroupData({ ...one, pieces: [...one.pieces, one.pieces[0]] })?.pieces).toHaveLength(2);
  });
});

describe("validation", () => {
  it("normalises tags", () => {
    expect(normalizeTags(["  Minimal ", "minimal", "#Butterfly", "", "a  b"])).toEqual(["Minimal", "Butterfly", "a b"]);
    expect(parseTagList("Minimal, Butterfly ,Symmetrical,")).toEqual(["Minimal", "Butterfly", "Symmetrical"]);
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(8);
  });

  it("requires a name and bounds the text", () => {
    expect(validateDetails({ name: "   ", description: "", tags: [] })).toBe("nameMissing");
    expect(validateDetails({ name: "x".repeat(61), description: "", tags: [] })).toBe("nameTooLong");
    expect(validateDetails({ name: "Crystal Smile", description: "", tags: [] })).toBeNull();
    expect(copyName("x".repeat(60), "(copy)")).toHaveLength(60);
  });

  it("checks feedback", () => {
    expect(validateFeedback({ rating: 0, category: "bug", message: "It crashed" })).toBe("ratingMissing");
    expect(validateFeedback({ rating: 4, category: "bug", message: " " })).toBe("messageTooShort");
    expect(validateFeedback({ rating: 5, category: "usability", message: "Lovely" })).toBeNull();
  });
});

describe("library", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  const creations = seedCreations("u1", now) as Creation[];

  it("seeds every designed piece and a usable arrangement for every group", () => {
    expect(creations.map((c) => c.name)).toEqual(["Crystal Smile", "Golden Stars", "Micro Heart", "Evening Row"]);
    expect(creations.find((c) => c.name === "Crystal Smile")?.elementCount).toBe(8);
    expect(creations.every((c) => c.estimatedPriceMinor > 0)).toBe(true);
    for (const g of seedGroups("u1", now)) expect(sanitizeGroupData(g.data)?.pieces).toHaveLength(g.elementCount);
  });

  it("searches name, description and tags, ignoring accents and case", () => {
    const c = creations[0];
    expect(matchesQuery(c, "crystal")).toBe(true);
    expect(matchesQuery(c, "SYMMÉTRICAL appointment")).toBe(true);
    expect(matchesQuery(c, "ruby")).toBe(false);
  });

  it("filters and sorts", () => {
    const names = (list: Creation[]) => list.map((c) => c.name);
    expect(names(creations.filter((c) => matchesFilter(c, "favorites")))).toEqual(["Crystal Smile"]);
    expect(names(creations.filter((c) => matchesFilter(c, "minimal")))).toEqual(["Micro Heart"]);
    expect(creations.filter((c) => matchesFilter(c, "symmetrical")).map((c) => c.name)).toContain("Crystal Smile");
    expect(creations.filter((c) => matchesFilter(c, "symmetrical")).map((c) => c.name)).not.toContain("Golden Stars");
    expect(names(queryCreations(creations, { query: "", filter: "all", sort: "name", locale: "en" }))[0]).toBe("Crystal Smile");
    expect(names(queryCreations(creations, { query: "", filter: "all", sort: "updated" }))[0]).toBe("Golden Stars");
    expect(names(queryCreations(creations, { query: "", filter: "all", sort: "elements" }))[0]).toBe("Crystal Smile");
    expect(names(queryCreations(creations, { query: "", filter: "recent", sort: "updated", now }))).toEqual([
      "Golden Stars",
      "Crystal Smile",
      "Micro Heart",
    ]);
  });

  it("puts favourite groups first and sums the studio", () => {
    const groups = seedGroups("u1", now).map((g) => ({ ...g, thumbnailUrl: null }));
    expect(queryGroups(groups, "")[0].name).toBe("Mini Flower");
    const s = summarize(creations, groups);
    expect(s.creations).toBe(4);
    expect(s.groups).toBe(2);
    expect(s.gemsUsed).toBe(creations.reduce((n, c) => n + c.elementCount, 0));
    expect(Number.isInteger(s.totalEstimateMinor)).toBe(true);
  });
});

describe("local repository", () => {
  const scene = createScene({ pieces: [piece(), piece({ id: "b", toothId: "21", position: { x: 4, y: 0.5, z: 3 } })] });
  let clock = Date.parse("2026-09-27T10:00:00Z");
  const now = () => clock;

  it("creates, lists, edits, duplicates and deletes a creation", async () => {
    const storage = memoryStorage();
    const repo = createLocalRepositories("u1", { storage, now });
    const created = await repo.creations.create({
      name: " Minimal  Butterfly ",
      description: "Symmetrical butterfly composition for front teeth.",
      tags: ["Minimal", "minimal", "Butterfly"],
      scene,
      thumbnail: "data:image/jpeg;base64,AAAA",
    });
    expect(created).toMatchObject({ name: "Minimal Butterfly", tags: ["Minimal", "Butterfly"], elementCount: 2, userId: "u1" });
    expect(created.estimatedPriceMinor).toBeGreaterThan(0);
    expect(created.thumbnailUrl).toBe("data:image/jpeg;base64,AAAA");

    clock += 60_000;
    const faved = await repo.creations.update(created.id, { isFavorite: true });
    expect(faved.isFavorite).toBe(true);
    expect(faved.updatedAt).toBe(created.updatedAt); // not an edit

    const edited = await repo.creations.update(created.id, { scene: createScene({ pieces: [piece()] }) });
    expect(edited.elementCount).toBe(1);
    expect(edited.updatedAt).not.toBe(created.updatedAt);

    const copy = await repo.creations.duplicate(created.id, "Minimal Butterfly (copy)");
    expect(copy.id).not.toBe(created.id);
    expect(copy.isFavorite).toBe(false);
    expect(copy.thumbnailUrl).toBe(created.thumbnailUrl);
    expect(await repo.creations.list()).toHaveLength(2);

    await repo.creations.remove(created.id);
    const left = await repo.creations.list();
    expect(left.map((c) => c.id)).toEqual([copy.id]);
    await expect(repo.creations.update(created.id, { name: "x" })).rejects.toMatchObject({ code: "notFound" });
  });

  it("keeps each account's library to itself", async () => {
    const storage = memoryStorage();
    const mine = createLocalRepositories("u1", { storage, now });
    const theirs = createLocalRepositories("u2", { storage, now });
    await mine.creations.create({ name: "Mine", description: "", tags: [], scene, thumbnail: null });
    expect(await theirs.creations.list()).toEqual([]);
  });

  it("says so when storage refuses a write", async () => {
    const storage = memoryStorage();
    const repo = createLocalRepositories("u1", { storage, now });
    storage.failWrites = true;
    const attempt = repo.creations.create({ name: "Too much", description: "", tags: [], scene, thumbnail: null });
    await expect(attempt).rejects.toBeInstanceOf(StudioStoreError);
    await expect(attempt).rejects.toMatchObject({ code: "storage" });
  });

  it("refuses invalid details and one-gem groups", async () => {
    const repo = createLocalRepositories("u1", { storage: memoryStorage(), now });
    await expect(repo.creations.create({ name: "", description: "", tags: [], scene, thumbnail: null })).rejects.toMatchObject({
      code: "invalid",
    });
    const one = { version: 2 as const, anchorToothId: "11", pieces: [] };
    await expect(repo.groups.create({ name: "Solo", description: "", tags: [], data: one, thumbnail: null })).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("keeps a group's render through create, duplicate and delete; older groups have none", async () => {
    const storage = memoryStorage();
    const repo = createLocalRepositories("u1", { storage, now, seed: true });
    const seeded = await repo.groups.list();
    expect(seeded.every((g) => g.thumbnailUrl === null)).toBe(true);

    const render = "data:image/jpeg;base64,BBBB";
    const created = await repo.groups.create({ name: "Papillon", description: "", tags: [], data: seeded[0].data, thumbnail: render });
    expect(created.thumbnailUrl).toBe(render);
    expect((await repo.groups.update(created.id, { name: "Papillon bleu" })).thumbnailUrl).toBe(render);

    const copy = await repo.groups.duplicate(created.id, "Papillon (copy)");
    expect(copy.thumbnailUrl).toBe(render);
    await repo.groups.remove(created.id);
    expect((await repo.groups.list()).find((g) => g.id === copy.id)?.thumbnailUrl).toBe(render);

    // A group and a creation never share a render, even under the same id.
    expect(storage.getItem(`gt-studio-thumb-v1:u1:${created.id}`)).toBeNull();
  });

  it("seeds a new account once, and not again after the library is emptied", async () => {
    const storage = memoryStorage();
    const repo = createLocalRepositories("u1", { storage, now, seed: true });
    const first = await repo.creations.list();
    expect(first).toHaveLength(4);
    expect(await repo.groups.list()).toHaveLength(2);
    for (const c of first) await repo.creations.remove(c.id);
    expect(await createLocalRepositories("u1", { storage, now, seed: true }).creations.list()).toEqual([]);
  });

  it("stores feedback", async () => {
    const storage = memoryStorage();
    const repo = createLocalRepositories("u1", { storage, now });
    const context = { path: "/studio-3d/atelier", pieces: 3, language: "en", viewport: "1440x900" };
    await repo.feedback.submit({ rating: 5, category: "feature", message: "  Love the groups  ", context });
    await expect(repo.feedback.submit({ rating: 5, category: "feature", message: "", context })).rejects.toMatchObject({
      code: "invalid",
    });
    const raw = JSON.parse(storage.data.get("gt-studio-library-v2:u1")!);
    expect(raw.feedback[0].message).toBe("Love the groups");
  });
});
