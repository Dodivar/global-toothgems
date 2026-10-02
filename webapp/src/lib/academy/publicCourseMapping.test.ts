import { describe, expect, it } from "vitest";
import { findCourseByKey, lessonCount, checkCount, resolveCourseAddress, courseAddresses, isDiscounted } from "./publicCourse";
import { coverSrc, mapPublicCourse, mapPublicCourses, type PublicCourseRow } from "./publicCourseMapping";
import { productSlugTranslator } from "../catalog/productSlugs";
import { FIXTURE_COURSES } from "./fixtures";

const published = <T extends object>(locale: string, extra: T) => ({ locale, status: "published", ...extra });

function row(overrides: Partial<PublicCourseRow> = {}): PublicCourseRow {
  return {
    id: "0f6c2a8e-1111-4c1e-9a55-000000000001",
    slug: "pose-professionnelle",
    title: "Pose professionnelle",
    short_description: "Les bases",
    description: null,
    level: "beginner",
    category: "hygiene",
    published_at: "2026-10-01T09:00:00Z",
    duration_minutes: 95,
    objectives: ["Poser", " ", "Retirer"],
    requirements: [],
    min_score: 75,
    issues_certificate: true,
    price: 349,
    currency: "EUR",
    course_translations: [
      published("en", {
        title: "Professional placement",
        slug: "professional-placement",
        short_description: "",
        description: null,
        objectives: ["Place"],
        requirements: [],
      }),
    ],
    cover: {
      id: "0f6c2a8e-2222-4c1e-9a55-000000000002",
      alt_text: "Pose d’une gem",
      updated_at: "2026-10-01T10:00:00.000Z",
      training_media_translations: [published("en", { alt_text: "Placing a gem" })],
    },
    course_modules: [
      {
        id: "m2",
        position: 1,
        title: "Poser",
        description: null,
        course_module_translations: [],
        course_steps: [{ id: "s3", position: 0, title: "Pose", duration_minutes: 20, course_step_translations: [] }],
        course_quizzes: null,
      },
      {
        id: "m1",
        position: 0,
        title: "Préparer",
        description: "Avant la pose",
        course_module_translations: [{ locale: "en", status: "draft", title: "Prepare (draft)", description: null }],
        course_steps: [
          { id: "s2", position: 1, title: "Mordançage", duration_minutes: 8, course_step_translations: [] },
          { id: "s1", position: 0, title: "Hygiène", duration_minutes: 12, course_step_translations: [published("en", { title: "Hygiene" })] },
        ],
        course_quizzes: [{ title: "Contrôle", passing_score: 80, course_quiz_translations: [published("en", { title: "Check" })] }],
      },
    ],
    ...overrides,
  };
}

