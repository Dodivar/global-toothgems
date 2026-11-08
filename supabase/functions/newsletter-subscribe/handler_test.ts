import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { confirmationContent, type DirectMethod, handleSubscribe, type SubscribeDeps, type Subscription } from "./handler.ts";
import type { SendRequest } from "../_shared/email/send.ts";

const SITE = "https://globaltoothgems.com";
const PREVIEW = "https://preview.globaltoothgems.com";
const TOKEN = "ab".repeat(24);

function makeDeps(overrides: Partial<SubscribeDeps> = {}) {
  const sent: SendRequest[] = [];
  const subscribed: Subscription[] = [];
  const ips: string[] = [];
  const logs: unknown[] = [];
  const direct: [string, DirectMethod][] = [];
  const captchas: string[] = [];
  const deps: SubscribeDeps = {
    origins: { site: SITE, allowed: new Set([SITE, PREVIEW]) },
    userFromToken: (token) =>
      Promise.resolve(
        token === "member-token"
          ? { id: "u1", email: "Ana@Example.com", emailConfirmed: true }
          : token === "unconfirmed-token"
          ? { id: "u2", email: "ana@example.com", emailConfirmed: false }
          : null,
      ),
    captchaConfigured: false,
    verifyCaptcha: (token) => (captchas.push(token), Promise.resolve(token === "good-token")),
    subscribeDirect: (s, method) => (direct.push([s.email, method]), Promise.resolve({ status: "subscribed" })),
    ipAllowed: (hash) => {
      ips.push(hash);
      return Promise.resolve(true);
    },
    subscribe: (s) => {
      subscribed.push(s);
      return Promise.resolve({ status: "pending", confirmToken: TOKEN });
    },
    sendEmail: (request) => {
      sent.push(request);
      return Promise.resolve({ status: "sent", id: "re_1" });
    },
    log: (m, d) => logs.push([m, d]),
    ...overrides,
  };
  return { deps, sent, subscribed, ips, logs, direct, captchas };
}

const VALID = { email: " Ana@Example.com ", locale: "en", source: "home", policy_version: "2026-10-04", consent: true };

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://x.supabase.co/functions/v1/newsletter-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "sb-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("a valid request subscribes and e-mails the confirmation link with a button", async () => {
  const { deps, sent, subscribed, ips } = makeDeps();
  const res = await handleSubscribe(post(VALID), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "sent" });
  assertEquals(subscribed, [{ email: "ana@example.com", locale: "en", source: "home", policyVersion: "2026-10-04" }]);
  assertEquals(ips.length, 1);
  assertMatch(ips[0], /^[0-9a-f]{64}$/);
  assertEquals(sent.length, 1);
  const mail = sent[0];
  assertEquals(mail.templateKey, "newsletter_confirmation");
  assertEquals(mail.to, "ana@example.com");
  assertEquals(mail.locale, "en");
  assertEquals(mail.variables, { confirm_url: `${SITE}/newsletter/confirmer?token=${TOKEN}` });
  assertMatch(mail.eventKey, /^newsletter_confirmation:[0-9a-f]{32}$/);
  const content = typeof mail.content === "function" ? mail.content("fr") : mail.content;
  assertEquals(content?.primaryAction, { label: "Confirmer mon inscription", url: `${SITE}/newsletter/confirmer?token=${TOKEN}` });
});

Deno.test("the link goes to the allowed origin the form was sent from, else production", async () => {
  const preview = makeDeps();
  await handleSubscribe(post(VALID, { Origin: PREVIEW }), preview.deps);
  assertEquals(preview.sent[0].variables.confirm_url, `${PREVIEW}/newsletter/confirmer?token=${TOKEN}`);
  const other = makeDeps();
  await handleSubscribe(post(VALID, { Origin: "https://evil.example" }), other.deps);
  assertEquals(other.sent[0].variables.confirm_url, `${SITE}/newsletter/confirmer?token=${TOKEN}`);
});

Deno.test("already on the list (or bounced): same answer, no e-mail", async () => {
  for (const status of ["subscribed", "bounced", "complained"]) {
    const { deps, sent } = makeDeps({ subscribe: () => Promise.resolve({ status, confirmToken: null }) });
    const res = await handleSubscribe(post(VALID), deps);
    assertEquals([res.status, await res.json()], [200, { status: "sent" }]);
    assertEquals(sent.length, 0);
  }
});

Deno.test("invalid requests are refused before the database", async () => {
  const cases: unknown[] = [
    "not json",
    { ...VALID, consent: false },
    { ...VALID, consent: "true" },
    { ...VALID, email: "nope" },
    { ...VALID, source: "checkout" },
    { ...VALID, policy_version: "" },
    { ...VALID, policy_version: "<script>" },
  ];
  for (const body of cases) {
    const { deps, subscribed } = makeDeps();
    const res = await handleSubscribe(post(body), deps);
    assertEquals([res.status, await res.json()], [400, { error: "invalid_request" }], JSON.stringify(body));
    assertEquals(subscribed.length, 0);
  }
});

Deno.test("the honeypot is answered as a success and does nothing", async () => {
  const { deps, subscribed, sent } = makeDeps();
  const res = await handleSubscribe(post({ ...VALID, website: "http://spam" }), deps);
  assertEquals([res.status, await res.json()], [200, { status: "sent" }]);
  assertEquals([subscribed.length, sent.length], [0, 0]);
});

Deno.test("throttled by caller address, then by e-mail in the database", async () => {
  const ip = makeDeps({ ipAllowed: () => Promise.resolve(false) });
  const res = await handleSubscribe(post(VALID), ip.deps);
  assertEquals([res.status, await res.json()], [429, { error: "rate_limited" }]);
  assertEquals(ip.subscribed.length, 0);

  const db = makeDeps({ subscribe: () => Promise.resolve({ error: { code: "PT429" } }) });
  const res2 = await handleSubscribe(post(VALID), db.deps);
  assertEquals([res2.status, await res2.json()], [429, { error: "rate_limited" }]);
});

