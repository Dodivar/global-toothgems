import { describe, expect, it } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
import studioEn from "../../i18n/locales/studio.en.json";
import studioFr from "../../i18n/locales/studio.fr.json";
import {
  TRY_ON_ERROR_CODES,
  TRY_ON_ERROR_MESSAGES,
  errorSuggestsNewPhoto,
  normalizeDegrees,
  parseTryOnResponse,
  tryOnInputFromCreation,
  unavailableTryOnService,
} from "./tryOn";
import { checkPhotoFile, checkPhotoSize, fitWithin, PHOTO_MAX_BYTES, tryOnFileName } from "./tryOnPhoto";
import {
  boxPointToStage,
  clampTransform,
  DEFAULT_TRANSFORM,
  dragTransform,
  keyTransform,
  MAX_WIDTH,
  MIN_WIDTH,
  overlayFrame,
  overlayFromResult,
  pinchTransform,
  wheelTransform,
} from "./tryOnTransform";

const piece = (id: string, x: number, y: number, extra: Partial<PlacedJewelry> = {}): PlacedJewelry => ({
  id,
  productId: "p1",
  ss: 5,
  look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
  toothId: "11",
  position: { x, y, z: 10 },
  normal: { x: 0, y: 0, z: 1 },
  rotation: 0,
  scale: 1,
  ...extra,
});

describe("try-on service contract", () => {
  it("ships only the not-available service, answering at once", async () => {
    const out = await unavailableTryOnService.placeCreation({
      photo: new Blob(),
      photoWidth: 1000,
      photoHeight: 800,
      creation: { creationId: "c1", pieces: [] },
    });
    expect(out).toEqual({ ok: false, code: "not_available" });
  });

  it("sends the pieces only, never the owner or the prices", () => {
    const input = tryOnInputFromCreation({
      id: "c1",
      scene: { version: 2, model: "studio", lightPreset: "studio", camera: null, pieces: [piece("a", 0, 0, { rotation: 30 })], groups: [] },
    });
    expect(input).toEqual({ creationId: "c1", pieces: [{ pieceId: "a", toothId: "11", ss: 5, shape: "round", color: "#ffffff", rotation: 30 }] });
  });

  it("reads a valid answer and drops what does not belong", () => {
    const out = parseTryOnResponse(
      {
        ok: true,
        confidence: 1.4,
        placements: [
          { pieceId: "a", x: 0.4, y: 0.6, scale: 0.02, rotation: 370 },
          { pieceId: "a", x: 0.5, y: 0.6, scale: 0.02 }, // duplicate
          { pieceId: "zz", x: 0.5, y: 0.5, scale: 0.02 }, // unknown piece
          { pieceId: "b", x: 1.2, y: 0.5, scale: 0.02 }, // off the photo
          { pieceId: "b", x: 0.5, y: 0.5, scale: 0 }, // no size
        ],
        landmarks: [
          { toothId: "11", x: 0.45, y: 0.6 },
          { toothId: "99", x: 0.5, y: 0.5 },
          { toothId: "21", x: 2, y: -1 },
        ],
      },
      ["a", "b"],
    );
    expect(out).toEqual({
      ok: true,
      result: {
        confidence: 1,
        placements: [{ pieceId: "a", x: 0.4, y: 0.6, scale: 0.02, rotation: 10 }],
        landmarks: [
          { toothId: "11", x: 0.45, y: 0.6 },
          { toothId: "21", x: 1, y: 0 },
        ],
      },
    });
  });

  it("maps errors and malformed answers to a known code", () => {
    expect(parseTryOnResponse({ ok: false, code: "low_quality" }, [])).toEqual({ ok: false, code: "low_quality" });
    expect(parseTryOnResponse({ ok: false, code: "exploded" }, [])).toEqual({ ok: false, code: "failed" });
    expect(parseTryOnResponse(null, [])).toEqual({ ok: false, code: "failed" });
    expect(parseTryOnResponse({ ok: true, placements: [] }, ["a"])).toEqual({ ok: false, code: "failed" });
  });

  it("has a message in both languages for every error code", () => {
    type Tree = Record<string, unknown>;
    const lookup = (tree: Tree, key: string) => key.split(".").slice(1).reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);
    for (const code of TRY_ON_ERROR_CODES) {
      for (const key of [TRY_ON_ERROR_MESSAGES[code].title, TRY_ON_ERROR_MESSAGES[code].body]) {
        expect(typeof lookup(studioFr as Tree, key), `fr ${key}`).toBe("string");
        expect(typeof lookup(studioEn as Tree, key), `en ${key}`).toBe("string");
      }
    }
    expect(errorSuggestsNewPhoto("low_quality")).toBe(true);
    expect(errorSuggestsNewPhoto("not_available")).toBe(false);
  });

  it("normalises angles to -180..180", () => {
    expect(normalizeDegrees(190)).toBe(-170);
    expect(normalizeDegrees(-180)).toBe(180);
    expect(normalizeDegrees(720)).toBe(0);
  });
});

