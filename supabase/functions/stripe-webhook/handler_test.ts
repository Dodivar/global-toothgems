import { assert, assertEquals } from "jsr:@std/assert@1";
import Stripe from "npm:stripe@18.5.0";
import { DbCallError, handleWebhook, type EventStatus, type WebhookDeps, type WebhookEvent } from "./handler.ts";

// Signatures are made and checked by the real Stripe SDK with Web Crypto,
// exactly as in index.ts; only the database is faked.
const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_unused", { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const ORDER_ID = "11111111-2222-4333-8444-555555555555";

function sessionEvent(type: string, session: Record<string, unknown> = {}, id = "evt_test_1") {
  return {
    id,
    object: "event",
    type,
    livemode: false,
    data: {
      object: {
        id: "cs_test_abc",
        object: "checkout.session",
        amount_total: 4290,
        currency: "eur",
        payment_status: "paid",
        payment_intent: "pi_test_abc",
        metadata: { order_id: ORDER_ID, order_number: "GT-100042" },
        ...session,
      },
    },
  };
}

async function signed(payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret, cryptoProvider: crypto });
  return new Request("https://x.supabase.co/functions/v1/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body,
  });
}

function fakeDb(initial: Partial<{ status: EventStatus; order: { status: string; paymentStatus: string } }> = {}) {
  const state = {
    events: new Map<string, { status: EventStatus; attempts: number; error?: string }>(),
    order: initial.order ?? { status: "pending", paymentStatus: "pending" },
    paid: [] as { amount: string; currency: string; checkoutId: string; paymentId: string | null }[],
    cancelled: [] as string[],
    closed: [] as string[],
    refunds: new Map<string, { id: string; status: string }>(),
    succeededRefunds: [] as { id: string; providerRefundId: string }[],
    failedRefunds: [] as { id: string; reason: string | null }[],
    externalRefunds: [] as { paymentIntentId: string; providerRefundId: string; amount: string; currency: string }[],
    refundFollowUps: 0,
  };
  const deps: WebhookDeps = {
    verify: (raw, sig) => stripe.webhooks.constructEventAsync(raw, sig, SECRET, undefined, crypto) as unknown as Promise<WebhookEvent>,
    recordEvent: (event) => {
      const row = state.events.get(event.id);
      if (row) {
        row.attempts++;
        return Promise.resolve(row.status);
      }
      state.events.set(event.id, { status: initial.status ?? "received", attempts: 1 });
      return Promise.resolve(initial.status ?? "received");
    },
    finishEvent: (id, status, error) => {
      state.events.set(id, { ...state.events.get(id)!, status, error });
      return Promise.resolve();
    },
    orderState: () => Promise.resolve(state.order),
    paymentDetails: () => Promise.resolve({ methodType: "card", cardBrand: "visa", cardLast4: "4242" }),
    markOrderPaid: ({ amount, currency, checkoutId, paymentId }) => {
      state.paid.push({ amount, currency, checkoutId, paymentId });
      state.order = { status: "confirmed", paymentStatus: "paid" };
      return Promise.resolve();
    },
    cancelOrder: (id) => {
      state.cancelled.push(id);
      state.order = { ...state.order, status: "cancelled" };
      return Promise.resolve();
    },
    closeCheckoutPayment: (id) => {
      state.closed.push(id);
      return Promise.resolve();
    },
    findRefund: (refundId, providerRefundId) =>
      Promise.resolve((refundId && state.refunds.get(refundId)) || state.refunds.get(`provider:${providerRefundId}`) || null),
    markRefundSucceeded: (id, providerRefundId) => {
      state.succeededRefunds.push({ id, providerRefundId });
      return Promise.resolve();
    },
    markRefundFailed: (id, reason) => {
      state.failedRefunds.push({ id, reason });
      return Promise.resolve();
    },
    recordExternalRefund: (args) => {
      state.externalRefunds.push(args);
      return Promise.resolve();
    },
    refundConfirmed: () => {
      state.refundFollowUps++;
      return Promise.resolve();
    },
    log: () => {},
  };
  return { deps, state };
}

Deno.test("an invalid or missing signature is refused before anything is recorded", async () => {
  const { deps, state } = fakeDb();
  const forged = await signed(sessionEvent("checkout.session.completed"), "whsec_other");
  assertEquals((await handleWebhook(forged, deps)).status, 400);
  const tampered = await signed(sessionEvent("checkout.session.completed"));
  const body = (await tampered.clone().text()).replace("4290", "1");
  const req = new Request(tampered.url, { method: "POST", headers: tampered.headers, body });
  assertEquals((await handleWebhook(req, deps)).status, 400);
  const unsigned = new Request("https://x/f", { method: "POST", body: "{}" });
  assertEquals((await handleWebhook(unsigned, deps)).status, 400);
  assertEquals(state.events.size, 0);
  assertEquals(state.paid.length, 0);
});

