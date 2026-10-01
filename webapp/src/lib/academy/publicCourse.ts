import type { Localized } from "../../data/types";
import { localizedPath, type Locale } from "../localeRoutes";
import { findProductByKey, productSlug, resolveProductAddress, type ProductAddress, type SluggedProduct } from "../catalog/productSlugs";

/**
 * A course as the public Academy pages show it (phase B): the catalogue, the
 * course sales page, the home page band, the header's and footer's Academy
 * entries. Read from the published courses (`courses`, its outline and its
 * current price, under RLS: `lib/academy/api.ts`), or from the prototype's
 * fixtures when Supabase is not configured (`lib/academy/fixtures.ts`).
 *
 * Only what a visitor may read: the outline (modules, steps, knowledge checks
 * and their pass marks), never a lesson's content or a quiz's questions.
 *
 * Addresses work like products' (decided 2026-09-30, applied to courses):
 * `/fr/academy/formation/<courses.slug>`, `/en/academy/course/<English slug>`,
 * the English slug falling back to the French one; `id` is the French slug.
 */

export type CourseLevel = "beginner" | "intermediate" | "advanced" | "all";
export const COURSE_LEVELS: readonly CourseLevel[] = ["beginner", "intermediate", "advanced", "all"];

/** An amount in integer minor units with its currency (AGENTS.md §8). */
export interface Money {
  minor: number;
  currency: string;
}

export interface PublicStep {
  id: string;
  title: Localized;
  minutes: number;
}

export interface PublicModule {
  id: string;
  title: Localized;
  summary: Localized | null;
  steps: PublicStep[];
  /** The module's knowledge check, when it has one (title and pass mark only). */
  check: { title: Localized; passingScore: number } | null;
}

export interface PublicCourse extends SluggedProduct {
  /** French slug: the course's key in internal paths and reviews. */
  id: string;
  title: Localized;
  summary: Localized | null;
  description: Localized | null;
  level: CourseLevel;
  /** Advertised length, authored in the back office. */
  minutes: number;
  objectives: Localized[];
  requirements: Localized[];
  /** Average score the course requires to be completed. */
  minScore: number;
  issuesCertificate: boolean;
  price: Money;
  /** Price now, after the running promotion; equals `price` without one. */
  currentPrice: Money;
  /** End of the running promotion, null when open-ended or none. */
  promotionEndsAt: string | null;
  cover: { src: string; alt: Localized | null } | null;
  modules: PublicModule[];
  /**
   * What the sales page can do about it. `demo`: the prototype's enrolment
   * (mock mode, the course exists in the learner fixtures). `soon`: a real
   * course, which cannot be bought before phase D — the page says enrolment
   * opens soon instead of pretending to enrol.
   */
  enrolment: "demo" | "soon";
}

export function lessonCount(course: Pick<PublicCourse, "modules">): number {
  return course.modules.reduce((sum, module) => sum + module.steps.length, 0);
}

export function checkCount(course: Pick<PublicCourse, "modules">): number {
  return course.modules.filter((module) => module.check).length;
}

export function moduleMinutes(module: PublicModule): number {
  return module.steps.reduce((sum, step) => sum + step.minutes, 0);
}

export function isDiscounted(course: Pick<PublicCourse, "price" | "currentPrice">): boolean {
  return course.currentPrice.minor < course.price.minor;
}

export function courseSlug(course: PublicCourse, locale: Locale): string {
  return productSlug(course, locale);
}

export function courseAddresses(course: PublicCourse): Record<Locale, string> {
  return {
    fr: localizedPath("course", "fr", { id: courseSlug(course, "fr") }),
    en: localizedPath("course", "en", { id: courseSlug(course, "en") }),
  };
}

/** The course a URL key names: its slug in any language, or its row id. */
export function findCourseByKey(courses: readonly PublicCourse[], key: string): PublicCourse | undefined {
  return findProductByKey(courses, key);
}

export function resolveCourseAddress(courses: readonly PublicCourse[], key: string, locale: Locale): ProductAddress<PublicCourse> {
  return resolveProductAddress(courses, key, locale);
}
