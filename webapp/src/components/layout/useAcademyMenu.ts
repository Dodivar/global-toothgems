import { useTranslation } from "react-i18next";
import { ACADEMY_MEMBER_ITEM, DEFAULT_MENU_THUMB } from "../../data/menu";
import { pick } from "../../data/types";
import { useAcademy } from "../../lib/academy/AcademyProvider";
import { courseSlug, lessonCount } from "../../lib/academy/publicCourse";
import { courseHref } from "../../lib/academyUrl";
import { formatDuration } from "../../lib/trainingFilters";

export interface AcademyMenuEntry {
  key: string;
  title: string;
  sub: string;
  thumb: string;
  to: string;
}

/** How many courses the header's Academy panel lists before "see all". */
const MENU_COURSES = 3;

/** The header's Academy entries: the first published courses, then the member area. */
export function useAcademyMenu(): AcademyMenuEntry[] {
  const { t, i18n } = useTranslation();
  const { courses } = useAcademy();
  const lang = i18n.language;
  const locale = lang.startsWith("en") ? "en" : "fr";
  return [
    ...courses.slice(0, MENU_COURSES).map((course) => ({
      key: course.id,
      title: pick(course.title, lang),
      sub: [t("course.lessonCount", { count: lessonCount(course) }), course.minutes > 0 ? formatDuration(course.minutes, lang) : null]
        .filter(Boolean)
        .join(" · "),
      thumb: course.cover?.src ?? DEFAULT_MENU_THUMB,
      to: courseHref(courseSlug(course, locale)),
    })),
    {
      key: "member",
      title: pick(ACADEMY_MEMBER_ITEM.title, lang),
      sub: pick(ACADEMY_MEMBER_ITEM.sub, lang),
      thumb: ACADEMY_MEMBER_ITEM.thumb,
      to: ACADEMY_MEMBER_ITEM.to,
    },
  ];
}
