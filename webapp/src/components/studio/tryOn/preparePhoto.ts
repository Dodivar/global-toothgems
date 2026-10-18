import { checkPhotoFile, checkPhotoSize, fitWithin, type PhotoError } from "../../../lib/studio3d/tryOnPhoto";

/**
 * Decode the picked smile photo in the browser, turn it upright (EXIF
 * orientation), downscale it and re-encode it as a JPEG. Re-encoding drops
 * every metadata the file carried (camera, date, GPS position). The result
 * lives only in this tab, as an object URL that the caller revokes; nothing
 * is uploaded or stored.
 */

export interface PreparedPhoto {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

export type PreparePhotoResult = { ok: true; photo: PreparedPhoto } | { ok: false; error: PhotoError };

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode upright. `createImageBitmap` with EXIF orientation first; without
 * the option where a browser refuses it; then an `<img>`, which browsers
 * draw upright by default. Null when none can read the file (a HEIC outside
 * Safari, a damaged file).
 */
async function decode(file: File): Promise<Decoded | null> {
  for (const options of [{ imageOrientation: "from-image" } as ImageBitmapOptions, undefined]) {
    try {
      const bitmap = await createImageBitmap(file, options);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* next way */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export async function preparePhoto(file: File): Promise<PreparePhotoResult> {
  const fileError = checkPhotoFile(file);
  if (fileError) return { ok: false, error: fileError };
  // A HEIC decodes only where the browser can read it (Safari); elsewhere it fails here.
  const decoded = await decode(file);
  if (!decoded) return { ok: false, error: "unreadable" };
  try {
    const sizeError = checkPhotoSize(decoded.width, decoded.height);
    if (sizeError) return { ok: false, error: sizeError };
    const { width, height } = fitWithin(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "unreadable" };
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return { ok: false, error: "unreadable" };
    return { ok: true, photo: { blob, url: URL.createObjectURL(blob), width, height } };
  } finally {
    decoded.release();
  }
}
