import type { MediaKind } from "./trainingMediaRules";

/**
 * Small previews for the training media library's grids (decision 104).
 *
 * The grids used to show every original — a lesson photo is often 1–3 MB — to
 * fill a 200-pixel tile. The browser now draws a WebP of at most
 * `THUMB_MAX_SIDE` pixels when a file is uploaded (and once for files uploaded
 * before), stored next to the original at `media/<id>/_thumb.webp`. Lessons and
 * course pages keep using the original.
 */

export const THUMB_MAX_SIDE = 480;
const THUMB_QUALITY = 0.8;

/** The thumbnail's size: the longer side brought down to `max`, never enlarged. */
export function thumbSize(width: number, height: number, max = THUMB_MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: max, height: max };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Storage path of a file's thumbnail, by the type the browser could encode. The
 * leading underscore keeps it apart from the original, whose stored name never
 * starts with one (`storageFileName`).
 */
export function thumbPath(mediaId: string, mimeType: string): string {
  return `media/${mediaId}/_thumb.${mimeType === "image/webp" ? "webp" : "jpg"}`;
}

/**
 * Draws the thumbnail of an image or a video (an early frame), from a local
 * file or a URL. Resolves with null when the browser cannot decode it: the
 * grids then fall back to the original (images) or an icon (videos).
 */
export async function drawThumbnail(source: Blob | string, kind: MediaKind): Promise<Blob | null> {
  try {
    const frame = kind === "image" ? await imageFrame(source) : await videoFrame(source);
    if (!frame) return null;
    const size = thumbSize(frame.width, frame.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // A JPEG fallback has no transparency: draw on white rather than black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(frame.drawable, 0, 0, size.width, size.height);
    frame.release();
    const webp = await toBlob(canvas, "image/webp");
    if (webp?.type === "image/webp") return webp;
    return await toBlob(canvas, "image/jpeg");
  } catch {
    return null;
  }
}

interface Frame {
  drawable: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function imageFrame(source: Blob | string): Promise<Frame | null> {
  const blob = typeof source === "string" ? await fetch(source).then((r) => (r.ok ? r.blob() : null)) : source;
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob);
  return { drawable: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

function videoFrame(source: Blob | string): Promise<Frame | null> {
  const local = typeof source !== "string";
  const url = local ? URL.createObjectURL(source) : source;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const done = (frame: Frame | null) => {
      video.onloadeddata = video.onseeked = video.onerror = null;
      resolve(frame);
    };
    const release = () => {
      video.removeAttribute("src");
      video.load();
      if (local) URL.revokeObjectURL(url);
    };
    // A signed URL is another origin: without CORS the canvas could not be read.
    if (!local) video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => {
      release();
      done(null);
    };
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, (video.duration || 0) / 2);
    };
    video.onseeked = () => done({ drawable: video, width: video.videoWidth, height: video.videoHeight, release });
    video.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, THUMB_QUALITY));
}
