import { pick } from "../../data/types";
import { COURSE_CATEGORIES, COURSE_LEVELS, type CourseCategory, type CourseLevel, type PublicCourse } from "./publicCourse";

/**
 * The Academy marketplace's browsing rules (`/academy`): which course is
 * featured, what the filters can offer, how the catalogue is narrowed and
 * ordered, and which courses suit a starting point. Pure functions on the
 * published courses, unit-tested; the page renders what they return.
 *
 * Nothing here is invented: every filter and every pathway reads a column
 * the back office authors (level, theme, price, length, publication date).
 * There is no "popular" signal yet, so nothing is ranked or labelled by
 * popularity.
 */

export type CatalogSort = "curated" | "newest" | "price-asc" | "price-desc" | "duration-asc";
export const CATALOG_SORTS: readonly CatalogSort[] = ["curated", "newest", "price-asc", "price-desc", "duration-asc"];

/** `any`, not `all`: "all levels" is itself a `CourseLevel`. */
export interface CatalogFilters {
  search: string;
  category: CourseCategory | "any";
  level: CourseLevel | "any";
  sort: CatalogSort;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = { search: "", category: "any", level: "any", sort: "curated" };

/** How many filters narrow the list (the sort does not), for "Clear" and the mobile button's count. */
export function activeFilterCount(filters: CatalogFilters): number {
  return (filters.search.trim() ? 1 : 0) + (filters.category !== "any" ? 1 : 0) + (filters.level !== "any" ? 1 : 0);
}

/** Ignores case and accents, so "hygiene" finds "Hygiène". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matchesSearch(course: PublicCourse, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = [course.title.fr, course.title.en, course.summary?.fr ?? "", course.summary?.en ?? ""].map(normalize).join(" ");
  return haystack.includes(needle);
}

const published = (course: PublicCourse) => course.publishedAt ?? "";

/**
 * The courses the filters keep, in the chosen order. "Curated" is the
 * catalogue's own order (oldest publication first, as the database returns
 * it). Ties keep that order too, so the list never shuffles between renders.
 */
export function filterCatalog(courses: readonly PublicCourse[], filters: CatalogFilters, lang: string): PublicCourse[] {
  const kept = courses.filter(
    (course) =>
      matchesSearch(course, filters.search) &&
      (filters.category === "any" || course.category === filters.category) &&
      (filters.level === "any" || course.level === filters.level),
  );
  const collator = new Intl.Collator(lang.startsWith("en") ? "en" : "fr", { sensitivity: "base" });
  const byTitle = (a: PublicCourse, b: PublicCourse) => collator.compare(pick(a.title, lang), pick(b.title, lang));
  const order = new Map(courses.map((course, index) => [course.id, index]));
  const curated = (a: PublicCourse, b: PublicCourse) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);

  return [...kept].sort((a, b) => {
    switch (filters.sort) {
      case "newest":
        return published(b).localeCompare(published(a)) || curated(a, b);
      case "price-asc":
        return a.currentPrice.minor - b.currentPrice.minor || byTitle(a, b);
      case "price-desc":
        return b.currentPrice.minor - a.currentPrice.minor || byTitle(a, b);
      case "duration-asc":
        // A course without an advertised length goes last rather than first.
        return (a.minutes || Infinity) - (b.minutes || Infinity) || byTitle(a, b);
      case "curated":
      default:
        return curated(a, b);
    }
  });
}

/** The themes and levels the published courses actually use, in their canonical order. */
export function catalogFacets(courses: readonly PublicCourse[]): { categories: CourseCategory[]; levels: CourseLevel[] } {
  const categories = new Set(courses.map((course) => course.category));
  const levels = new Set(courses.map((course) => course.level));
  return {
    categories: COURSE_CATEGORIES.filter((category) => categories.has(category)),
    levels: COURSE_LEVELS.filter((level) => levels.has(level)),
  };
}

/**
 * The course the marketplace puts forward: the most recently published one
 * (there is no editorial "featured" flag yet), the catalogue's first course
 * when no date is known.
 */
export function featuredCourse(courses: readonly PublicCourse[]): PublicCourse | undefined {
  let best: PublicCourse | undefined;
  for (const course of courses) {
    if (!best || published(course) > published(best)) best = course;
  }
  return best;
}

/** Days a course is labelled "new" after it goes online. */
export const NEW_COURSE_DAYS = 60;

/**
 * True for a course published within the last `NEW_COURSE_DAYS` days. Reads
 * the clock, so a server-rendered page must only call it once hydrated.
 */
export function isNewCourse(course: Pick<PublicCourse, "publishedAt">, now: Date): boolean {
  if (!course.publishedAt) return false;
  const at = Date.parse(course.publishedAt);
  if (!Number.isFinite(at) || at > now.getTime()) return false;
  return now.getTime() - at <= NEW_COURSE_DAYS * 24 * 60 * 60 * 1000;
}

/* Starting points ----------------------------------------------------------- */

export type Pathway = "new" | "improve" | "professional" | "refine";
export const PATHWAYS: readonly Pathway[] = ["new", "improve", "professional", "refine"];

/**
 * Which courses suit each starting point, from what the back office authors:
 * a course for every level suits a beginner and an improving artist alike;
 * professionalising is the business theme; refining is the advanced level and
 * the creative theme.
 */
const PATHWAY_RULES: Record<Pathway, { levels: readonly CourseLevel[]; categories: readonly CourseCategory[] }> = {
  new: { levels: ["beginner", "all"], categories: [] },
  improve: { levels: ["intermediate", "all"], categories: [] },
  professional: { levels: [], categories: ["business"] },
  refine: { levels: ["advanced"], categories: ["creative"] },
};

export function suitsPathway(course: Pick<PublicCourse, "level" | "category">, pathway: Pathway): boolean {
  const rule = PATHWAY_RULES[pathway];
  return rule.levels.includes(course.level) || rule.categories.includes(course.category);
}

/**
 * The catalogue for a chosen starting point: the courses that suit it first,
 * then the others, each group in its existing order. Nothing is hidden, so a
 * starting point no course is designed for yet never ends on an empty page.
 */
export function orderForPathway(courses: readonly PublicCourse[], pathway: Pathway | null): PublicCourse[] {
  if (!pathway) return [...courses];
  return [...courses.filter((course) => suitsPathway(course, pathway)), ...courses.filter((course) => !suitsPathway(course, pathway))];
}
