import { describe, expect, it } from "vitest";
import { LOUPE_LIFT, LOUPE_SIZE, LOUPE_ZOOM, loupeSource, placeLoupe } from "./stageLoupe";

describe("the phone's loupe", () => {
  it("stands above the finger, centred on it", () => {
    const box = placeLoupe(200, 300, 390, 500);
    expect(box.left).toBe(200 - LOUPE_SIZE / 2);
    expect(box.top).toBe(300 - LOUPE_LIFT - LOUPE_SIZE / 2);
  });
  it("moves beside the finger near the top of the stage, on the roomier side", () => {
    const left = placeLoupe(60, 40, 390, 500);
    expect(left.left).toBeGreaterThan(60);
    const right = placeLoupe(330, 40, 390, 500);
    expect(right.left + LOUPE_SIZE).toBeLessThan(330);
  });
  it("stays inside the stage", () => {
    const box = placeLoupe(2, 2, 390, 500);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    const far = placeLoupe(389, 499, 390, 500);
    expect(far.left + LOUPE_SIZE).toBeLessThanOrEqual(390);
    expect(far.top + LOUPE_SIZE).toBeLessThanOrEqual(500);
  });
  it("copies a square centred on the finger, magnified, in device pixels", () => {
    const src = loupeSource(100, 50, 2);
    const side = (LOUPE_SIZE / LOUPE_ZOOM) * 2;
    expect(src.side).toBe(side);
    expect(src.sx + side / 2).toBe(200);
    expect(src.sy + side / 2).toBe(100);
  });
});
