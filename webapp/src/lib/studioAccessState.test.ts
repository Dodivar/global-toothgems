import { describe, expect, it } from "vitest";
import {
  countdownTickMs,
  grantsAccess,
  hoursSince,
  isTrialWarning,
  parseAccessRow,
  remainingParts,
  serverTimeNow,
  trialRemainingMs,
  TRIAL_WARNING_MS,
} from "./studioAccessState";

const H = 3_600_000;
const row = {
  state: "trial_active",
  server_now: "2026-10-17T10:00:00.000Z",
  trial_started_at: "2026-10-17T09:00:00.000Z",
  trial_expires_at: "2026-10-19T09:00:00.000Z",
  first_creation_at: null,
  subscription_plan: null,
  subscription_status: null,
};

describe("parseAccessRow", () => {
  it("reads the database answer", () => {
    const info = parseAccessRow(row)!;
    expect(info.state).toBe("trial_active");
    expect(info.trialExpiresAt! - info.trialStartedAt!).toBe(48 * H);
    expect(info.firstCreationAt).toBeNull();
  });

  it("refuses anything that is not a known state with a server time", () => {
    expect(parseAccessRow(null)).toBeNull();
    expect(parseAccessRow([row])).toBeNull();
    expect(parseAccessRow({ ...row, state: "free_forever" })).toBeNull();
    expect(parseAccessRow({ ...row, server_now: "not a date" })).toBeNull();
  });
});

describe("grantsAccess", () => {
  it("opens the Studio for an active trial, a subscription and staff only", () => {
    expect(grantsAccess("trial_active")).toBe(true);
    expect(grantsAccess("subscribed")).toBe(true);
    expect(grantsAccess("staff")).toBe(true);
    for (const state of ["not_started", "trial_expired", "subscription_pending", "subscription_ended"] as const) {
      expect(grantsAccess(state)).toBe(false);
    }
  });
});

describe("time left", () => {
  const info = parseAccessRow(row)!;

  it("counts on the database clock, not the device's", () => {
    // 2 h of monotonic time after the read: the device's wall clock plays no part.
    const now = serverTimeNow(info, 1_000, 1_000 + 2 * H);
    expect(trialRemainingMs(info, now)).toBe(45 * H);
  });

  it("never goes below zero and is null without a trial", () => {
    expect(trialRemainingMs(info, info.trialExpiresAt! + H)).toBe(0);
    expect(trialRemainingMs({ ...info, trialExpiresAt: null }, info.serverNow)).toBeNull();
    // A monotonic clock that went backwards does not add time.
    expect(serverTimeNow(info, 5_000, 1_000)).toBe(info.serverNow);
  });

  it("says the time left at the right precision, rounded down", () => {
    expect(remainingParts(47 * H + 59 * 60_000)).toEqual({ unit: "daysHours", days: 1, hours: 23 });
    expect(remainingParts(24 * H)).toEqual({ unit: "daysHours", days: 1, hours: 0 });
    expect(remainingParts(23 * H + 30 * 60_000)).toEqual({ unit: "hours", hours: 23 });
    expect(remainingParts(5 * H + 59 * 60_000)).toEqual({ unit: "hoursMinutes", hours: 5, minutes: 59 });
    expect(remainingParts(59 * 60_000 + 59_000)).toEqual({ unit: "minutes", minutes: 59 });
    expect(remainingParts(59_000)).toEqual({ unit: "lessThanMinute" });
    expect(remainingParts(-5)).toEqual({ unit: "lessThanMinute" });
  });

  it("warns only in the last hours of a running trial", () => {
    expect(isTrialWarning(TRIAL_WARNING_MS + 1)).toBe(false);
    expect(isTrialWarning(TRIAL_WARNING_MS)).toBe(true);
    expect(isTrialWarning(0)).toBe(false);
    expect(isTrialWarning(null)).toBe(false);
    expect(countdownTickMs(TRIAL_WARNING_MS + 1)).toBe(60_000);
    expect(countdownTickMs(H)).toBe(15_000);
  });

  it("measures hours since the trial started", () => {
    expect(hoursSince(info.trialStartedAt, info.serverNow)).toBe(1);
    expect(hoursSince(null, info.serverNow)).toBeNull();
  });
});
