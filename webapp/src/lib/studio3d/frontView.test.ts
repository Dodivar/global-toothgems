import { describe, expect, it } from "vitest";
import { FREE_TOOTH, scaleForSs, type PlacedJewelry, type Vec3 } from "../../data/studioEditor";
import { approxLabialPoint } from "./archLayout";
import { DENTITION_CROWNS } from "./dentition";
import { FRONT_VIEW_BOX, FRONT_VIEW_TEETH, crownOutline, gemOutline, pathToSvg, projectFrontView, seatOnTooth } from "./frontView";

const crown = (fdi: string) => DENTITION_CROWNS.find((c) => c.fdi === fdi)!;

/** A piece on the dentition's labial face of `fdi`, `across` mm along the arch and `up` mm above the crown's middle. */
function onDentition(id: string, fdi: string, across = 0, up = 0, extra: Partial<PlacedJewelry> = {}): PlacedJewelry {
  const c = crown(fdi);
  const position: Vec3 = {
    x: c.center.x + c.tangent.x * across + c.outward.x * c.halfDepth,
    y: c.center.y + up,
    z: c.center.z + c.tangent.z * across + c.outward.z * c.halfDepth,
  };
  return {
    id,
    productId: "gem",
    ss: 5,
    look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
    toothId: fdi,
    position,
    normal: { ...c.outward },
    rotation: 0,
    scale: scaleForSs(5),
    ...extra,
  };
}

