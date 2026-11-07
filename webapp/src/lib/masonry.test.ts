import { describe, expect, it } from "vitest";
import { distributeMasonry } from "./masonry";

describe("distributeMasonry", () => {
  it("fills the shortest column first, keeping the order within each column", () => {
    const heights = [300, 100, 100, 100, 200];
    expect(distributeMasonry(heights, 2, (h) => h)).toEqual([
      [300, 200],
      [100, 100, 100],
    ]);
  });

  it("goes left to right on equal heights", () => {
    expect(distributeMasonry([1, 2, 3, 4], 4, () => 10)).toEqual([[1], [2], [3], [4]]);
  });

  it("keeps empty columns when there are fewer items, and at least one column", () => {
    expect(distributeMasonry(["a"], 3, () => 1)).toEqual([["a"], [], []]);
    expect(distributeMasonry(["a", "b"], 0, () => 1)).toEqual([["a", "b"]]);
  });
});
