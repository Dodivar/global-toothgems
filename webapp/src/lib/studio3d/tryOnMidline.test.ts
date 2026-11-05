import { describe, expect, it } from "vitest";
import { FRONT_VIEW_TEETH, type FrontViewGem } from "./frontView";
import {
  arbitratedReliable,
  arbitrateMidline,
  CORRECTED_MIDLINE_TOLERANCE,
  LOWER_EDGES,
  lowerToothGaps,
  segmentTeeth,
  toothGaps,
  UPPER_EDGES,
  type CloseUpPixels,
  type ToothGap,
} from "./tryOnMidline";
import { registerDesign, shiftNumbering, type CloseUpBox, type FoundTooth } from "./tryOnRegistration";

const S = 20; // px/mm
const TX = 600;
const TY = 300;
const UPPER = ["15", "14", "13", "12", "11", "21", "22", "23", "24", "25"];
const tooth = (fdi: string) => FRONT_VIEW_TEETH.find((t) => t.fdi === fdi)!;

/** The reference upper teeth as the photo shows them (scale S, shifted): the truth. */
const truth: FoundTooth[] = UPPER.map((fdi) => {
  const t = tooth(fdi);
  const top = Math.min(t.cervical, t.incisal);
  return { fdi, x: t.x0 * S + TX, y: top * S + TY, width: (t.x1 - t.x0) * S, height: Math.abs(t.incisal - t.cervical) * S };
});
const byFdi = (teeth: FoundTooth[], fdi: string) => teeth.find((t) => t.fdi === fdi)!;
/** Where two neighbouring teeth meet on the photo: halfway between their boxes (the reference's overlap or leave a little room). */
const seam = (left: string, right: string) => (byFdi(truth, left).x + byFdi(truth, left).width + byFdi(truth, right).x) / 2;
const seams = UPPER.slice(1).map((fdi, i) => seam(UPPER[i], fdi));
const midline = seam("11", "21");
const centralWidth = byFdi(truth, "11").width;
const near = (a: number, b: number, px = 6) => Math.abs(a - b) <= px;

