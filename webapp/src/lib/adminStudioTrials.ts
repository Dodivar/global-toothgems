import { useEffect, useState } from "react";
import { SHOP_TIME_ZONE } from "../data/adminAnalytics";
import { periodInstants, type Period } from "./adminAnalyticsMapping";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";

/**
 * The 3D Studio trial figures of `/admin/statistiques`, aggregated in the
 * browser from the rows `view_statistics` staff read (`studio_trials`,
 * `studio_subscriptions`, migration `20261017103101_studio_trial_access`),
 * like the Academy panel — no statistics function in the database.
 *
 * The cohort is the trials started in the period, counted once per account
 * (one trial per account by construction). What the database cannot know —
 * offer views, sessions, return visits, feature use, plan clicks — lives in
 * PostHog (`studioAnalytics.ts`, `docs/studio-trial-analytics.md`).
 */

export interface TrialRow {
  user_id: string;
  trial_started_at: string;
  trial_expires_at: string;
  first_creation_at: string | null;
}

export interface SubscriptionRow {
  user_id: string;
  status: string;
  created_at: string;
}

/** A subscription started within this long after the trial's end still counts as a trial conversion. */
export const CONVERSION_WINDOW_DAYS = 30;
const DAY = 86_400_000;

export interface StudioTrialFigures {
  started: number;
  /** Trials running now, whenever they started. */
  activeNow: number;
  /** Trials of the cohort that have reached their end. */
  ended: number;
  /** Ended without a subscription in the window so far. */
  endedUnconverted: number;
  firstSaveRate: number | null;
  medianHoursToFirstSave: number | null;
  converted: number;
  conversionRate: number | null;
  /** Trials started per ISO week (Monday, shop day), oldest first. */
  weeks: { week: string; started: number; saved: number; converted: number }[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Monday of the week of an instant, as `YYYY-MM-DD` in UTC (stable, time-zone free grouping). */
function weekOf(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

export function buildStudioTrialFigures(
  trials: TrialRow[],
  subscriptions: SubscriptionRow[],
  range: { start: Date; end: Date },
  now: Date,
): StudioTrialFigures {
  const nowMs = now.getTime();
  const firstSubscription = new Map<string, number>();
  for (const sub of subscriptions) {
    // An attempt that never went through is not a conversion.
    if (sub.status === "incomplete" || sub.status === "incomplete_expired") continue;
    const at = Date.parse(sub.created_at);
    const known = firstSubscription.get(sub.user_id);
    if (known === undefined || at < known) firstSubscription.set(sub.user_id, at);
  }

  const cohort = trials.filter((trial) => {
    const at = Date.parse(trial.trial_started_at);
    return at >= range.start.getTime() && at < range.end.getTime();
  });
  const converts = (trial: TrialRow) => {
    const at = firstSubscription.get(trial.user_id);
    return at !== undefined && at >= Date.parse(trial.trial_started_at) && at <= Date.parse(trial.trial_expires_at) + CONVERSION_WINDOW_DAYS * DAY;
  };

  const ended = cohort.filter((trial) => Date.parse(trial.trial_expires_at) <= nowMs);
  const saved = cohort.filter((trial) => trial.first_creation_at !== null);
  const converted = cohort.filter(converts);

  const weeks = new Map<string, { week: string; started: number; saved: number; converted: number }>();
  for (const trial of cohort) {
    const week = weekOf(Date.parse(trial.trial_started_at));
    const row = weeks.get(week) ?? { week, started: 0, saved: 0, converted: 0 };
    row.started += 1;
    if (trial.first_creation_at !== null) row.saved += 1;
    if (converts(trial)) row.converted += 1;
    weeks.set(week, row);
  }

  return {
    started: cohort.length,
    activeNow: trials.filter((trial) => Date.parse(trial.trial_started_at) <= nowMs && nowMs < Date.parse(trial.trial_expires_at)).length,
    ended: ended.length,
    endedUnconverted: ended.filter((trial) => !converts(trial)).length,
    firstSaveRate: cohort.length ? saved.length / cohort.length : null,
    medianHoursToFirstSave: median(saved.map((trial) => (Date.parse(trial.first_creation_at!) - Date.parse(trial.trial_started_at)) / 3_600_000)),
    converted: converted.length,
    conversionRate: cohort.length ? converted.length / cohort.length : null,
    weeks: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)),
  };
}

/* ----------------------------------------------------------------- the read */

const PAGE_ROWS = 1000;

async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await query(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}

export type StudioTrialState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; figures: StudioTrialFigures };

/** The figures for the page's period; re-read when the period changes. */
export function useStudioTrialFigures(period: Period | null, reloadKey: unknown): StudioTrialState {
  const [state, setState] = useState<{ key: string; value: StudioTrialState } | null>(null);
  const key = period ? `${period.from}/${period.to}` : "";

  useEffect(() => {
    if (!period || !isSupabaseConfigured) return;
    const controller = new AbortController();
    const client = requireSupabase();
    const range = periodInstants(period, SHOP_TIME_ZONE);
    Promise.all([
      readAll<TrialRow>((from, to) =>
        client
          .from("studio_trials")
          .select("user_id, trial_started_at, trial_expires_at, first_creation_at")
          .order("user_id", { ascending: true })
          .range(from, to)
          .abortSignal(controller.signal),
      ),
      readAll<SubscriptionRow>((from, to) =>
        client
          .from("studio_subscriptions")
          .select("user_id, status, created_at")
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(controller.signal),
      ),
    ])
      .then(([trials, subscriptions]) =>
        setState({ key, value: { kind: "ready", figures: buildStudioTrialFigures(trials, subscriptions, range, new Date()) } }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, value: { kind: "error" } });
      });
    return () => controller.abort();
    // `period` is described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadKey]);

  if (!isSupabaseConfigured) return { kind: "unavailable" };
  return state && state.key === key ? state.value : { kind: "loading" };
}
