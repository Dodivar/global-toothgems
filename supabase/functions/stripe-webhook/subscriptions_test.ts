import { assertEquals } from "jsr:@std/assert@1";
import Stripe from "npm:stripe@18.5.0";
import { DbCallError, handleWebhook, type EventStatus, type WebhookDeps, type WebhookEvent } from "./handler.ts";
import { invoiceLineFacts, subscriptionTarget, type StudioInvoiceLine, type StudioSubscriptionState, type SubscriptionDeps } from "./subscriptions.ts";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_unused", { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const USER = "aaaaaaaa-0000-4000-8000-000000000001";
const PERIOD_END = 1_800_000_000;

async function signed(payload: unknown) {
  const body = JSON.stringify(payload);
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: SECRET, cryptoProvider: crypto });
  return new Request("https://x.supabase.co/functions/v1/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body,
  });
}

const event = (type: string, object: Record<string, unknown>, id = "evt_sub_1") => ({
  id,
  object: "event",
  type,
  livemode: false,
  data: { object },
});

const subscriptionObject = { id: "sub_test0001", object: "subscription", status: "active" };
const invoiceObject = (overrides: Record<string, unknown> = {}) => ({
  id: "in_test0001",
  object: "invoice",
  billing_reason: "subscription_create",
  amount_paid: 1990,
  amount_due: 1990,
  total: 1990,
  currency: "eur",
  created: 1_790_000_000,
  status_transitions: { paid_at: 1_790_000_100 },
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_test0001" } },
  ...overrides,
});

const LINE: StudioInvoiceLine = {
  amountMinor: 1990,
  priceId: "price_artistMonth1",
  periodStart: 1_790_000_000,
  periodEnd: 1_792_600_000,
  proration: false,
  quantity: 1,
};

function fake(stripeState: Partial<StudioSubscriptionState> = {}, applyError?: DbCallError, lines: StudioInvoiceLine[] = [LINE]) {
  const state = {
    linesRead: [] as string[],
    events: new Map<string, EventStatus>(),
    errors: new Map<string, string | undefined>(),
    retrieved: [] as string[],
    applied: [] as Parameters<SubscriptionDeps["applySubscription"]>[0][],
    invoices: [] as Parameters<SubscriptionDeps["recordStudioInvoice"]>[0][],
    logs: [] as string[],
  };
  const current: StudioSubscriptionState = {
    id: "sub_test0001",
    customerId: "cus_test000001",
    status: "active",
    priceId: "price_artistMonth1",
    currentPeriodEnd: PERIOD_END,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    livemode: false,
    metadata: { kind: "studio_subscription", user_id: USER, plan: "artist", interval: "month" },
    ...stripeState,
  };
  const unused = () => Promise.reject(new Error("not an order event"));
  const deps: WebhookDeps = {
    verify: (raw, sig) => stripe.webhooks.constructEventAsync(raw, sig, SECRET, undefined, crypto) as unknown as Promise<WebhookEvent>,
    recordEvent: (e) => {
      const known = state.events.get(e.id);
      if (known) return Promise.resolve(known);
      state.events.set(e.id, "received");
      return Promise.resolve("received" as EventStatus);
    },
    finishEvent: (id, status, error) => {
      state.events.set(id, status);
      state.errors.set(id, error);
      return Promise.resolve();
    },
    orderState: unused,
    paymentDetails: unused,
    markOrderPaid: unused,
    cancelOrder: unused,
    closeCheckoutPayment: unused,
    findRefund: unused,
    markRefundSucceeded: unused,
    markRefundFailed: unused,
    recordExternalRefund: unused,
    studio: {
      retrieveSubscription: (id) => {
        state.retrieved.push(id);
        return Promise.resolve(current);
      },
      applySubscription: (args) => {
        if (applyError) return Promise.reject(applyError);
        state.applied.push(args);
        return Promise.resolve({ created: state.applied.length === 1, otherLiveSubscriptions: 0 });
      },
      recordStudioInvoice: (args) => {
        state.invoices.push(args);
        return Promise.resolve();
      },
      invoiceLines: (id) => {
        state.linesRead.push(id);
        return Promise.resolve(lines);
      },
    },
    log: (message) => state.logs.push(message),
  };
  return { deps, state };
}