Deno.test("a database or e-mail failure is a generic error, never the provider's text", async () => {
  const db = makeDeps({ subscribe: () => Promise.resolve({ error: { code: "XX000", message: "secret detail" } }) });
  const res = await handleSubscribe(post(VALID), db.deps);
  assertEquals([res.status, await res.json()], [500, { error: "server_error" }]);

  const mail = makeDeps({ sendEmail: () => Promise.resolve({ status: "failed", error: "provider says no", retryable: true }) });
  const res2 = await handleSubscribe(post(VALID), mail.deps);
  assertEquals([res2.status, await res2.json()], [502, { error: "server_error" }]);

  const dup = makeDeps({ sendEmail: () => Promise.resolve({ status: "duplicate", previous: "sent" }) });
  const res3 = await handleSubscribe(post(VALID), dup.deps);
  assertEquals([res3.status, await res3.json()], [200, { status: "sent" }]);
});

Deno.test("only POST, CORS for allowed origins only", async () => {
  const { deps } = makeDeps();
  const get = await handleSubscribe(new Request("https://x/f", { method: "GET" }), deps);
  assertEquals(get.status, 405);
  await get.body?.cancel();
  const pre = await handleSubscribe(new Request("https://x/f", { method: "OPTIONS", headers: { Origin: SITE } }), deps);
  assertEquals([pre.status, pre.headers.get("Access-Control-Allow-Origin")], [204, SITE]);
  const evil = await handleSubscribe(new Request("https://x/f", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), deps);
  assertEquals(evil.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("the button label follows the template's language", () => {
  assertEquals(confirmationContent("https://x/c")("en").primaryAction?.label, "Confirm my subscription");
  assertEquals(confirmationContent("https://x/c")("de").primaryAction?.label, "Confirm my subscription");
});

// ---------------------------------------------------------------- Direct sign-up (2026-11-08)

Deno.test("a signed-in member subscribing their own address is subscribed at once, no e-mail, no captcha", async () => {
  const { deps, direct, sent, subscribed, captchas } = makeDeps({ captchaConfigured: true });
  const res = await handleSubscribe(post(VALID, { Authorization: "Bearer member-token" }), deps);
  assertEquals([res.status, await res.json()], [200, { status: "subscribed" }]);
  assertEquals(direct, [["ana@example.com", "member_session"]]);
  assertEquals([sent.length, subscribed.length, captchas.length], [0, 0, 0]);
});

Deno.test("a member typing another address, or an unconfirmed account, is treated as a visitor", async () => {
  const other = makeDeps();
  await handleSubscribe(post({ ...VALID, email: "someone@example.com" }, { Authorization: "Bearer member-token" }), other.deps);
  assertEquals([other.direct.length, other.sent.length], [0, 1]);
  const unconfirmed = makeDeps();
  await handleSubscribe(post(VALID, { Authorization: "Bearer unconfirmed-token" }), unconfirmed.deps);
  assertEquals([unconfirmed.direct.length, unconfirmed.sent.length], [0, 1]);
});

Deno.test("with the captcha configured, a visitor needs a passing token and is then subscribed at once", async () => {
  const missing = makeDeps({ captchaConfigured: true });
  const r1 = await handleSubscribe(post(VALID), missing.deps);
  assertEquals([r1.status, await r1.json()], [400, { error: "captcha_required" }]);
  assertEquals([missing.direct.length, missing.sent.length, missing.subscribed.length], [0, 0, 0]);

  const bad = makeDeps({ captchaConfigured: true });
  const r2 = await handleSubscribe(post({ ...VALID, captcha: "bad-token" }), bad.deps);
  assertEquals([r2.status, await r2.json()], [400, { error: "captcha_failed" }]);
  assertEquals(bad.direct.length, 0);

  const good = makeDeps({ captchaConfigured: true });
  const r3 = await handleSubscribe(post({ ...VALID, captcha: "good-token" }), good.deps);
  assertEquals([r3.status, await r3.json()], [200, { status: "subscribed" }]);
  assertEquals(good.direct, [["ana@example.com", "captcha"]]);
  assertEquals([good.sent.length, good.subscribed.length], [0, 0]);
});

Deno.test("the direct answer is the same whatever the address's state", async () => {
  for (const status of ["subscribed", "bounced", "complained"]) {
    const { deps } = makeDeps({ captchaConfigured: true, subscribeDirect: () => Promise.resolve({ status }) });
    const res = await handleSubscribe(post({ ...VALID, captcha: "good-token" }), deps);
    assertEquals(await res.json(), { status: "subscribed" });
  }
});

Deno.test("a captcha service outage or a database error is a generic error; the throttle still applies", async () => {
  const down = makeDeps({ captchaConfigured: true, verifyCaptcha: () => Promise.reject(new Error("timeout")) });
  const r1 = await handleSubscribe(post({ ...VALID, captcha: "good-token" }), down.deps);
  assertEquals([r1.status, await r1.json()], [502, { error: "server_error" }]);
  const db = makeDeps({ captchaConfigured: true, subscribeDirect: () => Promise.resolve({ error: { code: "PT429" } }) });
  const r2 = await handleSubscribe(post({ ...VALID, captcha: "good-token" }), db.deps);
  assertEquals([r2.status, await r2.json()], [429, { error: "rate_limited" }]);
  const tooLong = makeDeps({ captchaConfigured: true });
  const r3 = await handleSubscribe(post({ ...VALID, captcha: "x".repeat(2049) }), tooLong.deps);
  assertEquals(r3.status, 400);
});
