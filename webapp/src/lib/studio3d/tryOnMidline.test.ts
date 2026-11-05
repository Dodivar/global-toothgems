import { describe, expect, it } from "vitest";
import { FRONT_VIEW_TEETH, type FrontViewGem } from "./frontView";
import { arbitratedReliable, arbitrateMidline, CORRECTED_MIDLINE_TOLERANCE, toothGaps, type CloseUpPixels, type ToothGap } from "./tryOnMidline";
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

  it("leaves the readings alone when they agree", () => {
    const a = arbitrateMidline(truth, box(0.1), gaps);
    expect(a.triggered).toBe(false);
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
    expect(a.found.some((t) => t.fdi === "11")).toBe(false);
    expect(near(byFdi(a.found, "21").x, byFdi(truth, "21").x)).toBe(true);
  });

  it("moves box edges onto the gaps near them", () => {
    const squeezed = truth.map((t) => (t.fdi === "22" ? { ...t, x: t.x - 0.2 * centralWidth } : t));
    const a = arbitrateMidline(squeezed, box(0.4), gaps);
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
