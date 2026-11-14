import { describe, expect, it } from "vitest";
import {
  addDays,
  clientCancellation,
  databaseCode,
  defaultWeek,
  formatHour,
  groupSlotsByDay,
  hourState,
  localDay,
  localHour,
  readArtistCalendar,
  readBookingError,
  readMyBookings,
  readSlots,
  rulesToWeek,
  splitBookings,
  toggleTarget,
  validateDraft,
  validateWeek,
  weekStart,
  weekToRules,
} from "./glowbookBookingMapping";

describe("slots", () => {
  it("reads the database answer and refuses anything else", () => {
    expect(readSlots(null)).toBeNull();
    expect(readSlots({ slots: [] })).toBeNull();
    const s = readSlots({ timezone: "Europe/Paris", min_notice_hours: 24, horizon_days: 56, from: "2026-11-14", to: "2026-11-27", slots: ["2026-11-20T13:00:00+00:00", 5] });
    expect(s?.slots).toEqual(["2026-11-20T13:00:00+00:00"]);
    expect(s?.horizonDays).toBe(56);
  });

  it("groups by the artist's local day, not the viewer's", () => {
    // 23:00 UTC on the 20th is already the 21st in Paris.
    const days = groupSlotsByDay(["2026-11-20T23:00:00Z", "2026-11-20T09:00:00Z", "2026-11-21T09:00:00Z"], "Europe/Paris");
    expect(days.map((d) => d.day)).toEqual(["2026-11-20", "2026-11-21"]);
    expect(days[1].slots).toEqual(["2026-11-20T23:00:00Z", "2026-11-21T09:00:00Z"]);
    expect(localHour("2026-11-20T23:00:00Z", "Europe/Paris")).toBe(0);
    expect(formatHour("2026-11-20T13:00:00Z", "Europe/Paris", "fr")).toBe("14:00");
    expect(localDay("2026-11-20T13:00:00Z", "Not/AZone")).toBe("2026-11-20");
  });
});

describe("dates", () => {
  it("moves across months and finds the Monday", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // a Sunday
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
  });
});

describe("weekly hours", () => {
  it("round-trips rules and checks them", () => {
    const week = rulesToWeek([
      { weekday: 2, startHour: 14, endHour: 19 },
      { weekday: 2, startHour: 10, endHour: 13 },
    ]);
    expect(week[2]).toEqual([
      { start: 10, end: 13 },
      { start: 14, end: 19 },
    ]);
    expect(weekToRules(week)).toHaveLength(2);
    expect(validateWeek(week)).toBeNull();
    expect(validateWeek({ ...week, 3: [{ start: 12, end: 10 }] })).toBe("order");
    expect(validateWeek({ ...week, 3: [{ start: 10, end: 13 }, { start: 12, end: 15 }] })).toBe("overlap");
    expect(validateWeek(defaultWeek())).toBeNull();
  });
});

describe("the artist's week view", () => {
  it("decides what an hour shows and what a click does", () => {
    expect(hourState(undefined, false, false)).toBe("closed");
    expect(hourState({ startsAt: "", day: "", hour: 10, weekly: true, override: null }, false, false)).toBe("open");
    expect(hourState({ startsAt: "", day: "", hour: 10, weekly: true, override: "blocked" }, false, false)).toBe("blocked");
    expect(hourState({ startsAt: "", day: "", hour: 10, weekly: false, override: "open" }, false, false)).toBe("extra");
    expect(hourState(undefined, true, false)).toBe("booked");
    expect(toggleTarget("open")).toBe("blocked");
    expect(toggleTarget("closed")).toBe("open");
    expect(toggleTarget("extra")).toBe("default");
    expect(toggleTarget("booked")).toBeNull();
  });

  it("reads the calendar without the client's account", () => {
    const c = readArtistCalendar({
      switch_on: true,
      open: false,
      settings: { enabled: true, timezone: "Europe/Paris", min_notice_hours: 24, horizon_days: 56 },
      rules: [{ weekday: 2, start_hour: 10, end_hour: 13 }],
      hours: [{ starts_at: "2026-11-17T09:00:00Z", day: "2026-11-17", hour: 10, weekly: true, override: null }],
      bookings: [{ id: "b", starts_at: "2026-11-17T09:00:00Z", ends_at: "2026-11-17T10:00:00Z", status: "booked", design_kind: "custom", client_name: "Sam" }],
      upcoming: [],
      blocks: [{ id: "k", client_name: "X", created_at: "2026-11-01" }],
    });
    expect(c?.settings?.enabled).toBe(true);
    expect(c?.bookings[0].designKind).toBe("custom");
    expect(c?.bookings[0]).not.toHaveProperty("clientId");
    expect(c?.blocks).toHaveLength(1);
  });
});

