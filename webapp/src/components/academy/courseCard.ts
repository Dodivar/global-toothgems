import type { TFunction } from "i18next";
import { pick } from "../../data/types";
import { toMajorUnits } from "../../lib/catalog/money";
import { formatDuration } from "../../lib/trainingFilters";
import { isDiscounted, lessonCount, type PublicCourse } from "../../lib/academy/publicCourse";
import type { CourseCardData } from "../ui/CourseCard";

/** What a catalogue card shows of a published course: its level, size, length, cover and price now. */
export function courseCardData(course: PublicCourse, lang: string, t: TFunction): CourseCardData {
  return {
    id: course.id,
    title: pick(course.title, lang),
    level: t(`academy.levels.${course.level}`),
    lessonCount: lessonCount(course),
    duration: formatDuration(course.minutes, lang),
    price: toMajorUnits(course.currentPrice.minor),
    currency: course.currentPrice.currency,
    compareAt: isDiscounted(course) ? toMajorUnits(course.price.minor) : undefined,
    image: course.cover?.src,
  };
}
