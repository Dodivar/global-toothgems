import { describe, expect, it } from "vitest";
import studioEn from "../../i18n/locales/studio.en.json";
import studioFr from "../../i18n/locales/studio.fr.json";
import {
  PHOTO_ISSUES,
  TRY_ON_ERROR_CODES,
  TRY_ON_ERROR_MESSAGES,
  errorAllowsRetry,
  parseTryOnAnalysis,
  parseTryOnResponse,
  parseTryOnStatus,
  resultExtension,
  sourcePayload,
  unavailableTryOnService,
} from "./tryOn";
import { checkPhotoFile, checkPhotoLight, checkPhotoSize, fitWithin, PHOTO_MAX_BYTES, tryOnFileName } from "./tryOnPhoto";

describe("try-on service contract", () => {
  it("the not-available service says so at once, without a photo leaving", async () => {
    expect(await unavailableTryOnService.status()).toEqual({ available: false, dailyLimit: null, quota: null });
    expect(await unavailableTryOnService.analyse({ photo: new Blob(), source: { kind: "own", creationId: "c1" } })).toEqual({ ok: false, code: "not_available" });
    const crop = { x: 0, y: 0, width: 10, height: 10, photoWidth: 10, photoHeight: 10 };
    expect(await unavailableTryOnService.render({ photo: new Blob(), design: new Blob(), guide: new Blob(), crop, marks: 1, source: { kind: "own", creationId: "c1" } })).toEqual({
      ok: false,
      code: "not_available",
    });
  });

  it("reads the status and the member's daily allowance as untrusted input", () => {
    expect(parseTryOnStatus({ available: true, daily_limit: 10, quota: { limit: 10, remaining: 7 } })).toEqual({
      available: true,
      dailyLimit: 10,
      quota: { unlimited: false, limit: 10, remaining: 7 },
    });
    expect(parseTryOnStatus({ available: true, daily_limit: 10, quota: { unlimited: true } }).quota).toEqual({ unlimited: true });
    expect(parseTryOnStatus({ available: true, daily_limit: 10, quota: null })).toEqual({ available: true, dailyLimit: 10, quota: null });
    expect(parseTryOnStatus({ available: true, quota: { limit: 10, remaining: 12 } }).quota).toEqual({ unlimited: false, limit: 10, remaining: 10 });
    expect(parseTryOnStatus({ available: true, quota: { limit: "10", remaining: -1 } }).quota).toBeNull();
    expect(parseTryOnStatus({ available: "yes" })).toEqual({ available: false, dailyLimit: null, quota: null });
    expect(parseTryOnStatus(null).available).toBe(false);
  });

  it("names the creation by reference only, never by its scene", () => {
    expect(sourcePayload({ kind: "own", creationId: "c1" })).toEqual({ creation_id: "c1" });
    expect(sourcePayload({ kind: "share", token: "t" })).toEqual({ token: "t" });
    expect(sourcePayload({ kind: "glowbook", handle: "aurora", itemId: "i1" })).toEqual({ handle: "aurora", item_id: "i1" });
  });

  it("reads a generated image", async () => {
    const out = parseTryOnResponse({ ok: true, image: { mime_type: "image/png", data: btoa("png!") } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.image.type).toBe("image/png");
    expect(await out.image.text()).toBe("png!");
    expect(resultExtension("image/png")).toBe("png");
    expect(resultExtension("image/jpeg")).toBe("jpg");
  });

  it("refuses images of another type, not base64 or missing", () => {
    expect(parseTryOnResponse({ ok: true, image: { mime_type: "image/svg+xml", data: btoa("<svg/>") } })).toEqual({ ok: false, code: "failed" });
    expect(parseTryOnResponse({ ok: true, image: { mime_type: "image/png", data: "not base64!" } })).toEqual({ ok: false, code: "failed" });
    expect(parseTryOnResponse({ ok: true })).toEqual({ ok: false, code: "failed" });
  });

  it("maps errors and malformed answers to a known code", () => {
    expect(parseTryOnResponse({ ok: false, code: "daily_limit" })).toEqual({ ok: false, code: "daily_limit" });
    expect(parseTryOnResponse({ ok: false, code: "session_expired" })).toEqual({ ok: false, code: "sign_in_required" });
    expect(parseTryOnResponse({ ok: false, code: "exploded" })).toEqual({ ok: false, code: "failed" });
    expect(parseTryOnResponse(null)).toEqual({ ok: false, code: "failed" });
  });

  it("reads why the photo check refused a photo, known reasons only", () => {
    expect(parseTryOnResponse({ ok: false, code: "photo_unsuitable", reasons: ["blurry", "too_far", "<b>"] })).toEqual({
      ok: false,
      code: "photo_unsuitable",
      reasons: ["too_far", "blurry"],
    });
    expect(parseTryOnResponse({ ok: false, code: "photo_unsuitable" })).toEqual({ ok: false, code: "photo_unsuitable", reasons: [] });
    expect(errorAllowsRetry("photo_unsuitable")).toBe(false);
    expect(parseTryOnResponse({ ok: false, code: "photo_unsuitable", reasons: ["placement_uncertain"] })).toMatchObject({ reasons: ["placement_uncertain"] });
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
    for (const issue of PHOTO_ISSUES) {
      expect(typeof lookup(studioFr as Tree, `studio.tryOn.photoIssues.${issue}`), `fr ${issue}`).toBe("string");
      expect(typeof lookup(studioEn as Tree, `studio.tryOn.photoIssues.${issue}`), `en ${issue}`).toBe("string");
    }
    expect(errorAllowsRetry("network")).toBe(true);
    expect(errorAllowsRetry("not_allowed")).toBe(false);
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

  it("refuses only a photo far too dark to see any tooth", () => {
    const dim = Array.from({ length: 100 }, (_, i) => (i < 85 ? 30 : 110)); // dark room, teeth still bright
    expect(checkPhotoLight(dim)).toBeNull();
    expect(checkPhotoLight(Array.from({ length: 100 }, () => 25))).toBe("tooDark");
    expect(checkPhotoLight([])).toBeNull();
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

describe("parseTryOnAnalysis", () => {
  const crop = { x: 10, y: 20, width: 400, height: 300, photo_width: 800, photo_height: 600 };

  it("reads the crop and the teeth inside it; drops the rest", () => {
    const outcome = parseTryOnAnalysis({
      ok: true,
      crop,
      teeth: [
        { fdi: "11", x: 100, y: 50, width: 60, height: 120 },
        { fdi: "11", x: 200, y: 50, width: 60, height: 120 }, // twice
        { fdi: "18", x: 0, y: 0, width: 10, height: 10 }, // not a front tooth
        { fdi: "21", x: 380, y: 50, width: 60, height: 120 }, // past the crop
        { fdi: "22", x: 1, y: 1, width: 0, height: 5 }, // no width
        "nonsense",
      ],
      centrals: { x: 90, y: 40, width: 130, height: 130 },
    });
    expect(outcome).toEqual({
      ok: true,
      analysis: {
        crop: { x: 10, y: 20, width: 400, height: 300, photoWidth: 800, photoHeight: 600 },
        teeth: [{ fdi: "11", x: 100, y: 50, width: 60, height: 120 }],
        centrals: { x: 90, y: 40, width: 130, height: 130 },
      },
    });
  });

  it("reads the central incisors' box only when it is one inside the crop", () => {
    const centralsOf = (centrals: unknown) => {
      const outcome = parseTryOnAnalysis({ ok: true, crop, teeth: [], centrals });
      return outcome.ok ? outcome.analysis.centrals : "refused";
    };
    expect(centralsOf(undefined)).toBeNull();
    expect(centralsOf(null)).toBeNull();
    expect(centralsOf({ x: 350, y: 10, width: 100, height: 50 })).toBeNull(); // past the crop
    expect(centralsOf({ x: 1, y: 1, width: "2", height: 3 })).toBeNull();
    expect(centralsOf({ x: 0, y: 0, width: 400, height: 300 })).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it("needs a crop; refusals read like a render's", () => {
    expect(parseTryOnAnalysis({ ok: true, teeth: [] })).toEqual({ ok: false, code: "failed" });
    expect(parseTryOnAnalysis({ ok: false, code: "not_allowed" })).toEqual({ ok: false, code: "not_allowed" });
    expect(parseTryOnAnalysis({ ok: false, code: "photo_unsuitable", reasons: ["blurry", "x"] })).toEqual({
      ok: false,
      code: "photo_unsuitable",
      reasons: ["blurry"],
    });
    expect(parseTryOnAnalysis(null)).toEqual({ ok: false, code: "failed" });
  });
});
