import { describe, expect, it } from "vitest";
import { ALL_TEETH, isLowerTooth, toothKeys, type Vec3 } from "../../data/studioEditor";
import { crownAt, DENTITION_CROWNS, LOWER_ARCH, UPPER_ARCH } from "./dentition";

const along = (p: Vec3, dir: Vec3, d: number): Vec3 => ({ x: p.x + dir.x * d, y: p.y + dir.y * d, z: p.z + dir.z * d });
const crown = (fdi: string) => DENTITION_CROWNS.find((c) => c.fdi === fdi)!;
/** A point on the labial face of a crown, at its middle. */
const labial = (fdi: string) => along(crown(fdi).center, crown(fdi).outward, crown(fdi).halfDepth);

describe("default dentition calibration", () => {
  it("knows every tooth of both arches, once", () => {
    expect(DENTITION_CROWNS.map((c) => c.fdi).sort()).toEqual([...ALL_TEETH].sort());
    expect(UPPER_ARCH.every((fdi) => !crown(fdi).lower)).toBe(true);
    expect(LOWER_ARCH.every((fdi) => crown(fdi).lower)).toBe(true);
  });

  it("faces every crown away from the tongue, and the front teeth toward the viewer", () => {
    for (const c of DENTITION_CROWNS) expect(Math.hypot(c.outward.x, c.outward.z)).toBeCloseTo(1);
    for (const fdi of ["11", "21", "41", "31"]) expect(crown(fdi).outward.z).toBeGreaterThan(0.9);
  });

  it("puts the upper crowns above the occlusal plane and the lower ones below", () => {
    for (const fdi of UPPER_ARCH) expect(crown(fdi).center.y).toBeGreaterThan(0);
    for (const fdi of LOWER_ARCH) expect(crown(fdi).center.y).toBeLessThan(0);
  });

  it("scales the scan to real size: an upper central incisor is about 8.5 mm wide", () => {
    const c = crown("11");
    expect(c.alongMinus + c.alongPlus).toBeGreaterThan(7.5);
    expect(c.alongMinus + c.alongPlus).toBeLessThan(10);
  });

  it("recognises each crown from a point of its labial face", () => {
    for (const c of DENTITION_CROWNS) expect(crownAt(labial(c.fdi))).toBe(c.fdi);
  });

  it("tells neighbours apart along the arch", () => {
    const c = crown("11");
    expect(crownAt(along(labial("11"), c.tangent, c.alongPlus + 1))).toBe("21");
    expect(crownAt(along(labial("11"), c.tangent, -(c.alongMinus + 1)))).toBe("12");
  });

  it("refuses the gum above an upper crown and below a lower one", () => {
    const up = crown("11");
    expect(crownAt({ ...labial("11"), y: up.top + 2 })).toBeNull();
    const low = crown("41");
    expect(crownAt({ ...labial("41"), y: low.bottom - 2 })).toBeNull();
  });

  it("refuses points far off the enamel: the palate, the socle in front", () => {
    const c = crown("21");
    expect(crownAt(along(c.center, c.outward, -(c.halfDepth + 4)))).toBeNull();
    expect(crownAt(along(c.center, c.outward, c.halfDepth + 6))).toBeNull();
  });
});

describe("tooth names", () => {
  it("names the lower quadrants", () => {
    expect(toothKeys("43")).toEqual({ tooth: "canine", side: "lowerRight" });
    expect(toothKeys("31")).toEqual({ tooth: "central", side: "lowerLeft" });
    expect(toothKeys("11")).toEqual({ tooth: "central", side: "right" });
    expect(toothKeys("28")).toBeNull();
    expect(toothKeys("51")).toBeNull();
  });

  it("tells the lower arch", () => {
    expect(isLowerTooth("36")).toBe(true);
    expect(isLowerTooth("47")).toBe(true);
    expect(isLowerTooth("26")).toBe(false);
  });
});