Deno.test("subscriptionTarget: subscription, invoice (basil parent), subscription Checkout; others are not ours", () => {
  assertEquals(subscriptionTarget("customer.subscription.updated", subscriptionObject)?.subscriptionId, "sub_test0001");
  const invoice = subscriptionTarget("invoice.paid", invoiceObject());
  assertEquals(invoice?.subscriptionId, "sub_test0001");
  assertEquals(invoice?.invoice?.billingReason, "subscription_create");
  assertEquals(invoice?.invoice?.amountMinor, 1990);
  assertEquals(invoice?.invoice?.occurredAt, 1_790_000_100);
  assertEquals(subscriptionTarget("invoice.paid", invoiceObject({ parent: null })), null);
  assertEquals(
    subscriptionTarget("checkout.session.completed", { id: "cs_test_1", object: "checkout.session", mode: "subscription", subscription: "sub_test0001" })
      ?.subscriptionId,
    "sub_test0001",
  );
  assertEquals(subscriptionTarget("checkout.session.completed", { id: "cs_test_1", object: "checkout.session", mode: "payment" }), null);
});

Deno.test("customer.subscription.created mirrors the subscription as read back from Stripe", async () => {
  const { deps, state } = fake();
  const res = await handleWebhook(await signed(event("customer.subscription.created", subscriptionObject)), deps);
  assertEquals(res.status, 200);
  assertEquals(state.retrieved, ["sub_test0001"]);
  assertEquals(state.applied.length, 1);
  assertEquals(state.applied[0], {
    subscriptionId: "sub_test0001",
    customerId: "cus_test000001",
    metadataUserId: USER,
    priceId: "price_artistMonth1",
    status: "active",
    currentPeriodEnd: new Date(PERIOD_END * 1000).toISOString(),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    livemode: false,
  });
  assertEquals(state.events.get("evt_sub_1"), "processed");
});

Deno.test("a replayed event is acknowledged without touching anything", async () => {
  const { deps, state } = fake();
  const payload = event("customer.subscription.updated", subscriptionObject);
  await handleWebhook(await signed(payload), deps);
  const again = await handleWebhook(await signed(payload), deps);
  assertEquals((await again.json()).duplicate, true);
  assertEquals(state.applied.length, 1);
});

Deno.test("invoice.paid: renewal recorded with its billing reason, amount in decimal", async () => {
  const { deps, state } = fake();
  await handleWebhook(await signed(event("invoice.paid", invoiceObject({ billing_reason: "subscription_cycle", id: "in_test0002" }))), deps);
  assertEquals(state.applied.length, 1);
  assertEquals(state.invoices, [{
    invoiceId: "in_test0002",
    subscriptionId: "sub_test0001",
    billingReason: "subscription_cycle",
    status: "paid",
    amount: "19.90",
    currency: "EUR",
    occurredAt: new Date(1_790_000_100 * 1000).toISOString(),
    total: "19.90",
    lines: [{
      amount: "19.90",
      price_id: "price_artistMonth1",
      period_start: new Date(1_790_000_000 * 1000).toISOString(),
      period_end: new Date(1_792_600_000 * 1000).toISOString(),
      proration: false,
      quantity: 1,
    }],
  }]);
  assertEquals(state.linesRead, ["in_test0002"]);
});

Deno.test("invoiceLineFacts: basil line shapes — price, period, proration flag, negative credit", () => {
  assertEquals(
    invoiceLineFacts({
      object: "line_item",
      amount: 1990,
      quantity: 1,
      period: { start: 10, end: 20 },
      pricing: { type: "price_details", price_details: { price: "price_artistMonth1", product: "prod_1" } },
      parent: { type: "subscription_item_details", subscription_item_details: { proration: false, subscription_item: "si_1" } },
    }),
    { amountMinor: 1990, priceId: "price_artistMonth1", periodStart: 10, periodEnd: 20, proration: false, quantity: 1 },
  );
  assertEquals(
    invoiceLineFacts({
      amount: -495,
      quantity: null,
      period: { start: 10, end: 20 },
      pricing: { price_details: { price: { id: "price_oldPlan01" } } },
      parent: { type: "invoice_item_details", invoice_item_details: { proration: true } },
    }),
    { amountMinor: -495, priceId: "price_oldPlan01", periodStart: 10, periodEnd: 20, proration: true, quantity: 1 },
  );
  assertEquals(invoiceLineFacts({ description: "no amount" }), null);
  assertEquals(invoiceLineFacts(null), null);
});

