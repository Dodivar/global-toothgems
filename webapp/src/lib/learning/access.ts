import type { CourseStatus, TrainingCourse } from "../../data/adminTraining";

/**
 * Whether a learner may open an authored course.
 *
 * Access comes from an entitlement (the course on the account), never from the
 * URL. Then the publication status decides what an entitled learner sees:
 *
 * - `published` — the course is open.
 * - `unpublished` — the course was live and was taken down. A learner who
 *   already holds it keeps reading it: they paid for it, and the builder's own
 *   status notes say an unpublished course still has learners. **Assumption to
 *   confirm with the business** (AGENTS.md §15); the rule lives here, once.
 * - `draft` / `review` — never shown to a learner (`05-learning-platform-rules`).
 *
 * In production the same decision is made by RLS on the enrolment and course
 * tables; this function is what the interface uses to pick the right screen.
 */
export type LearnerAccess =
  | { state: "open"; course: TrainingCourse }
  | { state: "notEnrolled" }
  | { state: "preparing" }
  | { state: "empty"; course: TrainingCourse };

const READABLE_BY_ENROLLED: CourseStatus[] = ["published", "unpublished"];

export function learnerAccess(course: TrainingCourse | undefined, enrolled: boolean): LearnerAccess {
  if (!enrolled) return { state: "notEnrolled" };
  if (!course || !READABLE_BY_ENROLLED.includes(course.status)) return { state: "preparing" };
  if (course.modules.every((m) => m.steps.length === 0 && !m.quiz)) return { state: "empty", course };
  return { state: "open", course };
}
