import { describe, expect, it } from "vitest";
import { sanitizeJewels, type PlacedJewelry } from "../../data/studioEditor";
import { piecesKey } from "../studioWorkspace/scene";
import { DesignStore, withLock } from "./store";

/**
 * Locking a piece in the 3D Studio: a locked piece takes no edit — moved,
 * turned, resized, recoloured or deleted — whichever control asks, until it
 * is unlocked; each piece is locked on its own, never as a group.
 */

const piece = (over: Partial<PlacedJewelry> = {}): PlacedJewelry => ({
  id: "a",
  productId: "solitaire",
  size: { ss: 5 },
  look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
  toothId: "11",
  position: { x: -4, y: 0.5, z: 3 },
  normal: { x: -0.2, y: 0, z: 0.98 },
  rotation: 0,
  scale: 0.9,
  ...over,
});

function stage(...pieces: PlacedJewelry[]) {
  const store = new DesignStore({ persist: false });
  store.replaceDesign(pieces, "dentition");
  return store;
}
const byId = (store: DesignStore, id: string) => store.jewels.find((j) => j.id === id)!;

describe("piece lock", () => {
  it("locks and unlocks pieces one by one, as one undo step each", () => {
    const store = stage(piece(), piece({ id: "b" }), piece({ id: "c" }));
    store.setLocked(["a", "b", "c"], true);
    expect(store.jewels.every((j) => j.locked)).toBe(true);
    // Unlocking one piece leaves the others locked: no group was made.
    store.setLocked(["b"], false);
    expect(byId(store, "a").locked).toBe(true);
    expect(byId(store, "b").locked).toBeUndefined();
    expect(byId(store, "c").locked).toBe(true);
    store.undo();
    expect(byId(store, "b").locked).toBe(true);
    store.undo();
    expect(store.jewels.some((j) => j.locked)).toBe(false);
  });

  it("records no undo step when nothing changes", () => {
    const store = stage(piece({ locked: true }));
    store.setLocked(["a"], true);
    expect(store.getSnapshot().canUndo).toBe(false);
  });

  it("refuses every edit of a locked piece, and keeps editing the free ones", () => {
    const store = stage(piece({ locked: true }), piece({ id: "b" }));
    store.updateJewel("a", { rotation: 90 });
    store.applyPatches([
      { id: "a", patch: { position: { x: 9, y: 9, z: 9 } } },
      { id: "b", patch: { position: { x: 1, y: 2, z: 3 } } },
    ]);
    store.selectJewels(["a", "b"]);
    store.updateSelected({ offset: 0.1, variantId: "gold" });
    expect(byId(store, "a")).toEqual(piece({ locked: true }));
    expect(byId(store, "b")).toMatchObject({ position: { x: 1, y: 2, z: 3 }, offset: 0.1, variantId: "gold" });
  });

  it("does not delete locked pieces", () => {
    const store = stage(piece({ locked: true }), piece({ id: "b" }));
    expect(store.removeJewels(["a", "b"])).toBe(1);
    expect(store.jewels.map((j) => j.id)).toEqual(["a"]);
    expect(store.removeJewels(["a"])).toBe(0);
    expect(store.jewels).toHaveLength(1);
  });

  it("lists the editable pieces of a selection", () => {
    const store = stage(piece({ locked: true }), piece({ id: "b" }));
    expect(store.isLocked("a")).toBe(true);
    expect(store.isLocked("b")).toBe(false);
    expect(store.editableIds(["a", "b"])).toEqual(["b"]);
  });

  it("gives copies of a locked piece no lock", () => {
    const store = stage(piece({ locked: true }));
    store.insertJewels([piece({ id: "copy", locked: true })]);
    expect(byId(store, "copy").locked).toBeUndefined();
  });

  it("still moves locked pieces when the design is re-seated (not an edit)", () => {
    const store = stage(piece({ locked: true }));
    store.settleLoadedPieces([{ id: "a", patch: { position: { x: 0, y: 0, z: 0 } } }]);
    expect(byId(store, "a").position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("is saved with the scene and counts as a change", () => {
    const locked = piece({ locked: true });
    expect(sanitizeJewels([locked])[0].locked).toBe(true);
    // Anything but `true` reads as unlocked, and an unlocked piece carries no field.
    expect(sanitizeJewels([{ ...piece(), locked: "yes" }])[0]).not.toHaveProperty("locked");
    expect(piecesKey([locked])).not.toBe(piecesKey([piece()]));
  });

  it("withLock adds the flag or drops it entirely", () => {
    expect(withLock(piece(), true).locked).toBe(true);
    expect(withLock(piece({ locked: true }), false)).not.toHaveProperty("locked");
    const free = piece();
    expect(withLock(free, false)).toBe(free);
  });
});
