"use client";

import { learnHref } from "../../lib/academyUrl";
import { useProgress } from "../../lib/progress";

/**
 * Where the member menu's "My course" leads (owner, 2026-11-17): the course
 * the member opened last, else the first one they hold; null while the courses
 * are not known and for a member who holds none (the entry is then left out).
 * Withdrawn courses do not count. Several courses: the dashboard lists them all.
 */
export function useCourseEntry(): string | null {
  const { status, enrolledCourses, activeCourseId } = useProgress();
  if (status !== "ready") return null;
  const held = enrolledCourses().filter((course) => course.status !== "unpublished");
  if (held.length === 0) return null;
  const course = held.find((c) => c.id === activeCourseId) ?? held[0];
  return learnHref(course.id);
}
