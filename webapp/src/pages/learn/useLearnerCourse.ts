import { useMemo } from "react";
import { getCourse } from "../../data/courses";
import { useProgress } from "../../lib/progress";
import { learnerAccess, type LearnerAccess } from "../../lib/learning/access";
import { summarize } from "../../lib/learning/path";

/**
 * Everything a learner page needs about one course on the account: the
 * product, the authored course it opens, the learner's record and the summary
 * derived from both — plus the access decision (`lib/learning/access.ts`).
 */
export function useLearnerCourse(courseId: string) {
  const { enrollments, trainingFor, progressFor } = useProgress();
  const product = getCourse(courseId);
  const training = trainingFor(courseId);
  const record = enrollments[courseId];
  const access: LearnerAccess | null = product ? learnerAccess(training, Boolean(record)) : null;
  const summary = useMemo(() => (training && record ? summarize(training, record) : null), [training, record]);
  return { product, training, record, access, summary, progress: progressFor(courseId) };
}
