"use client";

import { supabase } from "./supabase/client";
import { supabaseUrl } from "./supabase/env";
import { functionErrorCode, readFunctionFailure } from "./supabase/functionError";
import {
  addDays,
  type ArtistCalendar,
  type BookingError,
  type BookingInfo,
  type BookingRule,
  type BookingSettings,
  type ClientBooking,
  databaseCode,
  readArtistCalendar,
  readBookingError,
  readBookingInfo,
  readMyBookings,
  readSlots,
  type SlotList,
} from "./glowbookBookingMapping";

/**
 * The persistence boundary of the Glowbook bookings (decision 144).
 *
 *   anyone:  glowbook_booking_info / glowbook_booking_slots (free hours only)
 *   member:  the Edge Function `glowbook-booking` (their JWT + Turnstile) books;
 *            my_glowbook_bookings, glowbook_cancel_booking
 *   artist:  glowbook_artist_calendar, glowbook_save_booking_settings,
 *            glowbook_set_calendar_hours, glowbook_cancel_booking (reason),
 *            glowbook_mark_booking, glowbook_block_client / glowbook_unblock_client
 *
 * Without Supabase (mock mode) nothing is offered: there is no simulated booking.
 */

export const bookingAvailable = (): boolean => supabase !== null;

/** Before the migration reaches a project the functions do not exist: offer nothing. */
const missing = (code: string | undefined) => code === "PGRST202" || code === "42883";

export async function fetchBookingInfo(handle: string): Promise<BookingInfo | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("glowbook_booking_info", { p_handle: handle });
  if (error) {
    if (missing(error.code)) return null;
    throw new Error("glowbook_booking_info unavailable");
  }
  return readBookingInfo(data);
}

export async function fetchSlots(handle: string, from?: string, to?: string): Promise<SlotList | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("glowbook_booking_slots", { p_handle: handle, p_from: from ?? null, p_to: to ?? null } as never);
  if (error) {
    if (missing(error.code)) return null;
    throw new Error("glowbook_booking_slots unavailable");
  }
  return readSlots(data);
}

export interface BookingRequest {
  handle: string;
  startsAt: string;
  itemId: string | null;
  name: string;
  phone: string;
  comment: string;
  locale: "fr" | "en";
  captcha: string | null;
}

export type BookAnswer = { kind: "booked"; id: string; startsAt: string; timezone: string } | { kind: "error"; error: BookingError };

export async function bookSlot(request: BookingRequest): Promise<BookAnswer> {
  if (!supabase) return { kind: "error", error: "unavailable" };
  const { data, error } = await supabase.functions.invoke("glowbook-booking", {
    body: {
      handle: request.handle,
      starts_at: request.startsAt,
      item_id: request.itemId,
      name: request.name.trim(),
      phone: request.phone.trim(),
      comment: request.comment.trim(),
      locale: request.locale,
      ...(request.captcha ? { captcha: request.captcha } : {}),
    },
  });
  if (error) {
    const failure = await readFunctionFailure(error);
    return { kind: "error", error: failure.kind === "http" ? readBookingError(functionErrorCode(failure.body)) : "unavailable" };
  }
  const row = (data as { booking?: { id?: unknown; starts_at?: unknown; timezone?: unknown } } | null)?.booking;
  if (!row || typeof row.id !== "string") return { kind: "error", error: "unavailable" };
  return { kind: "booked", id: row.id, startsAt: String(row.starts_at), timezone: String(row.timezone) };
}

export async function fetchMyBookings(): Promise<{ bannedUntil: string | null; bookings: ClientBooking[] } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_glowbook_bookings");
  if (error) {
    if (missing(error.code)) return null;
    throw new Error("my_glowbook_bookings unavailable");
  }
  return readMyBookings(data);
}

export type ActionResult = { ok: true } | { ok: false; code: string };

const fail = (message: string | undefined): ActionResult => ({ ok: false, code: databaseCode(message) ?? "unavailable" });

/** The client cancels (no reason), or the artist cancels (reason required). */
export async function cancelBooking(id: string, reason?: string): Promise<ActionResult> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { error } = await supabase.rpc("glowbook_cancel_booking", { p_id: id, p_reason: reason ?? null } as never);
  return error ? fail(error.message) : { ok: true };
}

