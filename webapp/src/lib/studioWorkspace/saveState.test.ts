import { describe, expect, it } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
import { DesignStore } from "../studio3d/store";
import { studioSectionFromPath, studioSectionPath } from "../studioUrl";
import { createScene, piecesKey } from "./scene";

/**
 * The Saved / Unsaved contract between the design on the stage and the
 * creation it belongs to (the store runs without browser storage here: its
 * reads and writes fail quietly, as they would in a locked-down browser).
 */

const piece = (over: Partial<PlacedJewelry> = {}): PlacedJewelry => ({
  id: "a",
  jewelryTypeId: "crystal-round",
  toothId: "11",
  position: { x: -4, y: 0.5, z: 3 },
  normal: { x: -0.2, y: 0, z: 0.98 },
  rotation: 0,
  scale: 0.95,
  color: "clear",
  ...over,
});
const link = { creationId: "c1", ownerId: "u1", name: "Crystal Smile", savedAt: "2026-09-27T10:00:00.000Z" };

function loaded() {
  const store = new DesignStore();
  store.loadScene(createScene({ pieces: [piece(), piece({ id: "b", toothId: "21", position: { x: 4, y: 0.5, z: 3 } })], lightPreset: "lamp" }), link);
  return store;
}
const clean = (store: DesignStore) => !!store.active && piecesKey(store.jewels) === store.active.baselineKey;

describe("design store and saved creations", () => {
  it("loads a scene as a clean, linked design with nothing to undo", () => {
    const store = loaded();
    expect(store.active?.creationId).toBe("c1");
    expect(store.lightPreset).toBe("lamp");
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.hasPendingLoad()).toBe(true);
    expect(store.takePendingLoad()).toEqual({ camera: null, model: "studio" });
    expect(store.hasPendingLoad()).toBe(false);
    expect(clean(store)).toBe(true);
  });

  it("stays clean when the engine re-seats the loaded pieces", () => {
    const store = loaded();
    store.settleLoadedPieces([{ id: "a", patch: { position: { x: -4.12, y: 0.47, z: 3.05 } } }]);
    expect(store.jewels[0].position.x).toBe(-4.12);
    expect(clean(store)).toBe(true);
    expect(store.getSnapshot().canUndo).toBe(false);
  });

  it("turns unsaved on an edit, and clean again on undo", () => {
    const store = loaded();
    store.pushHistory();
    store.updateJewel("a", { rotation: 45 });
    expect(clean(store)).toBe(false);
    store.undo();
    expect(clean(store)).toBe(true);
  });

  it("counts a slider change (no history step) as an edit", () => {
    const store = loaded();
    store.updateSelected({ scale: 1.2 }); // nothing selected: no change
    expect(clean(store)).toBe(true);
    store.updateJewel("b", { scale: 1.2 });
    expect(clean(store)).toBe(false);
  });

  it("takes the saved pieces as the new baseline", () => {
    const store = loaded();
    store.updateJewel("a", { color: "rose" });
    const saved = structuredClone(store.jewels);
    store.markSaved({ ...link, savedAt: "2026-09-27T11:00:00.000Z" }, saved);
    expect(clean(store)).toBe(true);
    expect(store.active?.savedAt).toBe("2026-09-27T11:00:00.000Z");
  });

  it("starts a new, unlinked design that can be undone", () => {
    const store = loaded();
    store.startNew();
    expect(store.active).toBeNull();
    expect(store.jewels).toEqual([]);
    store.undo();
    expect(store.jewels).toHaveLength(2);
  });

  it("serialises the stage with its groups, pruned to surviving pieces", () => {
    const store = loaded();
    store.addGroupRef({ id: "g", gemGroupId: "grp", name: "Pair", pieceIds: ["a", "b"] });
    store.removeJewels(["b"]);
    const scene = store.toScene({ model: "studio", camera: null });
    expect(scene.pieces.map((p) => p.id)).toEqual(["a"]);
    expect(scene.groups).toEqual([{ id: "g", gemGroupId: "grp", name: "Pair", pieceIds: ["a"] }]);
    expect(scene.lightPreset).toBe("lamp");
  });
});

describe("studio section URLs", () => {
  it("maps French slugs, English aliases and the editor itself", () => {
    expect(studioSectionFromPath("/studio-3d/atelier")).toBeNull();
    expect(studioSectionFromPath("/studio-3d/atelier/")).toBeNull();
    expect(studioSectionFromPath("/studio-3d/atelier/mes-creations")).toBe("creations");
    expect(studioSectionFromPath("/studio-3d/atelier/mes-groupes")).toBe("groups");
    expect(studioSectionFromPath("/studio-3d/editor/groups")).toBe("groups");
    expect(studioSectionFromPath("/studio-3d/editor/help")).toBe("help");
    expect(studioSectionFromPath("/studio-3d/atelier/nowhere")).toBeNull();
    expect(studioSectionPath("help")).toBe("/studio-3d/atelier/aide");
    expect(studioSectionPath(null)).toBe("/studio-3d/atelier");
  });
});
