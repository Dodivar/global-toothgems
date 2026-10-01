import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { COURSES, getCourse } from "../data/courses";
import type { TrainingCourse } from "../data/adminTraining";
import { TRAINING_COURSES } from "../data/adminTrainingSeed";
import { useAdminTraining } from "./adminTraining";
import { useAuth } from "./auth";
import { FIXTURE_LEVELS } from "./academy/fixtures";
import { isSupabaseConfigured, supabase } from "./supabase/client";
import { useTrainingMedia } from "./trainingMedia";
import { localGrader, type QuizGrader } from "./learning/grading";
import * as api from "./learning/learnerApi";
import {
  mediaPaths,
  toCorrection,
  toGradedAttempt,
  toHeldCourse,
  withProgress,
  type HeldCourse,
  type LearnerCourseCard,
} from "./learning/learnerCourse";
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
 * Learning progress for the signed-in member: the courses they hold, their
 * content, and what they did in them.
 *
 * With Supabase (production), everything comes from the server
 * (`learner_courses()`, `lib/learning/learnerApi.ts`): the courses the member
 * holds an active entitlement to, keyed by their French slug, the published
 * content without answer keys, the member's validated steps, check attempts
 * and completion. Validating a step or answering a check is a call to a
 * function that re-checks access and the path rules and returns the new
 * progress — the browser never records a completion or a pass by itself. A
 * withdrawn course stays on the account with no content (`status:
 * "unpublished"`). Lesson media are served by signed URLs (`useCourseMediaUrl`).
 *
 * Without Supabase (the prototype, mock mode), enrolments live in memory,
 * keyed by the prototype's storefront courses (`data/courses.ts`), seeded with
 * a demo history and graded locally with the same rules (`lib/learning/path.ts`).
 */

export type Enrollment = LearnerRecord;
export type { LearnerCourseCard } from "./learning/learnerCourse";

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
  /** Verification code of the certificate issued by the server (null in the prototype). */
  certificateCode: string | null;
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

export type LearningStatus = "idle" | "loading" | "ready" | "error";

