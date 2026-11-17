import { describe, expect, it } from "vitest";
import { ALL_TEETH, scaleForSize, type PlacedJewelry } from "../../data/studioEditor";
import { DENTITION_CROWNS } from "./dentition";
import { RENDER_VIEW_BOX, RENDER_VIEW_TEETH, projectRenderView, renderScale } from "./renderView";
import { SMILE_CROWNS } from "./smileDentition";

const tooth = (fdi: string) => RENDER_VIEW_TEETH.find((t) => t.fdi === fdi)!;

/** A piece on the dentition's outer face of `fdi`, `up` mm above the crown's middle. */
function onDentition(id: string, fdi: string, up = 0): PlacedJewelry {
  const c = DENTITION_CROWNS.find((x) => x.fdi === fdi)!;
  return {
    id,
    productId: "gem",
    size: { ss: 5 },
    look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
    toothId: fdi,
    position: { x: c.center.x + c.outward.x * c.halfDepth, y: c.center.y + up, z: c.center.z + c.outward.z * c.halfDepth },
    normal: { ...c.outward },
    rotation: 0,
    scale: scaleForSize({ ss: 5 }),
  };
}

const SECOND_MOLARS = ["17", "27", "37", "47"];

describe("render view teeth", () => {
  it("has the render's twelve teeth per arch, lower arch first, each from the viewer's left", () => {
    expect(RENDER_VIEW_TEETH).toHaveLength(24);
    for (const lower of [true, false]) {
      const row = RENDER_VIEW_TEETH.filter((t) => t.lower === lower);
      expect(row).toHaveLength(12);
      for (let i = 1; i < row.length; i++) expect(row[i].x0).toBeGreaterThanOrEqual(row[i - 1].x0);
    }
    expect(RENDER_VIEW_TEETH[0].lower).toBe(true);
    expect(RENDER_VIEW_TEETH.map((t) => t.fdi).filter((f) => SECOND_MOLARS.includes(f))).toEqual([]);
  });

  it("puts the midline between the central incisors and the arches either side of the biting plane", () => {
    expect(tooth("11").x1).toBeCloseTo(0, 6);
    expect(tooth("21").x0).toBeCloseTo(0, 6);
    for (const t of RENDER_VIEW_TEETH) {
      if (t.lower) expect(t.cervical).toBeGreaterThan(t.incisal);
      else expect(t.cervical).toBeLessThan(t.incisal);
      const box = RENDER_VIEW_BOX;
      expect(t.x0).toBeGreaterThanOrEqual(box.x);
      expect(t.x1).toBeLessThanOrEqual(box.x + box.width);
      expect(Math.min(t.cervical, t.incisal)).toBeGreaterThanOrEqual(box.y);
      expect(Math.max(t.cervical, t.incisal)).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  it("draws pieces at full size on the incisors and smaller on the side teeth, never below half", () => {
    expect(renderScale(tooth("11"))).toBe(1);
    expect(renderScale(tooth("16"))).toBe(0.5);
    expect(renderScale(tooth("14"))).toBeLessThan(1);
    expect(renderScale(tooth("14"))).toBeGreaterThan(0.5);
  });
});

describe("projectRenderView", () => {
  it("draws every tooth but the second molars, which are listed as not drawn", () => {
    const pieces = ALL_TEETH.map((fdi) => onDentition(`p${fdi}`, fdi));
    const view = projectRenderView(pieces, "dentition");
    expect(view.unplaced).toBe(4);
    expect(view.gems.filter((g) => !g.at).map((g) => g.toothId).sort()).toEqual([...SECOND_MOLARS].sort());
    for (const g of view.gems.filter((x) => x.at)) {
      const t = tooth(g.toothId);
      expect(g.at!.x).toBeGreaterThan(t.x0);
      expect(g.at!.x).toBeLessThan(t.x1);
    }
  });

  it("keeps the seat's height: toward the neck on a lower tooth is toward the bottom of the picture", () => {
    const low = projectRenderView([onDentition("a", "41", -2)], "dentition").gems[0].at!;
    const high = projectRenderView([onDentition("a", "41", 2)], "dentition").gems[0].at!;
    expect(low.y).toBeGreaterThan(high.y);
    const t = tooth("41");
    expect(low.y).toBeGreaterThan((t.cervical + t.incisal) / 2);
  });

  it("shrinks a piece with its tooth's foreshortening", () => {
    const front = projectRenderView([onDentition("a", "11")], "dentition").gems[0].at!;
    const side = projectRenderView([onDentition("a", "16")], "dentition").gems[0].at!;
    expect(side.r).toBeCloseTo(front.r * 0.5, 6);
  });

  it("draws a piece of the Studio's dentition at the same place of its tooth as one of the former scan", () => {
    for (const fdi of ["11", "23", "24", "36"]) {
      const c = SMILE_CROWNS.find((x) => x.fdi === fdi)!;
      const piece = { ...onDentition("s", fdi), position: { x: c.center.x + c.outward.x * c.halfDepth, y: c.center.y + 1.5, z: c.center.z + c.outward.z * c.halfDepth }, normal: { ...c.outward } };
      const smile = projectRenderView([piece], "smile").gems[0].at;
      expect(smile, fdi).not.toBeNull();
      // 1.5 mm up the crown: the same share of it on both models, so the same point of the drawn tooth
      const scan = projectRenderView([onDentition("d", fdi, (1.5 * (DENTITION_CROWNS.find((x) => x.fdi === fdi)!.top - DENTITION_CROWNS.find((x) => x.fdi === fdi)!.bottom)) / (c.top - c.bottom))], "dentition").gems[0].at!;
      expect(smile!.x).toBeCloseTo(scan.x, 3);
      expect(smile!.y).toBeCloseTo(scan.y, 3);
    }
  });

  it("numbers in reading order and places from the upper midline outward", () => {
    const pieces = ["21", "11", "41", "13"].map((fdi, i) => onDentition(`p${i}`, fdi));
    const view = projectRenderView(pieces, "dentition");
    expect(view.gems.map((g) => g.toothId)).toEqual(["13", "11", "21", "41"]);
    expect(view.gems.map((g) => g.order)).toEqual([3, 1, 2, 4]);
  });

});
