import { assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { type BookInput, bookingRefusal, type GlowbookBookingDeps, handleGlowbookBooking, parseBooking } from "./handler.ts";

const SITE = "https://global-toothgems.example";
const JWT = "member.jwt.sig";
const ITEM = "11111111-2222-4333-8444-555555555555";

function fake(overrides: Partial<GlowbookBookingDeps> = {}) {
  const calls = { booked: [] as BookInput[], notified: [] as string[], captcha: 0 };
  const deps: GlowbookBookingDeps = {
    origins: readSiteOrigins(SITE, undefined),
    captchaConfigured: false,
    verifyCaptcha: () => {
      calls.captcha++;
      return Promise.resolve(true);
    },
    ipAllowed: () => Promise.resolve(true),
    userFromToken: (token) => Promise.resolve(token === JWT ? "member-1" : null),
    book: (input) => {
      calls.booked.push(input);
      return Promise.resolve({ id: "b-1", startsAt: input.startsAt, endsAt: "2026-11-20T14:00:00.000Z", timezone: "Europe/Paris" });
    },
    notify: (id) => {
      calls.notified.push(id);
      return Promise.resolve();
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

const body = (extra: Record<string, unknown> = {}) => ({
  handle: "Lea.Gems",
  starts_at: "2026-11-20T13:00:00Z",
  item_id: ITEM,
  name: "Léa Martin",
  phone: "+33 6 12 34 56 78",
  comment: "",
  locale: "fr",
  ...extra,
});

const post = (payload: unknown, auth = true) =>
  new Request("https://fn.example/glowbook-booking", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", ...(auth ? { authorization: `Bearer ${JWT}` } : {}) },
    body: JSON.stringify(payload),
  });

Deno.test("a member books: the slot is passed on normalised, then the e-mails leave", async () => {
  const { deps, calls } = fake();
  const res = await handleGlowbookBooking(post(body()), deps);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).booking.id, "b-1");
  assertEquals(calls.booked[0], {
    clientId: "member-1",
    handle: "lea.gems",
    startsAt: "2026-11-20T13:00:00.000Z",
    itemId: ITEM,
    name: "Léa Martin",
    phone: "+33 6 12 34 56 78",
    comment: null,
    locale: "fr",
  });
  assertEquals(calls.notified, ["b-1"]);
});

Deno.test("a visitor without a session is asked to sign in, nothing is booked", async () => {
  const { deps, calls } = fake();
  const res = await handleGlowbookBooking(post(body(), false), deps);
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "sign_in_required");
  assertEquals(calls.booked.length, 0);
});

Deno.test("an expired token, a filled honeypot and bad fields are refused", async () => {
  const expired = fake({ userFromToken: () => Promise.resolve(null) });
  assertEquals((await handleGlowbookBooking(post(body()), expired.deps)).status, 401);
  const { deps, calls } = fake();
  assertEquals((await handleGlowbookBooking(post(body({ website: "x" })), deps)).status, 400);
  for (const bad of [{ phone: "abc" }, { name: "" }, { handle: "x" }, { starts_at: "tomorrow" }, { item_id: "nope" }, { comment: "a".repeat(1001) }]) {
    assertEquals((await handleGlowbookBooking(post(body(bad)), deps)).status, 400, JSON.stringify(bad));
  }
  assertEquals(calls.booked.length, 0);
});

Deno.test("the captcha is required once configured, and checked", async () => {
  const { deps, calls } = fake({ captchaConfigured: true });
  const missing = await handleGlowbookBooking(post(body()), deps);
  assertEquals((await missing.json()).error, "captcha_required");
  const failed = fake({ captchaConfigured: true, verifyCaptcha: () => Promise.resolve(false) });
  assertEquals((await (await handleGlowbookBooking(post(body({ captcha: "t" })), failed.deps)).json()).error, "captcha_failed");
  assertEquals((await handleGlowbookBooking(post(body({ captcha: "t" })), deps)).status, 200);
  assertEquals(calls.captcha, 1);
});

Deno.test("too many requests from one address", async () => {
  const { deps } = fake({ ipAllowed: () => Promise.resolve(false) });
  const req = new Request("https://fn.example/glowbook-booking", {
    method: "POST",
    headers: { origin: SITE, authorization: `Bearer ${JWT}`, "sb-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body()),
  });
  assertEquals((await handleGlowbookBooking(req, deps)).status, 429);
});

Deno.test("database refusals become short codes, SQL text never leaves", async () => {
  assertEquals(bookingRefusal({ code: "23514", message: "glowbook_booking: slot_taken" }), { code: "slot_taken", status: 409 });
  assertEquals(bookingRefusal({ code: "23514", message: "glowbook_booking: banned" }), { code: "banned", status: 409 });
  assertEquals(bookingRefusal({ code: "23514", message: "some constraint" }), { code: "refused", status: 409 });
  assertEquals(bookingRefusal({ code: "42501", message: "glowbook_booking: email_unconfirmed" }), { code: "email_unconfirmed", status: 403 });
  assertEquals(bookingRefusal({ code: "XX000", message: "boom" }), { code: "server_error", status: 500 });
  const { deps, calls } = fake({ book: () => Promise.resolve({ error: { code: "23514", message: "glowbook_booking: slot_taken" } }) });
  const res = await handleGlowbookBooking(post(body()), deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "slot_taken" });
  assertEquals(calls.notified.length, 0);
});

Deno.test("a failed e-mail does not undo the booking", async () => {
  const { deps } = fake({ notify: () => Promise.reject(new Error("resend down")) });
  assertEquals((await handleGlowbookBooking(post(body()), deps)).status, 200);
});

Deno.test("parseBooking keeps a custom design's comment and drops an empty item", () => {
  assertEquals(parseBooking(body({ item_id: null, comment: "  Une étoile  " }))?.comment, "Une étoile");
  assertEquals(parseBooking(body({ item_id: null }))?.itemId, null);
  assertEquals(parseBooking(body({ locale: "de" }))?.locale, "fr");
});

Deno.test("CORS preflight and wrong methods", async () => {
  const { deps } = fake();
  assertEquals((await handleGlowbookBooking(new Request("https://fn.example/x", { method: "OPTIONS", headers: { origin: SITE } }), deps)).status, 204);
  assertEquals((await handleGlowbookBooking(new Request("https://fn.example/x", { method: "GET" }), deps)).status, 405);
});
