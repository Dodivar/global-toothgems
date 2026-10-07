import type { Database } from "./supabase/database.types";
import type { Localized } from "../data/types";
import {
  type Answer,
  type ContentBlock,
  type CourseCategory,
  type CourseLevel,
  type CourseStatus,
  type Module,
  type Question,
  type Quiz,
  type Step,
  type TrainingCourse,
} from "../data/adminTraining";
import { toMajorUnits, toMinorUnits } from "./catalog/money";
import { minorToDecimalString, type CoursePromotion } from "./coursePricing";

/**
 * Row ↔ builder mapping for the Academy authoring tables (migration
 * `…_academy_authoring`). Pure functions only, unit-tested.
 *
 * French lives in the base columns, English in one `*_translations` row per
 * node (absent = no English yet, the French is shown). Media slots hold the
 * `training_media` id. Money crosses the boundary here: numeric(12,2) in the
 * database, integer minor units in TypeScript, a decimal string in payloads.
 */

type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];

type AnswerRow = Row<"quiz_answers"> & { quiz_answer_translations: Row<"quiz_answer_translations">[] };
type QuestionRow = Row<"quiz_questions"> & {
  quiz_question_translations: Row<"quiz_question_translations">[];
  quiz_answers: AnswerRow[];
};
type QuizRow = Row<"course_quizzes"> & {
  course_quiz_translations: Row<"course_quiz_translations">[];
  quiz_questions: QuestionRow[];
};
type BlockRow = Row<"course_blocks"> & { course_block_translations: Row<"course_block_translations">[] };
type StepRow = Row<"course_steps"> & {
  course_step_translations: Row<"course_step_translations">[];
  course_blocks: BlockRow[];
};
type ModuleRow = Row<"course_modules"> & {
  course_module_translations: Row<"course_module_translations">[];
  course_steps: StepRow[];
  course_quizzes: QuizRow[] | QuizRow | null;
};
export type CourseRow = Row<"courses"> & {
  course_translations: Row<"course_translations">[];
  course_modules: ModuleRow[];
};
export type CoursePromotionRow = Row<"course_promotions">;

/** One request reads every course with its whole tree (staff only, by RLS). */
export const ADMIN_COURSE_SELECT = `*,
  course_translations(*),
  course_modules(*,
    course_module_translations(*),
    course_steps(*,
      course_step_translations(*),
      course_blocks(*, course_block_translations(*))),
    course_quizzes(*,
      course_quiz_translations(*),
      quiz_questions(*,
        quiz_question_translations(*),
        quiz_answers(*, quiz_answer_translations(*)))))`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/* -------------------------------------------------------------------------- */
/* Rows → builder                                                              */
/* -------------------------------------------------------------------------- */

function en<T extends { locale: string }>(rows: T[] | null | undefined): T | undefined {
  return rows?.find((row) => row.locale === "en");
}

const loc = (fr: string | null | undefined, english: string | null | undefined): Localized => ({
  fr: fr ?? "",
  en: english ?? "",
});

/** Optional localized text: undefined when neither language has it. */
const optLoc = (fr: string | null | undefined, english: string | null | undefined): Localized | undefined =>
  fr || english ? loc(fr, english) : undefined;

/** Two parallel arrays (French base, English translation) → one list of pairs. */
function zipLists(fr: string[], english: string[] | undefined): Localized[] {
  return fr.map((value, index) => ({ fr: value, en: english?.[index] ?? "" }));
}

const byPosition = <T extends { position: number }>(rows: T[] | null | undefined): T[] =>
  [...(rows ?? [])].sort((a, b) => a.position - b.position);

