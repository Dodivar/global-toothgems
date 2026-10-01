import type { Localized } from "../../data/types";
import type { Question, Quiz } from "../../data/adminTraining";
import { scoreQuiz, type QuizScore } from "./path";

/**
 * Who corrects a knowledge check, and what a correction says.
 *
 * A learner's browser never holds the answer keys: in production the content
 * arrives without them (`learner_courses()`), and every correction comes back
 * from the server once an answer is submitted (`answer_quiz_question()` for
 * immediate feedback, `submit_quiz_answers()` for the whole check — see
 * `lib/learning/learnerBackend.ts`). The administrator's preview and the
 * prototype (mock mode) hold the full course, so they grade locally with the
 * same deterministic rule (`scoreQuiz`): `localGrader` below.
 */

export interface Correction {
  questionId: string;
  /** The answer that was recorded (the first one, with immediate feedback). */
  answerId: string | null;
  correct: boolean;
  /** Named only when the check reveals answers, or when the learner found it. */
  correctAnswerId: string | null;
  /** The question's feedback for a right or a wrong answer. */
  feedback: Localized;
  /** The chosen answer's own explanation, when it has one. */
  explanation?: Localized;
  learnMore?: Localized;
}

export interface GradedAttempt {
  score: QuizScore;
  corrections: Record<string, Correction>;
}

export interface QuizGrader {
  /** Immediate feedback: records one answer and returns its correction. */
  check: (questionId: string, answerId: string) => Promise<Correction>;
  /** Scores the whole attempt; `chosen` maps question id → answer id. */
  submit: (chosen: Record<string, string>) => Promise<GradedAttempt>;
}

const filled = (value: Localized | undefined): Localized | undefined => (value && (value.fr || value.en) ? value : undefined);

/** The correction of one answer, from a quiz that carries its answer keys. */
export function localCorrection(quiz: Quiz, question: Question, answerId: string | null): Correction {
  const answer = question.answers.find((a) => a.id === answerId);
  const right = question.answers.find((a) => a.correct);
  const correct = Boolean(answer?.correct);
  return {
    questionId: question.id,
    answerId: answer ? answer.id : null,
    correct,
    correctAnswerId: right && (quiz.settings.showAnswers || correct) ? right.id : null,
    feedback: correct ? question.correctFeedback : question.incorrectFeedback,
    explanation: filled(answer?.explanation),
    learnMore: filled(question.learnMore),
  };
}

/**
 * Grades in the browser, for a quiz whose answer keys are present (preview,
 * prototype). With immediate feedback the first answer to a question stands,
 * as on the server. `onScored` records the attempt where there is a record.
 */
export function localGrader(quiz: Quiz, onScored?: (score: QuizScore) => void): QuizGrader {
  let locked: Record<string, string> = {};
  return {
    check: async (questionId, answerId) => {
      const question = quiz.questions.find((q) => q.id === questionId);
      if (!question) throw new Error("unknown question");
      locked[questionId] ??= answerId;
      return localCorrection(quiz, question, locked[questionId]);
    },
    submit: async (chosen) => {
      const final = { ...chosen, ...locked };
      locked = {};
      const score = scoreQuiz(quiz, final);
      const corrections: Record<string, Correction> = {};
      for (const question of quiz.questions) {
        corrections[question.id] = localCorrection(quiz, question, final[question.id] ?? null);
      }
      onScored?.(score);
      return { score, corrections };
    },
  };
}
