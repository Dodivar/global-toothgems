import { pick } from "../../data/types";
import { truncate } from "../catalog/productMeta";
import type { Locale } from "../localeRoutes";
import { SITE_NAME, uiText } from "../pageMeta";
import { courseAddresses, type PublicCourse } from "./publicCourse";

/**
 * What the server says about a course sales page (phase B; the decision
 * postponed in docs/migration-nextjs.md until the Academy had real data):
 * its title, description, addresses in both languages and its structured
 * data (schema.org `Course`). Only what the page itself shows. Pure,
 * unit-tested.
 */

export function courseTitle(course: PublicCourse, locale: Locale): string {
  return `${pick(course.title, locale)} · ${SITE_NAME}`;
}

/** The summary the hero shows, else the description, else the course and its level. */
export function courseDescription(course: PublicCourse, locale: Locale): string {
  const text = (course.summary && pick(course.summary, locale)) || (course.description && pick(course.description, locale)) || "";
  const clean = text.replace(/\s+/g, " ").trim();
  return truncate(clean || `${pick(course.title, locale)} — ${uiText(locale, `academy.levels.${course.level}`)}.`);
}

/** ISO 8601 duration of a length in minutes ("PT1H35M"), or undefined without one. */
export function isoDuration(minutes: number): string | undefined {
  if (minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `PT${hours ? `${hours}H` : ""}${rest ? `${rest}M` : ""}`;
}

/**
 * schema.org `Course`, with absolute URLs. No `offers` until a course can be
 * bought (phase D): the page says enrolment opens soon, so the structured
 * data does not advertise an offer either.
 */
export function courseJsonLd(course: PublicCourse, locale: Locale, base: URL): Record<string, unknown> {
  const absolute = (path: string) => new URL(path, base).toString();
  const timeRequired = isoDuration(course.minutes);
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: pick(course.title, locale),
    description: courseDescription(course, locale),
    url: absolute(courseAddresses(course)[locale]),
    inLanguage: locale,
    educationalLevel: uiText(locale, `academy.levels.${course.level}`),
    provider: { "@type": "Organization", name: SITE_NAME, url: absolute("/") },
    ...(course.cover ? { image: [absolute(course.cover.src)] } : {}),
    ...(timeRequired ? { timeRequired } : {}),
  };
}