export function secondsToClock(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "mm:ss" (or "h:mm:ss") → seconds; null when it does not read as a duration. */
export function clockToSeconds(clock: string): number | null {
  const parts = clock.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

function rowToBlock(row: BlockRow): ContentBlock {
  const t = en(row.course_block_translations);
  if (row.kind === "image") {
    return {
      id: row.id,
      type: "image",
      src: row.media_id ?? "",
      alt: loc(row.alt_text, t?.alt_text),
      caption: loc(row.caption, t?.caption),
      align: (row.align as "left" | "center" | "full" | null) ?? "full",
    };
  }
  if (row.kind === "video") {
    return {
      id: row.id,
      type: "video",
      source: row.media_id ?? "",
      poster: row.poster_media_id ?? "",
      title: loc(row.title, t?.title),
      duration: secondsToClock(row.duration_seconds),
      caption: loc(row.caption, t?.caption),
    };
  }
  return { id: row.id, type: "text", html: loc(row.body_html, t?.body_html) };
}

function rowToStep(row: StepRow): Step {
  const t = en(row.course_step_translations);
  return {
    id: row.id,
    title: loc(row.title, t?.title),
    summary: loc(row.summary, t?.summary),
    duration: row.duration_minutes,
    blocks: byPosition(row.course_blocks).map(rowToBlock),
  };
}

function rowToAnswer(row: AnswerRow): Answer {
  const t = en(row.quiz_answer_translations);
  const answer: Answer = { id: row.id, text: loc(row.text, t?.text), correct: row.is_correct };
  const explanation = optLoc(row.explanation, t?.explanation);
  if (explanation) answer.explanation = explanation;
  return answer;
}

function rowToQuestion(row: QuestionRow): Question {
  const t = en(row.quiz_question_translations);
  const question: Question = {
    id: row.id,
    text: loc(row.text, t?.text),
    answers: byPosition(row.quiz_answers).map(rowToAnswer),
    correctFeedback: loc(row.correct_feedback, t?.correct_feedback),
    incorrectFeedback: loc(row.incorrect_feedback, t?.incorrect_feedback),
  };
  if (row.image_media_id) question.image = row.image_media_id;
  const learnMore = optLoc(row.learn_more, t?.learn_more);
  if (learnMore) question.learnMore = learnMore;
  return question;
}

function rowToQuiz(row: QuizRow): Quiz {
  const t = en(row.course_quiz_translations);
  return {
    id: row.id,
    title: loc(row.title, t?.title),
    intro: loc(row.intro, t?.intro),
    questions: byPosition(row.quiz_questions).map(rowToQuestion),
    settings: {
      passingScore: row.passing_score,
      shuffleAnswers: row.shuffle_answers,
      immediateFeedback: row.immediate_feedback,
      showAnswers: row.show_answers,
    },
  };
}

function rowToModule(row: ModuleRow): Module {
  const t = en(row.course_module_translations);
  // A one-to-one embed comes back as an object or as a one-item array depending on the client version.
  const quizRow = Array.isArray(row.course_quizzes) ? row.course_quizzes[0] : row.course_quizzes;
  return {
    id: row.id,
    title: loc(row.title, t?.title),
    description: loc(row.description, t?.description),
    cover: row.cover_media_id ?? "",
    objectives: zipLists(row.objectives, t?.objectives),
    steps: byPosition(row.course_steps).map(rowToStep),
    quiz: quizRow ? rowToQuiz(quizRow) : null,
  };
}

export function rowToCourse(row: CourseRow): TrainingCourse {
  const t = en(row.course_translations);
  return {
    id: row.id,
    slug: row.slug,
    title: loc(row.title, t?.title),
    shortDescription: loc(row.short_description, t?.short_description),
    fullDescription: loc(row.description, t?.description),
    cover: row.cover_media_id ?? "",
    category: row.category as CourseCategory,
    level: row.level as CourseLevel,
    duration: row.duration_minutes,
    objectives: zipLists(row.objectives, t?.objectives),
    requirements: zipLists(row.requirements, t?.requirements),
    completion: {
      allSteps: row.complete_all_steps,
      allQuizzes: row.complete_all_quizzes,
      minScore: row.min_score,
      certificate: row.issues_certificate,
    },
    priceMinor: toMinorUnits(row.price),
    currency: row.currency,
    status: row.status as CourseStatus,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Learner figures arrive with the learner tables (phase C).
    completionRate: 0,
    enrolled: 0,
    modules: byPosition(row.course_modules).map(rowToModule),
  };
}

export function rowToPromotion(row: CoursePromotionRow): CoursePromotion {
  return {
    id: row.id,
    courseId: row.course_id,
    label: row.label,
    discountType: row.discount_type as CoursePromotion["discountType"],
    value: row.discount_type === "amount" ? toMinorUnits(row.discount_value) : Math.round(Number(row.discount_value)),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    active: row.is_active,
  };
}

/* -------------------------------------------------------------------------- */
/* Builder → payloads                                                          */
/* -------------------------------------------------------------------------- */

const media = (ref: string | undefined): string | null => (isUuid(ref) ? ref : null);
const trim = (value: string | undefined): string => (value ?? "").trim();

/**
 * Lists are stored as two parallel arrays. An item without English text sends
 * its French text in the English array, so the two never shift against each
 * other (the database drops blank items).
 */
function splitLists(items: Localized[]): { fr: string[]; en: string[] } {
  const kept = items.filter((item) => trim(item.fr) !== "");
  return { fr: kept.map((item) => trim(item.fr)), en: kept.map((item) => trim(item.en) || trim(item.fr)) };
}

/** Lower-case ASCII words joined by dashes, as the `slug` columns require. */
export function courseSlug(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug || "formation";
}

function blockPayload(block: ContentBlock) {
  if (block.type === "text") {
    return { id: block.id, kind: "text", body_html: block.html.fr, en: { body_html: block.html.en } };
  }
  if (block.type === "image") {
    return {
      id: block.id,
      kind: "image",
      media_id: media(block.src),
      alt_text: trim(block.alt.fr),
      caption: trim(block.caption.fr),
      align: block.align,
      en: { alt_text: trim(block.alt.en), caption: trim(block.caption.en) },
    };
  }
  return {
    id: block.id,
    kind: "video",
    media_id: media(block.source),
    poster_media_id: media(block.poster),
    title: trim(block.title.fr),
    caption: trim(block.caption.fr),
    duration_seconds: clockToSeconds(block.duration),
    en: { title: trim(block.title.en), caption: trim(block.caption.en) },
  };
}

function quizPayload(quiz: Quiz) {
  return {
    id: quiz.id,
    title: trim(quiz.title.fr),
    intro: trim(quiz.intro.fr),
    passing_score: quiz.settings.passingScore,
    shuffle_answers: quiz.settings.shuffleAnswers,
    immediate_feedback: quiz.settings.immediateFeedback,
    show_answers: quiz.settings.showAnswers,
    en: { title: trim(quiz.title.en), intro: trim(quiz.intro.en) },
    questions: quiz.questions.map((question) => ({
      id: question.id,
      text: trim(question.text.fr),
      image_media_id: media(question.image),
      correct_feedback: trim(question.correctFeedback.fr),
      incorrect_feedback: trim(question.incorrectFeedback.fr),
      learn_more: trim(question.learnMore?.fr),
      en: {
        text: trim(question.text.en),
        correct_feedback: trim(question.correctFeedback.en),
        incorrect_feedback: trim(question.incorrectFeedback.en),
        learn_more: trim(question.learnMore?.en),
      },
      answers: question.answers.map((answer) => ({
        id: answer.id,
        text: trim(answer.text.fr),
        is_correct: answer.correct,
        explanation: trim(answer.explanation?.fr),
        en: { text: trim(answer.text.en), explanation: trim(answer.explanation?.en) },
      })),
    })),
  };
}

/** The whole course, as `admin_save_course(jsonb)` reads it. */
export function courseToPayload(course: TrainingCourse) {
  const objectives = splitLists(course.objectives);
  const requirements = splitLists(course.requirements);
  return {
    id: course.id,
    slug: course.slug || courseSlug(course.title.fr),
    title: trim(course.title.fr),
    short_description: trim(course.shortDescription.fr),
    description: trim(course.fullDescription.fr),
    cover_media_id: media(course.cover),
    category: course.category,
    level: course.level,
    duration_minutes: Math.max(0, Math.round(course.duration)),
    objectives: objectives.fr,
    requirements: requirements.fr,
    complete_all_steps: course.completion.allSteps,
    complete_all_quizzes: course.completion.allQuizzes,
    min_score: course.completion.minScore,
    issues_certificate: course.completion.certificate,
    price: minorToDecimalString(course.priceMinor),
    currency: course.currency,
    en: {
      title: trim(course.title.en),
      slug: trim(course.title.en) ? courseSlug(course.title.en) : "",
      short_description: trim(course.shortDescription.en),
      description: trim(course.fullDescription.en),
      objectives: objectives.en,
      requirements: requirements.en,
    },
    modules: course.modules.map((module) => {
      const moduleObjectives = splitLists(module.objectives);
      return {
        id: module.id,
        title: trim(module.title.fr),
        description: trim(module.description.fr),
        cover_media_id: media(module.cover),
        objectives: moduleObjectives.fr,
        en: { title: trim(module.title.en), description: trim(module.description.en), objectives: moduleObjectives.en },
        steps: module.steps.map((step) => ({
          id: step.id,
          title: trim(step.title.fr),
          summary: trim(step.summary.fr),
          duration_minutes: Math.max(0, Math.round(step.duration)),
          en: { title: trim(step.title.en), summary: trim(step.summary.en) },
          blocks: step.blocks.map(blockPayload),
        })),
        quiz: module.quiz ? quizPayload(module.quiz) : null,
      };
    }),
  };
}

export function promotionToRow(promotion: CoursePromotion) {
  return {
    id: promotion.id,
    course_id: promotion.courseId,
    label: promotion.label.trim(),
    discount_type: promotion.discountType,
    // numeric(12,2) column: whole percent, or the amount in major units — an integer number of
    // cents divided by 100 serialises as its exact two-decimal text (4999 → 49.99).
    discount_value: promotion.discountType === "amount" ? toMajorUnits(promotion.value) : promotion.value,
    starts_at: promotion.startsAt,
    ends_at: promotion.endsAt,
    is_active: promotion.active,
  };
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export type TrainingErrorKind =
  | "forbidden"
  | "notReady"
  | "published"
  | "overlap"
  | "amountTooHigh"
  | "invalid"
  | "network";

/** A database refusal → the message family the back office shows. */
export function trainingErrorKind(error: { code?: string; message?: string } | null | undefined): TrainingErrorKind {
  const message = error?.message ?? "";
  if (error?.code === "42501") return "forbidden";
  if (message.includes("not ready")) return "notReady";
  if (message.includes("overlap")) return "overlap";
  if (message.includes("amount_exceeds_price")) return "amountTooHigh";
  if (message.includes("published course") || message.includes("cannot go back")) return "published";
  if (error?.code && /^(22|23)/.test(error.code)) return "invalid";
  return "network";
}

/** The readiness codes a "not ready" refusal carries ("courses: not ready (no_modules,empty_quiz)"). */
export function notReadyCodes(message: string | undefined): string[] {
  const match = /not ready \(([^)]*)\)/.exec(message ?? "");
  return match ? match[1].split(",").filter(Boolean) : [];
}
