import type { Localized } from "../../data/types";
import type { Module, Quiz, TrainingCourse } from "../../data/adminTraining";

/**
 * The learner's path through an authored course.
 *
 * The course is read exactly as the builder stores it: every step of every
 * module in order, and each module's knowledge check (if it has one) right
 * after its last step. This is the same walk the administrator's preview takes
 * (`screens/admin/TrainingPreview.tsx`), so the two views of a course can never
 * disagree on what comes next.
 *
 * Everything here is pure and deterministic. In production the same rules run
 * server-side — a completion or a passed check is recorded by the server, never
 * trusted from the browser (`05-learning-platform-rules.md`); this module is
 * the reference the prototype and those server rules share.
 */

export type NodeKind = "step" | "quiz";

export interface PathNode {
  /** Stable across reordering: the step id, or `quiz-<moduleId>`. */
  key: string;
  kind: NodeKind;
  moduleId: string;
  moduleIndex: number;
  /** Position inside the module's own list (steps first, then the check). */
  indexInModule: number;
  /** Number of nodes in the module. */
  moduleSize: number;
  title: Localized;
  /** Estimated minutes. Steps are authored; a check is estimated (see below). */
  minutes: number;
}

/**
 * Estimated minutes per knowledge-check question. Not authored anywhere in the
 * builder, so it is a documented estimate rather than a hidden constant.
 */
export const MINUTES_PER_QUESTION = 1;

export const quizKey = (moduleId: string) => `quiz-${moduleId}`;

export function quizMinutes(quiz: Quiz): number {
  return Math.max(1, quiz.questions.length * MINUTES_PER_QUESTION);
}

export function buildPath(course: TrainingCourse): PathNode[] {
  return course.modules.flatMap((module, moduleIndex) => moduleNodes(module, moduleIndex));
}

