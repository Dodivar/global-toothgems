import { describe, expect, it } from "vitest";
import { ALL_TEETH, isLowerTooth, toothKeys } from "../../data/studioEditor";
import { DENTITION_CROWNS, LOWER_ARCH, UPPER_ARCH } from "./dentition";

const crown = (fdi: string) => DENTITION_CROWNS.find((c) => c.fdi === fdi)!;

describe("reference anatomy (the former scan's calibration)", () => {
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

  it("is at real size: an upper central incisor is about 8.5 mm wide", () => {
    const c = crown("11");
    expect(c.alongMinus + c.alongPlus).toBeGreaterThan(7.5);
    expect(c.alongMinus + c.alongPlus).toBeLessThan(10);
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