describe("mapPublicCourse", () => {
  it("keeps the French base and the published English, falling back to French", () => {
    const course = mapPublicCourse(row(), undefined);
    expect(course.id).toBe("pose-professionnelle");
    expect(course.dbId).toBe("0f6c2a8e-1111-4c1e-9a55-000000000001");
    expect(course.slugs).toEqual({ en: "professional-placement" });
    expect(course.title).toEqual({ fr: "Pose professionnelle", en: "Professional placement" });
    // An empty English summary shows the French one.
    expect(course.summary).toEqual({ fr: "Les bases", en: "Les bases" });
    expect(course.description).toBeNull();
    // Blank list items are dropped; missing English items fall back.
    expect(course.objectives).toEqual([
      { fr: "Poser", en: "Place" },
      { fr: "Retirer", en: "Retirer" },
    ]);
  });

  it("orders modules and steps by position and ignores draft translations", () => {
    const course = mapPublicCourse(row(), undefined);
    expect(course.modules.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(course.modules[0].title).toEqual({ fr: "Préparer", en: "Préparer" });
    expect(course.modules[0].steps.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(course.modules[0].steps[0].title.en).toBe("Hygiene");
    expect(course.modules[0].check).toEqual({ title: { fr: "Contrôle", en: "Check" }, passingScore: 80 });
    expect(course.modules[1].check).toBeNull();
    expect(lessonCount(course)).toBe(3);
    expect(checkCount(course)).toBe(1);
  });

  it("reads one-to-one quizzes returned as an object", () => {
    const base = row();
    const modules = base.course_modules!.map((m) =>
      m.id === "m1" ? { ...m, course_quizzes: { title: "Contrôle", passing_score: 70, course_quiz_translations: null } } : m,
    );
    const course = mapPublicCourse({ ...base, course_modules: modules }, undefined);
    expect(course.modules[0].check?.passingScore).toBe(70);
  });

  it("keeps money in minor units, with the current price from the view", () => {
    const course = mapPublicCourse(row({ price: "349.00" }), {
      course_id: "0f6c2a8e-1111-4c1e-9a55-000000000001",
      current_price: "279.20",
      promotion_ends_at: "2026-10-08T00:00:00.000Z",
    });
    expect(course.price).toEqual({ minor: 34900, currency: "EUR" });
    expect(course.currentPrice).toEqual({ minor: 27920, currency: "EUR" });
    expect(course.promotionEndsAt).toBe("2026-10-08T00:00:00.000Z");
    expect(isDiscounted(course)).toBe(true);
  });

  it("falls back to the list price without a current price, never below it", () => {
    const course = mapPublicCourse(row(), undefined);
    expect(course.currentPrice.minor).toBe(34900);
    expect(course.promotionEndsAt).toBeNull();
    expect(isDiscounted(course)).toBe(false);
  });

  it("serves the cover through the public cover route, versioned", () => {
    const course = mapPublicCourse(row(), undefined);
    expect(course.cover?.src).toBe(coverSrc("0f6c2a8e-2222-4c1e-9a55-000000000002", "2026-10-01T10:00:00.000Z"));
    expect(course.cover?.src).toMatch(/^\/media\/formations\/0f6c2a8e-2222-4c1e-9a55-000000000002\?v=\d+$/);
    expect(course.cover?.alt).toEqual({ fr: "Pose d’une gem", en: "Placing a gem" });
    expect(mapPublicCourse(row({ cover: null }), undefined).cover).toBeNull();
  });

  it("is never enrollable before courses are sold", () => {
    expect(mapPublicCourse(row(), undefined).enrolment).toBe("sale");
    expect(mapPublicCourse(row({ level: "expert" }), undefined).level).toBe("all");
  });

  it("keeps the theme and the publication date, defaulting an unknown theme", () => {
    const course = mapPublicCourse(row(), undefined);
    expect(course.category).toBe("hygiene");
    expect(course.publishedAt).toBe("2026-10-01T09:00:00Z");
    expect(mapPublicCourse(row({ category: "astrology" }), undefined).category).toBe("technique");
    expect(mapPublicCourse(row({ category: null, published_at: null }), undefined)).toMatchObject({ category: "technique", publishedAt: null });
  });

  it("matches prices to their course", () => {
    const [course] = mapPublicCourses([row()], [{ course_id: "other", current_price: 1, promotion_ends_at: null }]);
    expect(course.currentPrice.minor).toBe(34900);
  });
});

describe("course addresses", () => {
  const courses = [mapPublicCourse(row(), undefined)];

  it("has a slug per language", () => {
    expect(courseAddresses(courses[0])).toEqual({
      fr: "/fr/academy/formation/pose-professionnelle",
      en: "/en/academy/course/professional-placement",
    });
  });

  it("finds a course by any slug or its row id, and moves other keys", () => {
    expect(findCourseByKey(courses, "professional-placement")?.id).toBe("pose-professionnelle");
    expect(findCourseByKey(courses, "0f6c2a8e-1111-4c1e-9a55-000000000001")?.id).toBe("pose-professionnelle");
    expect(resolveCourseAddress(courses, "pose-professionnelle", "en")).toMatchObject({ kind: "moved", slug: "professional-placement" });
    expect(resolveCourseAddress(courses, "professional-placement", "en").kind).toBe("found");
    expect(resolveCourseAddress(courses, "inconnue", "fr").kind).toBe("unknown");
  });

  it("translates course slugs in addresses, and only on the course page", () => {
    const translate = productSlugTranslator(courses, "course");
    expect(translate("course", { id: "pose-professionnelle" }, "en")).toEqual({ id: "professional-placement" });
    expect(translate("course", { id: "professional-placement" }, "fr")).toEqual({ id: "pose-professionnelle" });
    expect(translate("product", { id: "pose-professionnelle" }, "en")).toEqual({ id: "pose-professionnelle" });
  });
});

describe("fixtures (mock mode)", () => {
  it("are the prototype's three courses, enrolled the prototype's way", () => {
    expect(FIXTURE_COURSES.map((c) => c.id)).toEqual(["fondation", "avance", "business"]);
    expect(FIXTURE_COURSES.every((c) => c.enrolment === "demo" && lessonCount(c) === 9)).toBe(true);
    expect(FIXTURE_COURSES[0].price).toEqual({ minor: 34900, currency: "EUR" });
  });
});
