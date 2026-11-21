import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("design store model", () => {
  it("opens on the Studio's dentition, and comes back to it for the next session", () => {
    const store = new DesignStore({ persist: false });
    expect(store.modelMode).toBe("smile");
    store.setModelMode("teeth");
    store.resetSession();
    expect(store.modelMode).toBe("smile");
  });

  it("remembers the model a design was re-seated on", () => {
    const store = twoPieces();
    store.replaceDesign(store.jewels, "smile");
    expect(store.designModel).toBe("smile");
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

describe("design store owner", () => {
  function withStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    vi.stubGlobal("localStorage", storage);
    return data;
  }
  afterEach(() => vi.unstubAllGlobals());

  /** Alice's draft: the account is named first, then the design is made. */
  function alicesDraft() {
    const store = new DesignStore({ persist: false });
    store.adoptAccount("alice");
    store.loadScene(createScene({ pieces: [piece(), piece({ id: "b", toothId: "21", position: { x: 4, y: 0.5, z: 3 } })] }), null);
    return store;
  }

  it("drops another account's draft, with its history and link", () => {
    const store = alicesDraft();
    store.updateJewel("a", { rotation: 30 });
    store.clientName = "Léa";
    expect(store.adoptAccount("bob")).toBe(true);
    expect(store.jewels).toEqual([]);
    expect(store.active).toBeNull();
    expect(store.clientName).toBe("");
    expect(store.getSnapshot().jewels).toEqual([]);
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.owner).toBe("bob");
  });

  it("keeps the draft for its own account", () => {
    const store = alicesDraft();
    expect(store.adoptAccount("alice")).toBe(false);
    expect(store.jewels).toHaveLength(2);
  });

  it("reads the owner back from storage and refuses an unowned draft", () => {
    const data = withStorage();
    const first = new DesignStore();
    first.adoptAccount("alice");
    first.loadScene(createScene({ pieces: [piece()] }), null);
    first.saveNow();
    expect(JSON.parse(data.get("gt-studio3d-design-v2")!).owner).toBe("alice");
    // a reload: the same account finds its draft, another does not
    const again = new DesignStore();
    expect(again.adoptAccount("alice")).toBe(false);
    expect(again.jewels).toHaveLength(1);
    const other = new DesignStore();
    expect(other.adoptAccount("bob")).toBe(true);
    expect(other.jewels).toEqual([]);
    // a draft saved before drafts named their account, linked to nobody's creation
    data.set("gt-studio3d-design-v2", JSON.stringify({ jewels: [piece()] }));
    expect(new DesignStore().adoptAccount("carol")).toBe(true);
  });

  it("keeps an unowned draft linked to one of the account's creations", () => {
    const data = withStorage();
    const active = { creationId: "c1", ownerId: "alice", name: "Mine", baselineKey: "k", savedAt: "2026-11-20T00:00:00Z" };
    data.set("gt-studio3d-design-v2", JSON.stringify({ jewels: [piece()], active }));
    const store = new DesignStore();
    expect(store.adoptAccount("alice", { notify: false })).toBe(false);
    expect(store.jewels).toHaveLength(1);
    expect(store.active?.creationId).toBe("c1");
  });
});
