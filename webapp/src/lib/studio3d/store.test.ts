import { describe, expect, it } from "vitest";
import { FREE_TOOTH, type PlacedJewelry } from "../../data/studioEditor";
import { createScene } from "../studioWorkspace/scene";
import { DesignStore, targetToothOf } from "./store";

/** The undo history: one step per change, and none for a change that changed nothing. */

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

function twoPieces() {
  const store = new DesignStore({ persist: false });
  store.loadScene(createScene({ pieces: [piece(), piece({ id: "b", toothId: "21", position: { x: 4, y: 0.5, z: 3 } })] }), null);
  return store;
}

describe("design store history", () => {
  it("records a step with the change, not before it", () => {
    const store = twoPieces();
    let commits = 0;
    store.subscribe(() => commits++);
    store.pushHistory();
    expect(commits).toBe(0);
    expect(store.getSnapshot().canUndo).toBe(false);
    store.updateJewel("a", { rotation: 30 });
    expect(commits).toBe(1);
    expect(store.getSnapshot().canUndo).toBe(true);
    store.undo();
    expect(store.jewels[0].rotation).toBe(0);
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.getSnapshot().canRedo).toBe(true);
  });

  it("leaves no step when the pieces come back unchanged", () => {
    const store = twoPieces();
    store.pushHistory();
    // a piece dropped where it was picked up: new objects, same design
    store.applyPatches([{ id: "a", patch: { position: { x: -4, y: 0.5, z: 3 } } }]);
    expect(store.getSnapshot().canUndo).toBe(false);
  });

  it("keeps a gesture of many commits as one step", () => {
    const store = twoPieces();
    // a turn: one step opened as it starts, then a commit per pointer move
    store.pushHistory();
    for (const rotation of [10, 20, 30]) store.updateJewel("a", { rotation });
    store.undo();
    expect(store.jewels[0].rotation).toBe(0);
    expect(store.getSnapshot().canUndo).toBe(false);
  });

  it("keeps the redo steps when a pressed control changed nothing", () => {
    const store = twoPieces();
    store.pushHistory();
    store.updateJewel("a", { rotation: 45 });
    store.undo();
    // a slider pressed and released on its value
    store.pushHistory();
    store.selectJewel("a");
    expect(store.getSnapshot().canRedo).toBe(true);
    store.redo();
    expect(store.jewels[0].rotation).toBe(45);
  });

  it("drops a pending step when the design is loaded or re-seated", () => {
    const store = twoPieces();
    store.pushHistory();
    store.settleLoadedPieces([{ id: "a", patch: { position: { x: -4.1, y: 0.5, z: 3 } } }]);
    expect(store.getSnapshot().canUndo).toBe(false);
  });
});

describe("target tooth", () => {
  const jewels = [piece(), piece({ id: "b", toothId: FREE_TOOTH })];
  it("is the selected tooth, else the selected piece's tooth", () => {
    expect(targetToothOf({ jewels, selectedJewelIds: [], selectedToothId: "21" })).toBe("21");
    expect(targetToothOf({ jewels, selectedJewelIds: ["a"], selectedToothId: null })).toBe("11");
  });
  it("names no tooth for nothing selected or a piece off the labelled teeth", () => {
    expect(targetToothOf({ jewels, selectedJewelIds: [], selectedToothId: null })).toBeNull();
    expect(targetToothOf({ jewels, selectedJewelIds: ["b"], selectedToothId: null })).toBeNull();
    expect(targetToothOf({ jewels, selectedJewelIds: [], selectedToothId: FREE_TOOTH })).toBeNull();
  });
});
