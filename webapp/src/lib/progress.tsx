import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { COURSES, getCourse, type Course } from "../data/courses";
import type { TrainingCourse } from "../data/adminTraining";
import { TRAINING_COURSES } from "../data/adminTrainingSeed";
import { useAdminTraining } from "./adminTraining";
import {
  buildPath,
  completeStep as completeStepRule,
  emptyRecord,
  recordQuizAttempt as recordQuizAttemptRule,
  summarize,
  type LearnerRecord,
  type ModuleSummary,
  type PathNode,
} from "./learning/path";

/**
 * Learning progress for the signed-in visitor.
 *
 * Mockup state: it lives in memory and resets
 * on reload. What it records is real, though: which steps of the authored
 * course were validated and how each knowledge check went, keyed by step and
 * module id (`lib/learning/path.ts`). Every number the member area shows —
 * percentage, lessons done, time left, the lesson to resume — is derived from
 * that record and from the course as the back office built it, so validating a
 * step in the player moves the dashboard, and adding a step in the builder
 * moves the total.
 *
 * An enrolment is keyed by the storefront course (the thing bought); the
 * content comes from the training it links to (`Course.trainingId`). In
 * production the record is the server's `lesson_progress` / `quiz_attempts`
 * rows, written by server-side rules — never by this browser.
 */

export type Enrollment = LearnerRecord;

export interface CourseProgress {
  enrolled: boolean;
  doneCount: number;
  total: number;
  /** 0-100, rounded — what the progress bars and the summary tiles show. */
  pct: number;
  /**
   * True once the course has been completed. Sticky: an administrator adding a
   * module later must not take a certificate back from someone who earned it.
   */
  completed: boolean;
  completedOn: string | null;
  startedOn: string | null;
  /** Estimated minutes left, lessons and knowledge checks together. */
  remainingMinutes: number;
  totalMinutes: number;
  /** Index, in the learner path, of the next unfinished lesson. */
  activeIdx: number;
  /** That lesson, or null when the course has no content. */
  current: PathNode | null;
  modules: ModuleSummary[];
  modulesDone: number;
  quizAverage: number | null;
}

/** Days are enough for the seeded history; the time of day is illustrative. */
const at = (date: string) => `${date}T10:00:00.000Z`;

/**
 * Walks a seeded learner through the first `count` nodes of an authored
 * course, validating steps and passing checks with `score`, with dates spread
 * between `from` and `to`. The demo history is therefore built from the real
 * course, and stays consistent with it by construction.
 */
function seedRecord(trainingId: string, count: number | "all", score: number, from: string, to: string): LearnerRecord {
  const training = TRAINING_COURSES.find((c) => c.id === trainingId);
  let record = emptyRecord(from);
  if (!training) return record;
  const path = buildPath(training);
  const nodes = path.slice(0, count === "all" ? path.length : count);
  const start = new Date(at(from)).getTime();
  const span = new Date(at(to)).getTime() - start;
  nodes.forEach((node, i) => {
    const when = new Date(start + (span * (i + 1)) / nodes.length).toISOString();
    record =
      node.kind === "step"
        ? completeStepRule(training, record, node.key, when)
        : recordQuizAttemptRule(training, record, node.key, score, when);
  });
  return record;
}

/**
 * Demo history: the Business kit was bought first and finished, the Foundation
 * is under way (its first module done, knowledge check included), Advanced
 * placement has not been started. The dates line up with the seeded orders in
 * `data/orders.ts` so the two histories tell one story.
 */
function seedEnrollments(): Record<string, Enrollment> {
  const business = seedRecord("hygiene-securite", "all", 90, "2026-03-04", "2026-04-11");
  const foundationTraining = TRAINING_COURSES.find((c) => c.id === "pose-professionnelle");
  const firstModuleSize = foundationTraining ? buildPath(foundationTraining).filter((n) => n.moduleIndex === 0).length : 0;
  return {
    business: { ...business, completedOn: "2026-04-11" },
    fondation: seedRecord("pose-professionnelle", firstModuleSize, 80, "2026-08-28", "2026-09-24"),
  };
}

/** The course the player opens when nothing else has been chosen. */
const DEFAULT_COURSE_ID = "fondation";

