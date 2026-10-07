import { assert, assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { handleCheckout, releasePaymentStep, RESERVATION_MINUTES, SESSION_MINUTES, type CheckoutDeps, type CheckoutSessionParams, type OrderRow, type ReleaseDeps } from "./handler.ts";

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
const SECRET = "cs_test_a1B2c3D4e5F6g7H8_secret_Zz9Yy8Xx7Ww6";
const PREVIOUS = "cs_test_Old0Old0Old0Old0_secret_Pp1Qq2Rr3Ss4";

function fakeDeps(overrides: Partial<CheckoutDeps> = {}) {
  const calls = {
    createOrder: [] as { userId: string | null; minutes: number }[],
    sessions: [] as { params: CheckoutSessionParams; key: string }[],
    cancelled: [] as string[],
    recorded: [] as string[],
    released: [] as { sessionId: string; secret: string }[],
  };
  const deps: CheckoutDeps = {
    publishableKey: "pk_test_123",
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
      return Promise.resolve({ id: "cs_test_123", clientSecret: SECRET });
    },
    releasePaymentStep: (sessionId, secret) => {
      calls.released.push({ sessionId, secret });
      return Promise.resolve("released");
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
  assertEquals(await res.json(), {
    status: "payment",
    client_secret: SECRET,
    publishable_key: "pk_test_123",
    order_number: "GT-100042",
    amount_due: 4290,
    currency: "EUR",
    expires_at: new Date(NOW + SESSION_MINUTES * 60_000).toISOString(),
  });
  assertEquals(calls.createOrder, [{ userId: null, minutes: RESERVATION_MINUTES }]);
  const [{ params, key }] = calls.sessions;
  assertEquals(params.amountDue, 4290);
  assertEquals(params.currency, "EUR");
  assertEquals(params.orderId, ORDER.id);
  assertEquals(key, `checkout-session:${ORDER.id}`);
  assertEquals(params.expiresAt, NOW / 1000 + SESSION_MINUTES * 60);
  assert(params.expiresAt - NOW / 1000 >= 30 * 60, "Stripe needs ≥ 30 minutes");
  // An origin outside the allow-list gets production addresses and no CORS grant.
  assertEquals(params.returnUrl, "https://globaltoothgems.com/en/cart/confirmation?session_id={CHECKOUT_SESSION_ID}");
  assertEquals(res.headers.get("access-control-allow-origin"), null);
  assertEquals(calls.recorded, ["cs_test_123"]);
});

Deno.test("an allowed origin gets its own return addresses and CORS", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleCheckout(post({ ...BODY, locale: "fr" }, { origin: "http://localhost:5173" }), deps);
  assertEquals(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assertEquals(calls.sessions[0].params.returnUrl, "http://localhost:5173/fr/panier/confirmation?session_id={CHECKOUT_SESSION_ID}");
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

Deno.test("fully paid with gift cards: the order's follow-ups run, and a failure there changes nothing", async () => {
  const followed: string[] = [];
  const { deps } = fakeDeps({
    createOrder: () => Promise.resolve({ order: { ...ORDER, amount_due: 0, payment_status: "paid" } }),
    orderPaid: (orderId: string) => {
      followed.push(orderId);
      return Promise.reject(new Error("resend down"));
    },
  });
  const res = await handleCheckout(post(BODY), deps);
  assertEquals(await res.json(), { status: "paid", order_number: "GT-100042" });
  assertEquals(followed, [ORDER.id]);

  // A card order is paid later, by the webhook: nothing is sent at creation.
  const card = fakeDeps({ orderPaid: (orderId: string) => { followed.push(orderId); return Promise.resolve(); } });
  await handleCheckout(post(BODY), card.deps);
  assertEquals(followed.length, 1);
});

Deno.test("gift card codes: cards held by an abandoned payment are released before the new order", async () => {
  const order: string[] = [];
  const { deps } = fakeDeps({
    releaseHeldGiftCards: (codes) => {
      order.push(`release:${codes.join(",")}`);
      return Promise.resolve(1);
    },
    createOrder: () => {
      order.push("create");
      return Promise.resolve({ order: ORDER });
    },
  });
  const res = await handleCheckout(post({ ...BODY, gift_card_codes: ["GT-ABCD-EFGH-JKLM"] }), deps);
  assertEquals(res.status, 200);
  assertEquals(order, ["release:GT-ABCD-EFGH-JKLM", "create"]);
});

Deno.test("no gift card code: nothing is released; a failed release never blocks the checkout", async () => {
  let released = 0;
  const none = fakeDeps({ releaseHeldGiftCards: () => (released++, Promise.resolve(0)) });
  await handleCheckout(post(BODY), none.deps);
  assertEquals(released, 0);
  const failing = fakeDeps({ releaseHeldGiftCards: () => Promise.reject(new Error("stripe down")) });
  const res = await handleCheckout(post({ ...BODY, gift_card_codes: ["GT-ABCD-EFGH-JKLM"] }), failing.deps);
  assertEquals(res.status, 200);
  assertEquals(failing.calls.createOrder.length, 1);
});

Deno.test("no publishable key: payment unavailable before anything is reserved", async () => {
  const { deps, calls } = fakeDeps({ publishableKey: null });
  const res = await handleCheckout(post(BODY), deps);
  assertEquals(res.status, 502);
  assertEquals(await res.json(), { error: "payment_unavailable" });
  assertEquals(calls.createOrder.length, 0);
});

Deno.test("a previous payment step is closed before the new order; a failure never blocks", async () => {
  const order: string[] = [];
  const { deps, calls } = fakeDeps({
    releasePaymentStep: (sessionId) => {
      order.push(`release:${sessionId}`);
      return Promise.resolve("released");
    },
    createOrder: () => {
      order.push("create");
      return Promise.resolve({ order: ORDER });
    },
  });
  const res = await handleCheckout(post({ ...BODY, previous_client_secret: PREVIOUS }), deps);
  assertEquals(res.status, 200);
  assertEquals(order, ["release:cs_test_Old0Old0Old0Old0", "create"]);
  assertEquals(calls.sessions.length, 1);

  const failing = fakeDeps({ releasePaymentStep: () => Promise.reject(new Error("stripe down")) });
  const ok = await handleCheckout(post({ ...BODY, previous_client_secret: PREVIOUS }), failing.deps);
  assertEquals(ok.status, 200);
  assertEquals(failing.calls.createOrder.length, 1);
});

Deno.test("leaving the payment step: released by its client secret only, same answer whatever was found", async () => {
  const { deps, calls } = fakeDeps({ releasePaymentStep: (sessionId, secret) => {
    calls.released.push({ sessionId, secret });
    return Promise.resolve("not_found");
  } });
  const res = await handleCheckout(post({ release_client_secret: PREVIOUS }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "released" });
  assertEquals(calls.released, [{ sessionId: "cs_test_Old0Old0Old0Old0", secret: PREVIOUS }]);
  assertEquals(calls.createOrder.length, 0);

  for (const body of [{ release_client_secret: "cs_test_Old0Old0Old0Old0" }, { release_client_secret: PREVIOUS, items: [] }]) {
    const bad = await handleCheckout(post(body), deps);
    assertEquals(bad.status, 400);
  }
  assertEquals(calls.released.length, 1);
});

function releaseDeps(session: { clientSecret: string | null; status: string; orderId: string | null } | null, order = { status: "pending", paymentStatus: "pending" }, expireFails = false) {
  const calls = { expired: [] as string[], cancelled: [] as { orderId: string; reason: string }[] };
  const deps: ReleaseDeps = {
    retrieveSession: () => Promise.resolve(session),
    expireSession: (id) => {
      if (expireFails) return Promise.reject(new Error("session is being paid"));
      calls.expired.push(id);
      return Promise.resolve();
    },
    orderState: () => Promise.resolve(order),
    cancelOrder: (orderId, reason) => {
      calls.cancelled.push({ orderId, reason });
      return Promise.resolve();
    },
  };
  return { deps, calls };
}

Deno.test("release: the owner's open step is expired and its unpaid order cancelled", async () => {
  const { deps, calls } = releaseDeps({ clientSecret: PREVIOUS, status: "open", orderId: ORDER.id });
  assertEquals(await releasePaymentStep("cs_test_Old0Old0Old0Old0", PREVIOUS, deps), "released");
  assertEquals(calls.expired, ["cs_test_Old0Old0Old0Old0"]);
  assertEquals(calls.cancelled, [{ orderId: ORDER.id, reason: "payment_step_left" }]);
});

Deno.test("release: someone without the session's own secret cannot close it", async () => {
  for (const session of [
    { clientSecret: SECRET, status: "open", orderId: ORDER.id },
    { clientSecret: null, status: "open", orderId: ORDER.id },
    null,
  ]) {
    const { deps, calls } = releaseDeps(session);
    assertEquals(await releasePaymentStep("cs_test_Old0Old0Old0Old0", PREVIOUS, deps), "not_found");
    assertEquals(calls.expired.length + calls.cancelled.length, 0);
  }
  const unknown = releaseDeps(null);
  unknown.deps.retrieveSession = () => Promise.reject(new Error("No such checkout.session"));
  assertEquals(await releasePaymentStep("cs_test_Old0Old0Old0Old0", PREVIOUS, unknown.deps), "not_found");
});

Deno.test("release: a completed or completing payment, or a paid order, is never cancelled", async () => {
  const complete = releaseDeps({ clientSecret: PREVIOUS, status: "complete", orderId: ORDER.id });
  assertEquals(await releasePaymentStep("cs_test_Old0Old0Old0Old0", PREVIOUS, complete.deps), "kept");
  assertEquals(complete.calls.cancelled.length, 0);

  const paying = releaseDeps({ clientSecret: PREVIOUS, status: "open", orderId: ORDER.id }, undefined, true);
  assertEquals(await releasePaymentStep("cs_test_Old0Old0Old0Old0", PREVIOUS, paying.deps), "kept");
  assertEquals(paying.calls.cancelled.length, 0);

  const paid = releaseDeps({ clientSecret: PREVIOUS, status: "expired", orderId: ORDER.id }, { status: "confirmed", paymentStatus: "paid" });
  assertEquals(await releasePaymentStep("cs_test_Old0Old0Old0Old0", PREVIOUS, paid.deps), "released");
  assertEquals(paid.calls.cancelled.length, 0);
  assertEquals(paid.calls.expired.length, 0);
});
