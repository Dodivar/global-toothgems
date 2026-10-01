import type { TrainingCourse } from "../../data/adminTraining";
import type { LearnerCourseCard } from "./learnerCourse";

/**
 * Which screen a learner gets for a course address.
 *
 * Access comes from an entitlement (the course on the account), never from the
 * URL; the server enforces it (`learner_courses()` and the progress functions
 * refuse a course the member does not hold or that is not published). This
 * function only picks the screen:
 *
 * - `loading` / `error` — the held courses are not known yet, or failed to load.
 * - `notEnrolled` — not on the account.
 * - `unavailable` — the course was withdrawn (`unpublished`). Owner's decision
 *   (2026-10-01): its holders still see it in their space, greyed out with a
 *   "back soon" message, and nobody opens its content until it is published again.
 * - `preparing` — on the account but with no content to read (a draft in the prototype).
 * - `empty` — published with nothing in it yet.
 * - `open` — the course can be read.
 */
export type LearnerAccess =
  | { state: "loading" }
  | { state: "error" }
  | { state: "notEnrolled" }
  | { state: "unavailable" }
  | { state: "preparing" }
  | { state: "empty"; course: TrainingCourse }
  | { state: "open"; course: TrainingCourse };

export function learnerAccess(
  status: "idle" | "loading" | "ready" | "error",
  card: LearnerCourseCard | undefined,
  course: TrainingCourse | undefined,
  enrolled: boolean,
): LearnerAccess {
  if (status === "error") return { state: "error" };
  if (status !== "ready") return { state: "loading" };
  if (!enrolled || !card) return { state: "notEnrolled" };
  if (card.status === "unpublished") return { state: "unavailable" };
  if (!course || course.status !== "published") return { state: "preparing" };
  if (course.modules.every((m) => m.steps.length === 0 && !m.quiz)) return { state: "empty", course };
  return { state: "open", course };
}
