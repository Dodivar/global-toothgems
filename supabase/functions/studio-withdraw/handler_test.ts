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
