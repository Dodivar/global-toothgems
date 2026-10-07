import { describe, expect, it } from "vitest";
import {
  clockToSeconds,
  courseSlug,
  courseToPayload,
  notReadyCodes,
  promotionToRow,
  rowToCourse,
  rowToPromotion,
  secondsToClock,
  trainingErrorKind,
  type CoursePromotionRow,
  type CourseRow,
} from "./adminTrainingMapping";

const IMG = "11111111-1111-4111-8111-111111111111";
const VID = "22222222-2222-4222-8222-222222222222";

/** A stored course as PostgREST returns it with ADMIN_COURSE_SELECT (columns the mapping reads). */
const row = {
  id: "c0000000-0000-4000-8000-000000000001",
  slug: "pose-pro",
  title: "Pose pro",
  short_description: "Court",
  description: null,
  cover_media_id: IMG,
  category: "technique",
  level: "beginner",
  duration_minutes: 90,
  objectives: ["Poser", "Retirer"],
  requirements: [],
  complete_all_steps: true,
  complete_all_quizzes: false,
  min_score: 80,
  issues_certificate: true,
  price: 349.9,
  currency: "EUR",
  status: "published",
  published_at: "2026-09-01T10:00:00Z",
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
  course_translations: [{ locale: "en", title: "Pro placement", short_description: null, description: null, objectives: ["Place"], requirements: [] }],
  course_modules: [
    {
      id: "m2",
      position: 1,
      title: "Deuxième",
      description: null,
      cover_media_id: null,
      objectives: [],
      course_module_translations: [],
      course_steps: [],
      course_quizzes: [],
    },
    {
      id: "m1",
      position: 0,
      title: "Premier",
      description: "Intro",
      cover_media_id: IMG,
      objectives: [],
      course_module_translations: [{ locale: "en", title: "First", description: null, objectives: [] }],
      course_steps: [
        {
          id: "s1",
          position: 0,
          title: "Étape",
          summary: null,
          duration_minutes: 5,
          course_step_translations: [],
          course_blocks: [
            { id: "b2", position: 1, kind: "video", media_id: VID, poster_media_id: null, title: "Démo", caption: null, duration_seconds: 95, course_block_translations: [] },
            { id: "b1", position: 0, kind: "text", body_html: "<p>Bonjour</p>", course_block_translations: [{ locale: "en", body_html: "<p>Hello</p>" }] },
          ],
        },
      ],
      course_quizzes: {
        id: "q",
        title: "Quiz",
        intro: null,
        passing_score: 70,
        shuffle_answers: true,
        immediate_feedback: true,
        show_answers: false,
        course_quiz_translations: [],
        quiz_questions: [
          {
            id: "qq",
            position: 0,
            text: "Combien ?",
            image_media_id: null,
            correct_feedback: "Oui",
            incorrect_feedback: "Non",
            learn_more: null,
            quiz_question_translations: [],
            quiz_answers: [
              { id: "a2", position: 1, text: "Deux", is_correct: false, explanation: null, quiz_answer_translations: [] },
              { id: "a1", position: 0, text: "Un", is_correct: true, explanation: "Parce que", quiz_answer_translations: [] },
            ],
          },
        ],
      },
    },
  ],
} as unknown as CourseRow;

describe("rowToCourse", () => {
  const course = rowToCourse(row);

  it("orders every level by position and reads the English rows", () => {
    expect(course.modules.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(course.modules[0].title).toEqual({ fr: "Premier", en: "First" });
    expect(course.modules[0].steps[0].blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(course.modules[0].quiz?.questions[0].answers.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(course.modules[1].quiz).toBeNull();
  });

  it("converts money to minor units, durations to the authored clock", () => {
    expect(course.priceMinor).toBe(34990);
    const video = course.modules[0].steps[0].blocks[1];
    expect(video).toMatchObject({ type: "video", source: VID, poster: "", duration: "01:35" });
  });

  it("pairs list items with their English text", () => {
    expect(course.objectives).toEqual([
      { fr: "Poser", en: "Place" },
      { fr: "Retirer", en: "" },
    ]);
  });
});

describe("courseToPayload", () => {
  const payload = courseToPayload(rowToCourse(row));

  it("sends money as a decimal string and media as ids", () => {
    expect(payload.price).toBe("349.90");
    expect(payload.cover_media_id).toBe(IMG);
    expect(payload.modules[0].steps[0].blocks[1]).toMatchObject({ kind: "video", media_id: VID, poster_media_id: null, duration_seconds: 95 });
  });

  it("keeps the two list arrays aligned when an English item is missing", () => {
    expect(payload.objectives).toEqual(["Poser", "Retirer"]);
    expect(payload.en.objectives).toEqual(["Place", "Retirer"]);
  });

  it("never sends a prototype URL as a media id", () => {
    const course = rowToCourse(row);
    const withUrl = courseToPayload({ ...course, cover: "/images/a.jpg" });
    expect(withUrl.cover_media_id).toBeNull();
  });

  it("round-trips the correct answer and explanations", () => {
    const question = payload.modules[0].quiz?.questions[0];
    expect(question?.answers.map((a) => [a.id, a.is_correct, a.explanation])).toEqual([
      ["a1", true, "Parce que"],
      ["a2", false, ""],
    ]);
  });
});

describe("promotions", () => {
  it("converts amounts and percentages both ways", () => {
    const stored = {
      id: "p",
      course_id: "c",
      label: "Noël",
      discount_type: "amount",
      discount_value: 49.99,
      starts_at: "2026-12-01T00:00:00Z",
      ends_at: null,
      is_active: true,
    } as unknown as CoursePromotionRow;
    const promotion = rowToPromotion(stored);
    expect(promotion.value).toBe(4999);
    expect(promotionToRow(promotion).discount_value).toBe(49.99);
    expect(promotionToRow({ ...promotion, discountType: "percentage", value: 15 }).discount_value).toBe(15);
  });
});

describe("helpers", () => {
  it("reads and writes durations", () => {
    expect(secondsToClock(95)).toBe("01:35");
    expect(clockToSeconds("01:35")).toBe(95);
    expect(clockToSeconds("1:02:03")).toBe(3723);
    expect(clockToSeconds("abc")).toBeNull();
  });

  it("builds slugs the database accepts", () => {
    expect(courseSlug("Pose professionnelle — niveau 2 !")).toBe("pose-professionnelle-niveau-2");
    expect(courseSlug("   ")).toBe("formation");
  });

  it("maps database refusals to message families", () => {
    expect(trainingErrorKind({ code: "42501", message: "permission denied" })).toBe("forbidden");
    expect(trainingErrorKind({ code: "22023", message: "courses: not ready (no_modules,empty_quiz)" })).toBe("notReady");
    expect(trainingErrorKind({ code: "22023", message: "course_promotions: overlap" })).toBe("overlap");
    expect(trainingErrorKind({ code: "23514", message: "check" })).toBe("invalid");
    expect(trainingErrorKind({ message: "Failed to fetch" })).toBe("network");
    expect(notReadyCodes("courses: not ready (no_modules,empty_quiz)")).toEqual(["no_modules", "empty_quiz"]);
  });
});
