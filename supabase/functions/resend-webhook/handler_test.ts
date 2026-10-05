import { assertEquals } from "jsr:@std/assert@1";
import { type AppliedEvent, type CardStatus, handleResendWebhook, type WebhookDeps } from "./handler.ts";
import { sign, TEST_SECRET } from "../_shared/svix_testing.ts";

const NOW = new Date("2026-10-05T12:00:00Z");
const TS = Math.floor(NOW.getTime() / 1000);

function makeDeps(applied: Partial<AppliedEvent> | Error = {}, overrides: Partial<WebhookDeps> = {}) {
  const applyCalls: Array<[string, string]> = [];
  const cardCalls: Array<[string, string]> = [];
  const logs: unknown[] = [];
  const deps: WebhookDeps = {
    secret: TEST_SECRET,
    now: () => NOW,
    applyEvent: (id, status) => {
      applyCalls.push([id, status]);
      if (applied instanceof Error) return Promise.reject(applied);
      return Promise.resolve({ matched: true, applied: true, template: "order_confirmation", giftCardId: null, status, ...applied });
    },
    recordGiftCard: (card, status: CardStatus) => {
      cardCalls.push([card, status]);
      return Promise.resolve();
    },
    log: (message, detail) => logs.push([message, detail]),
    ...overrides,
  };
  return { deps, applyCalls, cardCalls, logs };
}

async function request(payload: unknown, opts: { signed?: boolean; id?: string; method?: string } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const id = opts.id ?? "msg_1";
  const headers: Record<string, string> = { "svix-id": id, "svix-timestamp": String(TS) };
  if (opts.signed !== false) headers["svix-signature"] = await sign(body, id, TS);
  else headers["svix-signature"] = "v1,AAAA";
  return new Request("https://x.test/functions/v1/resend-webhook", { method: opts.method ?? "POST", headers, body: opts.method === "GET" ? undefined : body });
}

const event = (type: string, emailId = "re_123") => ({ type, created_at: "2026-10-05T11:59:00Z", data: { email_id: emailId, to: ["visitor@example.com"], subject: "Secret subject" } });

Deno.test("an unsigned or wrongly signed request is refused before anything is read", async () => {
  const { deps, applyCalls } = makeDeps();
  const res = await handleResendWebhook(await request(event("email.delivered"), { signed: false }), deps);
  assertEquals(res.status, 401);
  assertEquals(applyCalls.length, 0);
  const missing = await handleResendWebhook(new Request("https://x.test", { method: "POST", body: "{}" }), deps);
  assertEquals(missing.status, 401);
});

Deno.test("an unset secret is a server error, never an open door", async () => {
  const { deps, applyCalls } = makeDeps({}, { secret: undefined });
  assertEquals((await handleResendWebhook(await request(event("email.delivered")), deps)).status, 500);
  assertEquals(applyCalls.length, 0);
});

Deno.test("POST only", async () => {
  const { deps } = makeDeps();
  assertEquals((await handleResendWebhook(await request({}, { method: "GET" }), deps)).status, 405);
});

Deno.test("each delivery event is mapped to its status", async () => {
  for (const [type, status] of [["email.delivered", "delivered"], ["email.opened", "opened"], ["email.bounced", "bounced"], ["email.complained", "complained"]]) {
    const { deps, applyCalls } = makeDeps();
    const res = await handleResendWebhook(await request(event(type, "re_9")), deps);
    assertEquals(res.status, 200, type);
    assertEquals(applyCalls, [["re_9", status]]);
  }
});

Deno.test("other event types are acknowledged and ignored", async () => {
  for (const type of ["email.sent", "email.delivery_delayed", "email.clicked", "contact.created", "__proto__"]) {
    const { deps, applyCalls } = makeDeps();
    const res = await handleResendWebhook(await request(event(type)), deps);
    assertEquals(res.status, 200);
    assertEquals((await res.json()).ignored, true);
    assertEquals(applyCalls.length, 0);
  }
});

Deno.test("an e-mail that is not in the log (an Auth e-mail) is acknowledged, not retried", async () => {
  const { deps, cardCalls } = makeDeps({ matched: false, applied: false });
  const res = await handleResendWebhook(await request(event("email.delivered")), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, matched: false });
  assertEquals(cardCalls.length, 0);
});

Deno.test("a gift card e-mail brings the card to delivered / opened / bounced", async () => {
  for (const status of ["delivered", "opened", "bounced"]) {
    const { deps, cardCalls } = makeDeps({ giftCardId: "card-1" });
    await handleResendWebhook(await request(event(`email.${status}`)), deps);
    assertEquals(cardCalls, [["card-1", status]]);
  }
});

Deno.test("a complaint has no card status; a replay heals the card from the log's status", async () => {
  const complaint = makeDeps({ giftCardId: "card-1" });
  await handleResendWebhook(await request(event("email.complained")), complaint.deps);
  assertEquals(complaint.cardCalls.length, 0);

  // Replay of an old 'delivered' while the log already says 'opened': the card gets 'opened', never a regression.
  const replay = makeDeps({ giftCardId: "card-1", applied: false, status: "opened" });
  const res = await handleResendWebhook(await request(event("email.delivered")), replay.deps);
  assertEquals((await res.json()).applied, false);
  assertEquals(replay.cardCalls, [["card-1", "opened"]]);
});

Deno.test("an e-mail without a gift card never touches cards", async () => {
  const { deps, cardCalls } = makeDeps({ giftCardId: null });
  await handleResendWebhook(await request(event("email.bounced")), deps);
  assertEquals(cardCalls.length, 0);
});

Deno.test("database failures answer 500 so Svix retries, without provider data in the log", async () => {
  const failing = makeDeps(new Error("db down"));
  assertEquals((await handleResendWebhook(await request(event("email.delivered")), failing.deps)).status, 500);
  const cardFails = makeDeps({ giftCardId: "card-1" }, {
    recordGiftCard: () => Promise.reject(new Error("card update failed")),
  });
  assertEquals((await handleResendWebhook(await request(event("email.delivered")), cardFails.deps)).status, 500);
  for (const { logs } of [failing, cardFails]) {
    const text = JSON.stringify(logs);
    assertEquals(text.includes("visitor@example.com"), false);
    assertEquals(text.includes("Secret subject"), false);
  }
});

Deno.test("malformed payloads of a valid signature are refused", async () => {
  for (const payload of ["{not json", { type: "email.delivered", data: {} }, { type: "email.delivered", data: { email_id: 5 } }, { type: "email.delivered", data: { email_id: "x".repeat(101) } }]) {
    const { deps, applyCalls } = makeDeps();
    const res = await handleResendWebhook(await request(payload), deps);
    assertEquals(res.status, 400);
    assertEquals(applyCalls.length, 0);
  }
});

Deno.test("only bounces and complaints are logged, and only the template", async () => {
  const bounce = makeDeps({ template: "newsletter_confirmation" });
  await handleResendWebhook(await request(event("email.bounced")), bounce.deps);
  assertEquals(bounce.logs, [["e-mail bounced", { template: "newsletter_confirmation" }]]);
  const opened = makeDeps();
  await handleResendWebhook(await request(event("email.opened")), opened.deps);
  assertEquals(opened.logs.length, 0);
});
