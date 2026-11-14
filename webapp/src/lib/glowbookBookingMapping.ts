/**
 * Glowbook bookings (decision 144): pure shapes and rules shared by the
 * booking dialog, the member's appointments and the artist's calendar. The
 * database decides everything that matters (free hours, limits, locks); these
 * helpers only read its answers and lay them out in the right time zone.
 */

export type BookingStatus = "booked" | "cancelled_client" | "cancelled_artist" | "honoured" | "no_show";
export type DesignKind = "creation" | "custom";

export interface BookingInfo {
  timezone: string;
  minNoticeHours: number;
  horizonDays: number;
}

export interface SlotList extends BookingInfo {
  from: string;
  to: string;
  slots: string[];
}

export interface ClientBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: BookingStatus;
  lateCancel: boolean;
  designKind: DesignKind;
  creationName: string | null;
  comment: string | null;
  phone: string | null;
  cancelReason: string | null;
  artistName: string;
  artistHandle: string | null;
}

export interface ArtistBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: BookingStatus;
  lateCancel: boolean;
  clientErased: boolean;
  clientBlocked: boolean;
  designKind: DesignKind;
  creationName: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  comment: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface BookingRule {
  weekday: number;
  startHour: number;
  endHour: number;
}

export interface CalendarHour {
  startsAt: string;
  day: string;
  hour: number;
  weekly: boolean;
  override: "blocked" | "open" | null;
}

export interface BookingSettings {
  enabled: boolean;
  timezone: string;
  minNoticeHours: number;
  horizonDays: number;
}

export interface ArtistCalendar {
  /** The platform-wide switch. */
  switchOn: boolean;
  /** Visitors can book now (switched on, page approved, plan active). */
  open: boolean;
  settings: BookingSettings | null;
  rules: BookingRule[];
  hours: CalendarHour[];
  bookings: ArtistBooking[];
  upcoming: { id: string; startsAt: string }[];
  blocks: { id: string; clientName: string; createdAt: string }[];
}

export const DEFAULT_SETTINGS: BookingSettings = { enabled: false, timezone: "Europe/Paris", minNoticeHours: 24, horizonDays: 56 };

/** Hours of notice and days of horizon the artist can pick (the database accepts 1–336 and 7–180). */
export const NOTICE_CHOICES = [1, 2, 4, 12, 24, 48, 72, 168] as const;
export const HORIZON_CHOICES = [14, 28, 56, 90, 180] as const;
export const TIMEZONE_CHOICES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "Europe/Luxembourg", "Europe/London", "America/Montreal", "Indian/Reunion", "America/Martinique", "America/Guadeloupe"] as const;

export const COMMENT_MAX = 1000;
export const NAME_MAX = 120;
export const PHONE_RE = /^\+?[0-9 ().-]{6,24}$/;
/** Free cancellation until this many hours before (owner-approved, decision 144). */
export const FREE_CANCEL_HOURS = 24;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const STATUSES: readonly BookingStatus[] = ["booked", "cancelled_client", "cancelled_artist", "honoured", "no_show"];
const status = (v: unknown): BookingStatus => (STATUSES.includes(v as BookingStatus) ? (v as BookingStatus) : "booked");
const design = (v: unknown): DesignKind => (v === "custom" ? "custom" : "creation");

export function readBookingInfo(data: unknown): BookingInfo | null {
  if (!isRecord(data) || typeof data.timezone !== "string") return null;
  return { timezone: data.timezone, minNoticeHours: num(data.min_notice_hours, 24), horizonDays: num(data.horizon_days, 56) };
}

export function readSlots(data: unknown): SlotList | null {
  const info = readBookingInfo(data);
  if (!info || !isRecord(data)) return null;
  const slots = Array.isArray(data.slots) ? data.slots.filter((s): s is string => typeof s === "string") : [];
  return { ...info, from: text(data.from) ?? "", to: text(data.to) ?? "", slots };
}

export function readMyBookings(data: unknown): { bannedUntil: string | null; bookings: ClientBooking[] } {
  if (!isRecord(data)) return { bannedUntil: null, bookings: [] };
  const rows = Array.isArray(data.bookings) ? data.bookings.filter(isRecord) : [];
  return {
    bannedUntil: text(data.banned_until),
    bookings: rows.map((r) => ({
      id: String(r.id),
      startsAt: String(r.starts_at),
      endsAt: String(r.ends_at),
      timezone: text(r.timezone) ?? "Europe/Paris",
      status: status(r.status),
      lateCancel: r.late_cancel === true,
      designKind: design(r.design_kind),
      creationName: text(r.creation_name),
      comment: text(r.comment),
      phone: text(r.phone),
      cancelReason: text(r.cancel_reason),
      artistName: text(r.artist_name) ?? "",
      artistHandle: text(r.artist_handle),
    })),
  };
}

