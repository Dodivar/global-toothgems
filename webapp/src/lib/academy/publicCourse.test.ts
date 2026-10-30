import { describe, expect, it } from "vitest";
import { catalogueFigures, type PublicModule } from "./publicCourse";

const step = (id: string) => ({ id, title: { fr: id, en: id }, minutes: 10 });
const module = (id: string, steps: number, check: boolean): PublicModule => ({
  id,
  title: { fr: id, en: id },
  summary: null,
  steps: Array.from({ length: steps }, (_, i) => step(`${id}-${i}`)),
  check: check ? { title: { fr: "Quiz", en: "Quiz" }, passingScore: 70 } : null,
});

describe("catalogue figures", () => {
  it("adds up lessons, lengths and checks across the published courses", () => {
    const figures = catalogueFigures([
      { modules: [module("a", 3, true), module("b", 2, false)], minutes: 90, issuesCertificate: false },
      { modules: [module("c", 4, true)], minutes: 45, issuesCertificate: true },
    ]);
    expect(figures).toEqual({ courses: 2, lessons: 9, minutes: 135, checks: 2, certificate: true });
  });

  it("states nothing for an empty catalogue", () => {
    expect(catalogueFigures([])).toEqual({ courses: 0, lessons: 0, minutes: 0, checks: 0, certificate: false });
  });

  it("never lets a negative length lower the total", () => {
    expect(catalogueFigures([{ modules: [], minutes: -5, issuesCertificate: false }]).minutes).toBe(0);
  });
});
