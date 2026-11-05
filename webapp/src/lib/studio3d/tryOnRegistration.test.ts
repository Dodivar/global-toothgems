import { describe, expect, it } from "vitest";
import { FRONT_VIEW_TEETH, type FrontViewGem, type FrontViewPoint } from "./frontView";
import {
  applySimilarity,
  fitArches,
  fitSimilarity,
  LOWER_OVERBITE_MM,
  MAX_CENTRALS_SPAN,
  registerDesign,
  RELIABLE_CONFIDENCE,
  shiftNumbering,
  type FoundTooth,
} from "./tryOnRegistration";

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

  /** Upper front teeth, and lower incisors whose visible part starts at the upper teeth's edge and shows `visibleMm`. */
  function overbitePhoto(visibleMm: number): { found: FoundTooth[]; upperEdge: number } {
    const s = 20;
    const upper = photoTeeth(UPPER_FRONT, s, 600, 300);
    const upperEdge = tooth("11").incisal * s + 300;
    const lower = ["42", "41", "31", "32"].map((fdi) => {
      const t = tooth(fdi);
      return { fdi, x: t.x0 * s + 600, y: upperEdge, width: (t.x1 - t.x0) * s, height: visibleMm * s };
    });
    return { found: [...upper, ...lower], upperEdge };
  }

  it("takes a lower tooth's edge above the upper teeth that cover it, and keeps its gem on the visible part", () => {
    const { found, upperEdge } = overbitePhoto(5);
    const t41 = tooth("41");
    // 4 mm from the biting edge: 2 mm under the upper teeth's edge with the overbite.
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "41", { y: t41.incisal + 4 })] }, found);
    const a = reg.gems[0];
    expect(a.y).toBeCloseTo(upperEdge + (4 - LOWER_OVERBITE_MM) * 20, -1);
    expect(a.tooth).toBe("found");
  });

  it("hides a gem whose place is outside the visible part of its tooth (behind a lip)", () => {
    const { found } = overbitePhoto(2.5);
    const t41 = tooth("41");
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "41", { y: t41.incisal + 6.5 }), gem("b", "11")] }, found);
    expect(reg.gems.find((g) => g.id === "a")!.tooth).toBe("hidden");
    expect(reg.gems.find((g) => g.id === "b")!.tooth).toBe("found");
  });
});

describe("the lower arch's opening", () => {
  it("fits the lower arch's offset down with the similarity", () => {
    const truth = { scale: 18, angle: -4, tx: 300, ty: 200 };
    const refs = ["12", "11", "21", "22", "41", "31"].map((fdi) => {
      const t = tooth(fdi);
      return { p: { x: (t.x0 + t.x1) / 2, y: t.incisal }, lower: t.lower };
    });
    const targets = refs.map((r) => applySimilarity(truth, r.lower ? { x: r.p.x, y: r.p.y + 7 } : r.p));
    const fit = fitArches(refs, targets)!;
    expect(fit.lowerOffset).toBeCloseTo(7, 3);
    expect(fit.t.scale).toBeCloseTo(18, 3);
    expect(fit.t.angle).toBeCloseTo(-4, 3);
  });

  it("keeps the lower teeth and their gems when the mouth is open", () => {
    const s = 20;
    const lower = photoTeeth(["42", "41", "31", "32"], s, 600, 300).map((t) => ({ ...t, y: t.y + 8 * s }));
    const found = [...photoTeeth(UPPER_FRONT, s, 600, 300), ...lower];
    const t41 = tooth("41");
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11"), gem("b", "41")] }, found);
    expect(reg.lowerOffset).toBeGreaterThan(5);
    expect(reg.teeth.filter((t) => t.source === "outlier")).toEqual([]);
    const b = reg.gems.find((g) => g.id === "b")!;
    expect(b.tooth).toBe("found");
    expect(b.y).toBeCloseTo(((t41.cervical + t41.incisal) / 2 + 8) * s + 300, 0);
    expect(reg.reliable).toBe(true);
  });
});