interface ProgressContextValue {
  enrollments: Record<string, Enrollment>;
  /** Course the learner last opened. */
  activeCourseId: string;
  activeCourse: Course;
  /** Enrols if needed, then makes the course active. Used by every "open course" path. */
  openCourse: (id: string) => void;
  progressFor: (id: string) => CourseProgress;
  /** The authored course a storefront course gives access to. */
  trainingFor: (id: string) => TrainingCourse | undefined;
  /** Courses on the account, most recently started first. */
  enrolledCourses: () => Course[];
  /** Courses the visitor has not started yet. */
  availableCourses: () => Course[];
  /** Remembers the lesson being read, so "resume" can return to it. */
  visitNode: (courseId: string, key: string) => void;
  /** Validates a step. Ignored when it is locked or unknown. */
  completeStep: (courseId: string, key: string) => void;
  /** Records one submitted attempt at a knowledge check, with its score. */
  recordQuizAttempt: (courseId: string, key: string, score: number) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { getCourse: getTraining } = useAdminTraining();
  const [enrollments, setEnrollments] = useState<Record<string, Enrollment>>(seedEnrollments);
  const [activeCourseId, setActiveCourseId] = useState(DEFAULT_COURSE_ID);

  const trainingFor = useCallback(
    (id: string) => {
      const course = getCourse(id);
      return course ? getTraining(course.trainingId) : undefined;
    },
    [getTraining],
  );

  const openCourse = useCallback((id: string) => {
    if (!getCourse(id)) return;
    setEnrollments((prev) => (prev[id] ? prev : { ...prev, [id]: emptyRecord(today()) }));
    setActiveCourseId(id);
  }, []);

  /** Applies a rule to one enrolment, with the course it reads. */
  const update = useCallback(
    (courseId: string, recipe: (training: TrainingCourse, record: Enrollment) => Enrollment) => {
      const training = trainingFor(courseId);
      if (!training) return;
      setEnrollments((prev) => {
        const record = prev[courseId];
        if (!record) return prev;
        const next = recipe(training, record);
        return next === record ? prev : { ...prev, [courseId]: next };
      });
    },
    [trainingFor],
  );

  const visitNode = useCallback(
    (courseId: string, key: string) => {
      setActiveCourseId(courseId);
      update(courseId, (_, record) => (record.lastKey === key ? record : { ...record, lastKey: key }));
    },
    [update],
  );

  const completeStep = useCallback(
    (courseId: string, key: string) =>
      update(courseId, (training, record) => completeStepRule(training, record, key, new Date().toISOString())),
    [update],
  );

  const recordQuizAttempt = useCallback(
    (courseId: string, key: string, score: number) =>
      update(courseId, (training, record) => recordQuizAttemptRule(training, record, key, score, new Date().toISOString())),
    [update],
  );

  const progressFor = useCallback(
    (id: string): CourseProgress => {
      const training = trainingFor(id);
      const record = enrollments[id];
      const summary = training ? summarize(training, record ?? emptyRecord(today())) : null;
      const completed = Boolean(record && (record.completedOn || summary?.completed));
      return {
        enrolled: Boolean(record),
        doneCount: record ? (summary?.doneCount ?? 0) : 0,
        total: summary?.total ?? 0,
        pct: record ? (summary?.pct ?? 0) : 0,
        completed,
        completedOn: record?.completedOn ?? null,
        startedOn: record?.startedOn ?? null,
        remainingMinutes: record ? (summary?.remainingMinutes ?? 0) : (summary?.totalMinutes ?? 0),
        totalMinutes: summary?.totalMinutes ?? 0,
        activeIdx: summary?.nextIndex ?? 0,
        current: summary?.path[summary.nextIndex] ?? null,
        modules: summary?.modules ?? [],
        modulesDone: record ? (summary?.modulesDone ?? 0) : 0,
        quizAverage: summary?.quizAverage ?? null,
      };
    },
    [enrollments, trainingFor],
  );

  const enrolledCourses = useCallback(
    () =>
      COURSES.filter((c) => enrollments[c.id]).sort((a, b) =>
        enrollments[b.id].startedOn.localeCompare(enrollments[a.id].startedOn),
      ),
    [enrollments],
  );

  const availableCourses = useCallback(() => COURSES.filter((c) => !enrollments[c.id]), [enrollments]);

  const value = useMemo<ProgressContextValue>(
    () => ({
      enrollments,
      activeCourseId,
      // The active id is only ever set from a known course, so this cannot miss.
      activeCourse: getCourse(activeCourseId) ?? COURSES[0],
      openCourse,
      progressFor,
      trainingFor,
      enrolledCourses,
      availableCourses,
      visitNode,
      completeStep,
      recordQuizAttempt,
    }),
    [
      enrollments,
      activeCourseId,
      openCourse,
      progressFor,
      trainingFor,
      enrolledCourses,
      availableCourses,
      visitNode,
      completeStep,
      recordQuizAttempt,
    ],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}
