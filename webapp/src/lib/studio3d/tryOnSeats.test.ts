import { describe, expect, it } from "vitest";
import { sanitizeScene } from "../studioWorkspace/scene";
import { tryOnSeats } from "./tryOnSeats";

const GEM = "c654aad1-58a7-42f4-bc3d-f74b7a809dc9";
const piece = (id: string, shape: string, mm: number, toothId: string, position: number[], normal: number[]) => ({
  id,
  look: { color: "#56a1cb", shape, effect: "none", material: "crystal" },
  size: { mm: [mm] },
  scale: mm / 2,
  normal: { x: normal[0], y: normal[1], z: normal[2] },
  toothId,
  position: { x: position[0], y: position[1], z: position[2] },
  rotation: 0,
  productId: GEM,
});

// From a real creation: a drop near the gum and a heart below it on 11, a star on 41.
const scene = sanitizeScene({
  model: "dentition",
  version: 2,
  pieces: [
    piece("drop", "raindrop", 4, "11", [-3.325, 6.777, 4.335], [0.1, 0.099, 0.99]),
    piece("heart", "heart", 3, "11", [-1.722, 3.725, 4.43], [0.117, 0.057, 0.991]),
    piece("star", "rivoli-star", 4, "41", [-2.531, -3.917, -1.804], [-0.006, -0.184, 0.983]),
    piece("back", "round", 2, "21", [2, 4, -2], [0, 0, -1]),
  ],
});

describe("tryOnSeats", () => {
  const seats = new Map(tryOnSeats(scene.pieces, scene.model).map((s) => [s.id, s]));

  it("measures each gem on its crown: height from the gum line, side, share of the width", () => {
    const drop = seats.get("drop")!;
    const heart = seats.get("heart")!;
    expect(drop.front).toBe(true);
    // Both in the crown, the drop on the gum side of the heart.
    for (const s of [drop, heart]) {
      expect(s.gum).toBeGreaterThanOrEqual(0);
      expect(s.gum).toBeLessThanOrEqual(1);
    }
    expect(drop.gum).toBeLessThan(heart.gum);
    // The heart sits toward the midline of tooth 11; a 4 mm stone is wider than a 3 mm one.
    expect(heart.mid).toBeGreaterThan(0);
    expect(drop.width).toBeGreaterThan(heart.width);
    expect(drop.width).toBeGreaterThan(0.2);
    expect(drop.width).toBeLessThan(1);
  });

  it("measures lower teeth from their own gum line", () => {
    const star = seats.get("star")!;
    expect(star.gum).toBeGreaterThanOrEqual(0);
    expect(star.gum).toBeLessThanOrEqual(1);
  });

  it("says when a gem sits on the tongue side", () => {
    expect(seats.get("back")?.front).toBe(false);
  });

  it("tags the front gems by tooth, from the gum side; none on the tongue side", () => {
    expect(seats.get("drop")?.tag).toBe("11a");
    expect(seats.get("heart")?.tag).toBe("11b");
    expect(seats.get("star")?.tag).toBe("41a");
    expect(seats.get("back")?.tag).toBeUndefined();
  });

  it("leaves out what the front view cannot place", () => {
    expect(tryOnSeats(scene.pieces, "imported" as never)).toEqual([]);
  });
});
