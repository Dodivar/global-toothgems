import { describe, expect, it } from "vitest";
import { FRONT_VIEW_TEETH, type FrontViewGem, type FrontViewPoint } from "./frontView";
import { applySimilarity, fitSimilarity, registerDesign, RELIABLE_CONFIDENCE, type FoundTooth } from "./tryOnRegistration";

const tooth = (fdi: string) => FRONT_VIEW_TEETH.find((t) => t.fdi === fdi)!;

/** A gem at the centre of a reference tooth's crown, `r` mm half-size, facing front unless said. */
function gem(id: string, fdi: string, over: Partial<FrontViewPoint> = {}): FrontViewGem {
  const t = tooth(fdi);
  const at = {
    x: (t.x0 + t.x1) / 2,
    y: (t.cervical + t.incisal) / 2,
    r: 1,
    nx: 0,
    ny: 0,
    nr: 0,
    stretch: [1, 1] as const,
    rotation: 0,
    u: 0,
    v: 0,
    facing: "front" as const,
    ...over,
  };
  return { id, number: 1, order: 1, toothId: fdi, shape: "round", piece: {} as FrontViewGem["piece"], at };
}

/** The reference teeth as a photo would show them under a similarity without tilt: scale `s` px/mm, shift (tx, ty). */
function photoTeeth(fdis: string[], s: number, tx: number, ty: number): FoundTooth[] {
  return fdis.map((fdi) => {
    const t = tooth(fdi);
    const top = Math.min(t.cervical, t.incisal);
    return { fdi, x: t.x0 * s + tx, y: top * s + ty, width: (t.x1 - t.x0) * s, height: Math.abs(t.incisal - t.cervical) * s };
  });
}

const UPPER_FRONT = ["13", "12", "11", "21", "22", "23"];

describe("fitSimilarity", () => {
  it("recovers a known scale, turn and shift", () => {
    const from = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 5 },
    ];
    const truth = { scale: 3, angle: 10, tx: 40, ty: -7 };
    const fit = fitSimilarity(from, from.map((p) => applySimilarity(truth, p)))!;
    expect(fit.scale).toBeCloseTo(3, 6);
    expect(fit.angle).toBeCloseTo(10, 6);
    expect(fit.tx).toBeCloseTo(40, 6);
    expect(fit.ty).toBeCloseTo(-7, 6);
  });

  it("needs two distinct points", () => {
    expect(fitSimilarity([{ x: 1, y: 1 }], [{ x: 2, y: 2 }])).toBeNull();
    expect(fitSimilarity([{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 2, y: 2 }, { x: 3, y: 3 }])).toBeNull();
  });
});

describe("registerDesign", () => {
  it("puts each gem where the photo's teeth say, at its real size, and trusts a clean fit", () => {
    const gems = [gem("a", "11"), gem("b", "22", { r: 1.5 })];
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems }, photoTeeth(UPPER_FRONT, 20, 600, 300));
    expect(reg.transform!.scale).toBeCloseTo(20, 4);
    expect(reg.transform!.angle).toBeCloseTo(0, 4);
    const t11 = tooth("11");
    const a = reg.gems.find((g) => g.id === "a")!;
    expect(a.x).toBeCloseTo(((t11.x0 + t11.x1) / 2) * 20 + 600, 3);
    expect(a.y).toBeCloseTo(((t11.cervical + t11.incisal) / 2) * 20 + 300, 3);
    // Physical size: 1 mm half-size × 20 px/mm; 1.5 mm × 20.
    expect(a.r).toBeCloseTo(20, 4);
    expect(reg.gems.find((g) => g.id === "b")!.r).toBeCloseTo(30, 4);
    expect(reg.gems.every((g) => g.tooth === "found")).toBe(true);
    expect(reg.issues).toEqual([]);
    expect(reg.reliable).toBe(true);
    expect(reg.confidence).toBeGreaterThanOrEqual(RELIABLE_CONFIDENCE);
  });

  it("follows the customer's own tooth across, not the reference's", () => {
    const found = photoTeeth(UPPER_FRONT, 20, 600, 300);
    // The customer's 11 is wider toward the midline: the gem at its centre moves with it.
    const t11 = found.find((t) => t.fdi === "11")!;
    t11.width += 20;
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, found);
    expect(reg.gems[0].x).toBeCloseTo(t11.x + t11.width / 2, 0);
  });

  it("turns the gems with a tilted smile", () => {
    const truth = { scale: 15, angle: 8, tx: 500, ty: 400 };
    const found: FoundTooth[] = UPPER_FRONT.map((fdi) => {
      const t = tooth(fdi);
      // Only the biting-edge centre matters to the fit: a box centred there, sitting on it.
      const edge = applySimilarity(truth, { x: (t.x0 + t.x1) / 2, y: t.incisal });
      const w = (t.x1 - t.x0) * truth.scale;
      const h = Math.abs(t.incisal - t.cervical) * truth.scale;
      return { fdi, x: edge.x - w / 2, y: edge.y - h, width: w, height: h };
    });
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "21", { rotation: 30 })] }, found);
    expect(reg.transform!.angle).toBeCloseTo(8, 3);
    expect(reg.gems[0].rotation).toBeCloseTo(38, 3);
  });

  it("sets aside a tooth with a wrong number and still places its gem from the fit", () => {
    const found = photoTeeth(UPPER_FRONT, 20, 600, 300);
    // "12" reported on the other side of the smile.
    const t12 = found.find((t) => t.fdi === "12")!;
    t12.x += 300;
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "12")] }, found);
    expect(reg.teeth.find((t) => t.fdi === "12" && t.source === "outlier")).toBeTruthy();
    expect(reg.teeth.find((t) => t.fdi === "12" && t.source === "fitted")).toBeTruthy();
    const ref = tooth("12");
    expect(reg.gems[0].tooth).toBe("fitted");
    expect(reg.gems[0].x).toBeCloseTo(((ref.x0 + ref.x1) / 2) * 20 + 600, 1);
    expect(reg.issues).toEqual(expect.arrayContaining(["outliers", "design_teeth_missing", "out_of_order"]));
    expect(reg.reliable).toBe(false);
  });

  it("places a gem on a tooth that was not found, from its neighbours", () => {
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "13")] }, photoTeeth(["12", "11", "21", "22"], 20, 600, 300));
    expect(reg.gems[0].tooth).toBe("fitted");
    expect(reg.teeth.some((t) => t.fdi === "13" && t.source === "fitted")).toBe(true);
    expect(reg.issues).toContain("design_teeth_missing");
  });

  it("skips gems on the tongue side or without a place; nothing to place without teeth", () => {
    const gems = [gem("a", "11"), gem("b", "21", { facing: "back" }), { ...gem("c", "11"), at: null }];
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems }, photoTeeth(UPPER_FRONT, 20, 0, 0));
    expect(reg.gems.map((g) => g.id)).toEqual(["a"]);
    expect(reg.skipped).toBe(2);
    const none = registerDesign({ teeth: FRONT_VIEW_TEETH, gems }, [{ fdi: "99", x: 0, y: 0, width: 10, height: 10 }]);
    expect(none.issues).toEqual(["no_teeth"]);
    expect(none.gems).toEqual([]);
    expect(none.reliable).toBe(false);
  });

  it("does not trust a single tooth", () => {
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, photoTeeth(["11"], 20, 0, 0));
    expect(reg.transform!.scale).toBeCloseTo(20, 4);
    expect(reg.issues).toContain("few_teeth");
    expect(reg.reliable).toBe(false);
  });
});
