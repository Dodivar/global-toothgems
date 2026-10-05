import { assertEquals } from "jsr:@std/assert@1";
import { handleSendEmail, type SendEmailDeps } from "./handler.ts";
import type { SendRequest, SendResult } from "../_shared/email/send.ts";

const SITE = "https://globaltoothgems.com";

function makeDeps(result: SendResult | Error = { status: "sent", id: "re_1" }, overrides: Partial<SendEmailDeps> = {}) {
  const sent: SendRequest[] = [];
  const logs: unknown[] = [];
  const deps: SendEmailDeps = {
    secret: "s3cret-value",
    siteUrl: SITE,
    send: (request) => {
      sent.push(request);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    log: (message, detail) => logs.push([message, detail]),
    ...overrides,
  };
  return { deps, sent, logs };
}

const contact = () => ({
  template_key: "contact_acknowledgement",
  to: "Visitor@Example.com",
  locale: "fr",
  variables: { name: "Léa", subject: "Question", ticket_number: "SUP-100001" },
  event_key: "contact_acknowledgement:SUP-100001",
});
const newsletter = () => ({
  template_key: "newsletter_confirmation",
  to: "visitor@example.com",
  locale: "en",
  variables: { confirm_url: `${SITE}/en/newsletter/confirm?token=abc` },
  event_key: "newsletter_confirmation:3f2a",
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://x.test/functions/v1/send-email", {
    method: "POST",
    headers: { "x-internal-secret": "s3cret-value", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("the shared secret is required; nothing is sent without it", async () => {
  for (const request of [post(contact(), { "x-internal-secret": "wrong" }), new Request("https://x.test", { method: "POST" })]) {
    const { deps, sent } = makeDeps();
    assertEquals((await handleSendEmail(request, deps)).status, 401);
    assertEquals(sent.length, 0);
  }
  const unset = makeDeps(undefined, { secret: undefined });
  assertEquals((await handleSendEmail(post(contact(), { "x-internal-secret": "" }), unset.deps)).status, 401);
  assertEquals(unset.sent.length, 0);
});

Deno.test("POST only", async () => {
  const { deps } = makeDeps();
  assertEquals((await handleSendEmail(new Request("https://x.test", { method: "GET" }), deps)).status, 405);
});

Deno.test("sends the contact acknowledgement with trimmed, validated values", async () => {
  const { deps, sent } = makeDeps();
  const res = await handleSendEmail(post(contact()), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, status: "sent" });
  assertEquals(sent, [{
    templateKey: "contact_acknowledgement",
    to: "Visitor@Example.com",
    locale: "fr",
    variables: { name: "Léa", subject: "Question", ticket_number: "SUP-100001" },
    eventKey: "contact_acknowledgement:SUP-100001",
  }]);
});

Deno.test("sends the newsletter confirmation, whose link must point at the site", async () => {
  const { deps, sent } = makeDeps();
  assertEquals((await handleSendEmail(post(newsletter()), deps)).status, 200);
  assertEquals(sent.length, 1);

  for (const url of ["https://evil.example/confirm?t=1", "http://globaltoothgems.com/x", `${SITE}.evil.example/x`, `${SITE}/x y`]) {
    const body = newsletter();
    body.variables.confirm_url = url;
    const { deps: d, sent: s } = makeDeps();
    assertEquals((await handleSendEmail(post(body), d)).status, 400, url);
    assertEquals(s.length, 0);
  }
  const noSite = makeDeps(undefined, { siteUrl: null });
  assertEquals((await handleSendEmail(post(newsletter()), noSite.deps)).status, 400);
});

Deno.test("only the two allow-listed templates can be sent", async () => {
  for (const key of ["order_confirmation", "gift_card_delivery", "order_refunded", "__proto__", "constructor", ""]) {
    const body = { ...contact(), template_key: key, event_key: `${key}:SUP-1` };
    const { deps, sent } = makeDeps();
    assertEquals((await handleSendEmail(post(body), deps)).status, 400, key);
    assertEquals(sent.length, 0);
  }
});

Deno.test("every field is validated", async () => {
  const cases: Array<[string, (b: ReturnType<typeof contact>) => unknown]> = [
    ["bad address", (b) => ({ ...b, to: "not-an-address" })],
    ["several addresses", (b) => ({ ...b, to: "a@example.com, b@example.com" })],
    ["address too long", (b) => ({ ...b, to: `${"a".repeat(250)}@example.com` })],
    ["unknown locale", (b) => ({ ...b, locale: "xx" })],
    ["locale not a string", (b) => ({ ...b, locale: 1 })],
    ["event key of another template", (b) => ({ ...b, event_key: "newsletter_confirmation:SUP-1" })],
    ["event key without id", (b) => ({ ...b, event_key: "contact_acknowledgement:" })],
    ["event key with a space", (b) => ({ ...b, event_key: "contact_acknowledgement:SUP 1" })],
    ["event key too long", (b) => ({ ...b, event_key: `contact_acknowledgement:${"a".repeat(151)}` })],
    ["missing variable", (b) => ({ ...b, variables: { name: "Léa", subject: "Q" } })],
    ["extra variable", (b) => ({ ...b, variables: { ...b.variables, code: "x" } })],
    ["unknown variable instead of a known one", (b) => ({ ...b, variables: { name: "Léa", subject: "Q", other: "x" } })],
    ["empty variable", (b) => ({ ...b, variables: { ...b.variables, name: "  " } })],
    ["variable not a string", (b) => ({ ...b, variables: { ...b.variables, name: 12 } })],
    ["variable too long", (b) => ({ ...b, variables: { ...b.variables, subject: "s".repeat(201) } })],
    ["variables is an array", (b) => ({ ...b, variables: ["x"] })],
    ["body is an array", () => [contact()]],
    ["body is null", () => null],
  ];
  for (const [name, mutate] of cases) {
    const { deps, sent } = makeDeps();
    const res = await handleSendEmail(post(mutate(contact())), deps);
    assertEquals(res.status, 400, name);
    assertEquals(await res.json(), { error: "invalid_request" }, name);
    assertEquals(sent.length, 0, name);
  }
});

Deno.test("bodies that are not JSON or too large are refused", async () => {
  for (const body of ["{not json", JSON.stringify({ ...contact(), padding: "x".repeat(9000) })]) {
    const { deps, sent } = makeDeps();
    assertEquals((await handleSendEmail(post(body), deps)).status, 400);
    assertEquals(sent.length, 0);
  }
});

Deno.test("a replay answers duplicate without error", async () => {
  const { deps } = makeDeps({ status: "duplicate", previous: "sent" });
  const res = await handleSendEmail(post(contact()), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, status: "duplicate" });
});

Deno.test("failures answer generic errors and never leak provider text or addresses", async () => {
  const secretText = "Resend said: visitor@example.com is on the suppression list";
  const cases: Array<[SendResult | Error, number, unknown]> = [
    [{ status: "failed", error: secretText, retryable: true }, 503, { error: "send_failed", retryable: true }],
    [{ status: "failed", error: secretText, retryable: false }, 502, { error: "send_failed", retryable: false }],
    [{ status: "template_missing" }, 503, { error: "unavailable" }],
    [{ status: "invalid", error: secretText }, 400, { error: "invalid_request" }],
    [new Error(secretText), 500, { error: "server_error" }],
  ];
  for (const [result, status, expected] of cases) {
    const { deps, logs } = makeDeps(result);
    const res = await handleSendEmail(post(contact()), deps);
    const text = await res.text();
    assertEquals(res.status, status);
    assertEquals(JSON.parse(text), expected);
    assertEquals(text.includes("visitor@example.com"), false);
    // The log keeps the template and the event, never the address.
    if (!(result instanceof Error)) assertEquals(JSON.stringify(logs).includes("visitor@example.com"), false);
  }
});