describe("photo checks", () => {
  it("accepts the photo formats, by type or by extension when the type is missing", () => {
    expect(checkPhotoFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(checkPhotoFile({ name: "IMG_1.HEIC", type: "", size: 1000 })).toBeNull();
    expect(checkPhotoFile({ name: "a.gif", type: "image/gif", size: 1000 })).toBe("type");
    expect(checkPhotoFile({ name: "notes.pdf", type: "", size: 1000 })).toBe("type");
  });

  it("refuses empty and oversized files", () => {
    expect(checkPhotoFile({ name: "a.png", type: "image/png", size: 0 })).toBe("empty");
    expect(checkPhotoFile({ name: "a.png", type: "image/png", size: PHOTO_MAX_BYTES + 1 })).toBe("tooLarge");
  });

  it("refuses photos too small to see the teeth", () => {
    expect(checkPhotoSize(640, 480)).toBeNull();
    expect(checkPhotoSize(479, 1000)).toBe("tooSmall");
    expect(checkPhotoSize(600, 500)).toBe("tooSmall");
    expect(checkPhotoSize(0, 0)).toBe("unreadable");
  });

  it("downscales to the longer side, never enlarges", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it("names the export after the creation", () => {
    expect(tryOnFileName("Étoile & Cœur")).toBe("global-toothgems-try-on-etoile-c-ur.jpg");
    expect(tryOnFileName("***", "png")).toBe("global-toothgems-try-on.png");
  });
});

describe("overlay transform", () => {
  it("clamps the box to the photo and to sane sizes", () => {
    expect(clampTransform({ cx: -1, cy: 2, width: 9, rotation: 200 })).toEqual({ cx: 0, cy: 1, width: MAX_WIDTH, rotation: -160 });
    expect(clampTransform({ ...DEFAULT_TRANSFORM, width: 0 }).width).toBe(MIN_WIDTH);
  });

  it("gives the same frame to the screen and the export, in their own pixels", () => {
    const t = { cx: 0.5, cy: 0.5, width: 0.4, rotation: 90 };
    const screen = overlayFrame(t, 500, 400);
    const full = overlayFrame(t, 2000, 1600);
    expect(full.width / screen.width).toBeCloseTo(4);
    expect(full.centerY / screen.centerY).toBeCloseTo(4);
    expect(screen).toMatchObject({ centerX: 250, centerY: 200, width: 200, height: 100, left: 150, top: 150 });
    // A quarter turn puts the box's right edge below its centre.
    const p = boxPointToStage(screen, 1, 0.5);
    expect(p.x).toBeCloseTo(250);
    expect(p.y).toBeCloseTo(300);
  });

  it("drags, scales and rotates", () => {
    expect(dragTransform(DEFAULT_TRANSFORM, 50, -20, 500, 400)).toMatchObject({ cx: 0.6, cy: 0.5 });
    const pinched = pinchTransform(
      DEFAULT_TRANSFORM,
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ],
      500,
      400,
    );
    expect(pinched.width).toBeCloseTo(1);
    expect(pinched.rotation).toBeCloseTo(90);
    expect(pinched.cx).toBeCloseTo(0.4);
    expect(pinched.cy).toBeCloseTo(0.8);
    expect(wheelTransform(DEFAULT_TRANSFORM, -100).width).toBeGreaterThan(DEFAULT_TRANSFORM.width);
  });

  it("answers the keyboard, with larger steps under Shift", () => {
    expect(keyTransform(DEFAULT_TRANSFORM, "ArrowRight", false)?.cx).toBeCloseTo(0.505);
    expect(keyTransform(DEFAULT_TRANSFORM, "ArrowUp", true)?.cy).toBeCloseTo(0.52);
    expect(keyTransform(DEFAULT_TRANSFORM, "+", false)?.width).toBeCloseTo(0.515);
    expect(keyTransform(DEFAULT_TRANSFORM, "]", true)?.rotation).toBe(10);
    expect(keyTransform(DEFAULT_TRANSFORM, "Enter", false)).toBeNull();
  });

  it("puts each gem of an automatic placement back where the service said", () => {
    const placements = [
      { pieceId: "a", x: 0.4, y: 0.6, scale: 0.02, rotation: 0 },
      { pieceId: "b", x: 0.55, y: 0.62, scale: 0.03, rotation: 15 },
    ];
    const mapped = overlayFromResult({ placements }, 0.75);
    expect(mapped).not.toBeNull();
    const frame = overlayFrame(mapped!.transform, 1000, 750);
    for (const spot of mapped!.placements) {
      const original = placements.find((p) => p.pieceId === spot.pieceId)!;
      const at = boxPointToStage(frame, spot.x, spot.y);
      expect(at.x).toBeCloseTo(original.x * 1000);
      expect(at.y).toBeCloseTo(original.y * 750);
      expect(spot.size * frame.width).toBeCloseTo(original.scale * 1000);
    }
    expect(overlayFromResult({ placements: [] }, 0.75)).toBeNull();
  });
});