export async function fetchArtistCalendar(from: string, to: string): Promise<ArtistCalendar | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("glowbook_artist_calendar", { p_from: from, p_to: to });
  if (error) {
    if (missing(error.code)) return null;
    throw new Error("glowbook_artist_calendar unavailable");
  }
  return readArtistCalendar(data);
}

export async function saveBookingSettings(settings: BookingSettings, rules: readonly BookingRule[]): Promise<ActionResult> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { error } = await supabase.rpc("glowbook_save_booking_settings", {
    p_enabled: settings.enabled,
    p_timezone: settings.timezone,
    p_min_notice_hours: settings.minNoticeHours,
    p_horizon_days: settings.horizonDays,
    p_rules: rules.map((r) => ({ weekday: r.weekday, start_hour: r.startHour, end_hour: r.endHour })),
  });
  return error ? fail(error.message) : { ok: true };
}

export async function setCalendarHours(starts: readonly string[], state: "blocked" | "open" | "default"): Promise<ActionResult> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { error } = await supabase.rpc("glowbook_set_calendar_hours", { p_starts: [...starts], p_state: state });
  return error ? fail(error.message) : { ok: true };
}

export async function markBooking(id: string, outcome: "honoured" | "no_show"): Promise<ActionResult> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { error } = await supabase.rpc("glowbook_mark_booking", { p_id: id, p_outcome: outcome });
  return error ? fail(error.message) : { ok: true };
}

export async function blockClient(bookingId: string): Promise<ActionResult> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { error } = await supabase.rpc("glowbook_block_client", { p_booking_id: bookingId });
  return error ? fail(error.message) : { ok: true };
}

export async function unblockClient(blockId: string): Promise<ActionResult> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { error } = await supabase.rpc("glowbook_unblock_client", { p_block_id: blockId });
  return error ? fail(error.message) : { ok: true };
}

/**
 * The artist's appointments around today: those to come (62 days) and the past
 * ones still waiting for an outcome (honoured / no-show can be recorded up to 60
 * days after the hour). Two reads, since one calendar read spans 62 days at most.
 */
export async function fetchArtistAppointments(today: string): Promise<{ upcoming: ArtistCalendar["bookings"]; toMark: ArtistCalendar["bookings"] } | null> {
  const [past, coming] = await Promise.all([fetchArtistCalendar(addDays(today, -60), today), fetchArtistCalendar(today, addDays(today, 61))]);
  if (!past || !coming) return null;
  const now = Date.now();
  const all = new Map([...past.bookings, ...coming.bookings].map((b) => [b.id, b]));
  const list = [...all.values()];
  return {
    upcoming: list.filter((b) => b.status === "booked" && new Date(b.startsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    toMark: list
      .filter((b) => b.status === "booked" && !b.clientErased && new Date(b.startsAt).getTime() <= now && new Date(b.startsAt).getTime() > now - 60 * 86400 * 1000)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}

/* ------------------------------------------------------------ calendar feed (lot 2) */

export interface FeedState {
  active: boolean;
  createdAt: string | null;
}

/** Whether the artist has a private calendar link (never the secret: it is shown once, when created). */
export async function fetchFeedState(): Promise<FeedState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("glowbook_calendar_feed_state");
  if (error) {
    if (missing(error.code)) return null;
    throw new Error("glowbook_calendar_feed_state unavailable");
  }
  const row = (data ?? null) as { active?: unknown; created_at?: unknown } | null;
  return { active: row?.active === true, createdAt: typeof row?.created_at === "string" ? row.created_at : null };
}

/** A new private link; any older one stops working. */
export async function createFeed(): Promise<{ ok: true; url: string } | { ok: false; code: string }> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { data, error } = await supabase.rpc("glowbook_create_calendar_feed");
  if (error || typeof data !== "string") return { ok: false, code: databaseCode(error?.message) ?? "unavailable" };
  return { ok: true, url: feedUrl(data) };
}

export async function disableFeed(): Promise<ActionResult> {
  if (!supabase) return { ok: false, code: "unavailable" };
  const { error } = await supabase.rpc("glowbook_disable_calendar_feed");
  return error ? fail(error.message) : { ok: true };
}

/** The feed's https address (the Edge Function); calendar apps also take it as webcal://. */
export function feedUrl(token: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/glowbook-calendar-feed?token=${token}`;
}