describe("the booking form", () => {
  const ok = { slot: "x", itemId: "i", custom: false, name: "Léa", phone: "+33 6 12 34 56 78", comment: "" };
  it("asks for a slot, a design, a name and a phone; a custom design needs a comment", () => {
    expect(validateDraft(ok)).toBeNull();
    expect(validateDraft({ ...ok, slot: null })).toBe("slot");
    expect(validateDraft({ ...ok, itemId: null })).toBe("design");
    expect(validateDraft({ ...ok, phone: "12" })).toBe("phone");
    expect(validateDraft({ ...ok, itemId: null, custom: true })).toBe("comment");
    expect(validateDraft({ ...ok, itemId: null, custom: true, comment: "Une étoile" })).toBeNull();
    expect(validateDraft({ ...ok, comment: "a".repeat(1001) })).toBe("commentLength");
  });

  it("maps error codes", () => {
    expect(readBookingError("slot_taken")).toBe("slot_taken");
    expect(readBookingError("boom")).toBe("unavailable");
    expect(databaseCode("glowbook_booking: reason_required")).toBe("reason_required");
    expect(databaseCode("other")).toBeNull();
  });
});

describe("the client's appointments", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  it("cancels freely until 24 h before, late afterwards, never after the hour", () => {
    expect(clientCancellation({ status: "booked", startsAt: "2026-11-16T10:00:00Z" }, now)).toEqual({ allowed: true, late: false });
    expect(clientCancellation({ status: "booked", startsAt: "2026-11-14T20:00:00Z" }, now)).toEqual({ allowed: true, late: true });
    expect(clientCancellation({ status: "booked", startsAt: "2026-11-14T09:00:00Z" }, now).allowed).toBe(false);
    expect(clientCancellation({ status: "cancelled_artist", startsAt: "2026-11-16T10:00:00Z" }, now).allowed).toBe(false);
  });

  it("reads them and splits upcoming from past", () => {
    const { bookings, bannedUntil } = readMyBookings({
      banned_until: null,
      bookings: [
        { id: "a", starts_at: "2026-11-20T10:00:00Z", status: "booked", artist_name: "Léa" },
        { id: "b", starts_at: "2026-11-16T10:00:00Z", status: "booked", artist_name: "Léa" },
        { id: "c", starts_at: "2026-11-01T10:00:00Z", status: "honoured", artist_name: "Léa" },
      ],
    });
    expect(bannedUntil).toBeNull();
    const split = splitBookings(bookings, now);
    expect(split.upcoming.map((b) => b.id)).toEqual(["b", "a"]);
    expect(split.past.map((b) => b.id)).toEqual(["c"]);
  });
});

describe("local hours as instants", () => {
  it("finds the instant of a local hour, summer and winter", async () => {
    const { zonedInstant, visibleHours } = await import("./glowbookBookingMapping");
    expect(zonedInstant("2026-11-20", 14, "Europe/Paris")).toBe("2026-11-20T13:00:00.000Z");
    expect(zonedInstant("2026-07-01", 9, "Europe/Paris")).toBe("2026-07-01T07:00:00.000Z");
    expect(zonedInstant("2026-11-20", 0, "Indian/Reunion")).toBe("2026-11-19T20:00:00.000Z");
    expect(visibleHours([{ weekday: 1, startHour: 6, endHour: 23 }], [])).toHaveLength(17);
    expect(visibleHours([], [])[0]).toBe(8);
  });
});
