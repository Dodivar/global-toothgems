import { learnHref } from "../academyUrl";
import { MEMBER_SPACE_PATH } from "../memberSpace";
import type { CartLine } from "./cartLines";

/**
 * Where the confirmation page's main button leads once a basket that opened
 * a course is paid: the course itself when the basket held exactly one course
 * line (the usual case — one course per member), else the member space, whose
 * dashboard lists every course held and resumes the last one (several courses,
 * or a pack whose course is only known to the database). Null when nothing in
 * the basket opened a course: the page then offers the orders.
 */
export function courseAfterPayment(lines: CartLine[]): string | null {
  const courseIds = [...new Set(lines.flatMap((line) => (line.courseId ? [line.courseId] : [])))];
  const opensPackCourse = lines.some((line) => line.pack?.course);
  if (courseIds.length === 1 && !opensPackCourse) return learnHref(courseIds[0]);
  if (courseIds.length > 0 || opensPackCourse) return MEMBER_SPACE_PATH;
  return null;
}
