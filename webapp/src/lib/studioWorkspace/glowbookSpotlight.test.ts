import { describe, expect, it } from "vitest";
import { needsSpotlightVideo, SPOTLIGHT_SECONDS, spotlightVideoPath, toPublicSpotlightVideo, toSpotlightState } from "./glowbookSpotlight";
import { toPublicGlowbook } from "./glowbook";
import { SPOTLIGHT_VIDEO, sweepAngle } from "../studio3d/socialExport/motion";

const row = {
  featured_item_id: "item-1",
  item_id: "item-1",
  path: "user-1/spotlight-item-1-a.mp4",
  type: "video/mp4",
  seconds: 5,
  current: true,
};

describe("toSpotlightState", () => {
  it("reads the database's state", () => {
    expect(toSpotlightState(row)).toEqual({
      featuredItemId: "item-1",
      itemId: "item-1",
      path: "user-1/spotlight-item-1-a.mp4",
      type: "video/mp4",
      current: true,
    });
  });

  it("is null without a Glowbook", () => {
    expect(toSpotlightState(null)).toBeNull();
    expect(toSpotlightState([])).toBeNull();
  });

  it("never calls a missing video current, and drops unknown types", () => {
    expect(toSpotlightState({ featured_item_id: "item-1", path: null, current: true })).toMatchObject({ path: null, current: false });
    expect(toSpotlightState({ ...row, type: "video/quicktime" })).toMatchObject({ type: null });
  });
});

describe("needsSpotlightVideo", () => {
  it("records when a spotlight is chosen and its video is missing, stale or of an older kind", () => {
    expect(needsSpotlightVideo(toSpotlightState({ featured_item_id: "item-1", path: null, current: false }))).toBe(true);
    expect(needsSpotlightVideo(toSpotlightState({ ...row, current: false }))).toBe(true);
  });

  it("does nothing without a spotlight or with a current video", () => {
    expect(needsSpotlightVideo(null)).toBe(false);
    expect(needsSpotlightVideo(toSpotlightState({ ...row, featured_item_id: null, current: false }))).toBe(false);
    expect(needsSpotlightVideo(toSpotlightState(row))).toBe(false);
  });
});

describe("the spotlight's length and sweep", () => {
  it("lasts 5 seconds, the length the recorder uses", () => {
    expect(SPOTLIGHT_SECONDS).toBe(5);
    expect(SPOTLIGHT_VIDEO.durationMs).toBe(SPOTLIGHT_SECONDS * 1000);
  });

  it("goes from 45° left to 45° right and back, slowing at each end", () => {
    const a = Math.PI / 4;
    const d = 5000;
    expect(sweepAngle(0, d, a)).toBeCloseTo(-a);
    expect(sweepAngle(d / 4, d, a)).toBeCloseTo(0);
    expect(sweepAngle(d / 2, d, a)).toBeCloseTo(a);
    expect(sweepAngle((3 * d) / 4, d, a)).toBeCloseTo(0);
    expect(sweepAngle(d, d, a)).toBeCloseTo(-a);
    // Slower near the ends than through the front.
    expect(Math.abs(sweepAngle(100, d, a) - sweepAngle(0, d, a))).toBeLessThan(Math.abs(sweepAngle(d / 4 + 50, d, a) - sweepAngle(d / 4 - 50, d, a)));
    for (let t = 0; t <= d; t += 125) expect(Math.abs(sweepAngle(t, d, a))).toBeLessThanOrEqual(a + 1e-9);
  });

  it("stays in range outside the loop", () => {
    expect(sweepAngle(-10, 5000, 1)).toBeCloseTo(-1);
    expect(sweepAngle(9000, 5000, 1)).toBeCloseTo(-1);
    expect(sweepAngle(10, 0, 1)).toBe(-1);
  });
});

describe("spotlightVideoPath", () => {
  it("is a new file in the member's folder, with the container's extension", () => {
    expect(spotlightVideoPath("u", "i", "video/mp4", "x")).toBe("u/spotlight-i-x.mp4");
    expect(spotlightVideoPath("u", "i", "video/webm", "y")).toBe("u/spotlight-i-y.webm");
  });
});

describe("the public page's video", () => {
  it("is read from the look, defensively", () => {
    expect(toPublicSpotlightVideo({ path: "u/a.mp4", type: "video/mp4", seconds: 5 })).toEqual({ path: "u/a.mp4", type: "video/mp4" });
    expect(toPublicSpotlightVideo({ path: "u/a.mp4", type: "image/gif" })).toBeNull();
    expect(toPublicSpotlightVideo(null)).toBeNull();
  });

  it("comes with the public Glowbook, and is absent without a look", () => {
    const base = { handle: "nova", display_name: "Nova", items: [] };
    expect(toPublicGlowbook({ ...base, look: { accent: "ink", spotlight_video: { path: "u/a.webm", type: "video/webm", seconds: 5 } } })?.spotlightVideo).toEqual({
      path: "u/a.webm",
      type: "video/webm",
    });
    expect(toPublicGlowbook({ ...base, look: null })?.spotlightVideo).toBeNull();
  });
});
