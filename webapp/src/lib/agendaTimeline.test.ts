import { describe, expect, it } from "vitest";
import { daysBetween, groupByPeriod, periodOf } from "./agendaTimeline";

// 2026-11-20 is a Friday: this week ends Sunday 2026-11-22.
const today = "2026-11-20";

describe("periodOf", () => {
  it("places days relative to today", () => {
    expect(periodOf("2026-11-20", today)).toBe("today");
    expect(periodOf("2026-11-19", today)).toBe("today");
    expect(periodOf("2026-11-21", today)).toBe("tomorrow");
    expect(periodOf("2026-11-22", today)).toBe("thisWeek");
    expect(periodOf("2026-11-23", today)).toBe("nextWeek");
    expect(periodOf("2026-11-29", today)).toBe("nextWeek");
    expect(periodOf("2026-11-30", today)).toBe("later");
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-11-20", "2026-11-23")).toBe(3);
    expect(daysBetween("2026-10-25", "2026-10-26")).toBe(1);
  });
});

describe("groupByPeriod", () => {
  it("orders by start, groups and drops empty periods", () => {
    const b = (startsAt: string) => ({ startsAt, timezone: "Europe/Paris" });
    const groups = groupByPeriod([b("2026-12-05T10:00:00Z"), b("2026-11-21T09:00:00Z"), b("2026-11-20T15:00:00Z")], today);
    expect(groups.map((g) => g.period)).toEqual(["today", "tomorrow", "later"]);
    expect(groups[0].items[0].inDays).toBe(0);
  });
});
