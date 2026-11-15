import { describe, expect, it } from "vitest";
import {
  addDays,
  clientCancellation,
  bookingsOnDays,
  cellName,
  closureLength,
  databaseCode,
  dayClosed,
  dayHeader,
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
  slotWeek,
  splitBookings,
  toggleTarget,
  validateClosure,
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

describe("hours closed by the other calendar", () => {
  it("shows them as busy elsewhere and opens them with a click", () => {
    const h = { startsAt: "", day: "", hour: 10, weekly: true, override: "blocked" as const };
    expect(hourState(h, false, false, true)).toBe("busy");
    expect(hourState(h, false, false, false)).toBe("blocked");
    expect(toggleTarget("busy")).toBe("open");
  });
});

describe("slotWeek", () => {
  it("lays one week of free slots out by the artist's local day and hour", () => {
    const week = slotWeek(
      ["2026-11-20T09:00:00Z", "2026-11-20T13:00:00Z", "2026-11-17T16:00:00Z", "2026-11-23T09:00:00Z", "2026-11-22T23:30:00Z"],
      "Europe/Paris",
      "2026-11-16",
    );
    expect(week.days).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    // 10:00 to 17:00 Paris time; the Monday after (23rd, 00:30 Paris) is another week.
    expect(week.hours).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(week.free.get("2026-11-20|14")).toBe("2026-11-20T13:00:00Z");
    expect(week.free.has("2026-11-20|11")).toBe(false);
    expect(week.free.size).toBe(3);
  });

  it("has no rows for a week without a free slot", () => {
    expect(slotWeek([], "Europe/Paris", "2026-11-16").hours).toEqual([]);
  });

  it("splits a day column's header", () => {
    expect(dayHeader("2026-11-20", "fr")).toEqual({ weekday: "ven.", date: "20" });
    expect(dayHeader("2026-11-20", "en")).toEqual({ weekday: "Fri", date: "20" });
  });
});

describe("closures (decision 147)", () => {
  const closures = [{ startsOn: "2026-12-20", endsOn: "2026-12-27" }];

  it("reads the periods and the page state from the calendar answer", () => {
    const c = readArtistCalendar({
      page_status: "approved",
      closures: [{ id: "c1", starts_on: "2026-12-20", ends_on: "2026-12-27", note: "Noël", bookings: 2 }, "junk"],
    });
    expect(c?.pageStatus).toBe("approved");
    expect(c?.closures).toEqual([{ id: "c1", startsOn: "2026-12-20", endsOn: "2026-12-27", note: "Noël", bookings: 2 }]);
    expect(readArtistCalendar({ page_status: "other" })?.pageStatus).toBeNull();
    expect(readArtistCalendar({})?.closures).toEqual([]);
  });

  it("knows which days are closed, both ends included", () => {
    expect(dayClosed("2026-12-19", closures)).toBe(false);
    expect(dayClosed("2026-12-20", closures)).toBe(true);
    expect(dayClosed("2026-12-27", closures)).toBe(true);
    expect(dayClosed("2026-12-28", closures)).toBe(false);
    expect(closureLength(closures[0])).toBe(8);
  });

  it("shows a closed day as a holiday, never actionable, an appointment still showing", () => {
    const open = { startsAt: "", day: "", hour: 10, weekly: true, override: null };
    expect(hourState(open, false, false, false, true)).toBe("holiday");
    expect(hourState({ ...open, override: "open" as const }, false, false, false, true)).toBe("holiday");
    expect(hourState(open, true, false, false, true)).toBe("booked");
    expect(hourState(open, false, true, false, true)).toBe("past");
    expect(toggleTarget("holiday")).toBeNull();
  });

  it("reads each booking's creation and the page's handle", () => {
    const c = readArtistCalendar({
      handle: "lea",
      bookings: [
        { id: "b1", starts_at: "s", ends_at: "e", status: "booked", item_id: "i1", thumbnail_path: "u/1.jpg", item_live: true },
        { id: "b2", starts_at: "s", ends_at: "e", status: "booked" },
      ],
    });
    expect(c?.handle).toBe("lea");
    expect(c?.bookings.map((b) => [b.itemId, b.thumbnailPath, b.itemLive])).toEqual([["i1", "u/1.jpg", true], [null, null, false]]);
  });

  it("reads the creation and the place of a client's booking (decision 147 (d))", () => {
    const { bookings } = readMyBookings({
      bookings: [
        {
          id: "b1", starts_at: "s", ends_at: "e", status: "booked", artist_name: "Léa", artist_handle: "lea",
          item_id: "i1", item_live: true, thumbnail_path: "u/1.jpg",
          place: { mode: "exact", label: "12 rue de la Paix, Paris", lat: "48.8687", lng: 2.3314 },
        },
        { id: "b2", starts_at: "s", ends_at: "e", status: "booked", place: { mode: "area" } },
      ],
    });
    expect(bookings[0]).toMatchObject({ itemId: "i1", itemLive: true, thumbnailPath: "u/1.jpg" });
    expect(bookings[0].place).toEqual({ mode: "exact", label: "12 rue de la Paix, Paris", lat: 48.8687, lng: 2.3314 });
    expect(bookings[1]).toMatchObject({ itemId: null, itemLive: false, thumbnailPath: null, place: null });
  });

  it("shortens a client's name for a week cell", () => {
    expect(cellName("Camille Roussel")).toBe("Camille");
    expect(cellName("Maximilienne Dupont")).toBe("Maximilie…");
    expect(cellName(null)).toBe("");
  });

  it("counts the appointments a period would cancel, by the artist's local day", () => {
    const upcoming = [
      { startsAt: "2026-12-19T23:30:00Z" }, // 20 Dec, 00:30 in Paris
      { startsAt: "2026-12-27T10:00:00Z" },
      { startsAt: "2026-12-27T23:30:00Z" }, // 28 Dec in Paris
    ];
    expect(bookingsOnDays(upcoming, "Europe/Paris", "2026-12-20", "2026-12-27")).toBe(2);
    expect(bookingsOnDays(upcoming, "Europe/Paris", "2027-01-01", "2027-01-02")).toBe(0);
  });

  it("checks a period like the database", () => {
    const today = "2026-11-15";
    const ok = { startsOn: "2026-12-20", endsOn: "2026-12-27", note: "" };
    expect(validateClosure(ok, today)).toBeNull();
    expect(validateClosure({ ...ok, startsOn: "" }, today)).toBe("dates");
    expect(validateClosure({ ...ok, startsOn: "2026-11-14" }, today)).toBe("past");
    expect(validateClosure({ ...ok, endsOn: "2026-12-19" }, today)).toBe("order");
    expect(validateClosure({ ...ok, endsOn: "2027-11-17" }, today)).toBe("tooFar");
    expect(validateClosure({ ...ok, note: "x".repeat(81) }, today)).toBe("note");
    expect(validateClosure({ startsOn: today, endsOn: today, note: "  " }, today)).toBeNull();
  });
});