export function readArtistCalendar(data: unknown): ArtistCalendar | null {
  if (!isRecord(data)) return null;
  const list = (key: string) => (Array.isArray(data[key]) ? (data[key] as unknown[]).filter(isRecord) : []);
  const s = isRecord(data.settings) ? data.settings : null;
  return {
    switchOn: data.switch_on !== false,
    open: data.open === true,
    settings: s
      ? {
          enabled: s.enabled === true,
          timezone: text(s.timezone) ?? DEFAULT_SETTINGS.timezone,
          minNoticeHours: num(s.min_notice_hours, DEFAULT_SETTINGS.minNoticeHours),
          horizonDays: num(s.horizon_days, DEFAULT_SETTINGS.horizonDays),
        }
      : null,
    rules: list("rules").map((r) => ({ weekday: num(r.weekday, 1), startHour: num(r.start_hour, 0), endHour: num(r.end_hour, 1) })),
    hours: list("hours").map((h) => ({
      startsAt: String(h.starts_at),
      day: String(h.day),
      hour: num(h.hour, 0),
      weekly: h.weekly === true,
      override: h.override === "blocked" || h.override === "open" ? h.override : null,
    })),
    bookings: list("bookings").map((b) => ({
      id: String(b.id),
      startsAt: String(b.starts_at),
      endsAt: String(b.ends_at),
      timezone: text(b.timezone) ?? DEFAULT_SETTINGS.timezone,
      status: status(b.status),
      lateCancel: b.late_cancel === true,
      clientErased: b.client_erased === true,
      clientBlocked: b.client_blocked === true,
      designKind: design(b.design_kind),
      creationName: text(b.creation_name),
      clientName: text(b.client_name),
      clientEmail: text(b.client_email),
      clientPhone: text(b.client_phone),
      comment: text(b.comment),
      cancelReason: text(b.cancel_reason),
      createdAt: String(b.created_at),
    })),
    upcoming: list("upcoming").map((u) => ({ id: String(u.id), startsAt: String(u.starts_at) })),
    blocks: list("blocks").map((b) => ({ id: String(b.id), clientName: text(b.client_name) ?? "—", createdAt: String(b.created_at) })),
  };
}

/* ------------------------------------------------------------ time zones */

const safeZone = (timezone: string): string => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return timezone;
  } catch {
    return DEFAULT_SETTINGS.timezone;
  }
};

/** "YYYY-MM-DD" of an instant in a time zone. */
export function localDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** The local hour (0–23) of an instant in a time zone. */
export function localHour(iso: string, timezone: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: safeZone(timezone), hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return Number(h) % 24;
}

const intlLocale = (locale: string) => (locale.startsWith("fr") ? "fr-FR" : "en-GB");

/** "14:00" in the artist's time zone. */
export function formatHour(iso: string, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: safeZone(timezone), hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "vendredi 20 novembre" for a local day key (noon UTC keeps the date in every zone). */
export function formatDay(day: string, locale: string, style: "long" | "short" = "long"): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "UTC",
    weekday: style,
    day: "numeric",
    month: style === "long" ? "long" : "short",
  }).format(date);
}

