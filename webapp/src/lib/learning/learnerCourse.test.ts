import { describe, expect, it } from "vitest";
import { TRAINING_COURSES } from "../../data/adminTrainingSeed";
import { accessErrorKind, isActiveHolder, isEmailLike, type CourseHolder } from "../adminCourseAccess";
import { localGrader } from "./grading";
import { toCorrection, toGradedAttempt, toHeldCourse, toRecord, withProgress, type LearnerCourseJson, type ProgressJson } from "./learnerCourse";
import { buildPath, quizKey } from "./path";

const M1 = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222221";
const S2 = "22222222-2222-4222-8222-222222222222";
const Q1 = "33333333-3333-4333-8333-333333333331";
const A1 = "44444444-4444-4444-8444-444444444441";
const A2 = "44444444-4444-4444-8444-444444444442";
const IMG = "55555555-5555-4555-8555-555555555555";

const EMPTY_PROGRESS: ProgressJson = { steps: [], attempts: [], completion: null };

function courseJson(overrides: Partial<LearnerCourseJson> = {}): LearnerCourseJson {
  return {
    id: "c0000000-0000-4000-8000-000000000001",
    slug: "pose-essentielle",
    status: "published",
    title: "Pose essentielle",
    short_description: "Court",
    cover_media_id: IMG,
    category: "technique",
    level: "beginner",
    duration_minutes: 90,
    objectives: ["Poser"],
    complete_all_steps: true,
    complete_all_quizzes: true,
    min_score: 70,
    issues_certificate: true,
    en: { title: "Essential placement", slug: "essential-placement", short_description: null, objectives: [] },
    media: { [IMG]: { path: `media/${IMG}/a.jpg`, kind: "image", mime_type: "image/jpeg", alt_text: null, alt_text_en: null, width: 1, height: 1 } },
    modules: [
      {
        id: M1,
        title: "Préparer",
        description: null,
        cover_media_id: null,
        objectives: [],
        en: null,
        steps: [
          {
            id: S1,
            title: "Hygiène",
            summary: null,
            duration_minutes: 10,
            en: { title: "Hygiene", summary: null },
            blocks: [
              {
                id: "b1",
                kind: "image",
                body_html: null,
                media_id: IMG,
                poster_media_id: null,
                alt_text: "Poste",
                caption: null,
                align: null,
                title: null,
                duration_seconds: null,
                en: null,
              },
            ],
          },
          { id: S2, title: "Matériel", summary: null, duration_minutes: 5, en: null, blocks: [] },
        ],
        quiz: {
          id: "q-row",
          title: "Contrôle",
          intro: null,
          passing_score: 80,
          shuffle_answers: false,
          immediate_feedback: false,
          show_answers: true,
          en: null,
          questions: [
            {
              id: Q1,
              text: "Combien ?",
              image_media_id: null,
              en: { text: "How many?" },
              answers: [
                { id: A1, text: "Un", en: { text: "One" } },
                { id: A2, text: "Deux", en: null },
              ],
            },
          ],
        },
      },
    ],
    entitlement: { source: "manual_grant", starts_at: "2026-10-01T09:00:00Z", expires_at: null },
    progress: EMPTY_PROGRESS,
    ...overrides,
  };
}

describe("toHeldCourse", () => {
  it("keys the course by its French slug and maps the tree without answer keys", () => {
    const held = toHeldCourse(courseJson());
    expect(held.card).toMatchObject({ id: "pose-essentielle", status: "published", level: "beginner", minutes: 90, cover: IMG });
    expect(held.card.title).toEqual({ fr: "Pose essentielle", en: "Essential placement" });
    const quiz = held.training!.modules[0].quiz!;
    expect(quiz.questions[0].answers.every((a) => a.correct === false)).toBe(true);
    expect(quiz.questions[0].answers[1].text).toEqual({ fr: "Deux", en: "Deux" });
    expect(quiz.questions[0].correctFeedback).toEqual({ fr: "", en: "" });
    expect(held.training!.modules[0].steps[0].blocks[0]).toMatchObject({ type: "image", src: IMG, alt: { fr: "Poste", en: "Poste" } });
    expect(held.record.startedOn).toBe("2026-10-01");
  });

  it("serves no content for a withdrawn course", () => {
    const held = toHeldCourse(courseJson({ status: "unpublished", modules: null }));
    expect(held.card.status).toBe("unpublished");
    expect(held.training).toBeNull();
  });
});

