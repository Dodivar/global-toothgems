/**
 * Checks on the smile photo picked for a try-on, before and after it is
 * decoded. Pure: they take the file's plain facts so they run anywhere (the
 * decoding itself is in `components/studio/tryOn/preparePhoto.ts`).
 */

export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
/** Shorter and longer side, in pixels, below which teeth are too small to place gems on. */
export const PHOTO_MIN_SHORT_EDGE = 480;
export const PHOTO_MIN_LONG_EDGE = 640;
/** The photo is downscaled to this longer side once decoded: plenty for a preview and an export. */
export const PHOTO_MAX_EDGE = 2048;

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

export type PhotoError = "type" | "empty" | "tooLarge" | "tooSmall" | "unreadable" | "tooDark";

/**
 * The file before decoding. Windows often reports an empty type for HEIC, so
 * the extension decides when the type is missing; whether a HEIC actually
 * decodes depends on the browser and is found out by decoding it.
 */
export function checkPhotoFile(file: { name: string; type: string; size: number }): PhotoError | null {
  const type = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const known = type ? TYPES.includes(type) : EXTENSIONS.includes(ext);
  if (!known) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > PHOTO_MAX_BYTES) return "tooLarge";
  return null;
}

/** The decoded size. */
export function checkPhotoSize(width: number, height: number): PhotoError | null {
  if (!(width > 0) || !(height > 0)) return "unreadable";
  if (Math.min(width, height) < PHOTO_MIN_SHORT_EDGE || Math.max(width, height) < PHOTO_MIN_LONG_EDGE) return "tooSmall";
  return null;
}

/**
 * Only a photo far too dark to see any tooth is refused here, before anything
 * is sent: the light of the 10 % brightest pixels (0–255). Teeth are among the
 * brightest things in a smile photo, so a dim but usable photo still has a
 * bright tenth; anything less clear-cut is left to the function's photo check.
 */
export const PHOTO_MIN_BRIGHT_LUMA = 60;

/** `luma`: one value per pixel of a small copy of the photo, 0–255. */
export function checkPhotoLight(luma: ArrayLike<number>): PhotoError | null {
  if (luma.length === 0) return null;
  const sorted = Array.from(luma).sort((a, b) => a - b);
  const bright = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  return bright < PHOTO_MIN_BRIGHT_LUMA ? "tooDark" : null;
}

/** The size to draw the photo at: within `maxEdge` on its longer side, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge = PHOTO_MAX_EDGE): { width: number; height: number } {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** A file name for the exported image, from the creation's name: lowercase ASCII, dashes. */
export function tryOnFileName(creationName: string, ext: "jpg" | "png" | "webp" = "jpg"): string {
  const slug = creationName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `global-toothgems-try-on${slug ? `-${slug}` : ""}.${ext}`;
}
