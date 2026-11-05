import type { TryOnCrop } from "../../../lib/studio3d/tryOnComposite";
import { arbitrateMidline, toothGaps, type CloseUpPixels, type MidlineArbitration } from "../../../lib/studio3d/tryOnMidline";
import type { CloseUpBox, FoundTooth } from "../../../lib/studio3d/tryOnRegistration";
import { bitmapOf } from "./pasteBack";

/**
 * Whether the pixel midline (`lib/studio3d/tryOnMidline.ts`) corrects the
 * placement, or is only measured for the analytics: on with
 * `NEXT_PUBLIC_TRY_ON_MIDLINE_ARBITER=on`, or in the try-on trial
 * (`scripts/try-on-trial/`, `TRIAL_ARBITER=1`), which sets
 * `window.__gtTrialArbiter` next to `window.__gtTrial`. Off by default until
 * it is checked on photos of other people than the trial's.
 */
export function midlineArbiterEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_TRY_ON_MIDLINE_ARBITER === "on") return true;
  if (typeof window === "undefined") return false;
  const w = window as { __gtTrial?: boolean; __gtTrialArbiter?: boolean };
  return w.__gtTrial === true && w.__gtTrialArbiter === true;
}

/** The close-up's pixels at the close-up's size (the teeth boxes' coordinates); null when the browser cannot read them. */
async function closeUpPixels(photo: Blob, crop: TryOnCrop): Promise<CloseUpPixels | null> {
  const image = await bitmapOf(photo);
  const sx = image.width / crop.photoWidth;
  const sy = image.height / crop.photoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, crop.x * sx, crop.y * sy, crop.width * sx, crop.height * sy, 0, 0, crop.width, crop.height);
  return ctx.getImageData(0, 0, crop.width, crop.height);
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
    return pixels ? arbitrateMidline(teeth, centrals, toothGaps(pixels, teeth)) : null;
  } catch {
    return null;
  }
}
