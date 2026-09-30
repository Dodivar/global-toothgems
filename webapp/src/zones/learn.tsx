"use client";

import { RequireAccount } from "../lib/auth";
import { CourseOverview } from "../screens/learn/CourseOverview";
import { LessonPlayer } from "../screens/learn/LessonPlayer";
import { CourseCompleted } from "../screens/learn/CourseCompleted";
import { ResumeTraining } from "../screens/learn/ResumeTraining";

/*
 * The learner's own pages (`app/academy/(learner)`), each gated by the
 * account here (navigation; the server layout turned signed-out visitors away
 * already) and by the enrolment inside each page (`lib/learning/access.ts`).
 */

/** `/academy/lecon`: the historical entry point, forwarding to the course that was just opened. */
export function ResumeTrainingScreen() {
  return (
    <RequireAccount>
      <ResumeTraining />
    </RequireAccount>
  );
}

/** `/academy/mes-formations/<course>`: a course's overview. */
export function CourseOverviewScreen() {
  return (
    <RequireAccount>
      <CourseOverview />
    </RequireAccount>
  );
}

/** `/academy/mes-formations/<course>/lecon/<node>`: a lesson (a step, or a module's knowledge check). */
export function LessonPlayerScreen() {
  return (
    <RequireAccount>
      <LessonPlayer />
    </RequireAccount>
  );
}

/** `/academy/mes-formations/<course>/terminee`: the completion screen. */
export function CourseCompletedScreen() {
  return (
    <RequireAccount>
      <CourseCompleted />
    </RequireAccount>
  );
}
