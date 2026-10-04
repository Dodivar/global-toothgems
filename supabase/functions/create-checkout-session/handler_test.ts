import { assert, assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { handleCheckout, RESERVATION_MINUTES, SESSION_MINUTES, type CheckoutDeps, type CheckoutSessionParams, type OrderRow } from "./handler.ts";

const ORDER: OrderRow = {
  id: "11111111-2222-4333-8444-555555555555",
  order_number: "GT-100042",
  customer_email: "camille@example.com",
  currency: "EUR",
  amount_due: "42.90",
  payment_status: "pending",
  expires_at: null,
};

const BODY = {
  items: [{ product_id: "0b5e6a52-7d0c-4a55-9d7e-1f6f6b2c1a01", variant_id: null, quantity: 2 }],
  email: "camille@example.com",
  address: { first_name: "C", last_name: "R", address_line1: "1 rue", postal_code: "69001", city: "Lyon", country_code: "FR" },
  shipping_rate_id: "5f0e9d8c-7b6a-4958-8473-625140392817",
  locale: "en",
};

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);

function fakeDeps(overrides: Partial<CheckoutDeps> = {}) {
  const calls = {
    createOrder: [] as { userId: string | null; minutes: number }[],
    sessions: [] as { params: CheckoutSessionParams; key: string }[],
    cancelled: [] as string[],
    recorded: [] as string[],
  };
  const deps: CheckoutDeps = {
    maintenanceEnabled: () => Promise.resolve(false),
    origins: readSiteOrigins("https://globaltoothgems.com", "http://localhost:5173, https://preview.example.app"),
    userFromToken: (token) => Promise.resolve(token === "a.valid.jwt" ? "user-1" : null),
    termsAccepted: () => Promise.resolve(true),
    createOrder: (_input, userId, minutes) => {
      calls.createOrder.push({ userId, minutes });
      return Promise.resolve({ order: ORDER });
    },
    cancelOrder: (id) => {
      calls.cancelled.push(id);
      return Promise.resolve();
    },
    createStripeSession: (params, key) => {
      calls.sessions.push({ params, key });
      return Promise.resolve({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
    },
    recordCheckoutPayment: (_order, sessionId) => {
      calls.recorded.push(sessionId);
      return Promise.resolve();
    },
    now: () => NOW,
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://x.supabase.co/functions/v1/create-checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("guest checkout: order from the database, session for its amount due", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleCheckout(post(BODY, { origin: "https://evil.example" }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
  assertEquals(calls.createOrder, [{ userId: null, minutes: RESERVATION_MINUTES }]);
  const [{ params, key }] = calls.sessions;
  assertEquals(params.amountDue, 4290);
  assertEquals(params.currency, "EUR");
  assertEquals(params.orderId, ORDER.id);
  assertEquals(key, `checkout-session:${ORDER.id}`);
  assertEquals(params.expiresAt, NOW / 1000 + SESSION_MINUTES * 60);
  assert(params.expiresAt - NOW / 1000 >= 30 * 60, "Stripe needs ≥ 30 minutes");
  // An origin outside the allow-list gets production addresses and no CORS grant.
  assertEquals(params.successUrl, "https://globaltoothgems.com/en/cart/confirmation?session_id={CHECKOUT_SESSION_ID}");
  assertEquals(params.cancelUrl, "https://globaltoothgems.com/en/cart");
  assertEquals(res.headers.get("access-control-allow-origin"), null);
  assertEquals(calls.recorded, ["cs_test_123"]);
});

Deno.test("an allowed origin gets its own return addresses and CORS", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleCheckout(post({ ...BODY, locale: "fr" }, { origin: "http://localhost:5173" }), deps);
  assertEquals(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assertEquals(calls.sessions[0].params.cancelUrl, "http://localhost:5173/fr/panier");
  const preflight = await handleCheckout(new Request("https://x/f", { method: "OPTIONS", headers: { origin: "http://localhost:5173" } }), deps);
  assertEquals(preflight.status, 204);
});

Deno.test("signed-in customer: the order is attached to the verified account", async () => {
  const { deps, calls } = fakeDeps();
  await handleCheckout(post(BODY, { authorization: "Bearer a.valid.jwt" }), deps);
  assertEquals(calls.createOrder[0].userId, "user-1");
  // The publishable key is not a user token: guest checkout.
  const guest = fakeDeps();
  await handleCheckout(post(BODY, { authorization: "Bearer sb_publishable_abc" }), guest.deps);
  assertEquals(guest.calls.createOrder[0].userId, null);
});

Deno.test("an account that has not accepted the terms creates no order (a guest is not asked)", async () => {
  const { deps, calls } = fakeDeps({ termsAccepted: () => Promise.resolve(false) });
  const res = await handleCheckout(post(BODY, { authorization: "Bearer a.valid.jwt" }), deps);
  assertEquals(res.status, 409);
  assertEquals((await res.json()).error, "terms_required");
  assertEquals(calls.createOrder.length, 0);
  const guest = await handleCheckout(post(BODY), deps);
  assertEquals(guest.status, 200);
  assertEquals(calls.createOrder.length, 1);
  // An unreadable record is a server error, never a free pass.
  const broken = fakeDeps({ termsAccepted: () => Promise.reject(new Error("db down")) });
  const failed = await handleCheckout(post(BODY, { authorization: "Bearer a.valid.jwt" }), broken.deps);
  assertEquals(failed.status, 500);
  assertEquals(broken.calls.createOrder.length, 0);
});

Deno.test("an expired session token is refused, not turned into a guest order", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleCheckout(post(BODY, { authorization: "Bearer an.expired.jwt" }), deps);
  assertEquals(res.status, 401);
  assertEquals(calls.createOrder.length, 0);
});

Deno.test("invalid input never reaches the database", async () => {
  const { deps, calls } = fakeDeps();
  for (const body of ["{", { ...BODY, total: 1 }, { ...BODY, items: [] }, "x".repeat(40 * 1024)]) {
    const res = await handleCheckout(post(body), deps);
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_request");
  }
  assertEquals((await handleCheckout(new Request("https://x/f", { method: "GET" }), deps)).status, 405);
  assertEquals(calls.createOrder.length, 0);
});

Deno.test("database refusals map to codes without leaking SQL", async () => {
  const cases: [{ code: string; message: string }, string, number][] = [
    [{ code: "P0001", message: "create_order: insufficient stock for Gel" }, "out_of_stock", 409],
    [{ code: "P0002", message: "create_order: product x is not available" }, "unavailable", 409],
    [{ code: "22023", message: "create_order: shipping rate not applicable to this basket" }, "shipping_unavailable", 409],
    [{ code: "P0002", message: "create_order: promotion code NOPE is not valid for this order" }, "promotion_code_invalid", 409],
    [{ code: "XX000", message: "relation does not exist" }, "server_error", 500],
  ];
  for (const [error, code, status] of cases) {
    const { deps, calls } = fakeDeps({ createOrder: () => Promise.resolve({ error }) });
    const res = await handleCheckout(post(BODY), deps);
    assertEquals(res.status, status);
    const text = await res.text();
    assertEquals(JSON.parse(text), { error: code });
    assert(!text.includes("create_order"));
    assertEquals(calls.sessions.length, 0);
  }
});

Deno.test("Stripe unavailable: the order is cancelled at once (stock released)", async () => {
  const { deps, calls } = fakeDeps({ createStripeSession: () => Promise.reject(new Error("stripe down")) });
  const res = await handleCheckout(post(BODY), deps);
  assertEquals(res.status, 502);
  assertEquals(await res.json(), { error: "payment_unavailable" });
  assertEquals(calls.cancelled, [ORDER.id]);
});

Deno.test("fully paid with gift cards: no Stripe session", async () => {
  const { deps, calls } = fakeDeps({
    createOrder: () => Promise.resolve({ order: { ...ORDER, amount_due: 0, payment_status: "paid" } }),
  });
  const res = await handleCheckout(post(BODY), deps);
  assertEquals(await res.json(), { status: "paid", order_number: "GT-100042" });
  assertEquals(calls.sessions.length, 0);
});

Deno.test("no order while the shop is in maintenance (and none if the switch cannot be read)", async () => {
  const on = fakeDeps({ maintenanceEnabled: () => Promise.resolve(true) });
  const res = await handleCheckout(post(BODY), on.deps);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), { error: "maintenance" });
  assertEquals(on.calls.createOrder.length, 0);
  const unknown = fakeDeps({ maintenanceEnabled: () => Promise.reject(new Error("db down")) });
  assertEquals((await handleCheckout(post(BODY), unknown.deps)).status, 500);
  assertEquals(unknown.calls.createOrder.length, 0);
});
