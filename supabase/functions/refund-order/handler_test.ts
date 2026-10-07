import { assert, assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import {
  handleRefundOrder,
  refusal,
  stripeReason,
  type Caller,
  type DbError,
  type RefundDeps,
  type RefundRow,
  type StripeOutcome,
} from "./handler.ts";
import { parseRefundInput } from "./input.ts";

const MANAGER: Caller = { userId: "aaaaaaaa-0000-4000-8000-000000000001", permissions: new Set(["view_orders", "manage_orders"]) };
const VIEWER: Caller = { userId: "aaaaaaaa-0000-4000-8000-000000000002", permissions: new Set(["view_orders"]) };
const TOKENS: Record<string, Caller> = { "manager.jwt.sig": MANAGER, "viewer.jwt.sig": VIEWER };

const ORDER_ID = "11111111-2222-4333-8444-555555555555";
const ITEM_ID = "22222222-2222-4333-8444-555555555555";
const REFUND_ID = "99999999-8888-4777-8666-555555555555";
const REFUND: RefundRow = { id: REFUND_ID, paymentId: "77777777-8888-4777-8666-555555555555", status: "pending", providerRefundId: null };

const REQUEST = {
  action: "request",
  order_id: ORDER_ID,
  amount_minor: 1250,
  reason: "defective",
  items: [{ order_item_id: ITEM_ID, quantity: 1 }],
  restock: true,
};

function fakeDeps(overrides: Partial<RefundDeps> = {}) {
  const calls = {
    requested: [] as unknown[],
    stripe: [] as unknown[],
    saved: [] as [string, string][],
    failed: [] as [string, string][],
    cancelled: [] as string[],
  };
  const deps: RefundDeps = {
    origins: readSiteOrigins("https://global-toothgems.example", undefined),
    caller: (token) => Promise.resolve(TOKENS[token] ?? null),
    requestRefund: (_token, input) => {
      calls.requested.push(input);
      return Promise.resolve({ refund: REFUND });
    },
    paymentIntentOf: () => Promise.resolve("pi_test_1"),
    createStripeRefund: (args) => {
      calls.stripe.push(args);
      return Promise.resolve<StripeOutcome>({ ok: true, providerRefundId: "re_test_1", status: "succeeded" });
    },
    saveProviderRefundId: (id, providerId) => {
      calls.saved.push([id, providerId]);
      return Promise.resolve();
    },
    markFailed: (id, reason) => {
      calls.failed.push([id, reason]);
      return Promise.resolve();
    },
    findRefund: () => Promise.resolve(REFUND),
    cancelAsCaller: (_token, id) => {
      calls.cancelled.push(id);
      return Promise.resolve(null as DbError | null);
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

function post(body: unknown, token: string | null = "manager.jwt.sig") {
  return new Request("https://x.supabase.co/functions/v1/refund-order", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

Deno.test("a request is validated, run as the caller, sent to Stripe once and left pending for the webhook", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleRefundOrder(post(REQUEST), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "requested", refund_id: REFUND_ID, stripe_status: "succeeded" });
  assertEquals(calls.stripe, [{ paymentIntentId: "pi_test_1", amountMinor: 1250, refundId: REFUND_ID, orderId: ORDER_ID, reason: "defective" }]);
  assertEquals(calls.saved, [[REFUND_ID, "re_test_1"]]);
  assertEquals(calls.failed, []);
});

Deno.test("no token, a bad token, or a team member without manage_orders gets nothing", async () => {
  for (const [token, status] of [[null, 401], ["not-a-jwt", 401], ["unknown.jwt.sig", 401], ["viewer.jwt.sig", 403]] as const) {
    const { deps, calls } = fakeDeps();
    const res = await handleRefundOrder(post(REQUEST, token), deps);
    assertEquals(res.status, status);
    assertEquals(calls.requested.length + calls.stripe.length, 0);
  }
});

Deno.test("the body is strict: integer minor units, known reason, no duplicate lines, restock needs lines", () => {
  const bad = (patch: Record<string, unknown>) => parseRefundInput({ ...REQUEST, ...patch });
  assert(!bad({ amount_minor: 12.5 }).ok);
  assert(!bad({ amount_minor: "1250" }).ok);
  assert(!bad({ amount_minor: 0 }).ok);
  assert(!bad({ amount_minor: -1 }).ok);
  assert(!bad({ reason: "because" }).ok);
  assert(!bad({ order_id: "not-a-uuid" }).ok);
  assert(!bad({ items: [{ order_item_id: ITEM_ID, quantity: 0 }] }).ok);
  assert(!bad({ items: [{ order_item_id: ITEM_ID, quantity: 1 }, { order_item_id: ITEM_ID, quantity: 1 }] }).ok);
  assert(!bad({ items: [], restock: true }).ok);
  assert(bad({ items: [], restock: false }).ok);
  assert(!parseRefundInput({ action: "cancel", refund_id: "x" }).ok);
  assert(parseRefundInput({ action: "cancel", refund_id: REFUND_ID }).ok);
  assert(!parseRefundInput({ action: "delete" }).ok);
  assert(!parseRefundInput(null).ok);
});

Deno.test("the database's refusals come back as codes, never as SQL messages", async () => {
  const cases: [DbError, string, number][] = [
    [{ code: "42501", message: "request_refund: not allowed" }, "forbidden", 403],
    [{ code: "P0002", message: "request_refund: no refundable card payment" }, "no_card_payment", 409],
    [{ code: "23514", message: "refunds: 50 exceeds the refundable balance (40 paid)" }, "amount_too_high", 409],
    [{ code: "23514", message: "refunds: a gift card bought in this order is still active; cancel it first" }, "gift_card_active", 409],
    [{ code: "23514", message: "refund_items: 1 of 1 units already refunded" }, "refund_refused", 409],
    [{ code: "XX000", message: "relation public.secret does not exist" }, "server_error", 500],
  ];
  for (const [error, code, status] of cases) {
    const { deps, calls } = fakeDeps({ requestRefund: () => Promise.resolve({ error }) });
    const res = await handleRefundOrder(post(REQUEST), deps);
    assertEquals(res.status, status);
    const body = await res.json();
    assertEquals(body, { error: code });
    assertEquals(calls.stripe.length, 0);
  }
  assertEquals(refusal({ code: "22023" }), "invalid_request");
});

Deno.test("a refusal by Stripe frees the balance; a Stripe outage leaves the refund pending", async () => {
  const refused = fakeDeps({ createStripeRefund: () => Promise.resolve<StripeOutcome>({ ok: false, definite: true, code: "charge_already_refunded" }) });
  const res = await handleRefundOrder(post(REQUEST), refused.deps);
  assertEquals(res.status, 422);
  assertEquals(await res.json(), { error: "stripe_refused" });
  assertEquals(refused.calls.failed, [[REFUND_ID, "charge_already_refunded"]]);

  const down = fakeDeps({ createStripeRefund: () => Promise.resolve<StripeOutcome>({ ok: false, definite: false }) });
  const outage = await handleRefundOrder(post(REQUEST), down.deps);
  assertEquals(outage.status, 502);
  assertEquals(await outage.json(), { error: "stripe_unavailable", refund_id: REFUND_ID });
  assertEquals(down.calls.failed, []);
  assertEquals(down.calls.saved, []);
});

Deno.test("a card payment without a PaymentIntent is refused and the balance freed", async () => {
  const { deps, calls } = fakeDeps({ paymentIntentOf: () => Promise.resolve(null) });
  const res = await handleRefundOrder(post(REQUEST), deps);
  assertEquals(res.status, 409);
  assertEquals(calls.stripe.length, 0);
  assertEquals(calls.failed, [[REFUND_ID, "no_payment_intent"]]);
});

Deno.test("failing to save the Stripe refund id does not fail the request (the webhook matches by metadata)", async () => {
  const { deps } = fakeDeps({ saveProviderRefundId: () => Promise.reject(new Error("db down")) });
  assertEquals((await handleRefundOrder(post(REQUEST), deps)).status, 200);
});

Deno.test("a pending refund that never reached Stripe can be cancelled; one that did cannot", async () => {
  const ok = fakeDeps();
  const res = await handleRefundOrder(post({ action: "cancel", refund_id: REFUND_ID }), ok.deps);
  assertEquals(res.status, 200);
  assertEquals(ok.calls.cancelled, [REFUND_ID]);

  const sent = fakeDeps({ findRefund: () => Promise.resolve({ ...REFUND, providerRefundId: "re_test_1" }) });
  const refused = await handleRefundOrder(post({ action: "cancel", refund_id: REFUND_ID }), sent.deps);
  assertEquals(refused.status, 409);
  assertEquals(await refused.json(), { error: "already_sent" });
  assertEquals(sent.calls.cancelled, []);

  const done = fakeDeps({ findRefund: () => Promise.resolve({ ...REFUND, status: "succeeded" }) });
  assertEquals((await handleRefundOrder(post({ action: "cancel", refund_id: REFUND_ID }), done.deps)).status, 409);

  const missing = fakeDeps({ findRefund: () => Promise.resolve(null) });
  assertEquals((await handleRefundOrder(post({ action: "cancel", refund_id: REFUND_ID }), missing.deps)).status, 404);
});

Deno.test("only the three reasons Stripe knows are forwarded", () => {
  assertEquals(stripeReason("duplicate"), "duplicate");
  assertEquals(stripeReason("fraudulent"), "fraudulent");
  assertEquals(stripeReason("requested_by_customer"), "requested_by_customer");
  assertEquals(stripeReason("goodwill"), undefined);
  assertEquals(stripeReason("defective"), undefined);
});

Deno.test("only POST (and the CORS preflight) is answered", async () => {
  const { deps } = fakeDeps();
  assertEquals((await handleRefundOrder(new Request("https://x/f", { method: "GET" }), deps)).status, 405);
  assertEquals((await handleRefundOrder(new Request("https://x/f", { method: "OPTIONS" }), deps)).status, 204);
});
