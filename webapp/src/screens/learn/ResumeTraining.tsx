import { Navigate } from "react-router-dom";
import { learnHref } from "../../lib/academyUrl";
import { useProgress } from "../../lib/progress";

/**
 * `/academy/lecon`: the address every "open this course" action has always
 * used (the Academy, the sales page, sign-in and sign-up). It forwards to the
 * overview of the course that was just opened, so none of those callers has to
 * know the learner's routes.
 */
export function ResumeTraining() {
  const { activeCourseId } = useProgress();
  return <Navigate to={learnHref(activeCourseId)} replace />;
}
