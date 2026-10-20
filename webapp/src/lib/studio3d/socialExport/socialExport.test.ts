import { describe, expect, it } from "vitest";
import {
  defaultMark,
  logoFileProblem,
  logoTargetSize,
  markChoices,
  parseShareBranding,
  resolveMark,
  rightsFor,
} from "./branding";
import { FORMAT_SIZES, SHARE_FORMATS, isShareFormat, safeInsets, scaledSize } from "./formats";
import { LAYOUT_TEMPLATES, LAYOUT_TEMPLATE_IDS, insidePicture, layoutFor, placeMark } from "./layouts";
import { exportFileName, loopAngles, pickVideoType, progressShare, turntableAngle, TURNTABLE_GIF } from "./motion";

describe("social export formats", () => {
  it("are the three network sizes", () => {
    expect(FORMAT_SIZES.story).toEqual({ width: 1080, height: 1920 });
    expect(FORMAT_SIZES.square).toEqual({ width: 1080, height: 1080 });
    expect(FORMAT_SIZES.portrait).toEqual({ width: 1080, height: 1350 });
    expect(SHARE_FORMATS).toEqual(["story", "square", "portrait"]);
    expect(isShareFormat("story")).toBe(true);
    expect(isShareFormat("landscape")).toBe(false);
  });

  it("scale down keeping the ratio, with even sides, never up", () => {
    expect(scaledSize("story", TURNTABLE_GIF.width)).toEqual({ width: 540, height: 960 });
    expect(scaledSize("portrait", 540)).toEqual({ width: 540, height: 676 });
    expect(scaledSize("square", 4000)).toEqual({ width: 1080, height: 1080 });
    const odd = scaledSize("portrait", 333);
    expect(odd.width % 2).toBe(0);
    expect(odd.height % 2).toBe(0);
  });

  it("keep the Story's profile line and reply bar clear", () => {
    expect(safeInsets("story", FORMAT_SIZES.story)).toEqual({ top: 250, bottom: 340, side: 65 });
    const half = safeInsets("story", scaledSize("story", 540));
    expect(half.top).toBe(125);
    expect(half.bottom).toBe(170);
    expect(safeInsets("square", FORMAT_SIZES.square).top).toBe(65);
  });
});

