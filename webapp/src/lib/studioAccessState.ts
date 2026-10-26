/**
 * The 3D Studio access state, as the database reports it
 * (`studio_access_state()` / `start_studio_trial()`, migration
 * `20261017103101_studio_trial_access`, decision 93 in `supabase/README.md`).
 *
 * Pure: no React, no Supabase. The database is the authority — it decides the
 * state and refuses every write without access (row-level security). What is
 * computed here is display only: the time left, counted on the database's
 * clock (`serverNow` → a clock offset), so changing the device's clock moves
 * nothing but the countdown text, and never reopens the Studio.
 */

/** Length of the free trial. Display value: the database fixes the real window. */
export const STUDIO_TRIAL_HOURS = 48;
/** From this much time left the countdown takes its warning dress. */
export const TRIAL_WARNING_MS = 6 * 60 * 60 * 1000;

export type StudioAccessKind =
  | "not_started"
  | "trial_active"
  | "trial_expired"
  | "subscribed"
  | "subscription_pending"
  | "subscription_ended"
  | "staff";

export interface StudioAccessInfo {
  state: StudioAccessKind;
  /** The database clock when the state was read, in ms since the epoch. */
  serverNow: number;
  trialStartedAt: number | null;
  trialExpiresAt: number | null;
  firstCreationAt: number | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  /** End of the paid period (renewal, or the end of a cancelled subscription). */
  subscriptionPeriodEnd: number | null;
  subscriptionInterval: "month" | "year" | null;
  subscriptionCancelAtPeriodEnd: boolean;
  /**
   * What the member's plan includes (decision 113, migration
   * `20261026170231_studio_plan_entitlements`): the tier (a trial counts as
   * essential, staff as atelier; null without access), whether the Glowbook
   * is theirs, how many creations / Gem Groups they may hold (null =
   * unlimited) and how many they hold. Display only: the database refuses a
   * save over the limit.
   */
  tier: StudioTier | null;
  glowbook: boolean;
  limits: StudioCounts<number | null>;
  usage: StudioCounts<number>;
}

export type StudioTier = "essential" | "artist" | "atelier";
export interface StudioCounts<T> {
  creations: T;
  gemGroups: T;
}

const KINDS: StudioAccessKind[] = [
  "not_started",
  "trial_active",
  "trial_expired",
  "subscribed",
  "subscription_pending",
  "subscription_ended",
  "staff",
];

const time = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const TIERS: StudioTier[] = ["essential", "artist", "atelier"];

/** The function's JSON answer, or null when it is not one (treated as an access error). */
export function parseAccessRow(raw: unknown): StudioAccessInfo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const state = row.state;
  const serverNow = time(row.server_now);
  if (typeof state !== "string" || !KINDS.includes(state as StudioAccessKind) || serverNow === null) return null;
  return {
    state: state as StudioAccessKind,
    serverNow,
    trialStartedAt: time(row.trial_started_at),
    trialExpiresAt: time(row.trial_expires_at),
    firstCreationAt: time(row.first_creation_at),
    subscriptionPlan: text(row.subscription_plan),
    subscriptionStatus: text(row.subscription_status),
    subscriptionPeriodEnd: time(row.subscription_period_end),
    subscriptionInterval: row.subscription_interval === "month" || row.subscription_interval === "year" ? row.subscription_interval : null,
    subscriptionCancelAtPeriodEnd: row.subscription_cancel_at_period_end === true,
    tier: TIERS.includes(row.tier as StudioTier) ? (row.tier as StudioTier) : null,
    glowbook: row.glowbook === true,
    limits: { creations: count(record(row.limits).creations), gemGroups: count(record(row.limits).gem_groups) },
    usage: { creations: count(record(row.usage).creations) ?? 0, gemGroups: count(record(row.usage).gem_groups) ?? 0 },
  };
}

/** True once the member holds as many as the plan allows (never for unlimited). */
export function atLimit(info: Pick<StudioAccessInfo, "limits" | "usage">, kind: keyof StudioCounts<number>): boolean {
  const limit = info.limits[kind];
  return limit !== null && info.usage[kind] >= limit;
}

/** May the Studio be used in this state (as far as the page is concerned)? */
export function grantsAccess(state: StudioAccessKind): boolean {
  return state === "trial_active" || state === "subscribed" || state === "staff";
}

/**
 * Database time now, estimated from the last answer: the server clock at the
 * read plus the time elapsed since on a monotonic clock. `readAtPerf` and
 * `nowPerf` are `performance.now()` values, immune to the device's wall clock.
 */
export function serverTimeNow(info: StudioAccessInfo, readAtPerf: number, nowPerf: number): number {
  return info.serverNow + Math.max(0, nowPerf - readAtPerf);
}

/** Milliseconds left in the trial at `serverNow`, 0 once over, null without a trial. */
export function trialRemainingMs(info: StudioAccessInfo, serverNow: number): number | null {
  if (info.trialExpiresAt === null) return null;
  return Math.max(0, info.trialExpiresAt - serverNow);
}

export type RemainingParts =
  | { unit: "daysHours"; days: number; hours: number }
  | { unit: "hours"; hours: number }
  | { unit: "hoursMinutes"; hours: number; minutes: number }
  | { unit: "minutes"; minutes: number }
  | { unit: "lessThanMinute" };

/**
 * How the time left is said: "1 day, 4 hours" above a day, "36 hours" is not
 * used (a day reads better), whole hours down to 6 hours, then hours and
 * minutes, then minutes. Rounded down: the countdown never promises time that
 * is not there.
 */
export function remainingParts(ms: number): RemainingParts {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return { unit: "lessThanMinute" };
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours >= 24) return { unit: "daysHours", days: Math.floor(totalHours / 24), hours: totalHours % 24 };
  if (totalHours >= 6) return { unit: "hours", hours: totalHours };
  if (totalHours >= 1) return { unit: "hoursMinutes", hours: totalHours, minutes };
  return { unit: "minutes", minutes: totalMinutes };
}

/** How often the countdown text needs refreshing for its precision. */
export function countdownTickMs(ms: number): number {
  return ms > TRIAL_WARNING_MS ? 60_000 : 15_000;
}

export function isTrialWarning(ms: number | null): boolean {
  return ms !== null && ms > 0 && ms <= TRIAL_WARNING_MS;
}

/** Hours elapsed since the trial started, for analytics (one decimal). */
export function hoursSince(from: number | null, now: number): number | null {
  if (from === null) return null;
  return Math.round(((now - from) / 3_600_000) * 10) / 10;
}
