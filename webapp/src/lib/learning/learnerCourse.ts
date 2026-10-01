import type { Localized } from "../../data/types";
import type {
  Answer,
  ContentBlock,
  CourseCategory,
  CourseStatus,
  Module,
  Question,
  Quiz,
  Step,
  TrainingCourse,
} from "../../data/adminTraining";
import type { CourseLevel } from "../academy/publicCourse";
import { secondsToClock } from "../adminTrainingMapping";
import type { Correction, GradedAttempt } from "./grading";
import { HISTORY_LENGTH, buildPath, quizKey, type CompletionEvent, type LearnerRecord, type QuizResult } from "./path";

/**
 * The courses a member holds, as the learner pages and the member area read
 * them, and the mapping from what the server returns (`learner_courses()`,
 * migration `…_academy_learner_access`). Pure functions, unit-tested.
 *
 * The content never carries the answer keys: every answer reads as not
 * correct here, and corrections arrive with `Correction` once the server has
 * recorded an answer (`lib/learning/grading.ts`). English falls back to the
 * French text when a node has no published translation.
 */

/** A course on the account, as the member area lists it. */
export interface LearnerCourseCard {
  /** Key in the learner's addresses: the course's French slug (the prototype's course id in mock mode). */
  id: string;
  title: Localized;
  summary: Localized;
  level: CourseLevel;
  /** Media reference of the cover: resolve it with `useCourseMediaUrl()`. */
  cover: string;
  /** `unpublished`: shown greyed out, "back soon", and cannot be opened (owner, 2026-10-01). */
  status: CourseStatus;
  issuesCertificate: boolean;
}

/** One held course: what it is, its content when it can be opened, and the member's record. */
export interface HeldCourse {
  card: LearnerCourseCard;
  /** Null while the course is withdrawn: its content is not served. */
  training: TrainingCourse | null;
  record: LearnerRecord;
  /** Verification code of the certificate, once the server issued it. */
  certificateCode: string | null;
}

/* -------------------------------------------------------------------------- */
/* Server JSON                                                                 */
/* -------------------------------------------------------------------------- */

type En<T> = T | null | undefined;

export interface MediaJson {
  path: string;
  kind: "image" | "video";
  mime_type: string;
  alt_text: string | null;
  alt_text_en: string | null;
  width: number | null;
  height: number | null;
}

interface BlockJson {
  id: string;
  kind: "text" | "image" | "video";
  body_html: string | null;
  media_id: string | null;
  poster_media_id: string | null;
  alt_text: string | null;
  caption: string | null;
  align: "left" | "center" | "full" | null;
  title: string | null;
  duration_seconds: number | null;
  en: En<{ body_html: string | null; alt_text: string | null; caption: string | null; title: string | null }>;
}

interface StepJson {
  id: string;
  title: string;
  summary: string | null;
  duration_minutes: number;
  en: En<{ title: string; summary: string | null }>;
  blocks: BlockJson[];
}

interface AnswerJson {
  id: string;
  text: string;
  en: En<{ text: string }>;
}

interface QuestionJson {
  id: string;
  text: string;
  image_media_id: string | null;
  en: En<{ text: string }>;
  answers: AnswerJson[];
}

interface QuizJson {
  id: string;
  title: string;
  intro: string | null;
  passing_score: number;
  allow_retry: boolean;
  max_attempts: number;
  shuffle_answers: boolean;
  immediate_feedback: boolean;
  show_answers: boolean;
  en: En<{ title: string; intro: string | null }>;
  questions: QuestionJson[];
}

interface ModuleJson {
  id: string;
  title: string;
  description: string | null;
  cover_media_id: string | null;
  objectives: string[];
  en: En<{ title: string; description: string | null; objectives: string[] }>;
  steps: StepJson[];
  quiz: QuizJson | null;
}

export interface AttemptJson {
  id: string;
  module_id: string;
  status: "open" | "submitted";
  score: number | null;
  passed: boolean;
  passing_score: number;
  answers: Record<string, { answer_id: string; correct: boolean }>;
  started_at: string;
  submitted_at: string | null;
}

export interface ProgressJson {
  steps: { step_id: string; completed_at: string }[];
  attempts: AttemptJson[];
  completion: { completed_at: string; average_score: number | null; min_score: number; certificate_code: string | null } | null;
}

