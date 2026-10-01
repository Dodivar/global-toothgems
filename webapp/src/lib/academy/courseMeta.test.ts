import { describe, expect, it } from "vitest";
import { courseDescription, courseJsonLd, courseTitle, isoDuration } from "./courseMeta";
import type { PublicCourse } from "./publicCourse";

const course: PublicCourse = {
  id: "pose-professionnelle",
  dbId: "0f6c2a8e-1111-4c1e-9a55-000000000001",
  slugs: { en: "professional-placement" },
  title: { fr: "Pose professionnelle", en: "Professional placement" },
  summary: { fr: "Les bases   de la pose.", en: "Placement basics." },
  description: null,
  level: "beginner",
  minutes: 95,
  objectives: [],
  requirements: [],
  minScore: 75,
  issuesCertificate: true,
  price: { minor: 34900, currency: "EUR" },
  currentPrice: { minor: 34900, currency: "EUR" },
  promotionEndsAt: null,
  cover: { src: "/media/formations/abc?v=1", alt: null },
  modules: [],
  enrolment: "soon",
};

describe("course head", () => {
  it("titles the page with the course", () => {
    expect(courseTitle(course, "en")).toBe("Professional placement · Global Toothgems");
  });

  it("describes it with its summary, else its title and level", () => {
    expect(courseDescription(course, "fr")).toBe("Les bases de la pose.");
    expect(courseDescription({ ...course, summary: null }, "fr")).toBe("Pose professionnelle — Débutant.");
  });

  it("writes ISO 8601 durations", () => {
    expect(isoDuration(95)).toBe("PT1H35M");
    expect(isoDuration(60)).toBe("PT1H");
    expect(isoDuration(45)).toBe("PT45M");
    expect(isoDuration(0)).toBeUndefined();
  });

  it("gives schema.org Course data with absolute URLs and no offer before courses are sold", () => {
    const data = courseJsonLd(course, "en", new URL("https://example.test"));
    expect(data).toMatchObject({
      "@type": "Course",
      name: "Professional placement",
      url: "https://example.test/en/academy/course/professional-placement",
      image: ["https://example.test/media/formations/abc?v=1"],
      timeRequired: "PT1H35M",
      educationalLevel: "Beginner",
      provider: { "@type": "Organization", name: "Global Toothgems" },
    });
    expect(data).not.toHaveProperty("offers");
  });
});
