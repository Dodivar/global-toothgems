import {
  stepCount,
  type CourseCategory,
  type CourseLevel,
  type CourseStatus,
  type TrainingCourse,
} from "../data/adminTraining";
import { pick } from "../data/types";

/**
 * Search, filtering and sorting of the training catalogue.
 *
 * Pure functions on plain state, kept out of the components for the same reason
 * `productFilters` is: the list renders what it is handed, and this is the part
 * a server-side query would eventually replace without any screen noticing.
 */

export type TrainingSortKey =
  | "recent"
  | "oldest"
  | "title-asc"
  | "modules-desc"
  | "completion-desc"
  | "enrolled-desc";

export const TRAINING_SORT_KEYS: TrainingSortKey[] = [
  "recent",
  "oldest",
  "title-asc",
  "modules-desc",
  "completion-desc",
  "enrolled-desc",
];

export interface TrainingFilterState {
  search: string;
  status: CourseStatus | "all";
  category: CourseCategory | "all";
  level: CourseLevel | "all";
  sort: TrainingSortKey;
}

export const DEFAULT_TRAINING_FILTERS: TrainingFilterState = {
  search: "",
  status: "all",
  category: "all",
  level: "all",
  sort: "recent",
};

/** True as soon as anything narrows the list, which is what enables "Clear". */
export function isTrainingFiltered(filters: TrainingFilterState): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.status !== "all" ||
    filters.category !== "all" ||
    filters.level !== "all"
  );
}

/** Ignores case and accents, so "hygiene" finds "Hygiène". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Matches against both languages of the title and descriptions, and against the
 * module titles. Searching for a module name is how an administrator looks for
 * "the course with the sterilisation module" without remembering its title.
 */
function matchesSearch(course: TrainingCourse, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = [
    course.title.fr,
    course.title.en,
    course.shortDescription.fr,
    course.shortDescription.en,
    ...course.modules.flatMap((m) => [m.title.fr, m.title.en]),
  ]
    .map(normalize)
    .join(" ");
  return haystack.includes(needle);
}

export function filterCourses(
  courses: TrainingCourse[],
  filters: TrainingFilterState,
  lang: string,
): TrainingCourse[] {
  const result = courses.filter((course) => {
    if (!matchesSearch(course, filters.search)) return false;
    if (filters.status !== "all" && course.status !== filters.status) return false;
    if (filters.category !== "all" && course.category !== filters.category) return false;
    if (filters.level !== "all" && course.level !== filters.level) return false;
    return true;
  });

  const collator = new Intl.Collator(lang.startsWith("en") ? "en" : "fr", { sensitivity: "base" });

  // A copy: `filter` already returned one, but sorting the caller's array would
  // reorder the store's state in place.
  return [...result].sort((a, b) => {
    switch (filters.sort) {
      case "oldest":
        return a.updatedAt.localeCompare(b.updatedAt);
      case "title-asc":
        return collator.compare(pick(a.title, lang), pick(b.title, lang));
      case "modules-desc":
        return b.modules.length - a.modules.length || stepCount(b) - stepCount(a);
      case "completion-desc":
        return b.completionRate - a.completionRate;
      case "enrolled-desc":
        return b.enrolled - a.enrolled;
      case "recent":
      default:
        return b.updatedAt.localeCompare(a.updatedAt);
    }
  });
}

/** Minutes to a compact "1 h 32" / "1h32" reading. */
export function formatDuration(minutes: number, lang: string): string {
  if (minutes <= 0) return lang.startsWith("en") ? "—" : "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return lang.startsWith("en") ? `${rest} min` : `${rest} min`;
  if (rest === 0) return lang.startsWith("en") ? `${hours}h` : `${hours} h`;
  return lang.startsWith("en") ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours} h ${String(rest).padStart(2, "0")}`;
}
