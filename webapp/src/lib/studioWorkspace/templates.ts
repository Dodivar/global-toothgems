import type { Database } from "../supabase/database.types";
import { sanitizeScene, type StudioScene } from "./scene";
import { normalizeTags } from "./validation";

/**
 * The Global Toothgems template library (migration
 * `20261018224657_studio_templates`, decision 97): Studio creations made by
 * the team and published with one flag. Members with Studio access browse
 * them and copy one into their own creations; the original never changes.
 *
 * Pure data and pure functions: rows from `studio_templates()` are untrusted
 * input and pass through `toTemplate` like any saved design.
 */

/** A template is "New" for this many days after its publication. */
export const TEMPLATE_NEW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface StudioTemplate {
  /** The published creation's id: what "use" and "unpublish" name. */
  id: string;
  name: string;
  description: string;
  tags: string[];
  scene: StudioScene;
  elementCount: number;
  /** Indicative estimate stored at the author's last save; never charged. */
  estimatedPriceMinor: number;
  currency: string;
  /** Object path of the render in the private bucket; signed by the repository. */
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  updatedAt: string;
}

export type TemplateRow = Database["public"]["Functions"]["studio_templates"]["Returns"][number];

export function toTemplate(row: TemplateRow, thumbnailUrl: string | null = null): StudioTemplate {
  const scene = sanitizeScene(row.scene_data);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    tags: normalizeTags(row.tags ?? []),
    scene,
    elementCount: scene.pieces.length,
    estimatedPriceMinor: row.estimated_price_minor,
    currency: row.currency,
    thumbnailPath: row.thumbnail_path ?? null,
    thumbnailUrl,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/** Published less than `TEMPLATE_NEW_DAYS` ago (a date in the future counts as new). */
export function isNewTemplate(publishedAt: string, now: number): boolean {
  const at = Date.parse(publishedAt);
  return Number.isFinite(at) && now - at < TEMPLATE_NEW_DAYS * DAY_MS;
}

/** Newest first, as the database returns them; ties by name so the order is stable. */
export function sortTemplates(list: StudioTemplate[]): StudioTemplate[] {
  return [...list].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.name.localeCompare(b.name));
}

/** Search by name, description and tags, ignoring case and accents. */
export function searchTemplates(list: StudioTemplate[], query: string): StudioTemplate[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const q = fold(query.trim());
  if (!q) return list;
  return list.filter((t) => [t.name, t.description, ...t.tags].some((s) => fold(s).includes(q)));
}
