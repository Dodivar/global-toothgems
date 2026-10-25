import { describe, expect, it } from "vitest";
import { scaleForSize, type PlacedJewelry, type Vec3 } from "../../data/studioEditor";
import { DENTITION_CROWNS } from "./dentition";
import { projectFrontView } from "./frontView";
import { tryOnLayout } from "./tryOnLayout";

/** A piece in the middle of the dentition's labial face of `fdi` (`facing` -1 puts it on the tongue side). */
function onTooth(id: string, fdi: string, facing = 1): PlacedJewelry {
  const c = DENTITION_CROWNS.find((x) => x.fdi === fdi)!;
  const position: Vec3 = {
    x: c.center.x + facing * c.outward.x * c.halfDepth,
    y: c.center.y,
    z: c.center.z + facing * c.outward.z * c.halfDepth,
  };
  return {
    id,
    productId: "gem",
    size: { ss: 5 },
    look: { shape: "heart", material: "crystal", color: "#ff0000", effect: "none" },
    toothId: fdi,
    position,
    normal: { x: facing * c.outward.x, y: 0, z: facing * c.outward.z },
    rotation: 0,
    scale: scaleForSize({ ss: 5 }),
  };
}

describe("try-on layout", () => {
  const W = 600;
  const H = 300;

  it("fits the front view to the box width and centres it, keeping the gems' order and proportions", () => {
    const pieces = [onTooth("a", "11"), onTooth("b", "21")];
    const { spots, guide } = tryOnLayout(pieces, "dentition", W, H);
    expect(spots.map((s) => s.pieceId).sort()).toEqual(["a", "b"]);
    const [a, b] = ["a", "b"].map((id) => spots.find((s) => s.pieceId === id)!);
    expect(a.x).toBeLessThan(b.x); // 11 is the patient's right, on the viewer's left
    for (const s of spots) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(W);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(H);
      expect(s.outline[0][0]).toBe("M");
    }
    const projection = projectFrontView(pieces, "dentition");
    const ga = projection.gems.find((g) => g.id === "a")!.at!;
    expect(a.r).toBeCloseTo(ga.r * (W / projection.box.width));
    expect(guide.length).toBe(12);
  });

  it("leaves out the gems on the tongue side", () => {
    const { spots } = tryOnLayout([onTooth("front", "11"), onTooth("back", "21", -1)], "dentition", W, H);
    expect(spots.map((s) => s.pieceId)).toEqual(["front"]);
  });

  it("draws nothing in an empty box", () => {
    expect(tryOnLayout([onTooth("a", "11")], "dentition", 0, 0)).toEqual({ spots: [], guide: [] });
  });
});
