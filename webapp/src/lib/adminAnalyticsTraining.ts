import type { Localized } from "../data/types";
import type { CourseDatum, KpiDatum, TrainingStats } from "../data/adminAnalytics";
import { kpiOf } from "./adminAnalyticsMapping";
import { toMinorUnits } from "./catalog/money";

/**
 * The Academy panel of the Statistics screen, computed from the rows staff
 * already read under RLS (`is_staff`): `course_entitlements`,
 * `course_completions`, `lesson_progress`, `quiz_attempts`, the course lines of
 * paid orders and `courses`. `analytics_snapshot()` leaves training `null`, and
 * the schema is not changed for statistics, so the figures are aggregated here
 * (pure; the reads are in `adminAnalytics.ts`).
 *
 * Definitions (to confirm with the owner, `AGENTS.md` §15):
 * - an *enrolment* is an access that opened in the period (`starts_at`) and was
 *   not revoked (a full refund revokes it); bought or granted by hand alike;
 * - the *completion rate* is the share of those enrolments whose holder has
 *   completed the course since (a cohort rate, so it never exceeds 100 %);
 * - *completed* counts completions in the period, the *average score* is theirs
 *   and the *time to complete* runs from the holder's first access to the course;
 * - an *active learner* completed a lesson or submitted a quiz in the period;
 * - a course's *revenue* is its order lines after discounts, VAT included, on
 *   orders paid in the period — the shop's revenue definition, applied to the
 *   course lines `analytics_sale_lines()` leaves out.
 */

export interface EntitlementRow {
  user_id: string;
  course_id: string;
  starts_at: string;
  revoked_at: string | null;
}

export interface CompletionRow {
  user_id: string;
  course_id: string;
  completed_at: string;
  average_score: number | null;
}

export interface ActivityRow {
  user_id: string;
}

export interface CourseLineRow {
  course_id: string | null;
  subtotal_amount: number | string;
  discount_amount: number | string;
  orders: { paid_at: string | null } | null;
}

export interface CourseInfo {
  id: string;
  title: Localized;
  level: string;
}

export interface TrainingSources {
  entitlements: EntitlementRow[];
  completions: CompletionRow[];
  /** Lesson completions and quiz submissions of the current period. */
  activity: ActivityRow[];
  /** Course lines of orders paid in the current period. */
  courseLines: CourseLineRow[];
  courses: CourseInfo[];
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

const DAY_MS = 86_400_000;

function within(iso: string | null, window: TimeWindow): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= window.start.getTime() && t < window.end.getTime();
}

const pair = (userId: string, courseId: string) => `${userId}|${courseId}`;

function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Enrolments of a window and the share of them completed since. */
function cohort(entitlements: EntitlementRow[], completed: ReadonlySet<string>, window: TimeWindow) {
  const opened = entitlements.filter((row) => !row.revoked_at && within(row.starts_at, window));
  return { count: opened.length, completed: opened.filter((row) => completed.has(pair(row.user_id, row.course_id))).length };
}

/** A window cut in `n` equal slices, as the database cuts the sparklines. */
function slices(window: TimeWindow, n = 12): TimeWindow[] {
  const length = window.end.getTime() - window.start.getTime();
  return Array.from({ length: n }, (_, i) => ({
    start: new Date(window.start.getTime() + (length * i) / n),
    end: new Date(window.start.getTime() + (length * (i + 1)) / n),
  }));
}

export function buildTraining(
  sources: TrainingSources,
  current: TimeWindow,
  previous: TimeWindow,
): { training: TrainingStats; kpis: KpiDatum[] } {
  const { entitlements, completions, activity, courseLines, courses } = sources;
  const completedPairs = new Set(completions.map((row) => pair(row.user_id, row.course_id)));

  const now = cohort(entitlements, completedPairs, current);
  const before = cohort(entitlements, completedPairs, previous);
  const completionRate = rate(now.completed, now.count);

  const completedNow = completions.filter((row) => within(row.completed_at, current));
  const scores = completedNow.flatMap((row) => (row.average_score === null ? [] : [row.average_score]));

  // First access per holder and course: where the time to complete starts.
  const firstAccess = new Map<string, number>();
  for (const row of entitlements) {
    const key = pair(row.user_id, row.course_id);
    const t = Date.parse(row.starts_at);
    if (!firstAccess.has(key) || t < (firstAccess.get(key) ?? t)) firstAccess.set(key, t);
  }
  const durations = completedNow.flatMap((row) => {
    const start = firstAccess.get(pair(row.user_id, row.course_id));
    return start === undefined ? [] : [Math.max(0, (Date.parse(row.completed_at) - start) / DAY_MS)];
  });

  const revenueByCourse = new Map<string, number>();
  for (const line of courseLines) {
    if (!line.course_id || !within(line.orders?.paid_at ?? null, current)) continue;
    const amount = toMinorUnits(line.subtotal_amount) - toMinorUnits(line.discount_amount);
    revenueByCourse.set(line.course_id, (revenueByCourse.get(line.course_id) ?? 0) + amount);
  }

  const rows: CourseDatum[] = courses.flatMap((course) => {
    const mine = entitlements.filter((row) => row.course_id === course.id);
    const enrolled = cohort(mine, completedPairs, current);
    const courseScores = completedNow
      .filter((row) => row.course_id === course.id && row.average_score !== null)
      .map((row) => row.average_score as number);
    const revenue = revenueByCourse.get(course.id) ?? 0;
    const completedHere = completedNow.some((row) => row.course_id === course.id);
    if (enrolled.count === 0 && revenue === 0 && !completedHere) return [];
    return [{
      id: course.id,
      title: course.title,
      level: course.level,
      enrollments: enrolled.count,
      completionRate: rate(enrolled.completed, enrolled.count),
      averageScore: courseScores.length ? Math.round(courseScores.reduce((a, b) => a + b, 0) / courseScores.length) : null,
      revenue,
    }];
  });
  rows.sort((a, b) => b.enrollments - a.enrollments || b.revenue - a.revenue || a.id.localeCompare(b.id));

  const training: TrainingStats = {
    enrollments: now.count,
    activeLearners: new Set(activity.map((row) => row.user_id)).size,
    completed: completedNow.length,
    completionRate,
    averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    daysToComplete: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    courses: rows,
  };

  const parts = slices(current).map((slice) => cohort(entitlements, completedPairs, slice));
  const kpis = [
    kpiOf("enrollments", now.count, before.count, "count", parts.map((part) => part.count)),
    kpiOf(
      "completionRate",
      completionRate,
      rate(before.completed, before.count),
      "percent",
      parts.map((part) => rate(part.completed, part.count)),
    ),
  ];

  return { training, kpis };
}
