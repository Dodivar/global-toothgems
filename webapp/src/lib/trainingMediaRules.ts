import type { Localized } from "../data/types";
import type { TrainingCourse } from "../data/adminTraining";

/**
 * Rules of the training image library.
 *
 * The library is the course editor's own media collection — lesson images,
 * module covers, video posters, question illustrations — and is deliberately
 * separate from the shop's product media (`data/adminCatalog.ts`): different
 * content, different people, and, in production, a different bucket. Paid
 * training material must not be publicly listable (AGENTS.md §7), so the
 * `training-media` bucket is meant to be private and served through signed
 * URLs, unlike the public `product-media` bucket.
 *
 * Pure functions only, so the upload checks and the filtering are testable.
 */

export type MediaCategory = "technique" | "hygiene" | "materials" | "results" | "studio";

export const MEDIA_CATEGORIES: MediaCategory[] = ["technique", "hygiene", "materials", "results", "studio"];

export interface TrainingMedia {
  id: string;
  src: string;
  /** File name as uploaded. */
  name: string;
  /** Default description, offered to the image block when it is inserted. */
  alt: Localized;
  category: MediaCategory;
  tags: string[];
  width: number;
  height: number;
  bytes: number;
  /** ISO timestamp. */
  createdAt: string;
  origin: "library" | "upload";
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
/** 10 MB: comfortably above a well-exported lesson photo, well below a raw camera file. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadRejection = "type" | "size" | "empty";

export function validateUpload(file: { type: string; size: number }): UploadRejection | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  return null;
}

/** "Poser la gem.JPG" → "Poser la gem": the readable part, as a starting name. */
export function displayName(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || fileName;
}

export type UsageFilter = "all" | "unused" | "uploads";

export interface MediaFilters {
  query: string;
  category: MediaCategory | "all";
  usage: UsageFilter;
}

export function filterMedia(
  items: TrainingMedia[],
  filters: MediaFilters,
  usage: Map<string, number>,
  lang: "fr" | "en",
): TrainingMedia[] {
  const query = normalise(filters.query);
  return items
    .filter((item) => filters.category === "all" || item.category === filters.category)
    .filter((item) =>
      filters.usage === "unused" ? !usage.get(item.src) : filters.usage === "uploads" ? item.origin === "upload" : true,
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
 * How many places each image is used across the authored courses: course and
 * module covers, image blocks, video posters and question images. An image in
 * use cannot be deleted from the library — the lesson would lose it.
 */
export function mediaUsage(courses: TrainingCourse[]): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (src: string | undefined) => {
    if (src) counts.set(src, (counts.get(src) ?? 0) + 1);
  };
  for (const course of courses) {
    add(course.cover);
    for (const module of course.modules) {
      add(module.cover);
      for (const step of module.steps) {
        for (const block of step.blocks) {
          if (block.type === "image") add(block.src);
          if (block.type === "video") add(block.poster);
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
