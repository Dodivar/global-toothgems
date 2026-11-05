import type { TryOnCrop } from "../../../lib/studio3d/tryOnComposite";
import { arbitrateMidline, lowerToothGaps, toothGaps, type CloseUpPixels, type MidlineArbitration } from "../../../lib/studio3d/tryOnMidline";
import type { CloseUpBox, FoundTooth } from "../../../lib/studio3d/tryOnRegistration";
import { bitmapOf } from "./pasteBack";

/** The close-up's pixels at the close-up's size (the teeth boxes' coordinates); null when the browser cannot read them. */
async function closeUpPixels(photo: Blob, crop: TryOnCrop): Promise<CloseUpPixels | null> {
  const image = await bitmapOf(photo);
  try {
    const sx = image.width / crop.photoWidth;
    const sy = image.height / crop.photoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, crop.x * sx, crop.y * sy, crop.width * sx, crop.height * sy, 0, 0, crop.width, crop.height);
    return ctx.getImageData(0, 0, crop.width, crop.height);
  } finally {
    if ("close" in image) image.close(); // a decoded photo held until collected weighs on phones
  }
}

/** The arbitration on the customer's photo; null when its pixels cannot be read. Never throws. */
export async function arbitrateOnPhoto(
  photo: Blob,
  crop: TryOnCrop,
  teeth: readonly FoundTooth[],
  centrals: CloseUpBox | null,
): Promise<MidlineArbitration | null> {
  try {
    const pixels = await closeUpPixels(photo, crop);
    return pixels ? arbitrateMidline(teeth, centrals, toothGaps(pixels, teeth), lowerToothGaps(pixels, teeth)) : null;
  } catch {
    return null;
  }
}
