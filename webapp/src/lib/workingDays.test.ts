import { describe, expect, it } from "vitest";
import { addWorkingDays, localToday, suggestedDelivery } from "./workingDays";

// 2026-10-22 is a Thursday.
describe("addWorkingDays", () => {
  it("skips the weekend", () => {
    expect(addWorkingDays("2026-10-22", 1)).toBe("2026-10-23");
    expect(addWorkingDays("2026-10-22", 2)).toBe("2026-10-26");
    expect(addWorkingDays("2026-10-22", 4)).toBe("2026-10-28");
  });

  it("counts a weekend start from the next Monday", () => {
    expect(addWorkingDays("2026-10-24", 0)).toBe("2026-10-26");
    expect(addWorkingDays("2026-10-25", 1)).toBe("2026-10-27");
  });

  it("keeps a weekday for zero days and crosses months and DST", () => {
    expect(addWorkingDays("2026-10-22", 0)).toBe("2026-10-22");
    expect(addWorkingDays("2026-10-23", 5)).toBe("2026-10-30");
    expect(addWorkingDays("2026-10-30", 2)).toBe("2026-11-03");
    expect(addWorkingDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("refuses a malformed day or count", () => {
    expect(() => addWorkingDays("22/10/2026", 2)).toThrow(RangeError);
    expect(() => addWorkingDays("2026-10-22", -1)).toThrow(RangeError);
    expect(() => addWorkingDays("2026-10-22", 1.5)).toThrow(RangeError);
  });
});

describe("suggestedDelivery", () => {
  it("offers nothing without a promised delay", () => {
    expect(suggestedDelivery("2026-10-22", null)).toBe("");
    expect(suggestedDelivery("2026-10-22", undefined)).toBe("");
  });

  it("adds the maximum in working days", () => {
    expect(suggestedDelivery("2026-10-22", 4)).toBe("2026-10-28");
  });
});

describe("localToday", () => {
  it("reads the local calendar day", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
