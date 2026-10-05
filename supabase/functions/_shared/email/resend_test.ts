import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { type OutgoingEmail, ResendError, sendWithResend } from "./resend.ts";

const mail: OutgoingEmail = {
  from: "Global Tooth Gems <no-reply@globaltoothgems.com>",
  to: "camille@example.com",
  replyTo: "contact@globaltoothgems.com",
  subject: "Bonjour",
  html: "<p>Bonjour</p>",
  text: "Bonjour",
  idempotencyKey: "order_confirmation:abc:1",
  tags: [{ name: "template", value: "order_confirmation" }],
};

function fakeFetch(status: number, body: unknown, seen?: { request?: Request }): typeof fetch {
  return (input, init) => {
    if (seen) seen.request = new Request(input as string, init);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
}

Deno.test("sends the documented request and returns the e-mail id", async () => {
  const seen: { request?: Request } = {};
  const result = await sendWithResend({ apiKey: "re_test", fetch: fakeFetch(200, { id: "em_1" }, seen) }, mail);
  assertEquals(result, { id: "em_1" });
  const request = seen.request!;
  assertEquals(request.url, "https://api.resend.com/emails");
  assertEquals(request.method, "POST");
  assertEquals(request.headers.get("authorization"), "Bearer re_test");
  assertEquals(request.headers.get("idempotency-key"), "order_confirmation:abc:1");
  assertEquals(await request.json(), {
    from: mail.from,
    to: ["camille@example.com"],
    subject: "Bonjour",
    html: "<p>Bonjour</p>",
    text: "Bonjour",
    reply_to: "contact@globaltoothgems.com",
    tags: [{ name: "template", value: "order_confirmation" }],
  });
});

Deno.test("a validation error is permanent", async () => {
  const error = await assertRejects(
    () => sendWithResend({ apiKey: "re_test", fetch: fakeFetch(422, { message: "Invalid `from` field" }) }, mail),
    ResendError,
    "422",
  );
  assertEquals(error.retryable, false);
  assertEquals(error.status, 422);
});

Deno.test("rate limits, server errors and concurrent idempotent requests are retryable", async () => {
  for (const status of [429, 500, 503, 409]) {
    const error = await assertRejects(
      () => sendWithResend({ apiKey: "re_test", fetch: fakeFetch(status, { message: "later" }) }, mail),
      ResendError,
    );
    assertEquals(error.retryable, true, String(status));
  }
});

Deno.test("a network failure is retryable and never leaks the key", async () => {
  const failing: typeof fetch = () => Promise.reject(new Error("connection reset"));
  const error = await assertRejects(() => sendWithResend({ apiKey: "re_secret", fetch: failing }, mail), ResendError);
  assertEquals(error.retryable, true);
  assertEquals(error.message.includes("re_secret"), false);
});

Deno.test("an unusable idempotency key is refused before any request", async () => {
  let called = false;
  const spy: typeof fetch = () => {
    called = true;
    return Promise.resolve(new Response("{}"));
  };
  await assertRejects(() => sendWithResend({ apiKey: "k", fetch: spy }, { ...mail, idempotencyKey: "" }), ResendError);
  await assertRejects(
    () => sendWithResend({ apiKey: "k", fetch: spy }, { ...mail, idempotencyKey: "x".repeat(257) }),
    ResendError,
  );
  assertEquals(called, false);
});
