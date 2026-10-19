import { describe, expect, it } from "vitest";
import { stageFullscreenMode } from "./stageFullscreen";

describe("stageFullscreenMode", () => {
  const request = () => Promise.resolve();

  it("uses the browser's full screen when the page may request it", () => {
    expect(stageFullscreenMode({ fullscreenEnabled: true }, { requestFullscreen: request })).toBe("native");
  });

  it("covers the window when elements cannot go full screen (iPhone Safari)", () => {
    expect(stageFullscreenMode({}, {})).toBe("overlay");
    expect(stageFullscreenMode({ fullscreenEnabled: true }, {})).toBe("overlay");
  });

  it("covers the window when full screen is disabled for the page", () => {
    expect(stageFullscreenMode({ fullscreenEnabled: false }, { requestFullscreen: request })).toBe("overlay");
  });
});
