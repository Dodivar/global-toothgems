import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { type CalendarFeedDeps, type Feed, feedBody, handleCalendarFeed, mapFeed } from "./handler.ts";

const TOKEN = "a".repeat(64);
const SITE = "https://globaltoothgems.com";

const FEED: Feed = {
  artistName: "Léa Gems",
  timezone: "Europe/Paris",
  events: [
    {
      id: "b-1", startsAt: "2026-11-20T13:00:00Z", endsAt: "2026-11-20T14:00:00Z", status: "booked", designKind: "custom",
      creationName: null, clientName: "Sam Client", clientPhone: "+33 6 00 00 00 00", clientEmail: "sam@example.com",
      comment: "Une étoile, côté gauche", cancelReason: null, updatedAt: "2026-11-14T10:00:00Z",
    },
    {
      id: "b-2", startsAt: "2026-11-21T09:00:00Z", endsAt: "2026-11-21T10:00:00Z", status: "cancelled_artist", designKind: "creation",
      creationName: "Aurora", clientName: "Kim", clientPhone: null, clientEmail: null, comment: null, cancelReason: "Absente",
      updatedAt: "2026-11-14T11:00:00Z",
    },
  ],
};

function deps(overrides: Partial<CalendarFeedDeps> = {}): CalendarFeedDeps {
  return {
    siteUrl: SITE,
    log: () => {},
    ipAllowed: () => Promise.resolve(true),
    feed: (token) => Promise.resolve(token === TOKEN ? FEED : null),
    ...overrides,
  };
}

Deno.test("a valid link answers the artist's appointments as an iCalendar feed", async () => {
  const res = await handleCalendarFeed(new Request(`https://fn.example/glowbook-calendar-feed?token=${TOKEN}`), deps());
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/calendar; charset=utf-8");
  assertEquals(res.headers.get("cache-control"), "private, no-store");
  const body = await res.text();
  assertStringIncludes(body, "BEGIN:VCALENDAR\r\n");
  assertStringIncludes(body, "X-WR-CALNAME:Glowbook — Léa Gems\r\n");
  assertStringIncludes(body, "UID:b-1@glowbook.globaltoothgems\r\n");
  assertStringIncludes(body, "DTSTART:20261120T130000Z\r\n");
  assertStringIncludes(body, "SUMMARY:Tooth gem — Sam Client\r\n");
  assertStringIncludes(body, "STATUS:CANCELLED\r\n");
  assertStringIncludes(body, "SUMMARY:[Annulé] Tooth gem — Kim\r\n");
  for (const line of body.split("\r\n")) assert(new TextEncoder().encode(line).length <= 75, line);
});

Deno.test("an unknown, malformed or missing token is a plain 404", async () => {
  for (const q of ["?token=" + "b".repeat(64), "?token=nope", ""]) {
    const res = await handleCalendarFeed(new Request(`https://fn.example/glowbook-calendar-feed${q}`), deps());
    assertEquals(res.status, 404, q);
    assertEquals(await res.text(), "Not found");
  }
});

Deno.test("too many requests from one address, wrong method, failure", async () => {
  const limited = await handleCalendarFeed(
    new Request(`https://fn.example/x?token=${TOKEN}`, { headers: { "sb-forwarded-for": "203.0.113.4" } }),
    deps({ ipAllowed: () => Promise.resolve(false) }),
  );
  assertEquals(limited.status, 429);
  assertEquals((await handleCalendarFeed(new Request(`https://fn.example/x?token=${TOKEN}`, { method: "POST" }), deps())).status, 405);
  const broken = await handleCalendarFeed(new Request(`https://fn.example/x?token=${TOKEN}`), deps({ feed: () => Promise.reject(new Error("db")) }));
  assertEquals(broken.status, 503);
  assertEquals(await broken.text(), "Unavailable");
  const head = await handleCalendarFeed(new Request(`https://fn.example/x?token=${TOKEN}`, { method: "HEAD" }), deps());
  assertEquals(head.status, 200);
});

Deno.test("an empty calendar is still a valid feed; rows map", () => {
  const body = feedBody({ artistName: "X", timezone: "Europe/Paris", events: [] }, SITE, "2026-11-14T10:00:00Z");
  assertStringIncludes(body, "BEGIN:VCALENDAR");
  assert(!body.includes("BEGIN:VEVENT"));
  const mapped = mapFeed({ artist_name: "A", timezone: "Europe/Paris", events: [{ id: "x", starts_at: "s", ends_at: "e", status: "booked", design_kind: "custom", updated_at: "u" }] });
  assertEquals(mapped?.events[0].designKind, "custom");
  assertEquals(mapFeed(null), null);
});
