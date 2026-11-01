import { lumaOf, type Luma } from "../../../lib/studio3d/tryOnAlign";
import type { TryOnCrop } from "../../../lib/studio3d/tryOnComposite";
import { driftReport, type DriftReport } from "../../../lib/studio3d/tryOnDrift";
import { placementGuideSvg, type GuideMark } from "../../../lib/studio3d/tryOnGuide";

/**
 * The browser side of the computed try-on (decision 111 (k), steps 3 and 5):
 * the placement guide drawn on the customer's mouth close-up, and the drift
 * check of the result. The pure parts are `tryOnGuide.ts` and `tryOnDrift.ts`.
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

/** The width the close-ups are compared at (the gems scaled with it). */
const DRIFT_WIDTH = 640;

function lumaAt(source: CanvasImageSource & { width: number; height: number }, crop: TryOnCrop, width: number, height: number): Luma | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, ...regionOf(source, crop), 0, 0, width, height);
  try {
    return lumaOf(ctx.getImageData(0, 0, width, height).data, width, height);
  } catch {
    return null;
  }
}

/**
 * The drift check (`tryOnDrift.ts`): the photo's close-up against the final
 * result's (the AI's answer pasted back into the photo), at each mark. Null
 * when the browser cannot read the pictures.
 */
export async function measureDrift(photo: Blob, result: Blob, crop: TryOnCrop, marks: readonly GuideMark[]): Promise<DriftReport | null> {
  try {
    const [base, final] = await Promise.all([bitmapOf(photo), bitmapOf(result)]);
    const scale = Math.min(1, DRIFT_WIDTH / crop.width);
    const width = Math.max(8, Math.round(crop.width * scale));
    const height = Math.max(8, Math.round(crop.height * scale));
    const original = lumaAt(base, crop, width, height);
    const edited = lumaAt(final, crop, width, height);
    if (!original || !edited) return null;
    return driftReport(
      original,
      edited,
      marks.map((m) => ({ id: m.id, x: m.x * scale, y: m.y * scale, r: m.r * scale })),
    );
  } catch {
    return null;
  }
}
