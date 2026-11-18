import { captureEvent, captureOnce, type AnalyticsProps } from "./analyticsCore";

/**
 * The Academy's learning funnel, sent to PostHog (consent rules in
 * `analyticsCore.ts`): course put in the cart → started → lessons opened and
 * completed → quizzes → completed with a certificate → certificate saved or
 * shared. The purchase itself is the shop's `order_completed`
 * (`contains_course`). Event list: `docs/academy-analytics.md`.
 *
 * Progress events are sent from the learner store (`lib/progress.tsx`) once
 * the server has recorded the step or graded the quiz: they describe what the
 * database holds, not what the screen hoped. Nothing personal: course ids,
 * positions, scores, never the learner's answers.
 */

export type AcademyEvent =
  | "academy_course_added_to_cart"
  /** The learner opened a course's first lesson (once per course and tab, when nothing was done yet). */
  | "academy_course_started"
  | "academy_lesson_opened"
  | "academy_step_completed"
  | "academy_quiz_submitted"
  /** The server marked the course completed (with or without a certificate). */
  | "academy_course_completed"
  | "academy_certificate_downloaded"
  | "academy_certificate_shared";

export function trackAcademy(event: AcademyEvent, props: AnalyticsProps = {}) {
  captureEvent(event, props);
}

/** Once per `key` in this tab (`gt-academy-evt:<key>` in session storage, only with consent). */
export function trackAcademyOnce(key: string, event: AcademyEvent, props: AnalyticsProps = {}) {
  captureOnce(`gt-academy-evt:${key}`, event, props);
}
