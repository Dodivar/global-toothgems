import { describe, expect, it } from "vitest";
import { inclusionError, inclusionsPayload, rowsToInclusions, sameInclusions } from "./productInclusions";
import type { AdminInclusion } from "../data/adminCatalog";

const t = (key: string) => key;
const course: AdminInclusion = { kind: "course", courseId: "c1" };
const studio: AdminInclusion = { kind: "studio", plan: "artist", months: 3 };

describe("product inclusions (decision 139)", () => {
  it("reads the rows by product, in order, skipping unknown shapes", () => {
    const map = rowsToInclusions([
      { product_id: "p", kind: "studio", course_id: null, studio_plan: "artist", studio_months: 3, position: 1 },
      { product_id: "p", kind: "course", course_id: "c1", studio_plan: null, studio_months: null, position: 0 },
      { product_id: "q", kind: "studio", course_id: null, studio_plan: "gold", studio_months: 3, position: 0 },
    ]);
    expect(map.get("p")).toEqual([course, studio]);
    expect(map.has("q")).toBe(false);
  });

  it("compares lists, none and empty being the same", () => {
    expect(sameInclusions(undefined, [])).toBe(true);
    expect(sameInclusions([course, studio], [course, studio])).toBe(true);
    expect(sameInclusions([course, studio], [studio, course])).toBe(false);
    expect(sameInclusions([studio], [{ ...studio, months: 6 }])).toBe(false);
  });

  it("writes the database's argument", () => {
    expect(inclusionsPayload([course, studio])).toEqual([
      { kind: "course", course_id: "c1" },
      { kind: "studio", studio_plan: "artist", studio_months: 3 },
    ]);
    expect(inclusionsPayload(undefined)).toEqual([]);
  });

  it("refuses what the database would refuse", () => {
    expect(inclusionError({ inclusions: [course, studio] }, t)).toBeNull();
    expect(inclusionError({ inclusions: undefined }, t)).toBeNull();
    expect(inclusionError({ inclusions: [{ kind: "course", courseId: "" }] }, t)).toBe("admin.inclusions.errorCourse");
    expect(inclusionError({ inclusions: [course, course] }, t)).toBe("admin.inclusions.errorTwice");
    expect(inclusionError({ inclusions: [studio, studio] }, t)).toBe("admin.inclusions.errorTwice");
    expect(inclusionError({ inclusions: [{ ...studio, months: 0 }] }, t)).toBe("admin.inclusions.errorMonths");
    expect(inclusionError({ inclusions: [{ ...studio, months: 25 }] }, t)).toBe("admin.inclusions.errorMonths");
  });
});