export interface LearnerCourseJson {
  id: string;
  slug: string;
  status: "published" | "unpublished";
  title: string;
  short_description: string | null;
  cover_media_id: string | null;
  category: string;
  level: string;
  duration_minutes: number;
  objectives: string[];
  complete_all_steps: boolean;
  complete_all_quizzes: boolean;
  min_score: number;
  issues_certificate: boolean;
  en: En<{ title: string; slug: string | null; short_description: string | null; objectives: string[] }>;
  media: Record<string, MediaJson>;
  modules: ModuleJson[] | null;
  entitlement: { source: string; starts_at: string; expires_at: string | null };
  progress: ProgressJson;
}

export interface CorrectionJson {
  question_id: string;
  answer_id: string | null;
  correct: boolean;
  correct_answer_id: string | null;
  explanation: string | null;
  explanation_en: string | null;
  feedback: string | null;
  feedback_en: string | null;
  learn_more: string | null;
  learn_more_en: string | null;
}

export interface SubmissionJson {
  score: number;
  correct: number;
  total: number;
  passing_score: number;
  passed: boolean;
  corrections: CorrectionJson[];
  progress: ProgressJson;
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

/** French base, English translation; English falls back to the French. */
export function loc(fr: string | null | undefined, english: string | null | undefined): Localized {
  const base = fr ?? "";
  return { fr: base, en: english || base };
}

const optLoc = (fr: string | null | undefined, english: string | null | undefined): Localized | undefined =>
  fr || english ? loc(fr, english) : undefined;

function zip(fr: string[] | null | undefined, english: string[] | null | undefined): Localized[] {
  return (fr ?? []).map((value, index) => loc(value, english?.[index]));
}

const LEVELS: readonly CourseLevel[] = ["beginner", "intermediate", "advanced", "all"];
const asLevel = (value: string): CourseLevel => (LEVELS.includes(value as CourseLevel) ? (value as CourseLevel) : "all");

function toBlock(json: BlockJson): ContentBlock {
  const en = json.en ?? null;
  if (json.kind === "image") {
    return {
      id: json.id,
      type: "image",
      src: json.media_id ?? "",
      alt: loc(json.alt_text, en?.alt_text),
      caption: loc(json.caption, en?.caption),
      align: json.align ?? "full",
    };
  }
  if (json.kind === "video") {
    return {
      id: json.id,
      type: "video",
      source: json.media_id ?? "",
      poster: json.poster_media_id ?? "",
      title: loc(json.title, en?.title),
      duration: secondsToClock(json.duration_seconds),
      caption: loc(json.caption, en?.caption),
    };
  }
  return { id: json.id, type: "text", html: loc(json.body_html, en?.body_html) };
}

function toStep(json: StepJson): Step {
  return {
    id: json.id,
    title: loc(json.title, json.en?.title),
    summary: loc(json.summary, json.en?.summary),
    duration: json.duration_minutes,
    blocks: json.blocks.map(toBlock),
  };
}

const EMPTY: Localized = { fr: "", en: "" };

function toQuestion(json: QuestionJson): Question {
  // No answer key and no feedback: they come back with the correction.
  const answers: Answer[] = json.answers.map((a) => ({ id: a.id, text: loc(a.text, a.en?.text), correct: false }));
  const question: Question = {
    id: json.id,
    text: loc(json.text, json.en?.text),
    answers,
    correctFeedback: EMPTY,
    incorrectFeedback: EMPTY,
  };
  if (json.image_media_id) question.image = json.image_media_id;
  return question;
}

function toQuiz(json: QuizJson): Quiz {
  return {
    id: json.id,
    title: loc(json.title, json.en?.title),
    intro: loc(json.intro, json.en?.intro),
    questions: json.questions.map(toQuestion),
    settings: {
      passingScore: json.passing_score,
      allowRetry: json.allow_retry,
      attempts: json.max_attempts,
      shuffleAnswers: json.shuffle_answers,
      immediateFeedback: json.immediate_feedback,
      showAnswers: json.show_answers,
    },
  };
}

function toModule(json: ModuleJson): Module {
  return {
    id: json.id,
    title: loc(json.title, json.en?.title),
    description: loc(json.description, json.en?.description),
    cover: json.cover_media_id ?? "",
    objectives: zip(json.objectives, json.en?.objectives),
    steps: json.steps.map(toStep),
    quiz: json.quiz ? toQuiz(json.quiz) : null,
  };
}

/** The course content a holder reads; null while the course is withdrawn. */
export function toTraining(json: LearnerCourseJson): TrainingCourse | null {
  if (json.status !== "published" || !json.modules) return null;
  return {
    id: json.id,
    slug: json.slug,
    title: loc(json.title, json.en?.title),
    shortDescription: loc(json.short_description, json.en?.short_description),
    fullDescription: EMPTY,
    cover: json.cover_media_id ?? "",
    category: json.category as CourseCategory,
    level: asLevel(json.level),
    duration: json.duration_minutes,
    objectives: zip(json.objectives, json.en?.objectives),
    requirements: [],
    completion: {
      allSteps: json.complete_all_steps,
      allQuizzes: json.complete_all_quizzes,
      minScore: json.min_score,
      certificate: json.issues_certificate,
    },
    // Not the learner's business: the price is the sales page's.
    priceMinor: 0,
    currency: "EUR",
    status: json.status,
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    completionRate: 0,
    enrolled: 0,
    modules: json.modules.map(toModule),
  };
}

/**
 * The member's record from the server's rows. Checks are keyed by module
 * (`quiz-<module id>`, as in `path.ts`); history keeps the steps and first
 * passes the course still has, newest first.
 */
export function toRecord(progress: ProgressJson, training: TrainingCourse | null, startsAt: string): LearnerRecord {
  const quizResults: Record<string, QuizResult> = {};
  for (const attempt of progress.attempts) {
    if (attempt.status !== "submitted") continue;
    const key = quizKey(attempt.module_id);
    const previous = quizResults[key];
    quizResults[key] = {
      attempts: (previous?.attempts ?? 0) + 1,
      bestScore: Math.max(previous?.bestScore ?? 0, attempt.score ?? 0),
      passed: Boolean(previous?.passed) || attempt.passed,
    };
  }

  const known = new Set(training ? buildPath(training).map((node) => node.key) : []);
  const passes = new Map<string, string>();
  for (const attempt of progress.attempts) {
    const key = quizKey(attempt.module_id);
    if (attempt.passed && attempt.submitted_at && !passes.has(key)) passes.set(key, attempt.submitted_at);
  }
  const history: CompletionEvent[] = [
    ...progress.steps.map((s) => ({ key: s.step_id, at: s.completed_at })),
    ...[...passes].map(([key, at]) => ({ key, at })),
  ]
    .filter((event) => known.has(event.key))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, HISTORY_LENGTH);

