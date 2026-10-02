import type { Localized } from "../../data/types";
import { toMinorUnits } from "../catalog/money";
import { COURSE_CATEGORIES, COURSE_LEVELS, type CourseCategory, type CourseLevel, type PublicCourse, type PublicModule } from "./publicCourse";

/**
 * Rows of the published Academy (`lib/academy/api.ts`) → `PublicCourse`.
 * Pure, unit-tested. French lives in the base columns, English in published
 * `*_translations` rows; an English text left empty shows the French one.
 * Draft translations are ignored here too, so a staff member browsing the
 * public pages (staff read every row) sees what visitors see.
 */

interface TranslationRow {
  locale: string;
  status: string;
}

export interface PublicCourseRow {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  description: string | null;
  level: string;
  category?: string | null;
  published_at?: string | null;
  duration_minutes: number;
  objectives: string[];
  requirements: string[];
  min_score: number;
  issues_certificate: boolean;
  price: number | string;
  currency: string;
  course_translations:
    | (TranslationRow & {
        title: string;
        slug: string | null;
        short_description: string | null;
        description: string | null;
        objectives: string[];
        requirements: string[];
      })[]
    | null;
  cover: {
    id: string;
    alt_text: string | null;
    updated_at: string;
    training_media_translations: (TranslationRow & { alt_text: string })[] | null;
  } | null;
  course_modules:
    | {
        id: string;
        position: number;
        title: string;
        description: string | null;
        course_module_translations: (TranslationRow & { title: string; description: string | null })[] | null;
        course_steps:
          | {
              id: string;
              position: number;
              title: string;
              duration_minutes: number;
              course_step_translations: (TranslationRow & { title: string })[] | null;
            }[]
          | null;
        course_quizzes: QuizRow | QuizRow[] | null;
      }[]
    | null;
}

interface QuizRow {
  title: string;
  passing_score: number;
  course_quiz_translations: (TranslationRow & { title: string })[] | null;
}

export interface CoursePriceRow {
  course_id: string | null;
  current_price: number | string | null;
  promotion_ends_at: string | null;
}

function english<T extends TranslationRow>(rows: T[] | null | undefined): T | undefined {
  return rows?.find((row) => row.locale === "en" && row.status === "published");
}

const text = (value: string | null | undefined): string => value?.trim() ?? "";

/** French base + English translation; the English falls back to the French. */
function localized(fr: string | null | undefined, en: string | null | undefined): Localized {
  return { fr: text(fr), en: text(en) || text(fr) };
}

/** Same, null when the French text is empty (the base is the reference). */
function optional(fr: string | null | undefined, en: string | null | undefined): Localized | null {
  return text(fr) ? localized(fr, en) : null;
}

function list(fr: string[] | null | undefined, en: string[] | null | undefined): Localized[] {
  return (fr ?? []).filter((item) => text(item)).map((item, index) => localized(item, en?.[index]));
}

const byPosition = <T extends { position: number }>(rows: T[] | null | undefined): T[] =>
  [...(rows ?? [])].sort((a, b) => a.position - b.position);

const isLevel = (value: string): value is CourseLevel => (COURSE_LEVELS as readonly string[]).includes(value);
const isCategory = (value: string | null | undefined): value is CourseCategory =>
  value != null && (COURSE_CATEGORIES as readonly string[]).includes(value);

/** Where a cover is served from: the public cover route, versioned so a replaced file is fetched again. */
export function coverSrc(mediaId: string, updatedAt: string): string {
  const version = Date.parse(updatedAt);
  return `/media/formations/${mediaId}${Number.isFinite(version) ? `?v=${version}` : ""}`;
}

function mapModule(row: NonNullable<PublicCourseRow["course_modules"]>[number]): PublicModule {
  const t = english(row.course_module_translations);
  const quiz = Array.isArray(row.course_quizzes) ? row.course_quizzes[0] : row.course_quizzes;
  return {
    id: row.id,
    title: localized(row.title, t?.title),
    summary: optional(row.description, t?.description),
    steps: byPosition(row.course_steps).map((step) => ({
      id: step.id,
      title: localized(step.title, english(step.course_step_translations)?.title),
      minutes: step.duration_minutes,
    })),
    check: quiz
      ? { title: localized(quiz.title, english(quiz.course_quiz_translations)?.title), passingScore: quiz.passing_score }
      : null,
  };
}

export function mapPublicCourse(row: PublicCourseRow, price: CoursePriceRow | undefined): PublicCourse {
  const t = english(row.course_translations);
  const listPrice = toMinorUnits(row.price);
  // Without its current price (a view row RLS hides at the same time as the
  // course), the list price stands: never a price lower than the database's.
  const now = price?.current_price != null ? toMinorUnits(price.current_price) : listPrice;
  const enSlug = text(t?.slug);
  const cover = row.cover;
  return {
    id: row.slug,
    dbId: row.id,
    slugs: enSlug && enSlug !== row.slug ? { en: enSlug } : undefined,
    title: localized(row.title, t?.title),
    summary: optional(row.short_description, t?.short_description),
    description: optional(row.description, t?.description),
    level: isLevel(row.level) ? row.level : "all",
    // The column's default, should a row ever carry a theme this build does not know.
    category: isCategory(row.category) ? row.category : "technique",
    publishedAt: row.published_at ?? null,
    minutes: row.duration_minutes,
    objectives: list(row.objectives, t?.objectives),
    requirements: list(row.requirements, t?.requirements),
    minScore: row.min_score,
    issuesCertificate: row.issues_certificate,
    price: { minor: listPrice, currency: row.currency },
    currentPrice: { minor: Math.min(now, listPrice), currency: row.currency },
    promotionEndsAt: now < listPrice ? (price?.promotion_ends_at ?? null) : null,
    cover: cover
      ? {
          src: coverSrc(cover.id, cover.updated_at),
          alt: optional(cover.alt_text, english(cover.training_media_translations)?.alt_text),
        }
      : null,
    modules: byPosition(row.course_modules).map(mapModule),
    enrolment: "sale",
  };
}

export function mapPublicCourses(rows: PublicCourseRow[], prices: CoursePriceRow[]): PublicCourse[] {
  const byCourse = new Map(prices.map((price) => [price.course_id, price]));
  return rows.map((row) => mapPublicCourse(row, byCourse.get(row.id)));
}
