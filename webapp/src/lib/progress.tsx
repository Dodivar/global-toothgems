import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { COURSES, getCourse, type Course } from "../data/courses";
import { DEFAULT_LESSON_STATE, FLAT, remainingSeconds } from "../data/lessons";

/**
 * Learning progress for the signed-in visitor.
 *
 * Mockup state, exactly like `cart.tsx` and `auth.tsx`: it lives in memory, it
 * is never verified and it resets on reload. It exists so the lesson player and
 * the member dashboard read the same numbers — validating a lesson in the
 * player has to move the dashboard, or the progression view is decorative.
 *
 * Every course shares the single authored syllabus in `data/lessons.ts`
 * (see the README's scope note), so the total is the same for all of them.
 */

/** Lessons in a course. One authored syllabus, so one total. */
export const LESSON_TOTAL = FLAT.length;

export interface Enrollment {
  /** Lessons validated so far. The next one is unlocked, the rest are not. */
  doneCount: number;
  /** Lesson currently open in the player. */
  activeIdx: number;
  /** ISO date the course was added to the account. */
  startedOn: string;
  /** ISO date the last lesson was validated. Null until the course is finished. */
  completedOn: string | null;
}

export interface CourseProgress {
  enrolled: boolean;
  doneCount: number;
  total: number;
  /** 0-100, rounded — what the progress bars and the summary tiles show. */
  pct: number;
  completed: boolean;
  completedOn: string | null;
  startedOn: string | null;
  /** Video minutes left before the certificate. */
  remainingMinutes: number;
  /** Flat index of the lesson to resume on. */
  activeIdx: number;
}

/**
 * Demo history: the Business kit was bought first and finished, the Foundation
 * is under way, Advanced placement has not been started. The dates line up with
 * the seeded orders in `data/orders.ts` so the two histories tell one story.
 */
const SEED_ENROLLMENTS: Record<string, Enrollment> = {
  business: {
    doneCount: LESSON_TOTAL,
    activeIdx: LESSON_TOTAL - 1,
    startedOn: "2026-03-04",
    completedOn: "2026-04-11",
  },
  fondation: {
    doneCount: DEFAULT_LESSON_STATE.doneCount,
    activeIdx: DEFAULT_LESSON_STATE.activeIdx,
    startedOn: "2026-08-28",
    completedOn: null,
  },
};

/** The course the player opens when nothing else has been chosen. */
const DEFAULT_COURSE_ID = "fondation";

const NOT_ENROLLED: Omit<CourseProgress, "total" | "remainingMinutes"> = {
  enrolled: false,
  doneCount: 0,
  pct: 0,
  completed: false,
  completedOn: null,
  startedOn: null,
  activeIdx: 0,
};

interface ProgressContextValue {
  enrollments: Record<string, Enrollment>;
  /** Course the lesson player is showing. */
  activeCourseId: string;
  activeCourse: Course;
  /** Enrols if needed, then makes the course active. Used by every "open course" path. */
  openCourse: (id: string) => void;
  progressFor: (id: string) => CourseProgress;
  /** Courses on the account, most recently started first. */
  enrolledCourses: () => Course[];
  /** Courses the visitor has not started yet. */
  availableCourses: () => Course[];
  setActiveLesson: (idx: number) => void;
  /** Validates `idx` in the active course and moves on to the next lesson. */
  completeLesson: (idx: number) => void;
  totalLessons: number;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [enrollments, setEnrollments] = useState<Record<string, Enrollment>>(SEED_ENROLLMENTS);
  const [activeCourseId, setActiveCourseId] = useState(DEFAULT_COURSE_ID);

  const openCourse = useCallback((id: string) => {
    if (!getCourse(id)) return;
    setEnrollments((prev) =>
      prev[id]
        ? prev
        : { ...prev, [id]: { doneCount: 0, activeIdx: 0, startedOn: today(), completedOn: null } },
    );
    setActiveCourseId(id);
  }, []);

  const setActiveLesson = useCallback(
    (idx: number) => {
      setEnrollments((prev) => {
        const current = prev[activeCourseId];
        if (!current) return prev;
        return { ...prev, [activeCourseId]: { ...current, activeIdx: idx } };
      });
    },
    [activeCourseId],
  );

  const completeLesson = useCallback(
    (idx: number) => {
      setEnrollments((prev) => {
        const current = prev[activeCourseId];
        if (!current) return prev;
        const doneCount = Math.max(current.doneCount, idx + 1);
        return {
          ...prev,
          [activeCourseId]: {
            ...current,
            doneCount,
            activeIdx: Math.min(LESSON_TOTAL - 1, idx + 1),
            // Recorded once: finishing the last lesson again must not move the date.
            completedOn: doneCount >= LESSON_TOTAL ? current.completedOn ?? today() : current.completedOn,
          },
        };
      });
    },
    [activeCourseId],
  );

  const progressFor = useCallback(
    (id: string): CourseProgress => {
      const enrollment = enrollments[id];
      if (!enrollment) {
        return { ...NOT_ENROLLED, total: LESSON_TOTAL, remainingMinutes: Math.round(remainingSeconds(0) / 60) };
      }
      const { doneCount, activeIdx, startedOn, completedOn } = enrollment;
      return {
        enrolled: true,
        doneCount,
        total: LESSON_TOTAL,
        pct: Math.round((doneCount / LESSON_TOTAL) * 100),
        completed: doneCount >= LESSON_TOTAL,
        completedOn,
        startedOn,
        remainingMinutes: Math.round(remainingSeconds(doneCount) / 60),
        activeIdx,
      };
    },
    [enrollments],
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
      enrolledCourses,
      availableCourses,
      setActiveLesson,
      completeLesson,
      totalLessons: LESSON_TOTAL,
    }),
    [
      enrollments,
      activeCourseId,
      openCourse,
      progressFor,
      enrolledCourses,
      availableCourses,
      setActiveLesson,
      completeLesson,
    ],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}