function moduleNodes(module: Module, moduleIndex: number): PathNode[] {
  const moduleSize = module.steps.length + (module.quiz ? 1 : 0);
  const steps: PathNode[] = module.steps.map((step, indexInModule) => ({
    key: step.id,
    kind: "step",
    moduleId: module.id,
    moduleIndex,
    indexInModule,
    moduleSize,
    title: step.title,
    minutes: step.duration,
  }));
  if (!module.quiz) return steps;
  return [
    ...steps,
    {
      key: quizKey(module.id),
      kind: "quiz",
      moduleId: module.id,
      moduleIndex,
      indexInModule: module.steps.length,
      moduleSize,
      title: module.quiz.title,
      minutes: quizMinutes(module.quiz),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Learner record                                                              */
/* -------------------------------------------------------------------------- */

export interface QuizResult {
  /** Submitted attempts, passed or not. */
  attempts: number;
  /** Best score reached, percent. */
  bestScore: number;
  passed: boolean;
}

export interface CompletionEvent {
  key: string;
  /** ISO timestamp. */
  at: string;
}

/**
 * What the platform knows about one learner in one course.
 *
 * Keys, not indexes: an administrator reordering or inserting a step must not
 * silently move a learner's progress onto another lesson. A completed key that
 * no longer exists in the course is simply ignored.
 */
export interface LearnerRecord {
  completedSteps: string[];
  quizResults: Record<string, QuizResult>;
  /** The node the learner last opened. */
  lastKey: string | null;
  /** Most recent completions, newest first. */
  history: CompletionEvent[];
  /** ISO date the course was added to the account. */
  startedOn: string;
  /** ISO date the course was first completed. Recorded once. */
  completedOn: string | null;
}

export function emptyRecord(startedOn: string): LearnerRecord {
  return { completedSteps: [], quizResults: {}, lastKey: null, history: [], startedOn, completedOn: null };
}

export function isNodeDone(node: PathNode, record: LearnerRecord): boolean {
  return node.kind === "step" ? record.completedSteps.includes(node.key) : Boolean(record.quizResults[node.key]?.passed);
}

/**
 * Whether a node has to be done before anything after it opens, and before the
 * course counts as complete. Steps always do when the course requires all
 * steps; a knowledge check only when the course requires all checks — that is
 * what the builder's completion criteria say.
 */
export function isRequired(node: PathNode, course: TrainingCourse): boolean {
  return node.kind === "step" ? course.completion.allSteps : course.completion.allQuizzes;
}

/**
 * Index of the first required node still to do, or `path.length` when there is
 * none. Every node up to and including it is open; everything after is locked.
 */
export function frontier(path: PathNode[], record: LearnerRecord, course: TrainingCourse): number {
  const index = path.findIndex((node) => isRequired(node, course) && !isNodeDone(node, record));
  return index === -1 ? path.length : index;
}

export function isUnlocked(index: number, path: PathNode[], record: LearnerRecord, course: TrainingCourse): boolean {
  if (index < 0 || index >= path.length) return false;
  return index <= frontier(path, record, course) || isNodeDone(path[index], record);
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

export type ModuleStatus = "completed" | "inProgress" | "notStarted" | "locked";

export interface ModuleSummary {
  id: string;
  index: number;
  title: Localized;
  done: number;
  total: number;
  minutes: number;
  status: ModuleStatus;
}

export interface CourseSummary {
  path: PathNode[];
  total: number;
  doneCount: number;
  /** 0-100, rounded. */
  pct: number;
  /** Every required node done and the average check score at the course minimum. */
  completed: boolean;
  /** Average best score over the checks attempted so far, or null. */
  quizAverage: number | null;
  /** Index of the node to open on "Continue": the first one not yet done. */
  nextIndex: number;
  /** Index of the first locked node, `path.length` when nothing is locked. */
  frontierIndex: number;
  modulesDone: number;
  modules: ModuleSummary[];
  totalMinutes: number;
  remainingMinutes: number;
}

export function averageQuizScore(record: LearnerRecord, path: PathNode[]): number | null {
  const scores = path
    .filter((node) => node.kind === "quiz" && record.quizResults[node.key])
    .map((node) => record.quizResults[node.key].bestScore);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export function summarize(course: TrainingCourse, record: LearnerRecord): CourseSummary {
  const path = buildPath(course);
  const done = path.map((node) => isNodeDone(node, record));
  const doneCount = done.filter(Boolean).length;
  const frontierIndex = frontier(path, record, course);
  const firstUndone = done.indexOf(false);
  const quizAverage = averageQuizScore(record, path);

  const requiredDone = path.every((node, i) => done[i] || !isRequired(node, course));
  const scoreOk = quizAverage === null || quizAverage >= course.completion.minScore;
  const completed = path.length > 0 && requiredDone && scoreOk;

  const modules: ModuleSummary[] = course.modules.map((module, index) => {
    const nodes = path.map((node, i) => ({ node, i })).filter(({ node }) => node.moduleId === module.id);
    const moduleDone = nodes.filter(({ i }) => done[i]).length;
    const firstIndex = nodes[0]?.i ?? Number.POSITIVE_INFINITY;
    const status: ModuleStatus =
      nodes.length === 0
        ? "notStarted"
        : moduleDone === nodes.length
        ? "completed"
        : moduleDone > 0
          ? "inProgress"
          : firstIndex > frontierIndex
            ? "locked"
            : "notStarted";
    return {
      id: module.id,
      index,
      title: module.title,
      done: moduleDone,
      total: nodes.length,
      minutes: nodes.reduce((sum, { node }) => sum + node.minutes, 0),
      status,
    };
  });

  const totalMinutes = path.reduce((sum, node) => sum + node.minutes, 0);
  const remainingMinutes = path.reduce((sum, node, i) => (done[i] ? sum : sum + node.minutes), 0);

  return {
    path,
    total: path.length,
    doneCount,
    pct: path.length === 0 ? 0 : Math.round((doneCount / path.length) * 100),
    completed,
    quizAverage,
    nextIndex: firstUndone === -1 ? Math.max(0, path.length - 1) : firstUndone,
    frontierIndex,
    modulesDone: modules.filter((m) => m.status === "completed").length,
    modules,
    totalMinutes,
    remainingMinutes,
  };
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

/** Keeps the "recently completed" list short: it is a reminder, not a log. */
export const HISTORY_LENGTH = 5;

function pushHistory(history: CompletionEvent[], key: string, at: string): CompletionEvent[] {
  return [{ key, at }, ...history.filter((e) => e.key !== key)].slice(0, HISTORY_LENGTH);
}

/** Stamps `completedOn` the first time the course reads as complete, never again. */
function stampCompletion(course: TrainingCourse, record: LearnerRecord, at: string): LearnerRecord {
  if (record.completedOn) return record;
  return summarize(course, record).completed ? { ...record, completedOn: at.slice(0, 10) } : record;
}

/**
 * Validates a step. Refused (record returned unchanged) when the step is not
 * part of the course or is still locked — the same guard the server applies.
 */
export function completeStep(course: TrainingCourse, record: LearnerRecord, key: string, at: string): LearnerRecord {
  const path = buildPath(course);
  const index = path.findIndex((node) => node.key === key);
  if (index === -1 || path[index].kind !== "step" || !isUnlocked(index, path, record, course)) return record;
  if (record.completedSteps.includes(key)) return record;
  const next: LearnerRecord = {
    ...record,
    completedSteps: [...record.completedSteps, key],
    history: pushHistory(record.history, key, at),
  };
  return stampCompletion(course, next, at);
}

/** Records one submitted attempt at a module's knowledge check. */
export function recordQuizAttempt(
  course: TrainingCourse,
  record: LearnerRecord,
  key: string,
  score: number,
  at: string,
): LearnerRecord {
  const path = buildPath(course);
  const index = path.findIndex((node) => node.key === key);
  if (index === -1 || path[index].kind !== "quiz" || !isUnlocked(index, path, record, course)) return record;
  const quiz = course.modules[path[index].moduleIndex].quiz;
  if (!quiz) return record;
  const previous = record.quizResults[key];
  if (previous && attemptsLeft(quiz, previous) === 0) return record;

  const passed = score >= quiz.settings.passingScore;
  const result: QuizResult = {
    attempts: (previous?.attempts ?? 0) + 1,
    bestScore: Math.max(previous?.bestScore ?? 0, score),
    passed: Boolean(previous?.passed) || passed,
  };
  const next: LearnerRecord = {
    ...record,
    quizResults: { ...record.quizResults, [key]: result },
    history: passed && !previous?.passed ? pushHistory(record.history, key, at) : record.history,
  };
  return stampCompletion(course, next, at);
}

/* -------------------------------------------------------------------------- */
/* Knowledge checks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Attempts still available. A passed check has nothing left to prove; without
 * "allow another attempt" there is exactly one; otherwise the authored count.
 */
export function attemptsLeft(quiz: Quiz, result: QuizResult | undefined): number {
  const used = result?.attempts ?? 0;
  if (result?.passed) return 0;
  const allowed = quiz.settings.allowRetry ? Math.max(1, quiz.settings.attempts) : 1;
  return Math.max(0, allowed - used);
}

export interface QuizScore {
  correct: number;
  total: number;
  /** Percent, rounded. */
  score: number;
  passed: boolean;
}

/** Deterministic scoring from the chosen answer id per question. */
export function scoreQuiz(quiz: Quiz, chosen: Record<string, string>): QuizScore {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((q) => q.answers.find((a) => a.id === chosen[q.id])?.correct).length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, total, score, passed: total > 0 && score >= quiz.settings.passingScore };
}
