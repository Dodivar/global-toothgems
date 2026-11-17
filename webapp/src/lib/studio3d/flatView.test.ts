import { describe, expect, it } from "vitest";
import { scaleForSize, type PlacedJewelry } from "../../data/studioEditor";
import { DENTITION_CROWNS } from "./dentition";
import { FLAT_VIEW_BOX, FLAT_VIEW_TEETH, crownDetails, crownOutline, projectFlatView } from "./flatView";
import { pathToSvg, projectFrontView, type FrontViewPathCommand } from "./frontView";

const tooth = (fdi: string) => FLAT_VIEW_TEETH.find((t) => t.fdi === fdi)!;
const width = (fdi: string) => tooth(fdi).x1 - tooth(fdi).x0;
const height = (fdi: string) => Math.abs(tooth(fdi).incisal - tooth(fdi).cervical);

/** A piece on the dentition's outer face of `fdi`, `across` mm along the arch and `up` mm above the crown's middle. */
function onDentition(id: string, fdi: string, across = 0, up = 0): PlacedJewelry {
  const c = DENTITION_CROWNS.find((x) => x.fdi === fdi)!;
  return {
    id,
    productId: "gem",
    size: { ss: 5 },
    look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
    toothId: fdi,
    position: {
      x: c.center.x + c.tangent.x * across + c.outward.x * c.halfDepth,
      y: c.center.y + up,
      z: c.center.z + c.tangent.z * across + c.outward.z * c.halfDepth,
    },
    normal: { ...c.outward },
    rotation: 0,
    scale: scaleForSize({ ss: 5 }),
  };
}

/** Every point a path goes through or is pulled toward. */
const points = (commands: FrontViewPathCommand[]) =>
  commands.flatMap((c) => {
    const out: [number, number][] = [];
    for (let i = 1; i + 1 < c.length; i += 2) out.push([c[i] as number, c[i + 1] as number]);
    return out;
  });

describe("flat view teeth", () => {
  it("lays out all 28 crowns side by side, each arch centred on the midline", () => {
    expect(FLAT_VIEW_TEETH).toHaveLength(28);
    for (const lower of [false, true]) {
      const row = FLAT_VIEW_TEETH.filter((t) => t.lower === lower);
      expect(row).toHaveLength(14);
      row.slice(1).forEach((t, i) => expect(t.x0).toBeCloseTo(row[i].x1, 6));
      expect(row[0].x0).toBeCloseTo(-row[13].x1, 6);
      expect(row[6].x1).toBeCloseTo(0, 6);
    }
    // The patient's right is on the viewer's left.
    expect(tooth("11").x1).toBeLessThanOrEqual(tooth("21").x0);
    expect(tooth("17").x0).toBeLessThan(tooth("11").x0);
  });

  it("keeps the two arches apart, the upper one above (y down)", () => {
    const upperEdge = Math.max(...FLAT_VIEW_TEETH.filter((t) => !t.lower).map((t) => t.incisal));
    const lowerEdge = Math.min(...FLAT_VIEW_TEETH.filter((t) => t.lower).map((t) => t.incisal));
    expect(upperEdge).toBeLessThan(lowerEdge);
    expect(tooth("11").cervical).toBeLessThan(tooth("11").incisal);
    expect(tooth("41").cervical).toBeGreaterThan(tooth("41").incisal);
  });

  it("gives every tooth the proportions of its type", () => {
    // Central incisors are the widest front teeth; laterals narrower and shorter; molars wide and low.
    expect(width("11")).toBeGreaterThan(width("12"));
    expect(height("11")).toBeGreaterThan(height("12"));
    expect(width("16")).toBeGreaterThan(width("11"));
    expect(height("16")).toBeLessThan(height("11"));
    // Lower incisors are much narrower than the upper ones.
    expect(width("41")).toBeLessThan(width("11") * 0.7);
    expect(tooth("13").kind).toBe("canine");
    expect(tooth("36").kind).toBe("m1");
    // A molar shows its whole outer face, unlike in the front projection.
    expect(width("26")).toBeGreaterThan(9);
  });

  it("frames every crown", () => {
    const box = FLAT_VIEW_BOX;
    for (const t of FLAT_VIEW_TEETH) {
      expect(t.x0).toBeGreaterThan(box.x);
      expect(t.x1).toBeLessThan(box.x + box.width);
      expect(Math.min(t.cervical, t.incisal)).toBeGreaterThan(box.y);
      expect(Math.max(t.cervical, t.incisal)).toBeLessThan(box.y + box.height);
    }
  });
});

