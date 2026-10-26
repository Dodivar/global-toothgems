import { assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { changeRefusal, parseStudioManageRequest, prorationInstant, type ManagedSubscription } from "../_shared/studioManage.ts";
import { type ChargeOutcome, handleStudioManage, type ManagedContext, type StudioManageDeps } from "./handler.ts";

const SITE = "https://global-toothgems.example";
const TOKEN = "member.jwt.sig";
const NOW = Date.UTC(2026, 9, 26, 10, 0, 0);
const NOW_S = Math.floor(NOW / 1000);

const ACTIVE: ManagedSubscription = { status: "active", plan: "artist", interval: "month", cancelAtPeriodEnd: false, pendingUpdate: false };

function context(sub: Partial<ManagedSubscription> = {}): ManagedContext {
  return {
    customerId: "cus_1",
    subscriptionId: "sub_1",
    itemId: "si_1",
    sub: { ...ACTIVE, ...sub },
    currentPeriodEnd: NOW_S + 20 * 86400,
    amountMinor: 1990,
    currency: "EUR",
    paymentMethodId: null,
  };
}

function fake(options: { ctx?: ManagedContext | null; customer?: string | null; charge?: ChargeOutcome; publishable?: string | null } = {}) {
  const calls: string[] = [];
  const deps: StudioManageDeps = {
    origins: readSiteOrigins(SITE, undefined),
    publishableKey: options.publishable === undefined ? "pk_test_x" : options.publishable,
    userFromToken: (token) => Promise.resolve(token === TOKEN ? "user-1" : null),
    customerOf: () => Promise.resolve(options.customer === undefined ? "cus_1" : options.customer),
    subscriptionOf: () => Promise.resolve(options.ctx === undefined ? context() : options.ctx),
    overview: () => Promise.resolve({ subscription: { plan: "artist" }, card: null }),
    priceOf: (plan, interval) => Promise.resolve(plan === "atelier" && interval === "year" ? null : `price_${plan}_${interval}`),
    preview: (_ctx, priceId, date) => {
      calls.push(`preview:${priceId}:${date}`);
      return Promise.resolve({ dueNow: 0, nextAmount: 4490, nextDate: NOW_S + 20 * 86400, credit: 0, currency: "EUR" });
    },
    change: (_ctx, priceId, date) => {
      calls.push(`change:${priceId}:${date}`);
      return Promise.resolve(options.charge ?? { kind: "done" });
    },
    cancel: (_ctx, reason) => {
      calls.push(`cancel:${reason}`);
      return Promise.resolve();
    },
    resume: () => {
      calls.push("resume");
      return Promise.resolve();
    },
    startCardSession: (args) => {
      calls.push(`card_start:${args.returnUrl}`);
      return Promise.resolve("cs_test_a1_secret_b2");
    },
    cardSession: (id) =>
      Promise.resolve(
        id === "cs_test_mine000000"
          ? { status: "complete", kind: "studio_card", userId: "user-1", paymentMethodId: "pm_1" }
          : id === "cs_test_other00000"
          ? { status: "complete", kind: "studio_card", userId: "user-2", paymentMethodId: "pm_2" }
          : null,
      ),
    saveCard: (_ctx, pm) => {
      calls.push(`save:${pm}`);
      return Promise.resolve(options.charge ?? { kind: "done" });
    },
    now: () => NOW,
    log: () => {},
  };
  return { deps, calls };
}

const post = (body: unknown, token: string | null = TOKEN) =>
  new Request("https://fn.example/studio-manage-subscription", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("requests carry an action and that action's fields only: no price, amount or user", () => {
  assertEquals(parseStudioManageRequest({ action: "preview", plan: "atelier", interval: "month" }).ok, true);
  assertEquals(parseStudioManageRequest({ action: "preview", plan: "atelier", interval: "month", price: "price_x" }), { ok: false, field: "price" });
  assertEquals(parseStudioManageRequest({ action: "change", plan: "gold", interval: "month" }), { ok: false, field: "plan" });
  assertEquals(parseStudioManageRequest({ action: "change", plan: "artist", interval: "week" }), { ok: false, field: "interval" });
  assertEquals(parseStudioManageRequest({ action: "change", plan: "artist", interval: "year", proration_date: "1" }), { ok: false, field: "proration_date" });
  assertEquals(parseStudioManageRequest({ action: "cancel", reason: "angry" }), { ok: false, field: "reason" });
  assertEquals(parseStudioManageRequest({ action: "cancel", reason: "too_expensive" }).ok, true);
  assertEquals(parseStudioManageRequest({ action: "resume", user_id: "x" }), { ok: false, field: "user_id" });
  assertEquals(parseStudioManageRequest({ action: "refund" }), { ok: false, field: "action" });
  assertEquals(parseStudioManageRequest({ action: "card_saved", session_id: "nope" }), { ok: false, field: "session_id" });
});

Deno.test("a switch needs a subscription in good standing, not set to end, and another price", () => {
  assertEquals(changeRefusal(ACTIVE, "atelier", "month"), null);
  assertEquals(changeRefusal(ACTIVE, "artist", "year"), null);
  assertEquals(changeRefusal(ACTIVE, "artist", "month"), "same_plan");
  assertEquals(changeRefusal({ ...ACTIVE, status: "past_due" }, "atelier", "month"), "not_active");
  assertEquals(changeRefusal({ ...ACTIVE, cancelAtPeriodEnd: true }, "atelier", "month"), "cancel_scheduled");
  // A change still waiting for its payment is replaced by a new one.
  assertEquals(changeRefusal({ ...ACTIVE, pendingUpdate: true }, "atelier", "month"), null);
});

Deno.test("the preview's proration instant is reused only when recent", () => {
  assertEquals(prorationInstant(null, NOW_S), NOW_S);
  assertEquals(prorationInstant(NOW_S - 60, NOW_S), NOW_S - 60);
  assertEquals(prorationInstant(NOW_S - 16 * 60, NOW_S), NOW_S);
  assertEquals(prorationInstant(NOW_S + 60, NOW_S), NOW_S);
});

Deno.test("no token or an expired one is refused before anything is read", async () => {
  const { deps, calls } = fake();
  assertEquals((await handleStudioManage(post({ action: "overview" }, null), deps)).status, 401);
  assertEquals((await handleStudioManage(post({ action: "cancel" }, "other.jwt.sig"), deps)).status, 401);
  assertEquals((await handleStudioManage(post("not json"), deps)).status, 400);
  assertEquals(calls, []);
});

Deno.test("overview without a Stripe customer is empty; actions without a subscription are refused", async () => {
  const none = fake({ customer: null });
  const res = await handleStudioManage(post({ action: "overview" }), none.deps);
  assertEquals(await res.json(), { subscription: null, card: null });
  const gone = fake({ ctx: null });
  const res2 = await handleStudioManage(post({ action: "cancel" }), gone.deps);
  assertEquals(res2.status, 409);
  assertEquals(await res2.json(), { error: "no_subscription" });
});

Deno.test("preview: the price comes from the database, an interval switch is charged now", async () => {
  const { deps, calls } = fake();
  const res = await handleStudioManage(post({ action: "preview", plan: "artist", interval: "year" }), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.charged_now, true);
  assertEquals(body.proration_date, NOW_S);
  assertEquals(calls, [`preview:price_artist_year:${NOW_S}`]);

  const same = await handleStudioManage(post({ action: "preview", plan: "atelier", interval: "month" }), deps);
  assertEquals((await same.json()).charged_now, false);

  const unavailable = await handleStudioManage(post({ action: "preview", plan: "atelier", interval: "year" }), deps);
  assertEquals(unavailable.status, 409);
  assertEquals(await unavailable.json(), { error: "plan_unavailable" });
});

Deno.test("change: refused rules never reach Stripe; a 3-D Secure charge returns its client secret", async () => {
  const canceling = fake({ ctx: context({ cancelAtPeriodEnd: true }) });
  const refused = await handleStudioManage(post({ action: "change", plan: "atelier", interval: "month" }), canceling.deps);
  assertEquals(await refused.json(), { error: "cancel_scheduled" });
  assertEquals(canceling.calls, []);

  const ok = fake();
  const res = await handleStudioManage(post({ action: "change", plan: "atelier", interval: "month", proration_date: NOW_S - 30 }), ok.deps);
  assertEquals(await res.json(), { status: "updated" });
  assertEquals(ok.calls, [`change:price_atelier_month:${NOW_S - 30}`]);

  const action = fake({ charge: { kind: "requires_action", clientSecret: "pi_1_secret_2" } });
  const res2 = await handleStudioManage(post({ action: "change", plan: "artist", interval: "year" }), action.deps);
  assertEquals(await res2.json(), { status: "requires_action", client_secret: "pi_1_secret_2", publishable_key: "pk_test_x" });

  const failed = fake({ charge: { kind: "payment_failed" } });
  const res3 = await handleStudioManage(post({ action: "change", plan: "artist", interval: "year" }), failed.deps);
  assertEquals(res3.status, 402);
});

Deno.test("cancel and resume follow the subscription's state", async () => {
  const { deps, calls } = fake();
  assertEquals(await (await handleStudioManage(post({ action: "cancel", reason: "unused" }), deps)).json(), { status: "canceled" });
  assertEquals(calls, ["cancel:unused"]);
  const notCanceled = await handleStudioManage(post({ action: "resume" }), deps);
  assertEquals(await notCanceled.json(), { error: "not_canceled" });

  const canceling = fake({ ctx: context({ cancelAtPeriodEnd: true }) });
  assertEquals(await (await handleStudioManage(post({ action: "cancel" }), canceling.deps)).json(), { error: "already_canceled" });
  assertEquals(await (await handleStudioManage(post({ action: "resume" }), canceling.deps)).json(), { status: "resumed" });

  const ended = fake({ ctx: context({ status: "canceled" }) });
  assertEquals(await (await handleStudioManage(post({ action: "cancel" }), ended.deps)).json(), { error: "not_active" });
});

Deno.test("card: the setup session comes back to the account page; only this member's completed session is saved", async () => {
  const { deps, calls } = fake();
  const res = await handleStudioManage(post({ action: "card_start" }), deps);
  assertEquals(await res.json(), { client_secret: "cs_test_a1_secret_b2", publishable_key: "pk_test_x", expires_at: NOW_S + 1800 });
  assertEquals(calls, [`card_start:${SITE}/compte/studio?card=saved&session_id={CHECKOUT_SESSION_ID}`]);

  const mine = await handleStudioManage(post({ action: "card_saved", session_id: "cs_test_mine000000" }), deps);
  assertEquals(await mine.json(), { status: "card_saved" });
  const other = await handleStudioManage(post({ action: "card_saved", session_id: "cs_test_other00000" }), deps);
  assertEquals(other.status, 400);
  assertEquals(calls.filter((c) => c.startsWith("save:")), ["save:pm_1"]);

  const unconfigured = fake({ publishable: null });
  assertEquals((await handleStudioManage(post({ action: "card_start" }), unconfigured.deps)).status, 503);
});
