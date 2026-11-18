import { describe, expect, it } from "vitest";
import { SMILE_CROWNS } from "./smileDentition";
import { easeJaw, JAW_HINGE, jawPose, loopOpenness, MOUTH_LOOP, moveWithJaw } from "./jawMotion";

const lowerIncisor = SMILE_CROWNS.find((c) => c.fdi === "41")!;
const lastLowerMolar = SMILE_CROWNS.find((c) => c.fdi === "37")!;

describe("jaw motion", () => {
  it("leaves the arch where it is when closed", () => {
    const p = { x: 3, y: -4, z: 2 };
    expect(moveWithJaw(p, 0)).toEqual(p);
    expect(jawPose(0)).toEqual({ angle: 0, glide: 0 });
  });

  it("opens a little under 2 cm between the front teeth, the molars less", () => {
    const edge = { ...lowerIncisor.center, y: lowerIncisor.top };
    const open = moveWithJaw(edge, 1);
    const drop = edge.y - open.y;
    expect(drop).toBeGreaterThan(14);
    expect(drop).toBeLessThan(22);
    const molar = moveWithJaw(lastLowerMolar.center, 1);
    expect(lastLowerMolar.center.y - molar.y).toBeLessThan(drop * 0.7);
    // Never sideways.
    expect(open.x).toBe(edge.x);
  });

  it("glides forward a little, mostly at the end of the opening", () => {
    expect(jawPose(1).glide).toBe(JAW_HINGE.glide);
    expect(jawPose(0.5).glide).toBeLessThan(JAW_HINGE.glide / 2);
  });

  it("clamps the openness", () => {
    expect(jawPose(2)).toEqual(jawPose(1));
    expect(jawPose(-1)).toEqual(jawPose(0));
  });

  it("eases in and out", () => {
    expect(easeJaw(0)).toBe(0);
    expect(easeJaw(1)).toBe(1);
    expect(easeJaw(0.5)).toBeCloseTo(0.5);
    expect(easeJaw(0.1)).toBeLessThan(0.1);
  });

  it("loops open, hold, close, rest", () => {
    const { open, hold, close, rest } = MOUTH_LOOP;
    const period = open + hold + close + rest;
    expect(loopOpenness(0)).toBe(0);
    expect(loopOpenness(open + hold / 2)).toBe(1);
    expect(loopOpenness(open + hold + close / 2)).toBeCloseTo(0.5);
    expect(loopOpenness(period - rest / 2)).toBe(0);
    expect(loopOpenness(period + open + 1)).toBe(1);
  });
});
