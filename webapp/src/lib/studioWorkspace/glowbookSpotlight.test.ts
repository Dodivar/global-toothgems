import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPOTLIGHT_SECONDS,
  needsSpotlightVideo,
  spotlightSecondsFor,
  spotlightVideoPath,
  toPublicSpotlightVideo,
  toSpotlightState,
} from "./glowbookSpotlight";
import { toPublicGlowbook } from "./glowbook";

const row = {
  featured_item_id: "item-1",
  item_id: "item-1",
  path: "user-1/spotlight-item-1-a.mp4",
  type: "video/mp4",
  seconds: 6,
  current: true,
};

describe("toSpotlightState", () => {
  it("reads the database's state", () => {
    expect(toSpotlightState(row)).toEqual({
      featuredItemId: "item-1",
      itemId: "item-1",
      path: "user-1/spotlight-item-1-a.mp4",
      type: "video/mp4",
      seconds: 6,
      current: true,
    });
  });

  it("is null without a Glowbook", () => {
    expect(toSpotlightState(null)).toBeNull();
    expect(toSpotlightState([])).toBeNull();
  });

  it("never calls a missing video current, and drops unknown types and lengths", () => {
    expect(toSpotlightState({ featured_item_id: "item-1", path: null, current: true })).toMatchObject({ path: null, current: false, seconds: null });
    expect(toSpotlightState({ ...row, type: "video/quicktime", seconds: 5 })).toMatchObject({ type: null, seconds: null });
  });
});

describe("needsSpotlightVideo", () => {
  it("records when a spotlight is chosen and its video is missing or stale", () => {
    expect(needsSpotlightVideo(toSpotlightState({ featured_item_id: "item-1", path: null, current: false }))).toBe(true);
    expect(needsSpotlightVideo(toSpotlightState({ ...row, current: false }))).toBe(true);
  });

  it("does nothing without a spotlight or with a current video", () => {
    expect(needsSpotlightVideo(null)).toBe(false);
    expect(needsSpotlightVideo(toSpotlightState({ ...row, featured_item_id: null, current: false }))).toBe(false);
    expect(needsSpotlightVideo(toSpotlightState(row))).toBe(false);
  });
});

describe("spotlightSecondsFor", () => {
  it("takes the asked length, else the current video's, else 4 seconds", () => {
    expect(spotlightSecondsFor(toSpotlightState(row), 8)).toBe(8);
    expect(spotlightSecondsFor(toSpotlightState(row))).toBe(6);
    expect(spotlightSecondsFor(null)).toBe(4);
    expect(DEFAULT_SPOTLIGHT_SECONDS).toBe(4);
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
    expect(toPublicSpotlightVideo({ path: "u/a.mp4", type: "video/mp4", seconds: 4 })).toEqual({ path: "u/a.mp4", type: "video/mp4", seconds: 4 });
    expect(toPublicSpotlightVideo({ path: "u/a.mp4", type: "image/gif", seconds: 4 })).toBeNull();
    expect(toPublicSpotlightVideo(null)).toBeNull();
  });

  it("comes with the public Glowbook, and is absent without a look", () => {
    const base = { handle: "nova", display_name: "Nova", items: [] };
    expect(toPublicGlowbook({ ...base, look: { accent: "ink", spotlight_video: { path: "u/a.webm", type: "video/webm", seconds: 8 } } })?.spotlightVideo).toEqual({
      path: "u/a.webm",
      type: "video/webm",
      seconds: 8,
    });
    expect(toPublicGlowbook({ ...base, look: null })?.spotlightVideo).toBeNull();
  });
});
