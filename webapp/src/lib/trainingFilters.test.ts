import { describe, expect, it } from "vitest";
import type { TrainingCourse } from "../data/adminTraining";
import { groupCoursesByStatus } from "./trainingFilters";

const course = (id: string, status: TrainingCourse["status"], updatedAt: string) =>
  ({ id, status, updatedAt }) as TrainingCourse;

describe("groupCoursesByStatus", () => {
  it("lists published, then drafts, then withdrawn, most recent first, without empty sections", () => {
    const groups = groupCoursesByStatus([
      course("d1", "draft", "2026-10-01T10:00:00Z"),
      course("p1", "published", "2026-09-01T10:00:00Z"),
      course("d2", "draft", "2026-10-05T10:00:00Z"),
      course("p2", "published", "2026-10-02T10:00:00Z"),
    ]);
    expect(groups.map((g) => g.status)).toEqual(["published", "draft"]);
    expect(groups[0].courses.map((c) => c.id)).toEqual(["p2", "p1"]);
    expect(groups[1].courses.map((c) => c.id)).toEqual(["d2", "d1"]);
  });

  it("does not reorder the caller's array", () => {
    const list = [course("a", "draft", "2026-01-01T00:00:00Z"), course("b", "draft", "2026-02-01T00:00:00Z")];
    groupCoursesByStatus(list);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
