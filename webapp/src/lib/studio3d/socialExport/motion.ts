import type { ShareFormat } from "./formats";

/**
 * The 360° turntable: how long, how smooth, in which file.
 *
 * Pure: the browser's capabilities come in as arguments.
 */

export type ShareOutput = "image" | "video" | "gif";
export type ImageType = "png" | "jpeg";

/** One full turn of the video, at the frame rate the canvas is captured. */
export const TURNTABLE_VIDEO = { durationMs: 6000, fps: 30, bitsPerSecond: 10_000_000 };

/**
 * The GIF: half size (a full-size 1080 × 1920 GIF weighs tens of MB), one
 * turn in 3.6 s at 10 frames a second.
 */
export const TURNTABLE_GIF = { width: 540, frames: 36, delayMs: 100, maxColors: 256 };

/** The containers tried, best first: MP4 (H.264) is what Instagram and iOS take; WebM where it is all there is. */
export const VIDEO_TYPES: readonly string[] = [
  "video/mp4;codecs=avc1.640028",
  "video/mp4;codecs=avc1.4D401F",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export interface VideoType {
  mimeType: string;
  /** The file's own type (no codec), for the File and the share sheet. */
  fileType: "video/mp4" | "video/webm";
  extension: "mp4" | "webm";
}

/** The first container the browser can record, or null (no video export then). */
export function pickVideoType(isTypeSupported: ((type: string) => boolean) | null | undefined): VideoType | null {
  if (!isTypeSupported) return null;
  for (const mimeType of VIDEO_TYPES) {
    let ok = false;
    try {
      ok = isTypeSupported(mimeType);
    } catch {
      ok = false;
    }
    if (ok) return mimeType.startsWith("video/mp4") ? { mimeType, fileType: "video/mp4", extension: "mp4" } : { mimeType, fileType: "video/webm", extension: "webm" };
  }
  return null;
}

/**
 * The turntable angle after `elapsedMs` of a `durationMs` turn, in radians,
 * in [0, 2π). Driven by the clock, not by a frame count: a slow device draws
 * fewer frames but the turn still lasts the same and closes on itself.
 */
export function turntableAngle(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const k = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return k >= 1 ? 0 : k * Math.PI * 2;
}

/** The angles of an `n`-frame loop: evenly spaced, the last one short of the first, so the loop has no doubled frame. */
export function loopAngles(n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  return Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2);
}

/** Share of the work done, for the progress bar: [0, 1]. */
export function progressShare(done: number, total: number): number {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, done / total));
}

/** The file name of an export: "<creation>-<format>.<ext>", in plain ASCII. */
export function exportFileName(creationName: string, format: ShareFormat, output: ShareOutput, extension: string): string {
  const base =
    creationName
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "creation";
  const kind = output === "image" ? "" : "-360";
  return `global-toothgems-${base}-${format}${kind}.${extension}`;
}