Deno.test("checkout.session.completed (paid) marks the order paid with Stripe's amount", async () => {
  const { deps, state } = fakeDb();
  const res = await handleWebhook(await signed(sessionEvent("checkout.session.completed")), deps);
  assertEquals(res.status, 200);
  assertEquals(state.paid, [{ amount: "42.90", currency: "EUR", checkoutId: "cs_test_abc", paymentId: "pi_test_abc" }]);
  assertEquals(state.events.get("evt_test_1")?.status, "processed");
});

Deno.test("a replayed event does nothing the second time", async () => {
  const { deps, state } = fakeDb();
  const payload = sessionEvent("checkout.session.completed");
  assertEquals((await handleWebhook(await signed(payload), deps)).status, 200);
  const again = await handleWebhook(await signed(payload), deps);
  assertEquals(again.status, 200);
  assertEquals((await again.json()).duplicate, true);
  assertEquals(state.paid.length, 1);
  assertEquals(state.events.get("evt_test_1")?.attempts, 2);
});

Deno.test("a delayed payment method waits for async_payment_succeeded", async () => {
  const { deps, state } = fakeDb();
  await handleWebhook(await signed(sessionEvent("checkout.session.completed", { payment_status: "unpaid" })), deps);
  assertEquals(state.paid.length, 0);
  assertEquals(state.events.get("evt_test_1")?.status, "ignored");
  await handleWebhook(await signed(sessionEvent("checkout.session.async_payment_succeeded", {}, "evt_test_2")), deps);
  assertEquals(state.paid.length, 1);
});

Deno.test("expired / failed sessions cancel an unpaid order only", async () => {
  const unpaid = fakeDb();
  await handleWebhook(await signed(sessionEvent("checkout.session.expired", { payment_status: "unpaid" })), unpaid.deps);
  assertEquals(unpaid.state.cancelled, [ORDER_ID]);
  assertEquals(unpaid.state.closed, ["cs_test_abc"]);

  const paid = fakeDb({ order: { status: "confirmed", paymentStatus: "paid" } });
  const res = await handleWebhook(await signed(sessionEvent("checkout.session.async_payment_failed")), paid.deps);
  assertEquals(res.status, 200);
  assertEquals(paid.state.cancelled, []);
});

Deno.test("events that are not ours are acknowledged and ignored", async () => {
  const { deps, state } = fakeDb();
  await handleWebhook(await signed({ ...sessionEvent("charge.refunded"), id: "evt_test_3" }), deps);
  await handleWebhook(await signed(sessionEvent("checkout.session.completed", { metadata: {} }, "evt_test_4")), deps);
  assertEquals(state.events.get("evt_test_3")?.status, "ignored");
  assertEquals(state.events.get("evt_test_4")?.status, "ignored");
  assertEquals(state.paid.length, 0);
});

Deno.test("permanent errors are stored and acknowledged; transient ones are retried", async () => {
  const permanent = fakeDb();
  permanent.deps.markOrderPaid = () => Promise.reject(new DbCallError("mark_order_paid: paid 1 EUR does not match", "22023"));
  const res = await handleWebhook(await signed(sessionEvent("checkout.session.completed")), permanent.deps);
  assertEquals(res.status, 200);
  assertEquals(permanent.state.events.get("evt_test_1")?.status, "failed");

  const transient = fakeDb();
  transient.deps.markOrderPaid = () => Promise.reject(new Error("fetch failed"));
  const retry = await handleWebhook(await signed(sessionEvent("checkout.session.completed")), transient.deps);
  assertEquals(retry.status, 500);
  // A failed event is processed again on the next delivery.
  transient.deps.markOrderPaid = fakeDb().deps.markOrderPaid;
  const ok = await handleWebhook(await signed(sessionEvent("checkout.session.completed")), transient.deps);
  assertEquals(ok.status, 200);
  assert(transient.state.events.get("evt_test_1")?.status === "processed");
});

Deno.test("a database outage while recording answers 500 (Stripe retries)", async () => {
  const { deps, state } = fakeDb();
  deps.recordEvent = () => Promise.reject(new Error("connection refused"));
  assertEquals((await handleWebhook(await signed(sessionEvent("checkout.session.completed")), deps)).status, 500);
  assertEquals(state.paid.length, 0);
});

Deno.test("a paid order triggers its follow-ups; a failing follow-up never fails the event", async () => {
  const ok = fakeDb();
  const followed: string[] = [];
  ok.deps.orderPaid = (orderId) => {
    followed.push(orderId);
    return Promise.resolve();
  };
  assertEquals((await handleWebhook(await signed(sessionEvent("checkout.session.completed")), ok.deps)).status, 200);
  assertEquals(followed, [ORDER_ID]);

  const broken = fakeDb();
  broken.deps.orderPaid = () => Promise.reject(new Error("resend down"));
  const res = await handleWebhook(await signed(sessionEvent("checkout.session.completed")), broken.deps);
  assertEquals(res.status, 200);
  assertEquals(broken.state.events.get("evt_test_1")?.status, "processed");

  // No follow-up when the payment is not recorded (delayed method, amount mismatch).
  const unpaid = fakeDb();
  const none: string[] = [];
  unpaid.deps.orderPaid = (orderId) => {
    none.push(orderId);
    return Promise.resolve();
  };
  await handleWebhook(await signed(sessionEvent("checkout.session.completed", { payment_status: "unpaid" })), unpaid.deps);
  assertEquals(none, []);
});

