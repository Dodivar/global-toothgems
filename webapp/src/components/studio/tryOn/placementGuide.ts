import type { TryOnCrop } from "../../../lib/studio3d/tryOnComposite";
import { placementGuideSvg, type GuideMark } from "../../../lib/studio3d/tryOnGuide";

/**
 * The placement guide of a try-on (decision 111 (k)), drawn on the customer's
 * mouth close-up. The marks themselves are `tryOnGuide.ts` (pure).
 */

async function bitmapOf(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  try {
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** The crop's region of a picture of the photo (possibly decoded at another size), in that picture's pixels. */
function regionOf(source: { width: number; height: number }, crop: TryOnCrop): [number, number, number, number] {
  const sx = source.width / crop.photoWidth;
  const sy = source.height / crop.photoHeight;
  return [crop.x * sx, crop.y * sy, crop.width * sx, crop.height * sy];
}

/**
 * The close-up the function cut (`crop`, in the pixels of the photo it was
 * sent), with every mark drawn on it: a JPEG of the crop's size, IMAGE 1 of the
 * placed render. Null when the browser cannot draw it.
 */
export async function renderPlacementGuide(photo: Blob, crop: TryOnCrop, marks: readonly GuideMark[]): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([placementGuideSvg(marks, crop.width, crop.height)], { type: "image/svg+xml" }));
  try {
    const base = await bitmapOf(photo);
    const overlay = new Image();
    overlay.src = url;
    await overlay.decode();
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(base, ...regionOf(base, crop), 0, 0, crop.width, crop.height);
    ctx.drawImage(overlay, 0, 0, crop.width, crop.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