describe("the teeth's numbers", () => {
  const s = 20;
  /** Real teeth named one tooth to the left on the upper arch (11 called 12, 21 called 11…). */
  const UPPER_NAMED_LEFT: Record<string, string> = { "13": "14", "12": "13", "11": "12", "21": "11", "22": "21", "23": "22" };
  const misnamed = (found: FoundTooth[]) => found.map((t) => ({ ...t, fdi: UPPER_NAMED_LEFT[t.fdi] ?? t.fdi }));
  const centrals = () => {
    const a = tooth("11");
    const b = tooth("21");
    return { x: a.x0 * s + 600, y: a.cervical * s + 300, width: (b.x1 - a.x0) * s, height: (a.incisal - a.cervical) * s };
  };

  it("moves an arch's numbers along it, dropping teeth moved off it", () => {
    const found = [{ fdi: "16", x: 0, y: 0, width: 1, height: 1 }, { fdi: "11", x: 0, y: 0, width: 1, height: 1 }, { fdi: "41", x: 0, y: 0, width: 1, height: 1 }];
    expect(shiftNumbering(found, 1, -1).map((t) => t.fdi)).toEqual(["15", "21", "42"]);
    expect(shiftNumbering(found, -1, 0).map((t) => t.fdi)).toEqual(["12", "41"]);
  });

  it("renumbers an arch named one tooth off, and puts the gem back on its tooth", () => {
    const truth = photoTeeth(UPPER_FRONT, s, 600, 300);
    const t11 = tooth("11");
    for (const options of [{}, { centrals: centrals() }]) {
      const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, misnamed(truth), options);
      expect(reg.renumbered).toEqual({ upper: 1, lower: 0 });
      expect(reg.issues).toContain("renumbered");
      expect(reg.gems[0].x).toBeCloseTo(((t11.x0 + t11.x1) / 2) * s + 600, 0);
    }
  });

  it("keeps the function's numbers when they are right, even with uneven teeth", () => {
    const found = photoTeeth(UPPER_FRONT, s, 600, 300).map((t, i) => ({ ...t, width: t.width * (i % 2 ? 1.12 : 0.9), x: t.x + (i % 3) * 6 }));
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, found, { centrals: centrals() });
    expect(reg.renumbered).toEqual({ upper: 0, lower: 0 });
    expect(reg.issues).not.toContain("renumbered");
    expect(reg.midlineError).toBeLessThan(0.5);
  });

  it("flags a midline far from the photo check's central incisors", () => {
    const box = { ...centrals(), x: centrals().x + 0.8 * (tooth("11").x1 - tooth("11").x0) * s };
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, photoTeeth(UPPER_FRONT, s, 600, 300), { centrals: box });
    expect(reg.issues).toContain("midline_mismatch");
    expect(reg.midlineError).toBeGreaterThan(0.5);
    const clean = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, photoTeeth(UPPER_FRONT, s, 600, 300));
    expect(reg.confidence).toBeLessThan(clean.confidence);
    expect(reg.reliable).toBe(false);
    expect(clean.reliable).toBe(true);
  });

  /** The check model's box drawn `k` times too wide, around the same centre (as on the trial photos of 2026-11-05). */
  const widened = (k: number, shift = 0) => {
    const c = centrals();
    const width = c.width * k;
    return { ...c, x: c.x + c.width / 2 - width / 2 + shift * (tooth("11").x1 - tooth("11").x0) * s, width };
  };

  it("still checks the midline against a box drawn too wide", () => {
    const truth = photoTeeth(UPPER_FRONT, s, 600, 300);
    const good = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, truth, { centrals: widened(1.8) });
    expect(good.midlineError).not.toBeNull();
    expect(good.midlineError!).toBeLessThan(0.1);
    expect(good.reliable).toBe(true);
    const off = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, truth, { centrals: widened(1.8, 0.8) });
    expect(off.issues).toContain("midline_mismatch");
    expect(off.reliable).toBe(false);
  });

  it("ignores a box far too wide to be about the central incisors", () => {
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: [gem("a", "11")] }, photoTeeth(UPPER_FRONT, s, 600, 300), {
      centrals: widened(MAX_CENTRALS_SPAN + 0.5, 0.8),
    });
    expect(reg.midlineError).toBeNull();
    expect(reg.reliable).toBe(true);
  });
});
