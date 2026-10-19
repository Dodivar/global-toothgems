import { describe, expect, it } from "vitest";
import { buildStudioTrialFigures, type SubscriptionRow, type TrialRow } from "./adminStudioTrials";

const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const START = Date.parse("2026-10-05T00:00:00Z"); // a Monday
const range = { start: new Date(START), end: new Date(START + 14 * 24 * H) };
const now = new Date(START + 20 * 24 * H);

const trial = (user: string, startedAt: number, savedAfterH: number | null): TrialRow => ({
  user_id: user,
  trial_started_at: iso(startedAt),
  trial_expires_at: iso(startedAt + 48 * H),
  first_creation_at: savedAfterH === null ? null : iso(startedAt + savedAfterH * H),
});

describe("buildStudioTrialFigures", () => {
  const trials = [
    trial("a", START + 1 * H, 1),
    trial("b", START + 2 * H, 3),
    trial("c", START + 8 * 24 * H, null),
    trial("d", START - 24 * H, 2), // before the period
  ];
  const subs: SubscriptionRow[] = [
    { user_id: "a", status: "active", created_at: iso(START + 40 * H) }, // during the trial
    { user_id: "b", status: "incomplete", created_at: iso(START + 50 * H) }, // never went through
    { user_id: "c", status: "canceled", created_at: iso(START + 8 * 24 * H + 60 * 24 * H) }, // outside the window
  ];

  it("counts the cohort of the period, once per account", () => {
    const f = buildStudioTrialFigures(trials, subs, range, now);
    expect(f.started).toBe(3);
    expect(f.ended).toBe(3);
    expect(f.firstSaveRate).toBeCloseTo(2 / 3);
    expect(f.medianHoursToFirstSave).toBe(2);
  });

  it("counts a conversion only for a real subscription inside the window", () => {
    const f = buildStudioTrialFigures(trials, subs, range, now);
    expect(f.converted).toBe(1);
    expect(f.conversionRate).toBeCloseTo(1 / 3);
    expect(f.endedUnconverted).toBe(2);
  });

  it("counts running trials whatever the period", () => {
    const f = buildStudioTrialFigures(trials, subs, range, new Date(START + 8 * 24 * H + H));
    expect(f.activeNow).toBe(1);
    expect(f.ended).toBe(2);
  });

  it("groups the cohort by week of start", () => {
    const f = buildStudioTrialFigures(trials, subs, range, now);
    expect(f.weeks).toEqual([
      { week: "2026-10-05", started: 2, saved: 2, converted: 1 },
      { week: "2026-10-12", started: 1, saved: 0, converted: 0 },
    ]);
  });

  it("returns no rates for an empty period", () => {
    const f = buildStudioTrialFigures([], [], range, now);
    expect(f.firstSaveRate).toBeNull();
    expect(f.conversionRate).toBeNull();
    expect(f.medianHoursToFirstSave).toBeNull();
  });
});