describe("toRecord", () => {
  const training = toHeldCourse(courseJson()).training!;
  const progress: ProgressJson = {
    steps: [
      { step_id: S1, completed_at: "2026-10-01T10:00:00Z" },
      { step_id: "gone-step", completed_at: "2026-10-01T10:30:00Z" },
    ],
    attempts: [
      { id: "a", module_id: M1, status: "submitted", score: 50, passed: false, passing_score: 80, answers: {}, started_at: "2026-10-01T11:00:00Z", submitted_at: "2026-10-01T11:01:00Z" },
      { id: "b", module_id: M1, status: "submitted", score: 100, passed: true, passing_score: 80, answers: {}, started_at: "2026-10-01T12:00:00Z", submitted_at: "2026-10-01T12:01:00Z" },
      { id: "c", module_id: M1, status: "open", score: null, passed: false, passing_score: 80, answers: {}, started_at: "2026-10-01T13:00:00Z", submitted_at: null },
    ],
    completion: { completed_at: "2026-10-02T08:00:00Z", average_score: 100, min_score: 70, certificate_code: "GTC-AAAA-BBBB-CCCC" },
  };

  it("counts submitted attempts per module and keeps the best score and the pass", () => {
    const record = toRecord(progress, training, "2026-10-01T09:00:00Z");
    expect(record.quizResults[quizKey(M1)]).toEqual({ attempts: 2, bestScore: 100, passed: true });
    expect(record.completedSteps).toContain(S1);
    expect(record.completedOn).toBe("2026-10-02");
  });

  it("lists recent completions newest first, ignoring nodes the course no longer has", () => {
    const record = toRecord(progress, training, "2026-10-01T09:00:00Z");
    expect(record.history.map((e) => e.key)).toEqual([quizKey(M1), S1]);
    const keys = buildPath(training).map((n) => n.key);
    expect(record.history.every((e) => keys.includes(e.key))).toBe(true);
  });

  it("applies fresh progress without losing the lesson being read", () => {
    const held = toHeldCourse(courseJson());
    const reading = { ...held, record: { ...held.record, lastKey: S2 } };
    const next = withProgress(reading, progress);
    expect(next.record.lastKey).toBe(S2);
    expect(next.certificateCode).toBe("GTC-AAAA-BBBB-CCCC");
  });
});

describe("corrections", () => {
  it("maps a server correction with the English fallback", () => {
    const correction = toCorrection({
      question_id: Q1,
      answer_id: A2,
      correct: false,
      correct_answer_id: null,
      explanation: "Non",
      explanation_en: null,
      feedback: null,
      feedback_en: null,
      learn_more: null,
      learn_more_en: null,
    });
    expect(correction).toMatchObject({ correct: false, correctAnswerId: null, explanation: { fr: "Non", en: "Non" } });
    expect(correction.learnMore).toBeUndefined();
  });

  it("maps a scored submission", () => {
    const graded = toGradedAttempt({
      score: 50,
      correct: 1,
      total: 2,
      passing_score: 80,
      passed: false,
      corrections: [],
      progress: EMPTY_PROGRESS,
    });
    expect(graded.score).toEqual({ correct: 1, total: 2, score: 50, passed: false });
  });
});

describe("localGrader", () => {
  const quiz = TRAINING_COURSES.flatMap((c) => c.modules).find((m) => m.quiz && m.quiz.questions.length >= 2)!.quiz!;
  const [first] = quiz.questions;
  const right = first.answers.find((a) => a.correct)!;
  const wrong = first.answers.find((a) => !a.correct)!;

  it("keeps the first answer to a question, as the server does", async () => {
    const grader = localGrader({ ...quiz, settings: { ...quiz.settings, showAnswers: false } });
    const firstTry = await grader.check(first.id, wrong.id);
    expect(firstTry.correct).toBe(false);
    expect(firstTry.correctAnswerId).toBeNull();
    const again = await grader.check(first.id, right.id);
    expect(again.answerId).toBe(wrong.id);
  });

  it("names the right answer only when the check reveals answers", async () => {
    const grader = localGrader({ ...quiz, settings: { ...quiz.settings, showAnswers: true } });
    const graded = await grader.submit({ [first.id]: wrong.id });
    expect(graded.corrections[first.id].correctAnswerId).toBe(right.id);
    expect(graded.score.correct).toBe(0);
  });
});

describe("course access helpers", () => {
  it("reads the database's refusals", () => {
    expect(accessErrorKind({ message: "admin_grant_course: member_not_found" })).toBe("memberNotFound");
    expect(accessErrorKind({ message: "admin_grant_course: already_held" })).toBe("alreadyHeld");
    expect(accessErrorKind({ code: "42501", message: "admin_grant_course: permission denied" })).toBe("forbidden");
    expect(accessErrorKind({ message: "fetch failed" })).toBe("network");
  });

  it("checks e-mails and active holders", () => {
    expect(isEmailLike(" ana@example.com ")).toBe(true);
    expect(isEmailLike("ana@")).toBe(false);
    const holder = { revokedAt: null, expiresAt: "2026-10-10T00:00:00Z" } as CourseHolder;
    expect(isActiveHolder(holder, new Date("2026-10-05T00:00:00Z"))).toBe(true);
    expect(isActiveHolder(holder, new Date("2026-10-11T00:00:00Z"))).toBe(false);
    expect(isActiveHolder({ ...holder, revokedAt: "2026-10-02T00:00:00Z" }, new Date("2026-10-05T00:00:00Z"))).toBe(false);
  });
});
