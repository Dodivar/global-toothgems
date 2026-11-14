import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  bookingAttachment,
  bookingContent,
  bookingDate,
  bookingVariables,
  buildIcs,
  mapBookingMail,
  type PendingBookingMail,
  sendGlowbookBookingEmails,
} from "./glowbookBookingEmails.ts";
import type { EmailDeps, EmailStore } from "./send.ts";

const SITE = "https://globaltoothgems.com";

const mail = (extra: Partial<PendingBookingMail> = {}): PendingBookingMail => ({
  kind: "new",
  eventKey: "glowbook_booking_new:b-1",
  bookingId: "b-1",
  email: "artist@example.com",
  locale: "fr",
  replyTo: "client@example.com",
  artistName: "Léa Gems",
  artistHandle: "lea.gems",
  clientName: "Sam Client",
  clientEmail: "client@example.com",
  clientPhone: "+33 6 00 00 00 00",
  clientErased: false,
  startsAt: "2026-11-20T13:00:00Z",
  endsAt: "2026-11-20T14:00:00Z",
  timezone: "Europe/Paris",
  designKind: "custom",
  creationName: null,
  comment: "Une étoile sur l'incisive",
  cancelReason: null,
  lateCancel: false,
  ...extra,
});

Deno.test("the date is written in the booking's own time zone", () => {
  assertEquals(bookingDate("2026-11-20T13:00:00Z", "Europe/Paris", "fr"), "vendredi 20 novembre 2026 à 14:00 (heure de Paris)");
  assertStringIncludes(bookingDate("2026-11-20T13:00:00Z", "Europe/London", "en"), "13:00");
  // An unknown zone falls back to Paris rather than failing the e-mail.
  assertStringIncludes(bookingDate("2026-11-20T13:00:00Z", "Mars/Olympus", "fr"), "14:00");
});

Deno.test("the artist's e-mail carries the client's contact details; the client's never the artist's address", () => {
  const artist = bookingContent(mail(), "fr", SITE).blocks!.map((b) => b.text).join("\n");
  for (const v of ["Sam Client", "client@example.com", "+33 6 00 00 00 00", "Création personnalisée", "Une étoile"]) assertStringIncludes(artist, v);
  const client = bookingContent(mail({ kind: "confirmed", email: "client@example.com", replyTo: null }), "fr", SITE);
  const text = client.blocks!.map((b) => b.text).join("\n");
  assertStringIncludes(text, "Léa Gems");
  assert(!text.includes("artist@example.com"));
  assertEquals(client.primaryAction?.url, `${SITE}/compte/rendez-vous`);
});

Deno.test("cancellations: the artist's reason reaches the client with a link to book again; an erased client is named as such", () => {
  const c = bookingContent(mail({ kind: "cancel_artist", cancelReason: "Absente ce jour-là" }), "fr", SITE);
  assertStringIncludes(c.blocks!.map((b) => b.text).join("\n"), "Absente ce jour-là");
  assertEquals(c.primaryAction?.url, `${SITE}/fr/glowbook/lea.gems`);
  const gone = bookingContent(mail({ kind: "cancel_client", clientErased: true, clientName: null, comment: null }), "en", SITE);
  const text = gone.blocks!.map((b) => b.text).join("\n");
  assertStringIncludes(text, "deleted their account");
  assert(!text.includes("Sam Client"));
  assertEquals(bookingVariables(mail({ clientName: null }), "en").client_name, "A client");
});

Deno.test("the calendar file is a valid one-hour event in UTC", () => {
  const ics = buildIcs({ uid: "b-1@x", startsAt: "2026-11-20T13:00:00Z", endsAt: "2026-11-20T14:00:00Z", summary: "RDV; test, ok", description: "Ligne 1\nLigne 2", stamp: "2026-11-14T10:00:00Z" });
  assertStringIncludes(ics, "DTSTART:20261120T130000Z\r\n");
  assertStringIncludes(ics, "DTEND:20261120T140000Z\r\n");
  assertStringIncludes(ics, "SUMMARY:RDV\\; test\\, ok\r\n");
  assertStringIncludes(ics, "DESCRIPTION:Ligne 1\\nLigne 2\r\n");
  for (const line of ics.split("\r\n")) assert(new TextEncoder().encode(line).length <= 75, line);
  const file = bookingAttachment(mail(), SITE);
  assertEquals(file.filename, "rendez-vous.ics");
  const decoded = new TextDecoder().decode(Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0)));
  assertStringIncludes(decoded, "Sam Client");
});

Deno.test("rows map, unknown kinds are dropped", () => {
  assertEquals(mapBookingMail({ kind: "nope", email: "a@b.c", event_key: "x" }), null);
  const m = mapBookingMail({ kind: "reminder", event_key: "glowbook_booking_reminder:b", booking_id: "b", email: "a@b.co", locale: "en",
    starts_at: "2026-11-20T13:00:00Z", ends_at: "2026-11-20T14:00:00Z", design_kind: "creation", creation_name: "Aurora" });
  assertEquals(m?.kind, "reminder");
  assertEquals(m?.designKind, "creation");
});

Deno.test("the sweep sends each pending e-mail once, with the reply-to and the calendar file", async () => {
  const claimed: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const store: EmailStore = {
    loadTemplate: (key: string) =>
      Promise.resolve({ key, locale: "fr", subject: "Rendez-vous le {{date}}", preheader: "", body: "Bonjour {{client_name}} et {{artist_name}}", variables: ["artist_name", "client_name", "date"] }),
    claim: (entry: { eventKey: string }) => {
      claimed.push(entry.eventKey);
      return Promise.resolve({ claimed: true, attempt: 1 });
    },
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  } as unknown as EmailStore;
  const deps = {
    store,
    resend: {
      apiKey: "re_test",
      fetch: (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return Promise.resolve(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
      },
    },
    from: "Global Toothgems <no-reply@example.com>",
    layout: { brandName: "Global Toothgems", siteUrl: SITE },
  } as unknown as EmailDeps;
  const source = { pending: () => Promise.resolve([mail(), mail({ kind: "reminder", eventKey: "glowbook_booking_reminder:b-1", email: "client@example.com", replyTo: null })]) };
  const report = await sendGlowbookBookingEmails(deps, source);
  assertEquals(report, { examined: 2, sent: 2, skipped: 0, failed: 0 });
  assertEquals(claimed, ["glowbook_booking_new:b-1", "glowbook_booking_reminder:b-1"]);
  assertEquals(JSON.stringify(bodies[0]).includes("client@example.com"), true);
  assertEquals((bodies[0].attachments as unknown[] | undefined)?.length, 1);
  assertEquals(bodies[1].attachments, undefined);
});