Deno.test("invoice.paid for a plan change: proration lines with a credit, signed decimals; the total may be negative", async () => {
  const { deps, state } = fake({}, undefined, [
    { ...LINE, amountMinor: -495, priceId: "price_oldPlan01", proration: true },
    { ...LINE, amountMinor: 2495, priceId: "price_atelierMonth1", proration: true },
  ]);
  await handleWebhook(await signed(event("invoice.paid", invoiceObject({ billing_reason: "subscription_update", total: -300, amount_paid: 0 }))), deps);
  assertEquals(state.invoices[0].total, "-3.00");
  assertEquals(state.invoices[0].amount, "0.00");
  assertEquals(state.invoices[0].lines?.map((l) => [l.amount, l.proration]), [["-4.95", true], ["24.95", true]]);
});

Deno.test("invoice.payment_failed: the lines are not read (no legal invoice for an unpaid one)", async () => {
  const { deps, state } = fake({ status: "past_due" });
  await handleWebhook(await signed(event("invoice.payment_failed", invoiceObject())), deps);
  assertEquals(state.linesRead, []);
  assertEquals(state.invoices[0].lines, null);
});

Deno.test("invoice.paid replayed: recorded once (the database issues one invoice per Stripe invoice)", async () => {
  const { deps, state } = fake();
  const payload = event("invoice.paid", invoiceObject(), "evt_inv_1");
  await handleWebhook(await signed(payload), deps);
  await handleWebhook(await signed(payload), deps);
  assertEquals(state.invoices.length, 1);
});

Deno.test("Stripe unreachable when reading the lines: 500 so Stripe retries, nothing recorded", async () => {
  const { deps, state } = fake();
  deps.studio!.invoiceLines = () => Promise.reject(new Error("network"));
  const res = await handleWebhook(await signed(event("invoice.paid", invoiceObject())), deps);
  assertEquals(res.status, 500);
  assertEquals(state.invoices.length, 0);
});

Deno.test("invoice.payment_failed: recorded as failed; the status mirrored is Stripe's (past_due)", async () => {
  const { deps, state } = fake({ status: "past_due" });
  await handleWebhook(await signed(event("invoice.payment_failed", invoiceObject())), deps);
  assertEquals(state.applied[0].status, "past_due");
  assertEquals(state.invoices[0].status, "payment_failed");
});

Deno.test("cancellation at period end, then deletion", async () => {
  const scheduled = fake({ cancelAtPeriodEnd: true });
  await handleWebhook(await signed(event("customer.subscription.updated", subscriptionObject)), scheduled.deps);
  assertEquals(scheduled.state.applied[0].cancelAtPeriodEnd, true);
  assertEquals(scheduled.state.applied[0].status, "active");

  const ended = fake({ status: "canceled", canceledAt: 1_799_000_000 });
  await handleWebhook(await signed(event("customer.subscription.deleted", subscriptionObject, "evt_sub_2")), ended.deps);
  assertEquals(ended.state.applied[0].status, "canceled");
  assertEquals(ended.state.applied[0].canceledAt, new Date(1_799_000_000 * 1000).toISOString());
});

Deno.test("a subscription this site did not create is ignored", async () => {
  const { deps, state } = fake({ metadata: {} });
  const res = await handleWebhook(await signed(event("customer.subscription.created", subscriptionObject)), deps);
  assertEquals(res.status, 200);
  assertEquals(state.applied.length, 0);
  assertEquals(state.events.get("evt_sub_1"), "ignored");
});

Deno.test("an unknown account or price is a permanent failure (stored, acknowledged)", async () => {
  const { deps, state } = fake({}, new DbCallError("apply_studio_subscription: unknown account", "P0002"));
  const res = await handleWebhook(await signed(event("customer.subscription.created", subscriptionObject)), deps);
  assertEquals(res.status, 200);
  assertEquals(state.events.get("evt_sub_1"), "failed");
});

Deno.test("Stripe unreachable when reading back: 500 so Stripe retries", async () => {
  const { deps, state } = fake();
  deps.studio!.retrieveSubscription = () => Promise.reject(new Error("network"));
  const res = await handleWebhook(await signed(event("customer.subscription.updated", subscriptionObject)), deps);
  assertEquals(res.status, 500);
  assertEquals(state.events.get("evt_sub_1"), "failed");
});

Deno.test("a subscription Checkout completing is not mistaken for an order", async () => {
  const { deps, state } = fake();
  const res = await handleWebhook(
    await signed(event("checkout.session.completed", {
      id: "cs_test_sub",
      object: "checkout.session",
      mode: "subscription",
      subscription: "sub_test0001",
      payment_status: "paid",
      amount_total: 1990,
      currency: "eur",
      metadata: { kind: "studio_subscription", user_id: USER },
    })),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(state.applied.length, 1);
});
