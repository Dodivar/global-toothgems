import { describe, expect, it } from "vitest";
import { parseTryOnResponse } from "./tryOn";
import { parseTryOnCrop, pastePlacement } from "./tryOnComposite";

const CROP = { x: 120, y: 600, width: 700, height: 394, photo_width: 896, photo_height: 1200 };

describe("mouth close-up", () => {
  it("reads where the close-up goes, only inside its own photo", () => {
    expect(parseTryOnCrop(CROP)).toEqual({ x: 120, y: 600, width: 700, height: 394, photoWidth: 896, photoHeight: 1200 });
    expect(parseTryOnCrop({ ...CROP, x: 300 })).toBeNull(); // past the right edge
    expect(parseTryOnCrop({ ...CROP, y: -1 })).toBeNull();
    expect(parseTryOnCrop({ ...CROP, width: 12.5 })).toBeNull();
    expect(parseTryOnCrop(null)).toBeNull();
  });

  it("an answer with a crop carries it; without one, the image is the whole photo", () => {
    const image = { mime_type: "image/png", data: "aW1n" };
    const withCrop = parseTryOnResponse({ ok: true, image, crop: CROP });
    expect(withCrop.ok && withCrop.crop?.width).toBe(700);
    const plain = parseTryOnResponse({ ok: true, image });
    expect(plain.ok && "crop" in plain).toBe(false);
    const bad = parseTryOnResponse({ ok: true, image, crop: { ...CROP, height: 700 } });
    expect(bad.ok && "crop" in bad).toBe(false);
  });

  it("places it on the photo as decoded, with a soft border", () => {
    const crop = parseTryOnCrop(CROP)!;
    expect(pastePlacement(crop, { width: 896, height: 1200 })).toEqual({ x: 120, y: 600, width: 700, height: 394, feather: 20 });
    // The same photo decoded at half size: everything halves.
    expect(pastePlacement(crop, { width: 448, height: 600 })).toEqual({ x: 60, y: 300, width: 350, height: 197, feather: 10 });
  });
});
