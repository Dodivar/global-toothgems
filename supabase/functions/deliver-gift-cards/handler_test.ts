import { assertEquals } from "jsr:@std/assert@1";
import { type DeliverDeps, handleDeliverGiftCards } from "./handler.ts";

const REPORT = { examined: 2, sent: 2, healed: 0, inFlight: 0, failed: 0, gaveUp: 0, skipped: 0 };

function makeDeps(overrides: Partial<DeliverDeps> = {}) {
  const calls: number[] = [];
  const deps: DeliverDeps = {
    secret: "s3cret-value",
    run: (limit) => {
      calls.push(limit);
      return Promise.resolve(REPORT);
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

const post = (headers: Record<string, string> = {}, body?: unknown) =>
  new Request("https://x.test/functions/v1/deliver-gift-cards", {
    method: "POST",
    headers: { "x-internal-secret": "s3cret-value", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

Deno.test("the shared secret is required; nothing runs without it", async () => {
  for (const request of [post({ "x-internal-secret": "wrong" }), new Request("https://x.test", { method: "POST" })]) {
    const { deps, calls } = makeDeps();
    assertEquals((await handleDeliverGiftCards(request, deps)).status, 401);
    assertEquals(calls.length, 0);
  }
  const unset = makeDeps({ secret: undefined });
  assertEquals((await handleDeliverGiftCards(post({ "x-internal-secret": "" }), unset.deps)).status, 401);
  assertEquals(unset.calls.length, 0);
});

Deno.test("POST only", async () => {
  const { deps } = makeDeps();
  assertEquals((await handleDeliverGiftCards(new Request("https://x.test", { method: "GET" }), deps)).status, 405);
});

Deno.test("runs with the default limit and answers the report", async () => {
  const { deps, calls } = makeDeps();
  const res = await handleDeliverGiftCards(post(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, report: REPORT });
  assertEquals(calls, [25]);
});

Deno.test("an explicit limit is honoured within bounds", async () => {
  const { deps, calls } = makeDeps();
  assertEquals((await handleDeliverGiftCards(post({}, { limit: 100 }), deps)).status, 200);
  assertEquals(calls, [100]);
  for (const limit of [0, 101, 2.5, "10"]) {
    assertEquals((await handleDeliverGiftCards(post({}, { limit }), makeDeps().deps)).status, 400);
  }
});

Deno.test("a failing run answers a generic error", async () => {
  const { deps } = makeDeps({ run: () => Promise.reject(new Error("db detail that must not leak")) });
  const res = await handleDeliverGiftCards(post(), deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
});