/** A close-up of bright teeth with a dark line where each two meet, the line between 11 and 21 darkest. */
function smile(midlineGrey = 40, otherGrey = 120): CloseUpPixels {
  const width = Math.ceil(TX + 60 * S);
  const height = Math.ceil(TY + 20 * S);
  const data = new Uint8ClampedArray(width * height * 4);
  const top = Math.min(...truth.map((t) => t.y));
  const bottom = Math.max(...truth.map((t) => t.y + t.height));
  const left = truth[0].x;
  const right = truth[truth.length - 1].x + truth[truth.length - 1].width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inTeeth = x >= left && x < right && y >= top && y < bottom;
      let grey = inTeeth ? 225 : 90;
      if (inTeeth && seams.some((e) => Math.abs(x - e) <= 2)) grey = Math.abs(x - midline) <= 2 ? midlineGrey : otherGrey;
      data[i] = data[i + 1] = data[i + 2] = grey;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** The photo check's box around the two central incisors, centred `off` central widths right of the midline. */
const box = (off = 0): CloseUpBox => {
  const c11 = byFdi(truth, "11");
  return { x: midline - centralWidth + off * centralWidth, y: c11.y, width: 2 * centralWidth, height: c11.height };
};

const gem = (fdi: string): FrontViewGem => {
  const t = tooth(fdi);
  return {
    id: fdi,
    number: 1,
    order: 1,
    toothId: fdi,
    shape: "round",
    piece: {} as FrontViewGem["piece"],
    at: { x: (t.x0 + t.x1) / 2, y: (t.cervical + t.incisal) / 2, r: 1, nx: 0, ny: 0, nr: 0, stretch: [1, 1], rotation: 0, u: 0, v: 0, facing: "front" },
  };
};
const place = (found: FoundTooth[], centrals: CloseUpBox | null) =>
  registerDesign({ teeth: FRONT_VIEW_TEETH, gems: ["13", "11", "21", "23"].map(gem) }, found, { centrals });

describe("toothGaps", () => {
  it("finds the lines between the teeth, the midline's strongest", () => {
    const gaps = toothGaps(smile(), truth);
    const strongest = gaps.reduce((a, b) => (b.strength > a.strength ? b : a));
    expect(near(strongest.x, midline, 2)).toBe(true);
    for (const e of [seam("13", "12"), seam("12", "11"), seam("21", "22"), seam("22", "23")]) expect(gaps.some((g) => near(g.x, e, 2))).toBe(true);
  });

  it("finds nothing without upper teeth", () => {
    expect(toothGaps(smile(), [])).toEqual([]);
  });
});

describe("arbitrateMidline", () => {
  const gaps = toothGaps(smile(), truth);

  it("keeps the names of readings that agree, the check box moved onto the gap", () => {
    const a = arbitrateMidline(truth, box(0.1), gaps);
    expect(a.triggered).toBe(false);
    expect(a.corrections).toEqual([]);
    expect(near(a.midline!, midline, 2)).toBe(true);
    expect(a.found.map((t) => t.fdi).sort()).toEqual(truth.map((t) => t.fdi).sort());
    expect(near(a.centrals!.x + a.centrals!.width / 2, midline, 2)).toBe(true);
  });

  it("leaves readings that agree alone when the gap is a tooth away from them", () => {
    const far: ToothGap[] = [{ x: midline + 0.8 * centralWidth, strength: 60 }];
    const a = arbitrateMidline(truth, box(0.1), far);
    expect(a.midline).toBeNull();
    expect(a.found).toEqual(truth);
    expect(a.centrals).toEqual(box(0.1));
  });

  it("keeps teeth that are right when the check's box is off (the box then refused them)", () => {
    expect(place(truth, box(0.6)).reliable).toBe(false);
    const a = arbitrateMidline(truth, box(0.6), gaps);
    expect(a.triggered).toBe(true);
    expect(a.corrections).toEqual([]);
    expect(near(a.midline!, midline, 2)).toBe(true);
    expect(a.centralsOffset).toBeCloseTo(0.6, 1);
    const reg = place(a.found, a.centrals);
    expect(reg.reliable).toBe(true);
    expect(reg.midlineError!).toBeLessThan(0.1);
  });

  it("renames teeth read a whole tooth off, the box right", () => {
    const off = shiftNumbering(truth, -1, 0); // the real 21 named 11, and so on
    const a = arbitrateMidline(off, box(0), gaps);
    expect(a.corrections).toEqual(["shifted"]);
    expect(a.teethOffset!).toBeGreaterThan(0.65);
    for (const fdi of ["13", "11", "21", "22"]) expect(near(byFdi(a.found, fdi).x, byFdi(truth, fdi).x)).toBe(true);
    expect(place(a.found, a.centrals).reliable).toBe(true);
  });

  it("names back a reading mirrored left to right", () => {
    const swap: Record<string, string> = { "1": "2", "2": "1" };
    const mirrored = truth.map((t) => ({ ...t, fdi: swap[t.fdi[0]] + t.fdi[1] }));
    const a = arbitrateMidline(mirrored, box(0), gaps);
    expect(a.corrections).toContain("mirrored");
    expect(near(byFdi(a.found, "11").x, byFdi(truth, "11").x)).toBe(true);
  });

  it("renames the side of a central incisor that was missed", () => {
    // The 11 not found: the lateral named 11, the canine 12, and so on; the 2x side right.
    const missed = truth.filter((t) => t.fdi !== "11").map((t) => (t.fdi[0] === "1" ? { ...t, fdi: "1" + (Number(t.fdi[1]) - 1) } : t));
    const a = arbitrateMidline(missed, box(0), gaps);
    expect(a.corrections).toEqual(["half_shifted"]);
    expect(near(byFdi(a.found, "12").x, byFdi(truth, "12").x)).toBe(true);
    expect(near(byFdi(a.found, "21").x, byFdi(truth, "21").x)).toBe(true);
    // The missed 11 rebuilt between the gaps, its height its mirror's.
    const t11 = byFdi(a.found, "11");
    expect(near(t11.x, byFdi(truth, "11").x, 8)).toBe(true);
    expect(near(t11.x + t11.width, midline, 2)).toBe(true);
  });

  it("moves box edges onto the gaps near them when the boxes cannot be rebuilt", () => {
    const squeezed = truth.map((t) => (t.fdi === "22" ? { ...t, x: t.x - 0.2 * centralWidth } : t));
    const lone = gaps.filter((g) => Math.abs(g.x - midline) < 3 || g.x > midline + 0.3 * centralWidth); // no outer edge on the 1x side
    const a = arbitrateMidline(squeezed, box(0.4), lone);
    expect(a.segmented.upper).toBe(0);
    expect(a.snapped).toBeGreaterThan(0);
    expect(near(byFdi(a.found, "22").x, byFdi(truth, "22").x)).toBe(true);
  });

  it("changes nothing when no gap stands out", () => {
    const even = toothGaps(smile(120, 120), truth);
    const a = arbitrateMidline(truth, box(0.6), even);
    expect(a.triggered).toBe(true);
    expect(a.midline).toBeNull();
    expect(a.found).toEqual(truth);
    expect(a.centrals).toEqual(box(0.6));
  });

  it("needs both central incisors", () => {
    const gapsAt: ToothGap[] = [{ x: midline, strength: 50 }];
    const a = arbitrateMidline(truth.filter((t) => t.fdi !== "21"), box(0.6), gapsAt);
    expect(a.triggered).toBe(false);
  });
});

describe("arbitratedReliable", () => {
  const gaps = toothGaps(smile(), truth);

  it("trusts renamed teeth whose fit lands on the gap", () => {
    const a = arbitrateMidline(shiftNumbering(truth, -1, 0), box(0), gaps);
    const reg = place(a.found, a.centrals);
    expect(reg.midlineError!).toBeLessThanOrEqual(CORRECTED_MIDLINE_TOLERANCE);
    expect(arbitratedReliable(reg, a)).toBe(true);
  });

  it("does not trust renamed teeth whose fit still misses the gap", () => {
    const a = arbitrateMidline(shiftNumbering(truth, -1, 0), box(0), gaps);
    const moved = { ...a, centrals: { ...a.centrals!, x: a.centrals!.x + 0.4 * centralWidth } };
    const reg = place(a.found, moved.centrals);
    expect(reg.reliable).toBe(true); // within the usual tolerance...
    expect(arbitratedReliable(reg, moved)).toBe(false); // ...not the renamed reading's
  });

  it("keeps the usual check when nothing was renamed", () => {
    const a = arbitrateMidline(truth, box(0.6), gaps);
    const reg = place(a.found, a.centrals);
    expect(arbitratedReliable(reg, a)).toBe(reg.reliable);
  });
});

describe("segmentTeeth", () => {
  // A smile whose teeth have the usual widths (UPPER_EDGES, LOWER_EDGES), and the model's even grid of boxes on it.
  const M = 600; // midline
  const U = 100; // central incisor width / UPPER_EDGES[0]
  const LM = 610; // the lower midline, a little off the upper one
  const upperSeams = [M, ...UPPER_EDGES.flatMap((e) => [M - e * U, M + e * U])];
  const lowerSeams = [LM, ...LOWER_EDGES.flatMap((e) => [LM - e * U, LM + e * U])];
  const pixels = (): CloseUpPixels => {
    const width = 1200;
    const height = 420;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const upper = y >= 60 && y < 260;
        const lower = y >= 260 && y < 380;
        const inside = x >= M - 300 && x < M + 300 && (upper || lower);
        const seams = upper ? upperSeams : lowerSeams;
        let grey = inside ? 225 : 90;
        if (inside && seams.some((e) => Math.abs(x - e) <= 2)) grey = Math.abs(x - (upper ? M : LM)) <= 2 ? 40 : 120;
        data[i] = data[i + 1] = data[i + 2] = grey;
        data[i + 3] = 255;
      }
    }
    return { width, height, data };
  };
  // The model's grid: every tooth 75 px wide on the upper arch, 50 on the lower one, from a midline 20 px off.
  const grid = (row: string[], from: number, step: number, y: number, height: number) =>
    row.map((fdi, k) => ({ fdi, x: from + k * step, y, width: step, height }));
  const model: FoundTooth[] = [
    ...grid(["14", "13", "12", "11"], M + 20 - 4 * 75, 75, 60, 200),
    ...grid(["21", "22", "23", "24"], M + 20, 75, 60, 200),
    ...grid(["43", "42", "41"], M + 20 - 3 * 50, 50, 250, 140),
    ...grid(["31", "32", "33"], M + 20, 50, 250, 140),
  ];
  const px = pixels();
  const upperGaps = toothGaps(px, model);
  const lowerGaps = lowerToothGaps(px, model);
  const midlineGap = upperGaps.reduce((a, b) => (b.strength > a.strength ? b : a));

  it("finds the gaps of both arches", () => {
    expect(near(midlineGap.x, M, 2)).toBe(true);
    for (const e of LOWER_EDGES.slice(0, 2)) expect(lowerGaps.some((g) => near(g.x, LM + e * U, 3))).toBe(true);
  });

  it("rebuilds each box between the gaps, from the midline out", () => {
    const seg = segmentTeeth(model, midlineGap, 150, upperGaps, lowerGaps);
    expect(seg.upper).toBeGreaterThanOrEqual(6);
    expect(seg.lower).toBe(6);
    expect(near(seg.lowerMidline!, LM, 2)).toBe(true);
    const box = (fdi: string) => seg.found.find((t) => t.fdi === fdi)!;
    const edges = (fdi: string) => [box(fdi).x, box(fdi).x + box(fdi).width];
    const [a11, b11] = edges("11");
    expect(near(a11, M - UPPER_EDGES[0] * U, 3) && near(b11, M, 3)).toBe(true);
    const [a22, b22] = edges("22");
    expect(near(a22, M + UPPER_EDGES[0] * U, 3) && near(b22, M + UPPER_EDGES[1] * U, 3)).toBe(true);
    const [a31, b31] = edges("31");
    expect(near(a31, LM, 3) && near(b31, LM + LOWER_EDGES[0] * U, 3)).toBe(true);
    const [a23, b23] = edges("23");
    expect(near(a23, M + UPPER_EDGES[1] * U, 3) && near(b23, M + UPPER_EDGES[2] * U, 3)).toBe(true);
    expect(box("43").y).toBe(250); // the model's top and height kept
    expect(new Set(seg.found.map((t) => t.fdi)).size).toBe(seg.found.length);
  });

  it("puts the gems on the teeth the gaps show", () => {
    const seg = segmentTeeth(model, midlineGap, 150, upperGaps, lowerGaps);
    const reg = registerDesign({ teeth: FRONT_VIEW_TEETH, gems: ["12", "22", "42", "32"].map(gem) }, seg.found, { centrals: null });
    const onTooth = (fdi: string) => {
      const g = reg.gems.find((x) => x.toothId === fdi)!;
      const b = seg.found.find((t) => t.fdi === fdi)!;
      return g.x >= b.x && g.x <= b.x + b.width;
    };
    for (const fdi of ["12", "22", "42", "32"]) expect(onTooth(fdi)).toBe(true);
  });

  it("rebuilds nothing without the central incisors' outer edges alike on both sides", () => {
    const oneSided = upperGaps.filter((g) => g.x >= M - 3);
    const seg = segmentTeeth(model, midlineGap, 150, oneSided, lowerGaps);
    expect(seg.upper).toBe(0);
    expect(seg.found).toEqual(model);
  });
});
