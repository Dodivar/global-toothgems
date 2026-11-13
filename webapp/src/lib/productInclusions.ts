import type { AdminInclusion, AdminProduct } from "../data/adminCatalog";
import type { Json } from "./supabase/database.types";
import { isSupabaseConfigured } from "./supabase/env";
import { requireSupabase } from "./supabase/client";

/**
 * What a product also opens once paid (decision 139, migration
 * `20261108170000_product_inclusions`): an Academy course, or months of a 3D
 * Studio plan. The database owns the rules — an account, one pack per line,
 * the grants on payment, their revocation on a full refund; this module reads
 * and writes the list for the back office and checks it before saving.
 */

export const STUDIO_PLAN_IDS = ["essential", "artist", "atelier"] as const;
/** Same bounds as `product_inclusions.studio_months`. */
export const INCLUSION_MONTHS_MAX = 24;

/** Columns the back office reads from `product_inclusions`. */
export const INCLUSION_SELECT = "product_id, kind, course_id, studio_plan, studio_months, position";

export interface InclusionRow {
  product_id: string;
  kind: string;
  course_id: string | null;
  studio_plan: string | null;
  studio_months: number | null;
  position: number;
}

const isPlan = (value: unknown): value is (typeof STUDIO_PLAN_IDS)[number] =>
  STUDIO_PLAN_IDS.includes(value as (typeof STUDIO_PLAN_IDS)[number]);

/** Inclusions by product id, in their saved order; rows of an unknown shape are skipped. */
export function rowsToInclusions(rows: InclusionRow[]): Map<string, AdminInclusion[]> {
  const out = new Map<string, AdminInclusion[]>();
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    let inclusion: AdminInclusion | null = null;
    if (row.kind === "course" && row.course_id) inclusion = { kind: "course", courseId: row.course_id };
    else if (row.kind === "studio" && isPlan(row.studio_plan) && row.studio_months)
      inclusion = { kind: "studio", plan: row.studio_plan, months: row.studio_months };
    if (!inclusion) continue;
    out.set(row.product_id, [...(out.get(row.product_id) ?? []), inclusion]);
  }
  return out;
}

const key = (inclusion: AdminInclusion) =>
  inclusion.kind === "course" ? `course:${inclusion.courseId}` : `studio:${inclusion.plan}:${inclusion.months}`;

/** Same inclusions in the same order (undefined = none). */
export function sameInclusions(a: AdminInclusion[] | undefined, b: AdminInclusion[] | undefined): boolean {
  const left = (a ?? []).map(key);
  const right = (b ?? []).map(key);
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/** The `p_inclusions` argument of `admin_save_product_inclusions()`. */
export function inclusionsPayload(inclusions: AdminInclusion[] | undefined): Json {
  return (inclusions ?? []).map((inclusion) =>
    inclusion.kind === "course"
      ? { kind: "course", course_id: inclusion.courseId }
      : { kind: "studio", studio_plan: inclusion.plan, studio_months: inclusion.months },
  );
}

/** The form's own check, in the database's words; null when the list can be saved. */
export function inclusionError(
  product: Pick<AdminProduct, "inclusions">,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  const list = product.inclusions ?? [];
  const courses = list.filter((inclusion) => inclusion.kind === "course");
  if (courses.some((inclusion) => !inclusion.courseId)) return t("admin.inclusions.errorCourse");
  if (new Set(courses.map((inclusion) => inclusion.courseId)).size !== courses.length) return t("admin.inclusions.errorTwice");
  if (list.filter((inclusion) => inclusion.kind === "studio").length > 1) return t("admin.inclusions.errorTwice");
  for (const inclusion of list) {
    if (inclusion.kind === "studio" && (!Number.isInteger(inclusion.months) || inclusion.months < 1 || inclusion.months > INCLUSION_MONTHS_MAX)) {
      return t("admin.inclusions.errorMonths", { max: INCLUSION_MONTHS_MAX });
    }
  }
  return null;
}

export interface CourseOption {
  id: string;
  title: string;
  published: boolean;
}

/** The courses a pack can open, for the back office's picker (staff read every course). */
export async function fetchInclusionCourses(): Promise<CourseOption[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await requireSupabase().from("courses").select("id, title, status").order("title");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.id, title: row.title, published: row.status === "published" }));
}
