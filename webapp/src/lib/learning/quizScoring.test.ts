import { describe, expect, it } from "vitest";
import type { Quiz } from "../../data/adminTraining";
import { TRAINING_COURSES } from "../../data/adminTrainingSeed";
import { scoreQuiz } from "./path";

/*
 * The pass mark, at its boundaries. The server applies the same rule when a
 * learner submits (submit_quiz_answers(): supabase/tests/iteration22, Q0–Q2);
 * this is the local grader of the preview and of mock mode.
 */

const model = TRAINING_COURSES.flatMap((c) => c.modules).find((m) => m.quiz)!.quiz!;

/** A check of `count` copies of one question, with its own pass mark. */
function quizOf(count: number, passingScore: number): Quiz {
  const [question] = model.questions;
  return {
    ...model,
    settings: { ...model.settings, passingScore },
    questions: Array.from({ length: count }, (_, i) => ({ ...question, id: `q${i}` })),
  };
}

/** The first `right` questions answered correctly, the others wrongly. */
function answers(quiz: Quiz, right: number): Record<string, string> {
  return Object.fromEntries(
    quiz.questions.map((q, i) => [q.id, q.answers.find((a) => a.correct === i < right)!.id]),
  );
}

describe("scoreQuiz pass mark", () => {
  it.each([
    // questions, right, mark → score, passed
    [5, 3, 80, 60, false], // below
    [5, 4, 80, 80, true], // exactly at the mark: inclusive
    [5, 5, 80, 100, true], // above
    [4, 3, 76, 75, false], // one point under
    [4, 3, 75, 75, true],
    [3, 2, 67, 67, true], // 66.67 rounds to 67
    [3, 2, 68, 67, false],
    [1, 0, 0, 0, true], // a mark of 0 is passed by any attempt
    [2, 1, 100, 50, false],
  ])("%i questions, %i right, mark %i %% → %i %%, passed %s", (count, right, mark, score, passed) => {
    const quiz = quizOf(count, mark);
    expect(scoreQuiz(quiz, answers(quiz, right))).toEqual({ correct: right, total: count, score, passed });
  });

  it("never passes a check without questions, whatever its mark", () => {
    expect(scoreQuiz(quizOf(0, 0), {})).toEqual({ correct: 0, total: 0, score: 0, passed: false });
  });

  it("counts an unanswered question, or an unknown answer id, as wrong", () => {
    const quiz = quizOf(2, 50);
    const right = answers(quiz, 2);
    expect(scoreQuiz(quiz, { q0: right.q0 })).toMatchObject({ correct: 1, score: 50, passed: true });
    expect(scoreQuiz(quiz, { q0: "forged", q1: "forged" })).toMatchObject({ correct: 0, passed: false });
  });
});
