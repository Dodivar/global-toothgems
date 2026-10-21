import { describe, expect, it } from "vitest";
import { thumbPath, thumbSize } from "./trainingMediaThumbnail";

describe("thumbSize", () => {
  it("brings the longer side down to the maximum, keeping the proportions", () => {
    expect(thumbSize(4000, 3000)).toEqual({ width: 480, height: 360 });
    expect(thumbSize(1080, 1920)).toEqual({ width: 270, height: 480 });
  });

  it("never enlarges a small image", () => {
    expect(thumbSize(300, 200)).toEqual({ width: 300, height: 200 });
  });
});

describe("thumbPath", () => {
  it("sits next to the original, under a name an original never takes", () => {
    expect(thumbPath("abc", "image/webp")).toBe("media/abc/_thumb.webp");
    expect(thumbPath("abc", "image/jpeg")).toBe("media/abc/_thumb.jpg");
  });
});
