import { assertEquals } from "jsr:@std/assert@1";
import { refusalOf, type WithdrawalDeps, withdrawFromStudio, type WithdrawalRow } from "./studioWithdrawal.ts";

const USER = "aaaaaaaa-0000-4000-8000-000000000009";

const row = (over: Partial<WithdrawalRow> = {}): WithdrawalRow => ({
  id: "w-1",
  status: "requested",
  stripeSubscriptionId: "sub_test1",
  stripeInvoiceId: "in_test1",
  canceledAt: null,
  stripeRefundId: null,
  usedDays: 3,
  periodDays: 30,
  paidAmount: "19.90",
  usedAmount: "1.99",
  refundAmount: "17.91",
  currency: "EUR",
  ...over,
});

function fake(over: Partial<WithdrawalDeps> = {}) {
  const calls: string[] = [];
  const refunds: { amountMinor: number; withdrawalId: string }[] = [];
  const deps: WithdrawalDeps = {
    unfinishedWithdrawal: () => Promise.resolve(null),
    runningSubscription: () => Promise.resolve("sub_test1"),
    stripePeriod: () => Promise.resolve({ start: 1_760_000_000, end: 1_762_592_000 }),
    decide: (_user, start, end) => {
      calls.push(`decide:${start.toISOString()}:${end.toISOString()}`);
      return Promise.resolve({ ok: true, row: row() });
    },
    cancelSubscription: (id) => {
      calls.push(`cancel:${id}`);
      return Promise.resolve();
    },
    paymentOfInvoice: () => Promise.resolve({ paymentIntent: "pi_test1" }),
    createRefund: ({ amountMinor, withdrawalId }) => {
      refunds.push({ amountMinor, withdrawalId });
      calls.push("refund");
      return Promise.resolve({ id: "re_test1" });
    },
    recordStep: (_id, step, refundId) => {
      calls.push(`step:${step}${refundId ? `:${refundId}` : ""}`);
      return Promise.resolve();
    },
    acknowledge: () => {
      calls.push("ack");
      return Promise.resolve();
    },
    log: () => {},
    ...over,
  };
  return { deps, calls, refunds };
}

Deno.test("withdrawal: the database decides with Stripe's period, then cancel, then refund the rest in minor units", async () => {
  const { deps, calls, refunds } = fake();
  const outcome = await withdrawFromStudio(USER, deps);
  assertEquals(outcome.kind, "done");
  if (outcome.kind === "done") {
    assertEquals(outcome.summary.refundAmount, 1791);
    assertEquals(outcome.summary.usedAmount, 199);
    assertEquals(outcome.summary.status, "refund_pending");
  }
  assertEquals(calls, [
    `decide:${new Date(1_760_000_000_000).toISOString()}:${new Date(1_762_592_000_000).toISOString()}`,
    "cancel:sub_test1",
    "step:canceled",
    "refund",
    "step:refund_sent:re_test1",
    "ack",
  ]);
  assertEquals(refunds, [{ amountMinor: 1791, withdrawalId: "w-1" }]);
});

Deno.test("withdrawal: a refusal by the database touches nothing at Stripe", async () => {
  const { deps, calls } = fake({ decide: () => Promise.resolve({ ok: false, refusal: "deadline_passed" }) });
  assertEquals(await withdrawFromStudio(USER, deps), { kind: "refused", refusal: "deadline_passed" });
  assertEquals(calls, []);
  const none = fake({ runningSubscription: () => Promise.resolve(null) });
  assertEquals(await withdrawFromStudio(USER, none.deps), { kind: "refused", refusal: "no_subscription" });
});

Deno.test("withdrawal: a failed refund is resumed by the next call, without cancelling twice", async () => {
  const first = fake({ createRefund: () => Promise.reject(new Error("stripe down")) });
  assertEquals(await withdrawFromStudio(USER, first.deps), { kind: "incomplete", step: "refund" });
  assertEquals(first.calls, [first.calls[0], "cancel:sub_test1", "step:canceled"]);

  const second = fake({ unfinishedWithdrawal: () => Promise.resolve(row({ canceledAt: "2026-10-18T10:00:00Z" })) });
  const outcome = await withdrawFromStudio(USER, second.deps);
  assertEquals(outcome.kind, "done");
  assertEquals(second.calls, ["refund", "step:refund_sent:re_test1", "ack"]);
});

Deno.test("withdrawal: a failed cancellation stops before any refund", async () => {
  const { deps, calls } = fake({ cancelSubscription: () => Promise.reject(new Error("stripe down")) });
  assertEquals(await withdrawFromStudio(USER, deps), { kind: "incomplete", step: "cancel" });
  assertEquals(calls.includes("refund"), false);
});

Deno.test("withdrawal: nothing left to refund records no_refund; no payment found leaves it incomplete", async () => {
  const zero = fake({ decide: () => Promise.resolve({ ok: true, row: row({ usedAmount: "19.90", refundAmount: "0.00" }) }) });
  const outcome = await withdrawFromStudio(USER, zero.deps);
  assertEquals(outcome.kind === "done" && outcome.summary.status, "no_refund");
  assertEquals(zero.calls.includes("refund"), false);
  assertEquals(zero.calls.includes("step:no_refund"), true);

  const unpaid = fake({ paymentOfInvoice: () => Promise.resolve(null) });
  assertEquals(await withdrawFromStudio(USER, unpaid.deps), { kind: "incomplete", step: "refund" });
});

Deno.test("withdrawal: a failing acknowledgement never fails the withdrawal", async () => {
  const { deps } = fake({ acknowledge: () => Promise.reject(new Error("resend down")) });
  assertEquals((await withdrawFromStudio(USER, deps)).kind, "done");
});

Deno.test("refusal hints: only ours are recognised", () => {
  assertEquals(refusalOf("manual_review"), "manual_review");
  assertEquals(refusalOf("something else"), null);
  assertEquals(refusalOf(undefined), null);
});
