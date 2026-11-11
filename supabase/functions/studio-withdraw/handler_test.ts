import { assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import type { WithdrawalOutcome } from "../_shared/studioWithdrawal.ts";
import { handleStudioWithdraw, type StudioWithdrawDeps } from "./handler.ts";

const SITE = "https://global-toothgems.example";
const TOKEN = "member.jwt.sig";

function fake(outcome: WithdrawalOutcome) {
  const withdrawn: string[] = [];
  const deps: StudioWithdrawDeps = {
    origins: readSiteOrigins(SITE, undefined),
    userFromToken: (token) => Promise.resolve(token === TOKEN ? "user-1" : null),
    withdraw: (userId) => {
      withdrawn.push(userId);
      return Promise.resolve(outcome);
    },
    log: () => {},
  };
  return { deps, withdrawn };
}

const post = (body: string, token: string | null = TOKEN) =>
  new Request("https://fn.example/studio-withdraw", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });

const DONE: WithdrawalOutcome = {
  kind: "done",
  summary: { withdrawalId: "w-1", status: "refund_pending", usedDays: 3, periodDays: 30, usedAmount: 199, refundAmount: 1791, currency: "EUR" },
};

Deno.test("the signed-in member withdraws; the answer carries minor units", async () => {
  const { deps, withdrawn } = fake(DONE);
  const res = await handleStudioWithdraw(post("{}"), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "refund_pending", used_days: 3, period_days: 30, used_amount: 199, refund_amount: 1791, currency: "EUR" });
  assertEquals(withdrawn, ["user-1"]);
});

Deno.test("no token, an expired one, or a body with anything in it is refused before any withdrawal", async () => {
  const { deps, withdrawn } = fake(DONE);
  assertEquals((await handleStudioWithdraw(post("{}", null), deps)).status, 401);
  assertEquals((await handleStudioWithdraw(post("{}", "other.jwt.sig"), deps)).status, 401);
  assertEquals((await handleStudioWithdraw(post('{"amount":1}'), deps)).status, 400);
  assertEquals((await handleStudioWithdraw(post('{"user_id":"x"}'), deps)).status, 400);
  assertEquals(withdrawn, []);
});

Deno.test("refusals are 409 with the database's reason; a Stripe step that failed is 502 and resumable", async () => {
  const refused = fake({ kind: "refused", refusal: "deadline_passed" });
  const res = await handleStudioWithdraw(post(""), refused.deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "deadline_passed" });
  const incomplete = fake({ kind: "incomplete", step: "refund" });
  const res2 = await handleStudioWithdraw(post("{}"), incomplete.deps);
  assertEquals(res2.status, 502);
  assertEquals(await res2.json(), { error: "withdrawal_incomplete", step: "refund" });
});

Deno.test("POST only; a preflight from the site gets its CORS answer and withdraws nothing", async () => {
  const { deps, withdrawn } = fake(DONE);
  const get = new Request("https://fn.example/studio-withdraw", { method: "GET", headers: { origin: SITE, authorization: `Bearer ${TOKEN}` } });
  const res = await handleStudioWithdraw(get, deps);
  assertEquals(res.status, 405);
  const preflight = await handleStudioWithdraw(new Request("https://fn.example/studio-withdraw", { method: "OPTIONS", headers: { origin: SITE } }), deps);
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get("access-control-allow-origin"), SITE);
  assertEquals(withdrawn, []);
});

Deno.test("an oversized, malformed or array body is refused before any withdrawal", async () => {
  const { deps, withdrawn } = fake(DONE);
  assertEquals((await handleStudioWithdraw(post(`{"x":"${"a".repeat(400)}"}`), deps)).status, 400);
  assertEquals((await handleStudioWithdraw(post("{not json"), deps)).status, 400);
  assertEquals((await handleStudioWithdraw(post("[]"), deps)).status, 400);
  assertEquals((await handleStudioWithdraw(post("null"), deps)).status, 400);
  assertEquals(withdrawn, []);
});

Deno.test("a failing token check or withdrawal answers a generic 500, never the internal error", async () => {
  const logged: unknown[] = [];
  const base = fake(DONE).deps;
  const tokenDown: StudioWithdrawDeps = { ...base, userFromToken: () => Promise.reject(new Error("auth db: connection refused")), log: (m, d) => logged.push([m, d]) };
  const res = await handleStudioWithdraw(post("{}"), tokenDown);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });

  const stripeDown: StudioWithdrawDeps = { ...base, withdraw: () => Promise.reject(new Error("sk_live_leak in message")), log: (m, d) => logged.push([m, d]) };
  const res2 = await handleStudioWithdraw(post("{}"), stripeDown);
  assertEquals(res2.status, 500);
  const text = await res2.text();
  assertEquals(text.includes("sk_live"), false);
  assertEquals(logged.length, 2);
});
