import { ALIGN_WIDTH, alignCloseUp, IDENTITY_FIT, lumaOf, type CloseUpFit, type Luma } from "../../../lib/studio3d/tryOnAlign";
import { pastePlacement, type TryOnCrop } from "../../../lib/studio3d/tryOnComposite";
import { blendGems, type GemCheck } from "../../../lib/studio3d/tryOnGemBlend";
import type { GuideMark } from "../../../lib/studio3d/tryOnGuide";

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

/** A canvas and its 2D context, or null when the browser cannot draw. */
function canvasOf(width: number, height: number, readBack = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", readBack ? { willReadFrequently: true } : undefined);
  return ctx ? { canvas, ctx } : null;
}

const toJpeg = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));

/**
 * The answer kept around the gems only (`tryOnGemBlend.ts`, 2026-11-04): the
 * crop's region of the photo and the answer lined up on it, at the photo's
 * resolution, blended there and drawn back. Null when the answer cannot be
 * cut around the gems (then pasted whole); the checks either way.
 */
function pasteAroundGems(
  base: ImageBitmap | HTMLImageElement,
  edit: ImageBitmap | HTMLImageElement,
  crop: TryOnCrop,
  place: { x: number; y: number; width: number; height: number },
  marks: readonly GuideMark[],
): { canvas: HTMLCanvasElement | null; checks: GemCheck[] } | null {
  const sx = base.width / crop.photoWidth;
  const sy = base.height / crop.photoHeight;
  const x = Math.round(crop.x * sx);
  const y = Math.round(crop.y * sy);
  const width = Math.min(base.width - x, Math.round(crop.width * sx));
  const height = Math.min(base.height - y, Math.round(crop.height * sy));
  if (width < 1 || height < 1) return null;
  const original = canvasOf(width, height, true);
  const edited = canvasOf(width, height, true);
  if (!original || !edited) return null;
  original.ctx.drawImage(base, x, y, width, height, 0, 0, width, height);
  // The answer where it lines up; the photo wherever it does not reach.
  edited.ctx.drawImage(original.canvas, 0, 0);
  edited.ctx.drawImage(edit, place.x - x, place.y - y, place.width, place.height);
  const before = original.ctx.getImageData(0, 0, width, height);
  const after = edited.ctx.getImageData(0, 0, width, height);
  const scale = (sx + sy) / 2;
  const blend = blendGems(
    before,
    after,
    marks.map((m) => ({ id: m.id, x: m.x * sx, y: m.y * sy, r: m.r * scale, stretch: m.stretch })),
  );
  if (!blend.masked || !blend.data) return { canvas: null, checks: blend.checks };
  before.data.set(blend.data);
  original.ctx.putImageData(before, 0, 0);
  const out = canvasOf(base.width, base.height);
  if (!out) return null;
  out.ctx.drawImage(base, 0, 0);
  out.ctx.drawImage(original.canvas, x, y);
  return { canvas: out.canvas, checks: blend.checks };
}

export interface PastedResult {
  image: Blob;
  /** Each gem as the AI drew it (`tryOnGemBlend.ts`); null when not measured. */
  checks: GemCheck[] | null;
  /** Whether only the gems were taken from the answer (else the close-up whole). */
  masked: boolean;
}

/**
 * The customer's photo with the AI's edited mouth close-up drawn back at its
 * place (`tryOnComposite.ts`), lined up first (`measureFit`): with `marks`,
 * only around the gems (`pasteAroundGems`); else, or when the answer cannot be
 * cut around them, the whole close-up, its border faded into the original. A
 * JPEG of the photo's size. Null when the browser cannot draw it — the dialog
 * then shows the close-up alone.
 */
export async function pasteBack(photo: Blob, closeUp: Blob, crop: TryOnCrop, marks: readonly GuideMark[] = []): Promise<PastedResult | null> {
  try {
    const [base, edit] = await Promise.all([bitmapOf(photo), bitmapOf(closeUp)]);
    const width = base.width;
    const height = base.height;
    const place = pastePlacement(crop, { width, height }, measureFit(base, edit, crop));

    let checks: GemCheck[] | null = null;
    if (marks.length > 0) {
      const around = pasteAroundGems(base, edit, crop, place, marks);
      checks = around?.checks ?? null;
      if (around?.canvas) {
        const image = await toJpeg(around.canvas);
        if (image) return { image, checks, masked: true };
      }
    }

    const w = Math.round(place.width);
    const h = Math.round(place.height);

    // The close-up at its size, with a soft edge: each side fades in over `feather` pixels.
    const patch = canvasOf(w, h);
    if (!patch) return null;
    const p = patch.ctx;
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

    const out = canvasOf(width, height);
    if (!out) return null;
    out.ctx.drawImage(base, 0, 0);
    out.ctx.drawImage(patch.canvas, Math.round(place.x), Math.round(place.y));
    const image = await toJpeg(out.canvas);
    return image ? { image, checks, masked: false } : null;
  } catch {
    return null;
  }
}
