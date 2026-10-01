import { useMemo } from "react";
import { useProgress } from "../../lib/progress";
import { learnerAccess, type LearnerAccess } from "../../lib/learning/access";
import { summarize } from "../../lib/learning/path";

/**
 * Everything a learner page needs about one course on the account: the course
 * as the member area lists it, its content, the learner's record and the
 * summary derived from both — plus the access decision (`lib/learning/access.ts`).
 */
export function useLearnerCourse(courseId: string) {
  const { status, enrollments, trainingFor, courseFor, progressFor } = useProgress();
  const card = courseFor(courseId);
  const training = trainingFor(courseId);
  const record = enrollments[courseId];
  const access: LearnerAccess = learnerAccess(status, card, training, Boolean(record));
  const summary = useMemo(() => (training && record ? summarize(training, record) : null), [training, record]);
  return { card, training, record, access, summary, progress: progressFor(courseId) };
}