interface ProgressContextValue {
  source: "mock" | "supabase";
  /** Whether the held courses are known yet (always `ready` in the prototype). */
  status: LearningStatus;
  reload: () => void;
  /** The member's record per held course (data export). */
  enrollments: Record<string, Enrollment>;
  /** Course the learner last opened, or "" when none. */
  activeCourseId: string;
  /** Makes a held course the active one; the prototype also enrols. Never grants access with Supabase. */
  openCourse: (id: string) => void;
  progressFor: (id: string) => CourseProgress;
  /** The content of a held course; undefined when not held or withdrawn. */
  trainingFor: (id: string) => TrainingCourse | undefined;
  /** A held course as the member area lists it. */
  courseFor: (id: string) => LearnerCourseCard | undefined;
  /** Courses on the account, most recently started first (withdrawn ones included). */
  enrolledCourses: () => LearnerCourseCard[];
  /** Remembers the lesson being read, so "resume" can return to it. */
  visitNode: (courseId: string, key: string) => void;
  /** Validates a step. Resolves false when it was refused or could not be saved. */
  completeStep: (courseId: string, key: string) => Promise<boolean>;
  /** Who corrects one knowledge check of a held course (null when unknown). */
  quizGrader: (courseId: string, key: string) => QuizGrader | null;
  /** URL of a held course's media (signed), or "" when unknown here. */
  mediaUrl: (ref: string) => string;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function progressOf(training: TrainingCourse | undefined, record: LearnerRecord | undefined, certificateCode: string | null): CourseProgress {
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
    certificateCode,
    remainingMinutes: record ? (summary?.remainingMinutes ?? 0) : (summary?.totalMinutes ?? 0),
    totalMinutes: summary?.totalMinutes ?? 0,
    activeIdx: summary?.nextIndex ?? 0,
    current: summary?.path[summary.nextIndex] ?? null,
    modules: summary?.modules ?? [],
    modulesDone: record ? (summary?.modulesDone ?? 0) : 0,
    quizAverage: summary?.quizAverage ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Prototype (mock mode)                                                       */
/* -------------------------------------------------------------------------- */

/** Days are enough for the seeded history; the time of day is illustrative. */
const at = (date: string) => `${date}T10:00:00.000Z`;

/**
 * Walks a seeded learner through the first `count` nodes of an authored
 * course, validating steps and passing checks with `score`, with dates spread
 * between `from` and `to`, so the demo history stays consistent with the course.
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
 * is under way (its first module done), Advanced placement has not been
 * started. The dates line up with the seeded orders in `data/orders.ts`.
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

function useMockLearning(): ProgressContextValue {
  const { getCourse: getAuthored } = useAdminTraining();
  const [enrollments, setEnrollments] = useState<Record<string, Enrollment>>(seedEnrollments);
  const [activeCourseId, setActiveCourseId] = useState("fondation");

  const trainingFor = useCallback((id: string) => {
    const course = getCourse(id);
    return course ? getAuthored(course.trainingId) : undefined;
  }, [getAuthored]);

  const courseFor = useCallback(
    (id: string): LearnerCourseCard | undefined => {
      const course = getCourse(id);
      if (!course) return undefined;
      const training = getAuthored(course.trainingId);
      return {
        id: course.id,
        title: course.title,
        summary: course.copy,
        level: FIXTURE_LEVELS[course.id] ?? "all",
        cover: course.image,
        status: training?.status ?? "published",
        issuesCertificate: training?.completion.certificate ?? true,
      };
    },
    [getAuthored],
  );

  const openCourse = useCallback((id: string) => {
    if (!getCourse(id)) return;
    setEnrollments((prev) => (prev[id] ? prev : { ...prev, [id]: emptyRecord(today()) }));
    setActiveCourseId(id);
  }, []);

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
    async (courseId: string, key: string) => {
      update(courseId, (training, record) => completeStepRule(training, record, key, new Date().toISOString()));
      return true;
    },
    [update],
  );

  const quizGrader = useCallback(
    (courseId: string, key: string): QuizGrader | null => {
      const training = trainingFor(courseId);
      const node = training ? buildPath(training).find((n) => n.key === key && n.kind === "quiz") : undefined;
      const quiz = node && training ? training.modules[node.moduleIndex].quiz : null;
      if (!quiz) return null;
      return localGrader(quiz, (score) =>
        update(courseId, (t, record) => recordQuizAttemptRule(t, record, key, score.score, new Date().toISOString())),
      );
    },
    [trainingFor, update],
  );

  const progressFor = useCallback(
    (id: string) => progressOf(trainingFor(id), enrollments[id], null),
    [enrollments, trainingFor],
  );

  const enrolledCourses = useCallback(
    () =>
      COURSES.filter((c) => enrollments[c.id])
        .sort((a, b) => enrollments[b.id].startedOn.localeCompare(enrollments[a.id].startedOn))
        .map((c) => courseFor(c.id))
        .filter((c): c is LearnerCourseCard => Boolean(c)),
    [enrollments, courseFor],
  );

  return useMemo(
    () => ({
      source: "mock" as const,
      status: "ready" as const,
      reload: () => {},
      enrollments,
      activeCourseId,
      openCourse,
      progressFor,
      trainingFor,
      courseFor,
      enrolledCourses,
      visitNode,
      completeStep,
      quizGrader,
      // Prototype covers and media are plain URLs, resolved by the media library.
      mediaUrl: () => "",
    }),
    [enrollments, activeCourseId, openCourse, progressFor, trainingFor, courseFor, enrolledCourses, visitNode, completeStep, quizGrader],
  );
}

/* -------------------------------------------------------------------------- */
/* Supabase                                                                    */
/* -------------------------------------------------------------------------- */

/** Signed URLs last four hours; they are renewed well before. */
const RESIGN_MS = 3 * 60 * 60 * 1000;

function useLiveLearning(): ProgressContextValue {
  const { userId, restoring } = useAuth();
  const [status, setStatus] = useState<LearningStatus>("idle");
  const [held, setHeld] = useState<HeldCourse[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [activeCourseId, setActiveCourseId] = useState("");
  const [loads, setLoads] = useState(0);
  const paths = useRef(new Map<string, string>());
  const heldRef = useRef(held);
  useEffect(() => {
    heldRef.current = held;
  }, [held]);

  useEffect(() => {
    if (restoring) return;
    if (!supabase || !userId) {
      setHeld([]);
      setUrls(new Map());
      setStatus("idle");
      return;
    }
    const db = supabase;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const rows = await api.fetchLearnerCourses(db);
        if (cancelled) return;
        paths.current = mediaPaths(rows);
        const signed = await api.signMedia(db, paths.current).catch((error: unknown) => {
          console.error("[learning] media signing failed", error);
          return new Map<string, string>();
        });
        if (cancelled) return;
        setHeld(rows.map(toHeldCourse));
        setUrls(signed);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("[learning] load failed", error);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, restoring, loads]);

  // Signed URLs expire: renew them while the member stays on the site.
  useEffect(() => {
    if (!supabase || status !== "ready" || paths.current.size === 0) return;
    const db = supabase;
    const timer = setInterval(() => {
      api.signMedia(db, paths.current).then(setUrls, (error: unknown) => console.error("[learning] media re-signing failed", error));
    }, RESIGN_MS);
    return () => clearInterval(timer);
  }, [status]);

  const byKey = useMemo(() => new Map(held.map((course) => [course.card.id, course])), [held]);

  const replace = useCallback((key: string, recipe: (course: HeldCourse) => HeldCourse) => {
    setHeld((prev) => prev.map((course) => (course.card.id === key ? recipe(course) : course)));
  }, []);

  const openCourse = useCallback((id: string) => {
    if (byKey.has(id)) setActiveCourseId(id);
  }, [byKey]);

  const visitNode = useCallback(
    (courseId: string, key: string) => {
      setActiveCourseId(courseId);
      replace(courseId, (course) =>
        course.record.lastKey === key ? course : { ...course, record: { ...course.record, lastKey: key } },
      );
    },
    [replace],
  );

  const completeStep = useCallback(
    async (courseId: string, key: string) => {
      const course = heldRef.current.find((c) => c.card.id === courseId);
      if (!supabase || !course?.training) return false;
      if (course.record.completedSteps.includes(key)) return true;
      try {
        const progress = await api.completeStep(supabase, key);
        replace(courseId, (current) => withProgress(current, progress));
        return true;
      } catch (error) {
        console.error("[learning] step not recorded", error);
        return false;
      }
    },
    [replace],
  );

  const quizGrader = useCallback(
    (courseId: string, key: string): QuizGrader | null => {
      const course = byKey.get(courseId);
      const node = course?.training ? buildPath(course.training).find((n) => n.key === key && n.kind === "quiz") : undefined;
      if (!supabase || !node) return null;
      const db = supabase;
      const moduleId = node.moduleId;
      return {
        check: async (questionId, answerId) => toCorrection(await api.answerQuestion(db, moduleId, questionId, answerId)),
        submit: async (chosen) => {
          const result = await api.submitQuiz(db, moduleId, chosen);
          replace(courseId, (current) => withProgress(current, result.progress));
          return toGradedAttempt(result);
        },
      };
    },
    [byKey, replace],
  );

  const trainingFor = useCallback((id: string) => byKey.get(id)?.training ?? undefined, [byKey]);
  const courseFor = useCallback((id: string) => byKey.get(id)?.card, [byKey]);

  const progressFor = useCallback(
    (id: string) => {
      const course = byKey.get(id);
      return progressOf(course?.training ?? undefined, course?.record, course?.certificateCode ?? null);
    },
    [byKey],
  );

  // The server returns the newest entitlement first.
  const enrolledCourses = useCallback(() => held.map((course) => course.card), [held]);
  const enrollments = useMemo(() => Object.fromEntries(held.map((course) => [course.card.id, course.record])), [held]);
  const mediaUrl = useCallback((ref: string) => urls.get(ref) ?? "", [urls]);
  const reload = useCallback(() => setLoads((n) => n + 1), []);

  return useMemo(
    () => ({
      source: "supabase" as const,
      status,
      reload,
      enrollments,
      activeCourseId: activeCourseId || held.find((c) => c.card.status === "published")?.card.id || "",
      openCourse,
      progressFor,
      trainingFor,
      courseFor,
      enrolledCourses,
      visitNode,
      completeStep,
      quizGrader,
      mediaUrl,
    }),
    [status, reload, enrollments, activeCourseId, held, openCourse, progressFor, trainingFor, courseFor, enrolledCourses, visitNode, completeStep, quizGrader, mediaUrl],
  );
}

/* -------------------------------------------------------------------------- */

// Decided from the configuration, the same on the server and in the browser,
// so the hook below is always the same one.
const useLearning = isSupabaseConfigured ? useLiveLearning : useMockLearning;

export function ProgressProvider({ children }: { children: ReactNode }) {
  const value = useLearning();
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used within ProgressProvider");
  return ctx;
}

/**
 * Resolves a course media reference to a URL: the member's signed URLs first
 * (lesson media, covers of held courses), then the back office's library
 * (administrator preview) — which also passes the prototype's plain URLs through.
 */
export function useCourseMediaUrl(): (ref: string | undefined) => string {
  const learner = useContext(ProgressContext)?.mediaUrl;
  const { urlOf } = useTrainingMedia();
  return useCallback((ref: string | undefined) => (ref ? (learner?.(ref) || urlOf(ref)) : ""), [learner, urlOf]);
}
