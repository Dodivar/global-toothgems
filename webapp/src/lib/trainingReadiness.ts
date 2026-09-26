import {
  questionCount,
  quizCount,
  stepCount,
  type TrainingCourse,
} from "../data/adminTraining";

/**
 * What the review screen reports before a course is published.
 *
 * The rule the whole module follows: a **blocking** issue means a learner would
 * hit something broken — a module with no content, a quiz with no questions, a
 * question nobody can answer. A **warning** means the course works but is worse
 * than it should be: a missing knowledge check, an image without alternative
 * text. Publishing is refused on the first kind and merely discouraged on the
 * second, because an administrator who cannot publish an imperfect draft will
 * find a way around the check rather than fix it.
 *
 * Messages are returned as translation keys and parameters, never as prose:
 * this module is imported by screens in both languages.
 */

export type IssueSeverity = "blocking" | "warning";

export interface ReadinessIssue {
  id: string;
  severity: IssueSeverity;
  /** Key under `admin.training.review.issues`. */
  messageKey: string;
  params?: Record<string, string | number>;
  /** Where the builder should open to fix it. */
  moduleId?: string;
  stepId?: string;
}

export interface ReadinessCheck {
  id: string;
  ok: boolean;
  /** Key under `admin.training.review.checks`. */
  labelKey: string;
  params?: Record<string, string | number>;
}

export interface Readiness {
  checks: ReadinessCheck[];
  issues: ReadinessIssue[];
  blocking: ReadinessIssue[];
  warnings: ReadinessIssue[];
  /** No blocking issue: publishing is allowed. */
  publishable: boolean;
  /** Share of checks passed, for the progress meter. */
  score: number;
}

const filled = (value: { fr: string; en: string }) => value.fr.trim().length > 0 && value.en.trim().length > 0;

/** Position of a module in the course, 1-based, for readable messages. */
const moduleNumber = (course: TrainingCourse, moduleId: string) =>
  course.modules.findIndex((m) => m.id === moduleId) + 1;

export function analyseCourse(course: TrainingCourse): Readiness {
  const issues: ReadinessIssue[] = [];

  const steps = stepCount(course);
  const quizzes = quizCount(course);
  const questions = questionCount(course);

  /* ----------------------------------------------------------------------- */
  /* Course information                                                       */
  /* ----------------------------------------------------------------------- */

  const infoComplete =
    filled(course.title) &&
    filled(course.shortDescription) &&
    filled(course.fullDescription) &&
    course.objectives.length > 0;

  if (!filled(course.title)) {
    issues.push({ id: "course-title", severity: "blocking", messageKey: "missingTitle" });
  }
  if (!filled(course.shortDescription)) {
    issues.push({ id: "course-short", severity: "blocking", messageKey: "missingShortDescription" });
  }
  if (!filled(course.fullDescription)) {
    issues.push({ id: "course-full", severity: "warning", messageKey: "missingFullDescription" });
  }
  if (course.objectives.length === 0) {
    issues.push({ id: "course-objectives", severity: "warning", messageKey: "missingObjectives" });
  }

  /* ----------------------------------------------------------------------- */
  /* Structure                                                                */
  /* ----------------------------------------------------------------------- */

  if (course.modules.length === 0) {
    issues.push({ id: "course-modules", severity: "blocking", messageKey: "noModules" });
  }

  let answersConfigured = questions > 0;
  let feedbackConfigured = questions > 0;

  for (const module of course.modules) {
    const number = moduleNumber(course, module.id);
    const label = String(number).padStart(2, "0");

    if (module.steps.length === 0) {
      issues.push({
        id: `module-empty-${module.id}`,
        severity: "blocking",
        messageKey: "moduleNoSteps",
        params: { module: label },
        moduleId: module.id,
      });
    }

    if (!module.quiz) {
      issues.push({
        id: `module-noquiz-${module.id}`,
        severity: "warning",
        messageKey: "moduleNoQuiz",
        params: { module: label },
        moduleId: module.id,
      });
    }

    for (const [index, step] of module.steps.entries()) {
      const stepLabel = String(index + 1).padStart(2, "0");

      if (step.blocks.length === 0) {
        issues.push({
          id: `step-empty-${step.id}`,
          severity: "blocking",
          messageKey: "stepNoContent",
          params: { module: label, step: stepLabel },
          moduleId: module.id,
          stepId: step.id,
        });
      }

      for (const block of step.blocks) {
        if (block.type === "image" && !filled(block.alt)) {
          issues.push({
            id: `alt-${block.id}`,
            severity: "warning",
            messageKey: "imageNoAlt",
            params: { module: label, step: stepLabel },
            moduleId: module.id,
            stepId: step.id,
          });
        }
        if (block.type === "video" && (block.duration === "00:00" || block.duration.trim() === "")) {
          issues.push({
            id: `video-${block.id}`,
            severity: "warning",
            messageKey: "videoNoDuration",
            params: { module: label, step: stepLabel },
            moduleId: module.id,
            stepId: step.id,
          });
        }
      }
    }

    if (module.quiz) {
      if (module.quiz.questions.length === 0) {
        issues.push({
          id: `quiz-empty-${module.quiz.id}`,
          severity: "blocking",
          messageKey: "quizNoQuestions",
          params: { module: label },
          moduleId: module.id,
        });
      }

      for (const [index, question] of module.quiz.questions.entries()) {
        const questionLabel = String(index + 1).padStart(2, "0");
        const correct = question.answers.filter((a) => a.correct).length;

        if (question.answers.length < 2) {
          answersConfigured = false;
          issues.push({
            id: `question-answers-${question.id}`,
            severity: "blocking",
            messageKey: "questionTooFewAnswers",
            params: { module: label, question: questionLabel },
            moduleId: module.id,
          });
        }
        if (correct !== 1) {
          answersConfigured = false;
          issues.push({
            id: `question-correct-${question.id}`,
            severity: "blocking",
            messageKey: correct === 0 ? "questionNoCorrect" : "questionManyCorrect",
            params: { module: label, question: questionLabel },
            moduleId: module.id,
          });
        }
        if (!filled(question.correctFeedback) || !filled(question.incorrectFeedback)) {
          feedbackConfigured = false;
          issues.push({
            id: `question-feedback-${question.id}`,
            severity: "warning",
            messageKey: "questionNoFeedback",
            params: { module: label, question: questionLabel },
            moduleId: module.id,
          });
        }
      }
    }
  }

  const checks: ReadinessCheck[] = [
    { id: "info", ok: infoComplete, labelKey: "info" },
    { id: "modules", ok: course.modules.length > 0, labelKey: "modules", params: { count: course.modules.length } },
    { id: "steps", ok: steps > 0, labelKey: "steps", params: { count: steps } },
    { id: "quizzes", ok: quizzes > 0, labelKey: "quizzes", params: { count: quizzes } },
    { id: "questions", ok: questions > 0, labelKey: "questions", params: { count: questions } },
    { id: "answers", ok: answersConfigured, labelKey: "answers" },
    { id: "feedback", ok: feedbackConfigured, labelKey: "feedback" },
  ];

  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");
  const passed = checks.filter((c) => c.ok).length;

  return {
    checks,
    issues,
    blocking,
    warnings,
    publishable: blocking.length === 0,
    score: Math.round((passed / checks.length) * 100),
  };
}
