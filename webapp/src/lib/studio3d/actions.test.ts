import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
import { createScene } from "../studioWorkspace/scene";

/** The rotate handle's session, with and without a stage on screen. */

const preview = vi.fn();
let engine: { previewPatches: typeof preview; screenClockwiseSign: () => -1; beginGroupTurn: () => null } | null = null;
vi.mock("./engine", () => ({
  getEngine: () => engine,
  MAX_MODEL_BYTES: 1,
  ModelImportError: class extends Error {},
}));

const { beginRotation } = await import("./actions");
const { studioStore } = await import("./store");

const piece: PlacedJewelry = {
  id: "a",
  productId: "solitaire",
  size: { ss: 5 },
  look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
  toothId: "11",
  position: { x: -4, y: 0.5, z: 3 },
  normal: { x: -0.2, y: 0, z: 0.98 },
  rotation: 0,
  scale: 0.9,
};

beforeEach(() => {
  preview.mockClear();
  engine = null;
  studioStore.loadScene(createScene({ pieces: [piece] }), null);
});

describe("rotation session", () => {
  it("shows the turn on the stage and commits it once, as the gesture ends", () => {
    engine = { previewPatches: preview, screenClockwiseSign: () => -1, beginGroupTurn: () => null };
    let commits = 0;
    const off = studioStore.subscribe(() => commits++);
    const session = beginRotation(["a"]);
    session.set(10);
    session.set(20);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(commits).toBe(0);
    expect(studioStore.jewels[0].rotation).toBe(0);
    session.end();
    off();
    expect(commits).toBe(1);
    expect(studioStore.jewels[0].rotation).toBe(340); // clockwise on screen, seen from the front
    studioStore.undo();
    expect(studioStore.jewels[0].rotation).toBe(0);
  });

  it("records nothing when the handle is let go without a turn", () => {
    engine = { previewPatches: preview, screenClockwiseSign: () => -1, beginGroupTurn: () => null };
    beginRotation(["a"]).end();
    expect(studioStore.getSnapshot().canUndo).toBe(false);
  });

  it("without a stage, turns the design at once, as one undo step", () => {
    const session = beginRotation(["a"]);
    session.set(10);
    session.set(20);
    session.end();
    expect(studioStore.jewels[0].rotation).toBe(340);
    studioStore.undo();
    expect(studioStore.jewels[0].rotation).toBe(0);
    expect(studioStore.getSnapshot().canUndo).toBe(false);
  });
});