/** "vendredi 20 novembre 2026, 14:00" in the booking's time zone. */
export function formatWhen(iso: string, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: safeZone(timezone),
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** The city of a time zone, for "Paris time". */
export const zoneCity = (timezone: string): string => timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;

/** Whether the viewer's own zone differs from the artist's (then the dialog says whose hours they are). */
export function differentZone(timezone: string, viewerZone: string | undefined): boolean {
  return !!viewerZone && safeZone(viewerZone) !== safeZone(timezone);
}

/** Free slots grouped by the artist's local day, in order. */
export function groupSlotsByDay(slots: readonly string[], timezone: string): { day: string; slots: string[] }[] {
  const days = new Map<string, string[]>();
  for (const slot of [...slots].sort()) {
    const day = localDay(slot, timezone);
    const list = days.get(day) ?? [];
    list.push(slot);
    days.set(day, list);
  }
  return [...days].map(([day, list]) => ({ day, slots: list }));
}

/* ------------------------------------------------------------ calendar dates */

/** A local day key shifted by n days. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday) of a local day key. */
export function isoWeekday(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The Monday of the week holding this day. */
export function weekStart(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

/* ------------------------------------------------------------ weekly hours */

export type WeekHours = Record<number, { start: number; end: number }[]>;

export function rulesToWeek(rules: readonly BookingRule[]): WeekHours {
  const week: WeekHours = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const r of [...rules].sort((a, b) => a.weekday - b.weekday || a.startHour - b.startHour)) {
    if (r.weekday >= 1 && r.weekday <= 7) week[r.weekday].push({ start: r.startHour, end: r.endHour });
  }
  return week;
}

export function weekToRules(week: WeekHours): BookingRule[] {
  const rules: BookingRule[] = [];
  for (let d = 1; d <= 7; d++) for (const r of week[d] ?? []) rules.push({ weekday: d, startHour: r.start, endHour: r.end });
  return rules;
}

/** A first week for an artist who never set one: Tuesday to Saturday, 10:00–13:00 and 14:00–19:00. */
export function defaultWeek(): WeekHours {
  const day = [
    { start: 10, end: 13 },
    { start: 14, end: 19 },
  ];
  return { 1: [], 2: [...day], 3: [...day], 4: [...day], 5: [...day], 6: [...day], 7: [] };
}

export type WeekProblem = "order" | "overlap" | "tooMany" | null;

export function validateWeek(week: WeekHours): WeekProblem {
  let count = 0;
  for (let d = 1; d <= 7; d++) {
    const ranges = [...(week[d] ?? [])].sort((a, b) => a.start - b.start);
    count += ranges.length;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      if (!(Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end <= 24 && r.start < r.end)) return "order";
      if (i > 0 && r.start < ranges[i - 1].end) return "overlap";
    }
  }
  return count > 28 ? "tooMany" : null;
}

/* ------------------------------------------------------------ the artist's week view */

export type HourState = "open" | "closed" | "blocked" | "busy" | "extra" | "booked" | "past";

/** What one hour of the week view shows. */
export function hourState(hour: CalendarHour | undefined, booked: boolean, past: boolean, imported = false): HourState {
  if (booked) return "booked";
  if (past) return "past";
  // Closed by the other calendar (lot 3): a click opens it by hand, which the import then respects.
  if (hour?.override === "blocked") return imported ? "busy" : "blocked";
  if (hour?.override === "open") return "extra";
  return hour?.weekly ? "open" : "closed";
}

/** What a click on an hour asks the database: close an open hour, open a closed one, or give it back. */
export function toggleTarget(state: HourState): "blocked" | "open" | "default" | null {
  switch (state) {
    case "open":
      return "blocked";
    case "closed":
    case "busy":
      return "open";
    case "blocked":
    case "extra":
      return "default";
    default:
      return null;
  }
}

/* ------------------------------------------------------------ the booking form */

export interface BookingDraft {
  slot: string | null;
  itemId: string | null;
  custom: boolean;
  name: string;
  phone: string;
  comment: string;
}

export type DraftProblem = "slot" | "design" | "name" | "phone" | "comment" | "commentLength" | null;

export function validateDraft(d: BookingDraft): DraftProblem {
  if (!d.slot) return "slot";
  if (!d.custom && !d.itemId) return "design";
  if (!d.name.trim() || d.name.trim().length > NAME_MAX) return "name";
  if (!PHONE_RE.test(d.phone.trim())) return "phone";
  if (d.comment.trim().length > COMMENT_MAX) return "commentLength";
  if (d.custom && !d.comment.trim()) return "comment";
  return null;
}

/** The refusals the dialog explains; anything else reads as "unavailable". */
export const BOOKING_ERRORS = [
  "sign_in_required",
  "session_expired",
  "email_unconfirmed",
  "closed",
  "own_calendar",
  "slot_unavailable",
  "slot_taken",
  "limit_artist",
  "limit_total",
  "limit_daily",
  "banned",
  "blocked",
  "comment_required",
  "item_unavailable",
  "captcha_required",
  "captcha_failed",
  "rate_limited",
  "invalid_request",
  "unavailable",
] as const;
export type BookingError = (typeof BOOKING_ERRORS)[number];

export function readBookingError(code: unknown): BookingError {
  return BOOKING_ERRORS.includes(code as BookingError) ? (code as BookingError) : "unavailable";
}

/** The code inside a database refusal ("glowbook_booking: reason_required"). */
export function databaseCode(message: string | undefined): string | null {
  return /glowbook_booking: ([a-z_]+)/.exec(message ?? "")?.[1] ?? null;
}

/** Whether the client may still cancel, and whether it would count as late. */
export function clientCancellation(b: Pick<ClientBooking, "status" | "startsAt">, now: Date): { allowed: boolean; late: boolean } {
  const start = new Date(b.startsAt).getTime();
  if (b.status !== "booked" || start <= now.getTime()) return { allowed: false, late: false };
  return { allowed: true, late: start - now.getTime() < FREE_CANCEL_HOURS * 3600 * 1000 };
}

/** Upcoming first (soonest first), then the past (latest first). */
export function splitBookings<T extends { startsAt: string; status: BookingStatus }>(list: readonly T[], now: Date): { upcoming: T[]; past: T[] } {
  const upcoming = list.filter((b) => b.status === "booked" && new Date(b.startsAt).getTime() > now.getTime());
  const past = list.filter((b) => !upcoming.includes(b));
  upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  past.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}

/** The wall-clock time of an instant in a zone, as if it were UTC (ms). */
function wallClock(ms: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(timezone),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/** The instant of a whole local hour in a zone ("2026-11-20", 14, "Europe/Paris" → 13:00 UTC). */
export function zonedInstant(day: string, hour: number, timezone: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, hour);
  let guess = target;
  for (let i = 0; i < 3; i++) guess += target - wallClock(guess, timezone);
  return new Date(guess).toISOString();
}

/** The hours the week view draws: 8:00–21:00, widened to every weekly range and override. */
export function visibleHours(rules: readonly BookingRule[], hours: readonly CalendarHour[]): number[] {
  let first = 8;
  let last = 21;
  for (const r of rules) {
    first = Math.min(first, r.startHour);
    last = Math.max(last, r.endHour);
  }
  for (const h of hours) {
    first = Math.min(first, h.hour);
    last = Math.max(last, h.hour + 1);
  }
  return Array.from({ length: Math.max(last - first, 1) }, (_, i) => first + i);
}
