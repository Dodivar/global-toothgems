import { describe, expect, it } from "vitest";
import { alignedColumn, alignedHeights, centeredOffsets } from "./layout";

describe("alignedHeights", () => {
  it("lines pieces up midway between the highest and the lowest", () => {
    const out = alignedHeights([
      { id: "a", y: 2, lower: false },
      { id: "b", y: 6, lower: false },
      { id: "c", y: 3, lower: false },
    ]);
    expect([...out.values()]).toEqual([4, 4, 4]);
  });

  it("gives each arch its own line", () => {
    const out = alignedHeights([
      { id: "u1", y: 5, lower: false },
      { id: "u2", y: 7, lower: false },
      { id: "l1", y: -4, lower: true },
      { id: "l2", y: -8, lower: true },
    ]);
    expect(out.get("u1")).toBe(6);
    expect(out.get("u2")).toBe(6);
    expect(out.get("l1")).toBe(-6);
    expect(out.get("l2")).toBe(-6);
  });

  it("leaves out an arch with a single piece", () => {
    const out = alignedHeights([
      { id: "u1", y: 5, lower: false },
      { id: "u2", y: 7, lower: false },
      { id: "l1", y: -4, lower: true },
    ]);
    expect(out.has("l1")).toBe(false);
    expect(alignedHeights([{ id: "a", y: 1, lower: false }]).size).toBe(0);
  });
});

describe("centeredOffsets", () => {
  it("brings a piece alone on its tooth to the middle", () => {
    const out = centeredOffsets([
      { id: "a", toothId: "11", offset: 1.4 },
      { id: "b", toothId: "21", offset: -0.8 },
    ]);
    expect(out.get("a")).toBe(0);
    expect(out.get("b")).toBe(0);
  });

  it("centres pieces sharing a tooth as a cluster, keeping their spacing", () => {
    const out = centeredOffsets([
      { id: "a", toothId: "11", offset: 1 },
      { id: "b", toothId: "11", offset: 3 },
    ]);
    expect(out.get("a")).toBe(-1);
    expect(out.get("b")).toBe(1);
  });
});

describe("alignedColumn", () => {
  it("puts every piece, on either arch, midway between the leftmost and the rightmost", () => {
    const out = alignedColumn([
      { id: "a", x: -4 },
      { id: "b", x: 2 },
      { id: "c", x: 0 },
    ]);
    expect([...out.values()]).toEqual([-1, -1, -1]);
  });

  it("needs at least two pieces", () => {
    expect(alignedColumn([{ id: "a", x: 3 }]).size).toBe(0);
  });
});