describe("flat view outlines", () => {
  it("outlines each crown as a closed path inside its own slot", () => {
    for (const t of FLAT_VIEW_TEETH) {
      const outline = crownOutline(t);
      const d = pathToSvg(outline);
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      const slack = 0.25;
      for (const [x, y] of points(outline)) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(t.x0 - 1e-9);
        expect(x).toBeLessThanOrEqual(t.x1 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(Math.min(t.cervical, t.incisal) - slack);
        expect(y).toBeLessThanOrEqual(Math.max(t.cervical, t.incisal) + slack);
      }
    }
  });

  it("mirrors the two sides of an arch", () => {
    const xs = (fdi: string) => points(crownOutline(tooth(fdi))).map(([x]) => x);
    const right = xs("12");
    const left = xs("22");
    right.forEach((x, i) => expect(x).toBeCloseTo(-left[i], 6));
  });

  it("draws a groove on the molars only", () => {
    expect(crownDetails(tooth("16"))).toHaveLength(1);
    expect(crownDetails(tooth("47"))).toHaveLength(1);
    expect(crownDetails(tooth("11"))).toHaveLength(0);
    expect(crownDetails(tooth("14"))).toHaveLength(0);
  });
});

describe("projectFlatView", () => {
  it("puts a piece at the middle of its crown at the middle of the drawn one", () => {
    const view = projectFlatView([onDentition("a", "11")], "dentition");
    const at = view.gems[0].at!;
    const t = tooth("11");
    expect(at.x).toBeCloseTo((t.x0 + t.x1) / 2, 6);
    expect(at.y).toBeCloseTo((t.cervical + t.incisal) / 2, 6);
    expect(at.r).toBe(scaleForSize({ ss: 5 }));
    expect(at.nx).toBeCloseTo((at.x - view.box.x) / view.box.width, 6);
    expect(view.box).toBe(FLAT_VIEW_BOX);
    expect(view.teeth).toBe(FLAT_VIEW_TEETH);
  });

  it("keeps a piece on the same side of its tooth and at the same height on it", () => {
    // Toward the patient's left and the gum on an upper tooth: right and up on the drawing.
    const up = projectFlatView([onDentition("a", "21", 1.5, 2)], "dentition").gems[0].at!;
    const t21 = tooth("21");
    expect(up.x).toBeGreaterThan((t21.x0 + t21.x1) / 2);
    expect(up.y).toBeLessThan((t21.cervical + t21.incisal) / 2);
    // Toward the gum on a lower tooth is down.
    const down = projectFlatView([onDentition("b", "41", 0, -2)], "dentition").gems[0].at!;
    expect(down.y).toBeGreaterThan((tooth("41").cervical + tooth("41").incisal) / 2);
  });

  it("draws pieces on the side teeth on their own crown, apart from each other", () => {
    const view = projectFlatView([onDentition("m", "26"), onDentition("p", "25"), onDentition("n", "27")], "dentition");
    for (const g of view.gems) {
      const t = tooth(g.toothId);
      expect(g.at!.x).toBeGreaterThan(t.x0);
      expect(g.at!.x).toBeLessThan(t.x1);
    }
    const xs = view.gems.map((g) => g.at!.x);
    expect(xs[1] - xs[0]).toBeGreaterThan(5);
    expect(xs[2] - xs[1]).toBeGreaterThan(5);
  });

  it("numbers and orders the gems as the front projection does", () => {
    const pieces = [
      onDentition("l41", "41"),
      onDentition("u21", "21"),
      onDentition("u16", "16"),
      onDentition("u11-low", "11", 0, -2),
      onDentition("u11-high", "11", 0, 2),
      onDentition("l36", "36"),
    ];
    const flat = projectFlatView(pieces, "dentition");
    const front = projectFrontView(pieces, "dentition");
    expect(flat.gems.map((g) => [g.id, g.number, g.order])).toEqual(front.gems.map((g) => [g.id, g.number, g.order]));
  });

  it("does not draw pieces without a known tooth frame", () => {
    const view = projectFlatView([onDentition("p", "21")], "teeth");
    expect(view.gems[0].at).toBeNull();
    expect(view.unplaced).toBe(1);
  });
});
