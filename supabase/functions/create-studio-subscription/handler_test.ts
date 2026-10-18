import { assert, assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { parseStudioSubscriptionInput } from "../_shared/studioBilling.ts";
import { handleStudioCheckout, type StudioCheckoutDeps, type StudioSessionParams } from "./handler.ts";

const USER = { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "member@example.invalid" };
const TOKEN = "member.jwt.sig";
const SITE = "https://global-toothgems.example";

function fakeDeps(overrides: Partial<StudioCheckoutDeps> = {}) {
  const calls = { sessions: [] as StudioSessionParams[], expired: [] as string[], customers: [] as string[] };
  const deps: StudioCheckoutDeps = {
    origins: readSiteOrigins(SITE, "http://localhost:3000"),
    userFromToken: (token) => Promise.resolve(token === TOKEN ? USER : null),
    termsAccepted: () => Promise.resolve(true),
    hasBlockingSubscription: () => Promise.resolve(false),
    planPrice: (plan, interval) =>
      Promise.resolve(plan === "artist" && interval === "year" ? { stripePriceId: "price_artistYear01", amountMinor: 19900, currency: "EUR" } : null),
    ensureCustomer: (userId) => {
      calls.customers.push(userId);
      return Promise.resolve("cus_test000001");
    },
    expireOpenSessions: (customerId) => {
      calls.expired.push(customerId);
      return Promise.resolve(1);
    },
    createSession: (params) => {
      calls.sessions.push(params);
      return Promise.resolve({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

const request = (body: unknown, token: string | null = TOKEN, origin = SITE) =>
  new Request("https://fn.example/create-studio-subscription", {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const ARTIST_YEAR = { plan: "artist", interval: "year", locale: "en" };

Deno.test("input: plan and interval are required, unknown keys refused, locale defaults to fr", () => {
  assertEquals(parseStudioSubscriptionInput({ plan: "essential", interval: "month" }), {
    ok: true,
    value: { plan: "essential", interval: "month", locale: "fr" },
  });
  assertEquals(parseStudioSubscriptionInput({ plan: "gold", interval: "month" }), { ok: false, field: "plan" });
  assertEquals(parseStudioSubscriptionInput({ plan: "artist", interval: "week" }), { ok: false, field: "interval" });
  assertEquals(parseStudioSubscriptionInput({ plan: "artist", interval: "year", price: "price_x" }), { ok: false, field: "price" });
  assertEquals(parseStudioSubscriptionInput({ plan: "artist", interval: "year", amount: 1 }), { ok: false, field: "amount" });
  assertEquals(parseStudioSubscriptionInput([]), { ok: false, field: "body" });
});

Deno.test("a signed-in member gets a subscription Checkout for the stored price", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleStudioCheckout(request(ARTIST_YEAR), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { status: "checkout", url: "https://checkout.stripe.com/c/pay/cs_test_1", amount: 19900, currency: "EUR" });
  assertEquals(calls.expired, ["cus_test000001"]);
  assertEquals(calls.sessions.length, 1);
  const session = calls.sessions[0];
  assertEquals(session.priceId, "price_artistYear01");
  assertEquals(session.userId, USER.id);
  assertEquals(session.customerId, "cus_test000001");
  assertEquals(session.successUrl, `${SITE}/studio-3d/atelier?subscription=success`);
  assertEquals(session.cancelUrl, `${SITE}/studio-3d/atelier?subscription=canceled`);
});

Deno.test("return addresses follow an allowed origin, else production", async () => {
  const { deps, calls } = fakeDeps();
  await handleStudioCheckout(request(ARTIST_YEAR, TOKEN, "http://localhost:3000"), deps);
  await handleStudioCheckout(request(ARTIST_YEAR, TOKEN, "https://evil.example"), deps);
  assert(calls.sessions[0].successUrl.startsWith("http://localhost:3000/"));
  assert(calls.sessions[1].successUrl.startsWith(`${SITE}/`));
});

Deno.test("visitors, invalid tokens and the publishable key are refused before anything else", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await handleStudioCheckout(request(ARTIST_YEAR, null), deps)).status, 401);
  assertEquals((await handleStudioCheckout(request(ARTIST_YEAR, "sb_publishable_abc"), deps)).status, 401);
  const expired = await handleStudioCheckout(request(ARTIST_YEAR, "other.jwt.sig"), deps);
  assertEquals(expired.status, 401);
  assertEquals((await expired.json()).error, "session_expired");
  assertEquals(calls.customers.length, 0);
  assertEquals(calls.sessions.length, 0);
});

Deno.test("one subscription per account: a blocking one is refused without touching Stripe", async () => {
  const { deps, calls } = fakeDeps({ hasBlockingSubscription: () => Promise.resolve(true) });
  const res = await handleStudioCheckout(request(ARTIST_YEAR), deps);
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, "already_subscribed");
  assertEquals(calls.customers.length, 0);
});

Deno.test("terms not accepted, unknown price, invalid body", async () => {
  const terms = fakeDeps({ termsAccepted: () => Promise.resolve(false) });
  assertEquals((await (await handleStudioCheckout(request(ARTIST_YEAR), terms.deps)).json()).error, "terms_required");

  const { deps, calls } = fakeDeps();
  const missing = await handleStudioCheckout(request({ plan: "essential", interval: "month" }), deps);
  assertEquals(missing.status, 409);
  assertEquals((await missing.json()).error, "plan_unavailable");
  const invalid = await handleStudioCheckout(request({ plan: "artist", interval: "year", amount: 1 }), deps);
  assertEquals(invalid.status, 400);
  assertEquals(calls.sessions.length, 0);
});

Deno.test("Stripe unavailable: payment_unavailable; failing to expire old sessions does not block", async () => {
  const down = fakeDeps({ createSession: () => Promise.reject(new Error("stripe down")) });
  const res = await handleStudioCheckout(request(ARTIST_YEAR), down.deps);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "payment_unavailable");

  const { deps, calls } = fakeDeps({ expireOpenSessions: () => Promise.reject(new Error("list failed")) });
  assertEquals((await handleStudioCheckout(request(ARTIST_YEAR), deps)).status, 200);
  assertEquals(calls.sessions.length, 1);
});

Deno.test("CORS preflight and methods", async () => {
  const { deps } = fakeDeps();
  const preflight = await handleStudioCheckout(new Request("https://fn.example/x", { method: "OPTIONS", headers: { origin: SITE } }), deps);
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get("access-control-allow-origin"), SITE);
  assertEquals((await handleStudioCheckout(new Request("https://fn.example/x", { method: "GET" }), deps)).status, 405);
});
