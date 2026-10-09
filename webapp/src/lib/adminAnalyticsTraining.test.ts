import { describe, expect, it } from "vitest";
import { buildTraining, type TrainingSources } from "./adminAnalyticsTraining";

const current = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-10-11T00:00:00Z") };
const previous = { start: new Date("2026-09-21T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z") };

const course = (id: string, level = "beginner") => ({ id, title: { fr: id, en: id }, level });

const sources = (patch: Partial<TrainingSources> = {}): TrainingSources => ({
  entitlements: [
    // In the period: two on A (one completed since), one on B; one revoked.
    { user_id: "u1", course_id: "A", starts_at: "2026-10-02T10:00:00Z", revoked_at: null },
    { user_id: "u2", course_id: "A", starts_at: "2026-10-03T10:00:00Z", revoked_at: null },
    { user_id: "u3", course_id: "B", starts_at: "2026-10-04T10:00:00Z", revoked_at: null },
    { user_id: "u4", course_id: "B", starts_at: "2026-10-05T10:00:00Z", revoked_at: "2026-10-06T10:00:00Z" },
    // Before: one on A, completed in the period.
    { user_id: "u5", course_id: "A", starts_at: "2026-09-22T00:00:00Z", revoked_at: null },
  ],
  completions: [
    { user_id: "u1", course_id: "A", completed_at: "2026-10-12T00:00:00Z", average_score: 90 },
    { user_id: "u5", course_id: "A", completed_at: "2026-10-02T00:00:00Z", average_score: 70 },
  ],
  activity: [{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }],
  courseLines: [
    { course_id: "A", subtotal_amount: "149.00", discount_amount: "10.00", orders: { paid_at: "2026-10-02T09:00:00Z" } },
    { course_id: "B", subtotal_amount: 99.9, discount_amount: 0, orders: { paid_at: "2026-10-04T09:00:00Z" } },
    // Paid outside the period: not counted.
    { course_id: "B", subtotal_amount: 99.9, discount_amount: 0, orders: { paid_at: "2026-09-04T09:00:00Z" } },
  ],
  courses: [course("A"), course("B", "advanced"), course("C")],
  ...patch,
});

describe("buildTraining", () => {
  it("counts enrolments, completions and learners of the period", () => {
    const { training } = buildTraining(sources(), current, previous);
    expect(training).toMatchObject({
      enrollments: 3, // u4's access was revoked
      activeLearners: 2,
      completed: 1, // u5 in the period; u1 after it
      completionRate: 33.3, // u1 of u1, u2, u3 — completed since
      averageScore: 70,
      daysToComplete: 10, // u5: 22 Sept → 2 Oct
    });
  });

  it("ranks the courses and leaves out those with nothing to show", () => {
    const { training } = buildTraining(sources(), current, previous);
    expect(training.courses).toEqual([
      { id: "A", title: { fr: "A", en: "A" }, level: "beginner", enrollments: 2, completionRate: 50, averageScore: 70, revenue: 13900 },
      { id: "B", title: { fr: "B", en: "B" }, level: "advanced", enrollments: 1, completionRate: 0, averageScore: null, revenue: 9990 },
    ]);
  });

  it("compares the KPIs with the previous period", () => {
    const { kpis } = buildTraining(sources(), current, previous);
    const [enrollments, rate] = kpis;
    expect(enrollments).toMatchObject({ id: "enrollments", value: 3, previous: 1, change: 200, trend: "up", format: "count" });
    expect(enrollments.spark).toHaveLength(12);
    expect(enrollments.spark.reduce((a, b) => a + b, 0)).toBe(3);
    expect(rate).toMatchObject({ id: "completionRate", value: 33.3, previous: 100, change: -66.7, changeUnit: "points", trend: "down" });
  });

  it("reports nothing rather than zeros it cannot measure", () => {
    const { training, kpis } = buildTraining(
      { entitlements: [], completions: [], activity: [], courseLines: [], courses: [course("A")] },
      current,
      previous,
    );
    expect(training).toEqual({
      enrollments: 0, activeLearners: 0, completed: 0, completionRate: 0, averageScore: null, daysToComplete: null, courses: [],
    });
    expect(kpis[0].change).toBeNull();
  });
});
