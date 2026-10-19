import { coverCrop, MEDIA_MAX_INPUT_BYTES, MEDIA_SIZE, type MediaKind } from "../../lib/studioWorkspace/glowbookLook";

/**
 * A picture picked for a Glowbook, framed and re-encoded in the browser before
 * it is uploaded: centred square for the profile picture, 3:1 for the banner,
 * JPEG at a fixed size. Re-encoding drops the file's metadata (location, camera)
 * and keeps every upload small. Browser only.
 */
export type MediaError = "type" | "tooLarge" | "unreadable";

export class GlowbookMediaError extends Error {
  readonly code: MediaError;
  constructor(code: MediaError) {
    super(code);
    this.code = code;
  }
}

export async function prepareGlowbookPicture(file: File, kind: MediaKind): Promise<Blob> {
  if (file.type && !file.type.startsWith("image/")) throw new GlowbookMediaError("type");
  if (file.size > MEDIA_MAX_INPUT_BYTES) throw new GlowbookMediaError("tooLarge");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new GlowbookMediaError("unreadable");
  }
  const { width, height } = MEDIA_SIZE[kind];
  const crop = coverCrop(bitmap.width, bitmap.height, width / height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new GlowbookMediaError("unreadable");
  ctx.fillStyle = "#ffffff"; // transparent PNGs become white, not black, in JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob) throw new GlowbookMediaError("unreadable");
  return blob;
}