const REFUND_ID = "99999999-8888-4777-8666-555555555555";

function refundEvent(type: string, refund: Record<string, unknown> = {}, id = "evt_refund_1") {
  return {
    id,
    object: "event",
    type,
    livemode: false,
    data: {
      object: {
        id: "re_test_1",
        object: "refund",
        amount: 1250,
        currency: "eur",
        status: "succeeded",
        payment_intent: "pi_test_abc",
        metadata: { refund_id: REFUND_ID, order_id: ORDER_ID },
        ...refund,
      },
    },
  };
}

Deno.test("refund.updated (succeeded) confirms the refund the back office requested, then runs its follow-ups", async () => {
  const { deps, state } = fakeDb();
  state.refunds.set(REFUND_ID, { id: REFUND_ID, status: "pending" });
  const res = await handleWebhook(await signed(refundEvent("refund.updated")), deps);
  assertEquals(res.status, 200);
  assertEquals(state.succeededRefunds, [{ id: REFUND_ID, providerRefundId: "re_test_1" }]);
  assertEquals(state.externalRefunds, []);
  assertEquals(state.refundFollowUps, 1);
  assertEquals(state.events.get("evt_refund_1")?.status, "processed");
});

Deno.test("a refund event is found by its Stripe id when the metadata is missing or the id was already saved", async () => {
  const { deps, state } = fakeDb();
  state.refunds.set("provider:re_test_1", { id: REFUND_ID, status: "pending" });
  await handleWebhook(await signed(refundEvent("refund.created", { metadata: {} })), deps);
  assertEquals(state.succeededRefunds.length, 1);
  assertEquals(state.externalRefunds.length, 0);
});

Deno.test("a refund made in the Stripe dashboard is recorded from its payment intent", async () => {
  const { deps, state } = fakeDb();
  const res = await handleWebhook(await signed(refundEvent("refund.created", { metadata: {} })), deps);
  assertEquals(res.status, 200);
  assertEquals(state.externalRefunds, [
    { paymentIntentId: "pi_test_abc", providerRefundId: "re_test_1", amount: "12.50", currency: "EUR" },
  ]);
  assertEquals(state.refundFollowUps, 1);
});

Deno.test("a refund we asked for whose row is gone is never recreated as an external refund", async () => {
  const { deps, state } = fakeDb();
  const res = await handleWebhook(await signed(refundEvent("refund.updated")), deps);
  assertEquals(res.status, 200);
  assertEquals(state.externalRefunds, []);
  assertEquals(state.events.get("evt_refund_1")?.status, "failed");
});

Deno.test("failed and canceled refunds free the balance; pending ones wait", async () => {
  const { deps, state } = fakeDb();
  state.refunds.set(REFUND_ID, { id: REFUND_ID, status: "pending" });
  await handleWebhook(await signed(refundEvent("refund.updated", { status: "pending" }, "evt_a")), deps);
  assertEquals(state.succeededRefunds.length + state.failedRefunds.length, 0);
  assertEquals(state.events.get("evt_a")?.status, "processed");
  await handleWebhook(await signed(refundEvent("refund.failed", { status: "failed", failure_reason: "expired_or_canceled_card" }, "evt_b")), deps);
  assertEquals(state.failedRefunds, [{ id: REFUND_ID, reason: "expired_or_canceled_card" }]);
  await handleWebhook(await signed(refundEvent("refund.updated", { status: "canceled" }, "evt_c")), deps);
  assertEquals(state.failedRefunds.length, 2);
  assertEquals(state.refundFollowUps, 0);
});

Deno.test("a replayed refund event does nothing the second time; a failing follow-up never fails it", async () => {
  const { deps, state } = fakeDb();
  state.refunds.set(REFUND_ID, { id: REFUND_ID, status: "pending" });
  const payload = refundEvent("refund.updated");
  assertEquals((await handleWebhook(await signed(payload), deps)).status, 200);
  assertEquals((await (await handleWebhook(await signed(payload), deps)).json()).duplicate, true);
  assertEquals(state.succeededRefunds.length, 1);

  const broken = fakeDb();
  broken.state.refunds.set(REFUND_ID, { id: REFUND_ID, status: "pending" });
  broken.deps.refundConfirmed = () => Promise.reject(new Error("resend down"));
  assertEquals((await handleWebhook(await signed(refundEvent("refund.updated")), broken.deps)).status, 200);
  assertEquals(broken.state.events.get("evt_refund_1")?.status, "processed");
});

Deno.test("a refund the database refuses permanently is stored as failed and acknowledged", async () => {
  const { deps, state } = fakeDb();
  deps.recordExternalRefund = () => Promise.reject(new DbCallError("refunds: 99 exceeds the refundable balance", "23514"));
  const res = await handleWebhook(await signed(refundEvent("refund.created", { metadata: {} })), deps);
  assertEquals(res.status, 200);
  assertEquals(state.events.get("evt_refund_1")?.status, "failed");
});
