import { addDays, localDay, weekStart } from "./glowbookBookingMapping";

/** The periods the artist's appointments to come are grouped in, nearest first. */
export const TIMELINE_PERIODS = ["today", "tomorrow", "thisWeek", "nextWeek", "later"] as const;
export type TimelinePeriod = (typeof TIMELINE_PERIODS)[number];

/** Whole days from one local day key to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** The period of a local day relative to today (days before today count as today). */
export function periodOf(day: string, today: string): TimelinePeriod {
  const diff = daysBetween(today, day);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  const thisWeekEnd = addDays(weekStart(today), 6);
  if (day <= thisWeekEnd) return "thisWeek";
  if (day <= addDays(thisWeekEnd, 7)) return "nextWeek";
  return "later";
}

export type TimelineGroup<T> = { period: TimelinePeriod; items: { booking: T; day: string; inDays: number }[] };

/** Appointments to come, ordered by start and grouped by period; empty periods are left out. */
export function groupByPeriod<T extends { startsAt: string; timezone: string }>(bookings: readonly T[], today: string): TimelineGroup<T>[] {
  const sorted = [...bookings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const groups = new Map<TimelinePeriod, TimelineGroup<T>["items"]>();
  for (const booking of sorted) {
    const day = localDay(booking.startsAt, booking.timezone);
    const period = periodOf(day, today);
    const list = groups.get(period) ?? [];
    list.push({ booking, day, inDays: daysBetween(today, day) });
    groups.set(period, list);
  }
  return TIMELINE_PERIODS.flatMap((period) => {
    const items = groups.get(period);
    return items ? [{ period, items }] : [];
  });
}