describe("branding rights by plan", () => {
  it("never lets an essential member, a trial or a member without access drop the watermark", () => {
    for (const tier of ["essential", null] as const) {
      const rights = rightsFor(tier);
      expect(rights).toMatchObject({ mayRemoveWatermark: false, mayUseLogo: false, mayUseTemplates: false });
      expect(markChoices(rights, true)).toEqual(["brand"]);
      expect(resolveMark(rights, "none", true)).toBe("brand");
      expect(resolveMark(rights, "logo", true)).toBe("brand");
    }
  });

  it("gives an artist their logo or no mark, and no templates", () => {
    const rights = rightsFor("artist");
    expect(rights).toMatchObject({ mayRemoveWatermark: true, mayUseLogo: true, mayUseTemplates: false });
    expect(markChoices(rights, true)).toEqual(["logo", "brand", "none"]);
    expect(markChoices(rights, false)).toEqual(["brand", "none"]);
    expect(defaultMark(rights, true)).toBe("logo");
    expect(resolveMark(rights, "none", false)).toBe("none");
    // A logo that did not load is never replaced by nothing: the brand mark is drawn.
    expect(resolveMark(rights, "logo", false)).toBe("brand");
    expect(resolveMark(rights, "logo", true)).toBe("logo");
  });

  it("adds the templates for atelier", () => {
    expect(rightsFor("atelier")).toMatchObject({ mayRemoveWatermark: true, mayUseLogo: true, mayUseTemplates: true });
  });

  it("reads the database's answer, hiding a logo the tier no longer allows", () => {
    expect(parseShareBranding({ tier: "artist", logo_path: "u/logo.png", has_logo: true })).toEqual({ tier: "artist", logoPath: "u/logo.png", hasLogo: true });
    expect(parseShareBranding({ tier: "essential", logo_path: "u/logo.png", has_logo: true })).toEqual({ tier: "essential", logoPath: null, hasLogo: true });
    expect(parseShareBranding({ tier: null, logo_path: null, has_logo: false })).toEqual({ tier: null, logoPath: null, hasLogo: false });
    expect(parseShareBranding({ tier: "gold" })).toBeNull();
    expect(parseShareBranding(null)).toBeNull();
    expect(parseShareBranding([1])).toBeNull();
  });

  it("checks logo files like the bucket does", () => {
    expect(logoFileProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(logoFileProblem({ type: "image/svg+xml", size: 1000 })).toBe("type");
    expect(logoFileProblem({ type: "image/webp", size: 2 * 1024 * 1024 + 1 })).toBe("size");
    expect(logoFileProblem({ type: "image/jpeg", size: 0 })).toBe("size");
    expect(logoTargetSize(4000, 1000)).toEqual({ width: 1024, height: 256 });
    expect(logoTargetSize(300, 200)).toEqual({ width: 300, height: 200 });
  });
});

describe("layout templates", () => {
  const text = { title: "Sparkle smile", handle: "@nova.gems" };

  it("are versioned, plain for everyone and the rest for Atelier", () => {
    expect(LAYOUT_TEMPLATE_IDS).toEqual(["plain", "gallery", "spotlight", "band"]);
    for (const id of LAYOUT_TEMPLATE_IDS) expect(LAYOUT_TEMPLATES[id].version).toBeGreaterThanOrEqual(1);
    expect(LAYOUT_TEMPLATES.plain.premium).toBe(false);
    expect(LAYOUT_TEMPLATE_IDS.filter((id) => LAYOUT_TEMPLATES[id].premium)).toEqual(["gallery", "spotlight", "band"]);
  });

  it("fall back to plain when templates are not allowed", () => {
    const size = FORMAT_SIZES.square;
    expect(layoutFor("spotlight", false, "square", size, text)).toEqual(layoutFor("plain", true, "square", size, text));
  });

  it("keep the render, frame, texts and mark inside every format, out of the Story's covered bands", () => {
    for (const format of SHARE_FORMATS) {
      for (const size of [FORMAT_SIZES[format], scaledSize(format, 540)]) {
        const insets = safeInsets(format, size);
        for (const id of LAYOUT_TEMPLATE_IDS) {
          const layout = layoutFor(id, true, format, size, text);
          expect(insidePicture(layout.render, size), `${id} ${format} render`).toBe(true);
          expect(layout.render.w).toBeGreaterThan(size.width * 0.5);
          expect(layout.render.h).toBeGreaterThan(size.height * 0.25);
          if (layout.frame) expect(insidePicture(layout.frame.rect, size), `${id} ${format} frame`).toBe(true);
          expect(insidePicture(layout.mark, size), `${id} ${format} mark`).toBe(true);
          expect(layout.mark.y, `${id} ${format} mark top`).toBeGreaterThanOrEqual(insets.top);
          expect(layout.mark.y + layout.mark.h, `${id} ${format} mark bottom`).toBeLessThanOrEqual(size.height - insets.bottom * (format === "story" ? 1 : 0.3) + 0.5);
          for (const t of layout.texts) {
            expect(t.y, `${id} ${format} ${t.role} top`).toBeGreaterThanOrEqual(insets.top);
            expect(t.y + t.size, `${id} ${format} ${t.role} bottom`).toBeLessThanOrEqual(size.height - insets.bottom * (format === "story" ? 1 : 0.3));
            expect(t.maxWidth).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("leave out the texts that are empty", () => {
    const layout = layoutFor("gallery", true, "story", FORMAT_SIZES.story, { title: "  ", handle: "@me" });
    expect(layout.texts.map((t) => t.role)).toEqual(["handle"]);
    expect(layoutFor("plain", true, "story", FORMAT_SIZES.story, text).texts).toEqual([]);
  });

  it("put the plain mark in the bottom-right corner, on the stage", () => {
    const layout = layoutFor("plain", true, "story", FORMAT_SIZES.story);
    expect(layout.renderOnStage).toBe(true);
    expect(layout.render).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
    expect(layout.mark.x + layout.mark.w).toBe(1080 - 65);
    expect(layout.mark.y + layout.mark.h).toBe(1920 - 340);
  });
});

describe("placeMark (watermark and logo placement)", () => {
  const box = { x: 100, y: 200, w: 300, h: 100 };
  it("contains the image in its box, aligned", () => {
    expect(placeMark(box, 600, 100, "right")).toEqual({ x: 100, y: 225, w: 300, h: 50 });
    const tall = placeMark(box, 100, 200, "right");
    expect(tall).toEqual({ x: 350, y: 200, w: 50, h: 100 });
    expect(placeMark(box, 100, 200, "left").x).toBe(100);
    expect(placeMark(box, 100, 200, "center").x).toBe(225);
  });
  it("draws nothing for an empty image", () => {
    expect(placeMark(box, 0, 10, "right").w).toBe(0);
  });
});

describe("turntable motion", () => {
  it("prefers MP4, then WebM, and says when nothing records", () => {
    expect(pickVideoType((t) => t.startsWith("video/webm"))).toEqual({ mimeType: "video/webm;codecs=vp9", fileType: "video/webm", extension: "webm" });
    expect(pickVideoType((t) => t === "video/mp4" || t.startsWith("video/webm"))?.extension).toBe("mp4");
    expect(pickVideoType(() => false)).toBeNull();
    expect(pickVideoType(undefined)).toBeNull();
    expect(
      pickVideoType(() => {
        throw new Error("boom");
      }),
    ).toBeNull();
  });

  it("turns once with the clock and closes on itself", () => {
    expect(turntableAngle(0, 6000)).toBe(0);
    expect(turntableAngle(3000, 6000)).toBeCloseTo(Math.PI);
    expect(turntableAngle(6000, 6000)).toBe(0);
    expect(turntableAngle(-5, 6000)).toBe(0);
    expect(turntableAngle(100, 0)).toBe(0);
    const angles = loopAngles(4);
    expect(angles).toHaveLength(4);
    expect(angles[1]).toBeCloseTo(Math.PI / 2);
    expect(angles[3]).toBeLessThan(Math.PI * 2);
    expect(loopAngles(0)).toEqual([0]);
  });

  it("reports progress within [0, 1]", () => {
    expect(progressShare(5, 10)).toBe(0.5);
    expect(progressShare(20, 10)).toBe(1);
    expect(progressShare(1, 0)).toBe(1);
  });

  it("names files in plain ASCII", () => {
    expect(exportFileName("Étoile d'été ✨", "story", "image", "png")).toBe("global-toothgems-etoile-d-ete-story.png");
    expect(exportFileName("", "square", "video", "mp4")).toBe("global-toothgems-creation-square-360.mp4");
    expect(exportFileName("Nova", "portrait", "gif", "gif")).toBe("global-toothgems-nova-portrait-360.gif");
  });
});
