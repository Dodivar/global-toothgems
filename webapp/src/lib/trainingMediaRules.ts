import type { Localized } from "../data/types";
import type { TrainingCourse } from "../data/adminTraining";

/**
 * Rules of the training media library.
 *
 * The library is the course editor's own media collection — lesson images and
 * videos, module covers, video posters, question illustrations — and is
 * deliberately separate from the shop's product media: different content,
 * different people, a different bucket. Paid training material must not be
 * publicly listable (AGENTS.md §7), so the `training-media` bucket is private
 * and files are served through signed URLs.
 *
 * Pure functions only, so the upload checks and the filtering are testable.
 */

export type MediaKind = "image" | "video";

export type MediaCategory = "technique" | "hygiene" | "materials" | "results" | "studio";

export const MEDIA_CATEGORIES: MediaCategory[] = ["technique", "hygiene", "materials", "results", "studio"];

export interface TrainingMedia {
  id: string;
  /**
   * What a course stores to point at this file: the `training_media` id in
   * Supabase, the URL itself in the prototype.
   */
  ref: string;
  kind: MediaKind;
  /** Displayable URL (a signed URL in Supabase); empty while it is being signed. */
  src: string;
  mimeType: string;
  /** Readable name, from the file name. */
  name: string;
  /** Default description, offered to the image block when it is inserted. */
  alt: Localized;
  category: MediaCategory;
  tags: string[];
  width: number;
  height: number;
  bytes: number;
  /** Videos only. */
  durationSeconds: number | null;
  /** ISO timestamp. */
  createdAt: string;
  /** "upload" = added during this session (shown as new). */
  origin: "library" | "upload";
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const ACCEPTED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];

/** 10 MB: comfortably above a well-exported lesson photo, well below a raw camera file. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/**
 * 50 MB: the Supabase free plan's upload limit per file. Raise it here, and in
 * the dashboard (Storage → Settings), when the project moves to the Pro plan.
 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Back-compat name: the image limit. */
export const MAX_UPLOAD_BYTES = MAX_IMAGE_BYTES;

export function mediaKindOf(mimeType: string): MediaKind | null {
  if (IMAGE_TYPES.includes(mimeType)) return "image";
  if (VIDEO_TYPES.includes(mimeType)) return "video";
  return null;
}

export function maxBytesFor(kind: MediaKind): number {
  return kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

export type UploadRejection = "type" | "size" | "videoSize" | "empty";

export function validateUpload(file: { type: string; size: number }): UploadRejection | null {
  const kind = mediaKindOf(file.type);
  if (!kind) return "type";
  if (file.size === 0) return "empty";
  if (file.size > maxBytesFor(kind)) return kind === "video" ? "videoSize" : "size";
  return null;
}

/** "Poser la gem.JPG" → "Poser la gem": the readable part, as a starting name. */
export function displayName(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || fileName;
}

/** A storage-safe file name: "Poser la gem (1).JPG" → "poser-la-gem-1.jpg". */
export function storageFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return `${base || "media"}${ext ? `.${ext}` : ""}`;
}

export type UsageFilter = "all" | "unused" | "uploads";

export interface MediaFilters {
  query: string;
  category: MediaCategory | "all";
  usage: UsageFilter;
  kind?: MediaKind | "all";
}

export function filterMedia(
  items: TrainingMedia[],
  filters: MediaFilters,
  usage: Map<string, number>,
  lang: "fr" | "en",
): TrainingMedia[] {
  const query = normalise(filters.query);
  const kind = filters.kind ?? "all";
  return items
    .filter((item) => kind === "all" || item.kind === kind)
    .filter((item) => filters.category === "all" || item.category === filters.category)
    .filter((item) =>
      filters.usage === "unused" ? !usage.get(item.ref) : filters.usage === "uploads" ? item.origin === "upload" : true,
    )
    .filter((item) => {
      if (!query) return true;
      const haystack = normalise([item.name, item.alt[lang], item.alt.fr, item.alt.en, ...item.tags].join(" "));
      return query.split(/\s+/).every((word) => haystack.includes(word));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Lower case, accents off: "hygiène" finds "Hygiene". */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * How many places each media reference is used across the authored courses:
 * course and module covers, image blocks, videos and their posters, question
 * images. A file in use cannot be deleted from the library — the lesson would
 * lose it (the database refuses it too).
 */
export function mediaUsage(courses: TrainingCourse[]): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (ref: string | undefined) => {
    if (ref) counts.set(ref, (counts.get(ref) ?? 0) + 1);
  };
  for (const course of courses) {
    add(course.cover);
    for (const module of course.modules) {
      add(module.cover);
      for (const step of module.steps) {
        for (const block of step.blocks) {
          if (block.type === "image") add(block.src);
          if (block.type === "video") {
            add(block.source);
            add(block.poster);
          }
        }
      }
      for (const question of module.quiz?.questions ?? []) add(question.image);
    }
  }
  return counts;
}

export function formatBytes(bytes: number, lang: string): string {
  const en = lang.startsWith("en");
  if (bytes < 1024) return `${bytes} ${en ? "B" : "o"}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${en ? "KB" : "Ko"}`;
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${en ? mb : mb.replace(".", ",")} ${en ? "MB" : "Mo"}`;
}