describe("front view teeth", () => {
  it("draws all 28 crowns, lower arch first, inside the frame", () => {
    expect(FRONT_VIEW_TEETH).toHaveLength(28);
    expect(FRONT_VIEW_TEETH.slice(0, 14).every((t) => t.lower)).toBe(true);
    expect(FRONT_VIEW_TEETH.slice(14).every((t) => !t.lower)).toBe(true);
    const box = FRONT_VIEW_BOX;
    for (const t of FRONT_VIEW_TEETH) {
      expect(t.x1).toBeGreaterThan(t.x0);
      expect(t.x0).toBeGreaterThanOrEqual(box.x);
      expect(t.x1).toBeLessThanOrEqual(box.x + box.width);
      expect(Math.min(t.cervical, t.incisal)).toBeGreaterThanOrEqual(box.y);
      expect(Math.max(t.cervical, t.incisal)).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  it("puts the upper arch above the lower one (y down), the patient's right on the viewer's left", () => {
    const t11 = FRONT_VIEW_TEETH.find((t) => t.fdi === "11")!;
    const t21 = FRONT_VIEW_TEETH.find((t) => t.fdi === "21")!;
    const t41 = FRONT_VIEW_TEETH.find((t) => t.fdi === "41")!;
    expect(t11.cervical).toBeLessThan(t11.incisal);
    expect(t41.cervical).toBeGreaterThan(t41.incisal);
    expect(t11.cervical).toBeLessThan(t41.cervical);
    expect(t11.x0).toBeLessThan(t21.x0);
    expect(FRONT_VIEW_TEETH.find((t) => t.fdi === "13")!.pointed).toBe(true);
  });

  it("outlines a crown as a closed path", () => {
    const d = pathToSvg(crownOutline(FRONT_VIEW_TEETH[20]));
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("projectFrontView", () => {
  it("projects a dentition piece orthographically, normalised to the frame", () => {
    const p = onDentition("a", "11", 0.5, 1.2);
    const view = projectFrontView([p], "dentition");
    const at = view.gems[0].at!;
    const c = crown("11");
    expect(at.x).toBeCloseTo(c.center.x + c.tangent.x * 0.5, 6);
    expect(Math.abs(at.x - p.position.x)).toBeLessThan(1);
    expect(at.y).toBeCloseTo(-p.position.y, 6);
    expect(at.nx).toBeCloseTo((at.x - view.box.x) / view.box.width, 6);
    expect(at.ny).toBeCloseTo((at.y - view.box.y) / view.box.height, 6);
    expect(at.nr).toBeCloseTo(p.scale / view.box.width, 6);
    expect(at.nx).toBeGreaterThan(0);
    expect(at.nx).toBeLessThan(1);
    expect(at.facing).toBe("front");
    expect(view.aspect).toBeCloseTo(view.box.width / view.box.height, 6);
  });

  it("lands a piece at the middle of tooth 11 of the reference arch at the middle of crown 11", () => {
    const seat = approxLabialPoint("11", 0, 0)!;
    const piece: PlacedJewelry = { ...onDentition("s", "11"), position: seat.position, normal: seat.normal };
    const at = projectFrontView([piece], "studio").gems[0].at!;
    const c = crown("11");
    expect(at.x).toBeCloseTo(c.center.x, 0);
    expect(at.y).toBeCloseTo(-c.center.y, 0);
    const t = FRONT_VIEW_TEETH.find((x) => x.fdi === "11")!;
    expect(at.x).toBeGreaterThan(t.x0);
    expect(at.x).toBeLessThan(t.x1);
  });

  it("keeps a reference-arch piece on the same side of its tooth and near the gum when it was", () => {
    const seat = approxLabialPoint("21", 0.8, 0.8)!;
    const piece: PlacedJewelry = { ...onDentition("s", "21"), position: seat.position, normal: seat.normal };
    const at = projectFrontView([piece], "studio").gems[0].at!;
    const c = crown("21");
    expect(at.x).toBeGreaterThan(c.center.x);
    expect(at.y).toBeLessThan(-c.center.y);
  });

  it("keeps a piece on a side tooth on its drawn crown", () => {
    const at = projectFrontView([onDentition("m", "26")], "dentition").gems[0].at!;
    const t = FRONT_VIEW_TEETH.find((x) => x.fdi === "26")!;
    expect(at.x).toBeGreaterThanOrEqual(t.x0);
    expect(at.x).toBeLessThanOrEqual(t.x1);
  });

  it("does not draw pieces without a known tooth frame, but numbers them last", () => {
    const free = { ...onDentition("free", "11"), toothId: FREE_TOOTH };
    const placed = onDentition("p", "21");
    const view = projectFrontView([free, placed], "dentition");
    expect(view.gems.map((g) => g.id)).toEqual(["p", "free"]);
    expect(view.gems[1].at).toBeNull();
    expect(view.unplaced).toBe(1);
    // An imported model has no frame at all.
    const imported = projectFrontView([placed], "teeth");
    expect(imported.gems[0].at).toBeNull();
    expect(imported.gems[0].number).toBe(1);
  });

  it("numbers in reading order: upper arch left to right, then lower", () => {
    const pieces = [onDentition("l41", "41"), onDentition("u21", "21"), onDentition("u12", "12"), onDentition("u11", "11"), onDentition("l31", "31")];
    const view = projectFrontView(pieces, "dentition");
    expect(view.gems.map((g) => g.id)).toEqual(["u12", "u11", "u21", "l41", "l31"]);
    expect(view.gems.map((g) => g.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("suggests placing from the midline outward, upper first, patient's right first, gum side first", () => {
    const pieces = [
      onDentition("u13", "13"),
      onDentition("u21", "21"),
      onDentition("u11-low", "11", 0, -2),
      onDentition("u11-high", "11", 0, 2),
      onDentition("l41", "41"),
    ];
    const view = projectFrontView(pieces, "dentition");
    const order = [...view.gems].sort((a, b) => a.order - b.order).map((g) => g.id);
    expect(order).toEqual(["u11-high", "u11-low", "u21", "u13", "l41"]);
    expect(new Set(view.gems.map((g) => g.order)).size).toBe(pieces.length);
  });

  it("flags a piece on the tongue side", () => {
    const c = crown("11");
    const back = onDentition("b", "11", 0, 0, { normal: { x: -c.outward.x, y: 0, z: -c.outward.z } });
    expect(seatOnTooth(back, "dentition")!.facing).toBe("back");
    expect(projectFrontView([back], "dentition").gems[0].at!.facing).toBe("back");
  });

  it("turns screen rotation the opposite way of the stored spin (y down)", () => {
    const view = projectFrontView([onDentition("r", "11", 0, 0, { rotation: 30 })], "dentition");
    expect(view.gems[0].at!.rotation).toBe(-30);
  });
});

describe("gemOutline", () => {
  it("scales the 16-unit outline to the gem's real size around its centre", () => {
    const outline = gemOutline("square", { x: 10, y: 20, r: 1.3, rotation: 0 });
    const pts = outline.filter((c) => c[0] !== "Z").map((c) => [c[1] as number, c[2] as number]);
    const xs = pts.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo((12 * 2.6) / 13, 6);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(10, 6);
  });
});
