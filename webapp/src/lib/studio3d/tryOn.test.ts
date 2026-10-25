import { describe, expect, it } from "vitest";
import studioEn from "../../i18n/locales/studio.en.json";
import studioFr from "../../i18n/locales/studio.fr.json";
import {
  TRY_ON_ERROR_CODES,
  TRY_ON_ERROR_MESSAGES,
  errorAllowsRetry,
  parseTryOnResponse,
  resultExtension,
  sourcePayload,
  unavailableTryOnService,
} from "./tryOn";
import { checkPhotoFile, checkPhotoSize, fitWithin, PHOTO_MAX_BYTES, tryOnFileName } from "./tryOnPhoto";

describe("try-on service contract", () => {
  it("the not-available service says so at once, without a photo leaving", async () => {
    expect(await unavailableTryOnService.status()).toBe(false);
    expect(await unavailableTryOnService.render({ photo: new Blob(), source: { kind: "own", creationId: "c1" } })).toEqual({
      ok: false,
      code: "not_available",
    });
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

  it("has a message in both languages for every error code", () => {
    type Tree = Record<string, unknown>;
    const lookup = (tree: Tree, key: string) => key.split(".").slice(1).reduce<unknown>((node, part) => (node as Tree | undefined)?.[part], tree);
    for (const code of TRY_ON_ERROR_CODES) {
      for (const key of [TRY_ON_ERROR_MESSAGES[code].title, TRY_ON_ERROR_MESSAGES[code].body]) {
        expect(typeof lookup(studioFr as Tree, key), `fr ${key}`).toBe("string");
        expect(typeof lookup(studioEn as Tree, key), `en ${key}`).toBe("string");
      }
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

  it("downscales to the longer side, never enlarges", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it("names the export after the creation", () => {
    expect(tryOnFileName("Étoile & Cœur")).toBe("global-toothgems-try-on-etoile-c-ur.jpg");
    expect(tryOnFileName("***", "png")).toBe("global-toothgems-try-on.png");
  });
});
