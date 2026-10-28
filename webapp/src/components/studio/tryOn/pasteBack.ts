import { ALIGN_WIDTH, alignCloseUp, IDENTITY_FIT, lumaOf, type CloseUpFit, type Luma } from "../../../lib/studio3d/tryOnAlign";
import { pastePlacement, type TryOnCrop } from "../../../lib/studio3d/tryOnComposite";

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

/** A region of `source` drawn at `width` × `height`, as grey levels; null when the browser cannot read it back. */
function lumaAt(source: CanvasImageSource, region: [number, number, number, number], width: number, height: number): Luma | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, ...region, 0, 0, width, height);
  try {
    return lumaOf(ctx.getImageData(0, 0, width, height).data, width, height);
  } catch {
    return null;
  }
}

/**
 * Where the AI's answer lines up on the crop (`tryOnAlign.ts`): both drawn
 * small, side by side, and compared. The whole crop when it cannot be measured.
 */
function measureFit(base: ImageBitmap | HTMLImageElement, edit: ImageBitmap | HTMLImageElement, crop: TryOnCrop): CloseUpFit {
  const place = pastePlacement(crop, { width: base.width, height: base.height });
  const width = ALIGN_WIDTH;
  const height = Math.max(8, Math.round((ALIGN_WIDTH * place.height) / place.width));
  const original = lumaAt(base, [place.x, place.y, place.width, place.height], width, height);
  const edited = lumaAt(edit, [0, 0, edit.width, edit.height], width, height);
  return original && edited ? alignCloseUp(original, edited).fit : IDENTITY_FIT;
}

/**
 * The customer's photo with the AI's edited mouth close-up drawn back at its
 * place (`tryOnComposite.ts`), lined up first (`measureFit`), its border faded
 * into the original: a JPEG of the photo's size. Null when the browser cannot
 * draw it — the dialog then shows the close-up alone.
 */
export async function pasteBack(photo: Blob, closeUp: Blob, crop: TryOnCrop): Promise<Blob | null> {
  try {
    const [base, edit] = await Promise.all([bitmapOf(photo), bitmapOf(closeUp)]);
    const width = base.width;
    const height = base.height;
    const place = pastePlacement(crop, { width, height }, measureFit(base, edit, crop));
    const w = Math.round(place.width);
    const h = Math.round(place.height);

    // The close-up at its size, with a soft edge: each side fades in over `feather` pixels.
    const patch = document.createElement("canvas");
    patch.width = w;
    patch.height = h;
    const p = patch.getContext("2d");
    if (!p) return null;
    p.drawImage(edit, 0, 0, w, h);
    p.globalCompositeOperation = "destination-in";
    const f = place.feather;
    const fade = (x0: number, y0: number, x1: number, y1: number) => {
      const g = p.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      p.fillStyle = g;
      p.fillRect(0, 0, w, h);
    };
    fade(0, 0, f, 0);
    fade(w, 0, w - f, 0);
    fade(0, 0, 0, f);
    fade(0, h, 0, h - f);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(patch, Math.round(place.x), Math.round(place.y));
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  } catch {
    return null;
  }
}
