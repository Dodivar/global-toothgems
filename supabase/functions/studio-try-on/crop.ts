import jpeg from "npm:jpeg-js@0.4.4";
import { ASPECT_RATIOS } from "./gemini.ts";

/**
 * The mouth close-up (decision 111, 2026-10-26): the image model edits a crop
 * of the photo around the teeth instead of the whole photo, and the browser
 * pastes its answer back into the original (`webapp/src/lib/studio3d/tryOnComposite.ts`).
 *
 * Why: on a whole face the teeth are a small band of the picture and the
 * model spread the design over the smile's width — the side gems slid one
 * tooth outward. On a close-up the teeth fill the picture; and whatever the
 * model does outside the mouth is never shown, since only the crop is pasted back.
 *
 * The crop is built from the photo check's `teeth_box` (0–1000 scale): the
 * teeth with the lips around them, widened to the nearest proportions the
 * model can output, so its answer maps back onto the crop without distortion.
 * No crop (the whole photo, as before) when the check gave no box, when the
 * photo is not a JPEG (the browser always sends one) or when the crop would
 * be most of the photo anyway.
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Around the teeth: their width × this across, their height × this up and down (lips and a bit of skin). */
const PAD_X = 1.4;
const PAD_Y = 2.2;
/** A crop smaller than this (px, longer side) would be upscaled too much by the model. */
const MIN_EDGE = 320;
/** A crop covering more of the photo than this is no close-up: keep the whole photo. */
const MAX_AREA_SHARE = 0.6;

const ratioOf = (r: string) => {
  const [w, h] = r.split(":").map(Number);
  return w / h;
};

/** The model's output proportion nearest to `aspect`. */
export function nearestRatio(aspect: number): number {
  let best = 1;
  let gap = Infinity;
  for (const r of ASPECT_RATIOS) {
    const d = Math.abs(Math.log(ratioOf(r)) - Math.log(aspect));
    if (d < gap) {
      gap = d;
      best = ratioOf(r);
    }
  }
  return best;
}

/**
 * The crop around the teeth, in photo pixels, at one of the model's output
 * proportions and inside the photo; null when no useful close-up exists.
 */
export function mouthCrop(teethBox: unknown, size: { width: number; height: number } | null): CropRect | null {
  if (!size || !(size.width > 0) || !(size.height > 0)) return null;
  if (!Array.isArray(teethBox) || teethBox.length !== 4 || !teethBox.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000)) return null;
  const [ymin, xmin, ymax, xmax] = (teethBox as number[]).map((v) => v / 1000);
  if (!(xmax > xmin) || !(ymax > ymin)) return null;
  const cx = ((xmin + xmax) / 2) * size.width;
  const cy = ((ymin + ymax) / 2) * size.height;
  let width = (xmax - xmin) * size.width * PAD_X;
  let height = (ymax - ymin) * size.height * PAD_Y;
  // Widen the short side to the nearest output proportion (never cut into the teeth).
  const ratio = nearestRatio(width / height);
  if (width / height < ratio) width = height * ratio;
  else height = width / ratio;
  // Too large for the photo: shrink both sides together, keeping the proportion.
  const fit = Math.min(1, size.width / width, size.height / height);
  width *= fit;
  height *= fit;
  if (Math.max(width, height) < MIN_EDGE) return null;
  if ((width * height) / (size.width * size.height) > MAX_AREA_SHARE) return null;
  // Slide it inside the photo.
  const x = Math.min(Math.max(0, cx - width / 2), size.width - width);
  const y = Math.min(Math.max(0, cy - height / 2), size.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.floor(width), height: Math.floor(height) };
}

/**
 * A box the photo check gave ([ymin, xmin, ymax, xmax], 0–1000 of the photo)
 * in the pixels of `crop` (a region of that photo), cut to it; null when it is
 * not a valid box or does not fall in the crop (2026-11-04: the central
 * incisors' box, the midline the browser checks its placement against).
 */
export function boxInCrop(box: unknown, photo: { width: number; height: number }, crop: CropRect): CropRect | null {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000)) return null;
  const [ymin, xmin, ymax, xmax] = box as number[];
  if (!(xmax > xmin) || !(ymax > ymin) || !(photo.width > 0) || !(photo.height > 0)) return null;
  const x0 = Math.max(0, (xmin / 1000) * photo.width - crop.x);
  const y0 = Math.max(0, (ymin / 1000) * photo.height - crop.y);
  const x1 = Math.min(crop.width, (xmax / 1000) * photo.width - crop.x);
  const y1 = Math.min(crop.height, (ymax / 1000) * photo.height - crop.y);
  if (!(x1 - x0 >= 1) || !(y1 - y0 >= 1)) return null;
  const x = Math.round(x0);
  const y = Math.round(y0);
  return { x, y, width: Math.max(1, Math.round(x1) - x), height: Math.max(1, Math.round(y1) - y) };
}

/** The crop of a JPEG, as a JPEG; null when the bytes cannot be decoded. */
export function cropJpeg(bytes: Uint8Array, rect: CropRect, quality = 92): Uint8Array | null {
  let image: { width: number; height: number; data: Uint8Array };
  try {
    image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 30, maxMemoryUsageInMB: 256 });
  } catch {
    return null;
  }
  const { x, y, width, height } = rect;
  if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.width || y + height > image.height) return null;
  const out = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    out.set(image.data.subarray(from, from + width * 4), row * width * 4);
  }
  return new Uint8Array(jpeg.encode({ data: out, width, height }, quality).data);
}