  return {
    completedSteps: progress.steps.map((s) => s.step_id),
    quizResults,
    lastKey: null,
    history,
    startedOn: startsAt.slice(0, 10),
    completedOn: progress.completion ? progress.completion.completed_at.slice(0, 10) : null,
  };
}

export function toHeldCourse(json: LearnerCourseJson): HeldCourse {
  const training = toTraining(json);
  return {
    card: {
      id: json.slug,
      title: loc(json.title, json.en?.title),
      summary: loc(json.short_description, json.en?.short_description),
      level: asLevel(json.level),
      cover: json.cover_media_id ?? "",
      status: json.status,
      issuesCertificate: json.issues_certificate,
    },
    training,
    record: toRecord(json.progress, training, json.entitlement.starts_at),
    certificateCode: json.progress.completion?.certificate_code ?? null,
  };
}

/** Applies fresh progress (returned by a write) to a held course. */
export function withProgress(course: HeldCourse, progress: ProgressJson): HeldCourse {
  return {
    ...course,
    record: { ...toRecord(progress, course.training, course.record.startedOn), lastKey: course.record.lastKey },
    certificateCode: progress.completion?.certificate_code ?? null,
  };
}

export function toCorrection(json: CorrectionJson): Correction {
  return {
    questionId: json.question_id,
    answerId: json.answer_id,
    correct: json.correct,
    correctAnswerId: json.correct_answer_id,
    feedback: loc(json.feedback, json.feedback_en),
    explanation: optLoc(json.explanation, json.explanation_en),
    learnMore: optLoc(json.learn_more, json.learn_more_en),
  };
}

export function toGradedAttempt(json: SubmissionJson): GradedAttempt {
  const corrections: Record<string, Correction> = {};
  for (const correction of json.corrections) corrections[correction.question_id] = toCorrection(correction);
  return {
    score: { correct: json.correct, total: json.total, score: json.score, passed: json.passed },
    corrections,
  };
}

/** Storage paths of every media file the held courses use, by media id. */
export function mediaPaths(courses: LearnerCourseJson[]): Map<string, string> {
  const paths = new Map<string, string>();
  for (const course of courses) {
    for (const [id, media] of Object.entries(course.media ?? {})) paths.set(id, media.path);
  }
  return paths;
}
