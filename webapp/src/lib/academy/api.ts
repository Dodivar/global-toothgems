import { requireSupabase, type TypedSupabaseClient } from "../supabase/client";
import type { PublicCourse } from "./publicCourse";
import { mapPublicCourses, type CoursePriceRow, type PublicCourseRow } from "./publicCourseMapping";

/**
 * The published Academy as a visitor reads it (migration
 * `…_academy_public_pages`): courses, their outline, their cover and their
 * price now. RLS lets visitors read exactly that; the `published` filter
 * says it again so a staff member browsing the public pages sees what
 * customers see. Columns are listed (visitors may not read `created_by`).
 * Lesson content, questions and answers are not part of it.
 */
const PUBLIC_COURSE_SELECT = `
  id, slug, title, short_description, description, level, duration_minutes, objectives, requirements,
  min_score, issues_certificate, price, currency, published_at,
  course_translations ( locale, status, title, slug, short_description, description, objectives, requirements ),
  cover:training_media!courses_cover_media_id_fkey ( id, alt_text, updated_at,
    training_media_translations ( locale, status, alt_text ) ),
  course_modules ( id, position, title, description,
    course_module_translations ( locale, status, title, description ),
    course_steps ( id, position, title, duration_minutes, course_step_translations ( locale, status, title ) ),
    course_quizzes ( title, passing_score, course_quiz_translations ( locale, status, title ) ) )
`;

/** Every published course, oldest publication first (the catalogue's order). */
export async function fetchPublicCourses(signal?: AbortSignal, db: TypedSupabaseClient = requireSupabase()): Promise<PublicCourse[]> {
  let courses = db
    .from("courses")
    .select(PUBLIC_COURSE_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: true })
    .order("title", { ascending: true });
  let prices = db.from("course_current_prices").select("course_id, current_price, promotion_ends_at");
  if (signal) {
    courses = courses.abortSignal(signal);
    prices = prices.abortSignal(signal);
  }
  const [courseResult, priceResult] = await Promise.all([courses, prices]);
  if (courseResult.error) throw courseResult.error;
  if (priceResult.error) throw priceResult.error;
  return mapPublicCourses(
    (courseResult.data ?? []) as unknown as PublicCourseRow[],
    (priceResult.data ?? []) as CoursePriceRow[],
  );
}
