import { COURSE_STATUSES, type CourseStatus, type TrainingCourse } from "../data/adminTraining";

/**
 * How the back office lists the training catalogue, and the duration format
 * every Academy screen shares.
 *
 * The catalogue holds a handful of courses, so the list is not searched or
 * filtered (owner's decision, 2026-10-21): it is grouped by status — on sale
 * first, then drafts, then withdrawn — most recently changed first in each.
 */

/** Section order of the back-office list. */
export const COURSE_STATUS_ORDER: CourseStatus[] = ["published", "draft", "unpublished"];

export interface CourseStatusGroup {
  status: CourseStatus;
  courses: TrainingCourse[];
}

/** The courses by status, in `COURSE_STATUS_ORDER`, empty sections left out. */
export function groupCoursesByStatus(courses: TrainingCourse[]): CourseStatusGroup[] {
  const known = new Set<CourseStatus>(COURSE_STATUSES);
  return COURSE_STATUS_ORDER.filter((status) => known.has(status))
    .map((status) => ({
      status,
      courses: courses
        .filter((course) => course.status === status)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .filter((group) => group.courses.length > 0);
}

/** Minutes to a compact "1 h 32" / "1h32" reading. */
export function formatDuration(minutes: number, lang: string): string {
  if (minutes <= 0) return lang.startsWith("en") ? "—" : "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return lang.startsWith("en") ? `${rest} min` : `${rest} min`;
  if (rest === 0) return lang.startsWith("en") ? `${hours}h` : `${hours} h`;
  return lang.startsWith("en") ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours} h ${String(rest).padStart(2, "0")}`;
}
