import { IDENTITY_FIT, type CloseUpFit } from "./tryOnAlign";

/**
 * Pasting the AI's mouth close-up back into the customer's photo (decision
 * 111, 2026-10-26). The function `studio-try-on` has the model edit a crop of
 * the photo around the teeth (`crop.ts` in the function) and answers with the
 * edited crop and where it was cut; the browser draws it back at that place,
 * its edges faded into the original so no seam shows. Everything outside the
 * crop is the original photo, pixel for pixel. Since 2026-10-28 the answer is
 * first lined up with the crop (`tryOnAlign.ts`): a model that zoomed in gets
 * its answer pasted over the smaller region it really shows.
 */

/** Where the edited close-up goes, in the photo's pixels, as the function reports it. */
export interface TryOnCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The size of the photo the function cut it from (the photo the browser sent). */
  photoWidth: number;
  photoHeight: number;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** The function's `crop`, or null when absent or not inside its own photo. */
export function parseTryOnCrop(raw: unknown): TryOnCrop | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const { x, y, width, height, photo_width: photoWidth, photo_height: photoHeight } = c;
  if (![x, y, width, height, photoWidth, photoHeight].every(isInt)) return null;
  const [cx, cy, cw, ch, pw, ph] = [x, y, width, height, photoWidth, photoHeight] as number[];
  if (cx < 0 || cy < 0 || cw < 1 || ch < 1 || pw < 1 || ph < 1 || cx + cw > pw || cy + ch > ph) return null;
  return { x: cx, y: cy, width: cw, height: ch, photoWidth: pw, photoHeight: ph };
}

/**
 * Where the answer goes on a photo of this size (the same photo, possibly
 * decoded at another size): the crop, or the region `fit` of it where the
 * answer's content lines up (`tryOnAlign.ts`), and the width of its faded
 * border: a twentieth of its shorter side, at least 4 px.
 */
export function pastePlacement(crop: TryOnCrop, photo: { width: number; height: number }, fit: CloseUpFit = IDENTITY_FIT) {
  const sx = photo.width / crop.photoWidth;
  const sy = photo.height / crop.photoHeight;
  const rect = {
    x: (crop.x + fit.x * crop.width) * sx,
    y: (crop.y + fit.y * crop.height) * sy,
    width: crop.width * fit.scale * sx,
    height: crop.height * fit.scale * sy,
  };
  return { ...rect, feather: Math.max(4, Math.round(Math.min(rect.width, rect.height) / 20)) };
}
