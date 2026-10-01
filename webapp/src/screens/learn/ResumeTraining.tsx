"use client";

import { Navigate } from "../../lib/navigation";
import { learnHref } from "../../lib/academyUrl";
import { useProgress } from "../../lib/progress";

/**
 * `/academy/lecon`: the address every "open this course" action has always
 * used (the Academy, the sales page, sign-in and sign-up). It forwards to the
 * overview of the course that was just opened (else the last one held), or to
 * the member area when the account holds none, so none of those callers has
 * to know the learner's routes.
 */
export function ResumeTraining() {
  const { activeCourseId, status } = useProgress();
  // Wait for the held courses before deciding where to go.
  if (status === "loading" || status === "idle") return null;
  return <Navigate to={activeCourseId ? learnHref(activeCourseId) : "/compte"} replace />;
}
