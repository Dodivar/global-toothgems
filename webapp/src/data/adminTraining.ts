import type { Localized } from "./types";
import { photo } from "../lib/images";

/**
 * Training catalogue for the administration prototype.
 *
 * The hierarchy is the product: a course owns modules, a module owns ordered
 * content steps and at most one quiz, a step owns ordered content blocks, and a
 * quiz owns ordered questions. Every level carries its own id so the builder can
 * address one node without walking the tree by index — reordering must never
 * invalidate a selection.
 *
 * Seeded content is `Localized` rather than translation keys, like every other
 * mock store here: this is authored course material an administrator would edit,
 * not interface chrome.
 */

const img = photo;

/** Compact constructor — this file is mostly bilingual prose. */
const L = (fr: string, en: string): Localized => ({ fr, en });

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `unpublished` is not `draft`: a course that was live and was taken down has
 * buyers, and the list has to tell the two apart. There is no "review" state:
 * a single trainer authors every course, and a draft is already "not ready"
 * (owner's decision, 2026-10-01). The database enforces the transitions
 * (draft → published ⇄ unpublished, never back to draft).
 */
export type CourseStatus = "draft" | "published" | "unpublished";

export const COURSE_STATUSES: CourseStatus[] = ["draft", "published", "unpublished"];

export type CourseLevel = "beginner" | "intermediate" | "advanced" | "all";

export const COURSE_LEVELS: CourseLevel[] = ["beginner", "intermediate", "advanced", "all"];

export type CourseCategory = "technique" | "hygiene" | "business" | "creative";

export const COURSE_CATEGORIES: CourseCategory[] = ["technique", "hygiene", "business", "creative"];

export type BlockType = "text" | "image" | "video";

export const BLOCK_TYPES: BlockType[] = ["text", "image", "video"];

/** Rich text, stored as the small HTML subset the editor toolbar produces. */
export interface TextBlock {
  id: string;
  type: "text";
  html: Localized;
}

/**
 * Image and video fields hold a *media reference*: the training media library
 * entry the course points at (its id once stored in Supabase, a URL in the
 * prototype). Screens turn a reference into something displayable with
 * `useTrainingMedia().urlOf()` — never by using it as a URL directly.
 */
export interface ImageBlock {
  id: string;
  type: "image";
  /** Media reference (image). Empty while drafting; publication requires it. */
  src: string;
  /** Empty is a state the review screen reports on, not an error here. */
  alt: Localized;
  caption: Localized;
  align: "left" | "center" | "full";
}

export interface VideoBlock {
  id: string;
  type: "video";
  /** Poster frame: media reference (image), optional. */
  poster: string;
  title: Localized;
  /** mm:ss, as authored. */
  duration: string;
  /** The video file: media reference (video). Empty while drafting. */
  source: string;
  caption: Localized;
}

export type ContentBlock = TextBlock | ImageBlock | VideoBlock;

export interface Step {
  id: string;
  title: Localized;
  /** One line, shown in the structure tree and above the learner's content. */
  summary: Localized;
  /** Minutes. Numeric so module and course totals can be computed, not typed. */
  duration: number;
  blocks: ContentBlock[];
}

export interface Answer {
  id: string;
  text: Localized;
  correct: boolean;
  /** Optional per-answer note, shown beside the question-wide feedback. */
  explanation?: Localized;
}

export interface Question {
  id: string;
  text: Localized;
  image?: string;
  answers: Answer[];
  correctFeedback: Localized;
  incorrectFeedback: Localized;
  /** Optional "go further" note offered once the answer is revealed. */
  learnMore?: Localized;
}

export interface QuizSettings {
  /** Share of correct answers required to pass, percent. */
  passingScore: number;
  shuffleAnswers: boolean;
  immediateFeedback: boolean;
  showAnswers: boolean;
}

export interface Quiz {
  id: string;
  title: Localized;
  intro: Localized;
  questions: Question[];
  settings: QuizSettings;
}

export interface Module {
  id: string;
  title: Localized;
  description: Localized;
  cover: string;
  objectives: Localized[];
  steps: Step[];
  /** A module may legitimately end without a knowledge check. */
  quiz: Quiz | null;
}

export interface CompletionCriteria {
  allSteps: boolean;
  allQuizzes: boolean;
  /** Minimum average quiz score, percent. */
  minScore: number;
  certificate: boolean;
}

export interface TrainingCourse {
  id: string;
  title: Localized;
  shortDescription: Localized;
  fullDescription: Localized;
  cover: string;
  category: CourseCategory;
  level: CourseLevel;
  /** Minutes, authored: the advertised length, not the sum of the steps. */
  duration: number;
  objectives: Localized[];
  requirements: Localized[];
  completion: CompletionCriteria;
  /** Price in minor units (cents) of `currency`. A course is not a shop product. */
  priceMinor: number;
  currency: string;
  /** URL key of the sales page; set at creation, frozen once published. */
  slug: string;
  status: CourseStatus;
  /** First publication, set by the database. A course ever published cannot be deleted. */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Share of enrolled learners who finished, percent. Reporting, not input. */
  completionRate: number;
  enrolled: number;
  modules: Module[];
}

/* -------------------------------------------------------------------------- */
/* Derived counts                                                              */
/* -------------------------------------------------------------------------- */

export function stepCount(course: TrainingCourse): number {
  return course.modules.reduce((total, m) => total + m.steps.length, 0);
}

export function quizCount(course: TrainingCourse): number {
  return course.modules.filter((m) => m.quiz !== null).length;
}

export function questionCount(course: TrainingCourse): number {
  return course.modules.reduce((total, m) => total + (m.quiz?.questions.length ?? 0), 0);
}

/** Sum of the authored step durations — what the builder shows per module. */
export function moduleDuration(module: Module): number {
  return module.steps.reduce((total, s) => total + s.duration, 0);
}

export function courseStepDuration(course: TrainingCourse): number {
  return course.modules.reduce((total, m) => total + moduleDuration(m), 0);
}

export function blockCount(module: Module): number {
  return module.steps.reduce((total, s) => total + s.blocks.length, 0);
}

/* -------------------------------------------------------------------------- */
/* Reference data                                                              */
/* -------------------------------------------------------------------------- */

/** Prototype media library (mock mode only), so image blocks have something real to show. */
export const MEDIA_LIBRARY: { id: string; src: string; label: Localized }[] = [
  { id: "med-01", src: img("mouth-01.jpg"), label: L("Sourire terminé, gem centrale", "Finished smile, centre gem") },
  { id: "med-02", src: img("mouth-02.jpg"), label: L("Composition multi-gems", "Multi-gem composition") },
  { id: "med-03", src: img("mouth-03.jpg"), label: L("Gem sur dent latérale", "Gem on a lateral tooth") },
  { id: "med-04", src: img("mouth-04.jpg"), label: L("Contrôle après polymérisation", "Post-cure inspection") },
  { id: "med-05", src: img("mouth-05.jpg"), label: L("Résultat après une semaine", "Result after one week") },
  { id: "med-06", src: img("img-05.jpg"), label: L("Plateau d’instruments", "Instrument tray") },
  { id: "med-07", src: img("img-06.jpg"), label: L("Poste de travail préparé", "Prepared workstation") },
  { id: "med-08", src: img("img-08.jpg"), label: L("Gems triées par taille", "Gems sorted by size") },
  { id: "med-09", src: img("img-12.jpg"), label: L("Gros plan sur l’émail", "Enamel close-up") },
  { id: "med-10", src: img("img-14.jpg"), label: L("Lampe de polymérisation", "Curing lamp") },
  { id: "med-11", src: img("img-17.jpg"), label: L("Fiche de consentement client", "Client consent form") },
  { id: "med-12", src: img("img-19.jpg"), label: L("Studio en situation", "Studio in session") },
];

export const COVER_LIBRARY: string[] = [
  img("img-12.jpg"),
  img("mouth-01.jpg"),
  img("mouth-02.jpg"),
  img("mouth-03.jpg"),
  img("img-05.jpg"),
  img("img-19.jpg"),
  img("img-07.jpg"),
  img("img-20.jpg"),
];

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  passingScore: 70,
  shuffleAnswers: true,
  immediateFeedback: true,
  showAnswers: true,
};
