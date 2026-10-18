import { assert, assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { parseStudioCheckoutRequest, parseStudioSubscriptionInput } from "../_shared/studioBilling.ts";
import { handleStudioCheckout, type StudioCheckoutDeps, type StudioSessionParams, type StudioSessionState } from "./handler.ts";

const USER = { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "member@example.invalid" };
const TOKEN = "member.jwt.sig";
const SITE = "https://global-toothgems.example";
const SESSION_ID = "cs_test_a1B2c3D4e5F6g7H8";
const SECRET = `${SESSION_ID}_secret_Zz9Yy8Xx7Ww6`;
const NOW = Date.parse("2026-10-18T12:00:00Z");
const OPEN_SESSION: StudioSessionState = { clientSecret: SECRET, status: "open", kind: "studio_subscription", userId: USER.id };

function fakeDeps(overrides: Partial<StudioCheckoutDeps> = {}) {
  const calls = { sessions: [] as StudioSessionParams[], expired: [] as string[], customers: [] as string[], consents: [] as string[], marked: [] as string[], expiredSessions: [] as string[] };
  const deps: StudioCheckoutDeps = {
    origins: readSiteOrigins(SITE, "http://localhost:3000"),
    publishableKey: "pk_test_studio",
    userFromToken: (token) => Promise.resolve(token === TOKEN ? USER : null),
    termsAccepted: () => Promise.resolve(true),
    hasBlockingSubscription: () => Promise.resolve(false),
    planPrice: (plan, interval) =>
      Promise.resolve(plan === "artist" && interval === "year" ? { stripePriceId: "price_artistYear01", amountMinor: 19900, currency: "EUR" } : null),
    recordWithdrawalConsent: (userId) => {
      calls.consents.push(userId);
      return Promise.resolve("cccccccc-0000-4000-8000-000000000001");
    },
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
      return Promise.resolve({ id: SESSION_ID, clientSecret: SECRET });
    },
    retrieveSession: (id) => Promise.resolve(id === SESSION_ID ? OPEN_SESSION : null),
    markSessionConsent: (id, consentId) => {
      calls.marked.push(`${id}:${consentId}`);
      return Promise.resolve();
    },
    expireSession: (id) => {
      calls.expiredSessions.push(id);
      return Promise.resolve();
    },
    now: () => NOW,
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

const ARTIST_YEAR = { plan: "artist", interval: "year", locale: "en" } as const;

Deno.test("input: plan and interval are required, unknown keys refused, locale defaults to fr", () => {
  assertEquals(parseStudioSubscriptionInput({ plan: "essential", interval: "month" }), {
    ok: true,
    value: { plan: "essential", interval: "month", locale: "fr" },
  });
  assertEquals(parseStudioSubscriptionInput({ plan: "gold", interval: "month" }), { ok: false, field: "plan" });
  assertEquals(parseStudioSubscriptionInput({ plan: "artist", interval: "week" }), { ok: false, field: "interval" });
  assertEquals(parseStudioSubscriptionInput({ plan: "artist", interval: "year", price: "price_x" }), { ok: false, field: "price" });
  assertEquals(parseStudioSubscriptionInput({ plan: "artist", interval: "year", amount: 1 }), { ok: false, field: "amount" });
  // The request is no longer sent with the plan: it is ticked in the payment step.
  assertEquals(parseStudioSubscriptionInput({ plan: "artist", interval: "year", withdrawal_consent: true }), { ok: false, field: "withdrawal_consent" });
  assertEquals(parseStudioSubscriptionInput([]), { ok: false, field: "body" });
});

Deno.test("input: a consent or release request names a Checkout client secret, alone", () => {
  assertEquals(parseStudioCheckoutRequest({ consent_client_secret: SECRET }), {
    ok: true,
    value: { action: "consent", secret: SECRET, sessionId: SESSION_ID },
  });
  assertEquals(parseStudioCheckoutRequest({ release_client_secret: SECRET }), {
    ok: true,
    value: { action: "release", secret: SECRET, sessionId: SESSION_ID },
  });
  assertEquals(parseStudioCheckoutRequest({ consent_client_secret: "pi_123_secret_abcdefghij" }), { ok: false, field: "consent_client_secret" });
  assertEquals(parseStudioCheckoutRequest({ consent_client_secret: SECRET, plan: "artist" }), { ok: false, field: "body" });
  assertEquals(parseStudioCheckoutRequest(ARTIST_YEAR), { ok: true, value: { action: "open", input: { ...ARTIST_YEAR } } });
});

Deno.test("a signed-in member gets a payment step for the stored price, on our own page", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleStudioCheckout(request(ARTIST_YEAR), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    status: "payment",
    client_secret: SECRET,
    publishable_key: "pk_test_studio",
    amount: 19900,
    currency: "EUR",
    expires_at: "2026-10-18T13:00:00.000Z",
  });
  assertEquals(calls.expired, ["cus_test000001"]);
  assertEquals(calls.sessions.length, 1);
  const session = calls.sessions[0];
  assertEquals(session.priceId, "price_artistYear01");
  assertEquals(session.userId, USER.id);
  assertEquals(session.customerId, "cus_test000001");
  assertEquals(session.returnUrl, `${SITE}/studio-3d/atelier?subscription=success`);
  // Opening the step records nothing: the request is ticked beside the card form.
  assertEquals(calls.consents.length, 0);
});

Deno.test("no publishable key: nothing opens", async () => {
  const { deps, calls } = fakeDeps({ publishableKey: null });
  const res = await handleStudioCheckout(request(ARTIST_YEAR), deps);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "payment_unavailable");
  assertEquals(calls.customers.length, 0);
});

Deno.test("the immediate-access request is recorded for the member's own open session, then written to it", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleStudioCheckout(request({ consent_client_secret: SECRET }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "consented" });
  assertEquals(calls.consents, [USER.id]);
  assertEquals(calls.marked, [`${SESSION_ID}:cccccccc-0000-4000-8000-000000000001`]);
});

Deno.test("another member's, a foreign or a closed session: no request recorded", async () => {
  const cases: [StudioSessionState | null, number, string][] = [
    [{ ...OPEN_SESSION, userId: "bbbbbbbb-0000-4000-8000-000000000002" }, 400, "invalid_request"],
    [{ ...OPEN_SESSION, kind: null }, 400, "invalid_request"],
    [{ ...OPEN_SESSION, clientSecret: `${SESSION_ID}_secret_other00000` }, 400, "invalid_request"],
    [null, 400, "invalid_request"],
    [{ ...OPEN_SESSION, status: "expired" }, 409, "checkout_closed"],
    [{ ...OPEN_SESSION, status: "complete" }, 409, "checkout_closed"],
  ];
  for (const [state, status, error] of cases) {
    const { deps, calls } = fakeDeps({ retrieveSession: () => Promise.resolve(state) });
    const res = await handleStudioCheckout(request({ consent_client_secret: SECRET }), deps);
    assertEquals(res.status, status);
    assertEquals((await res.json()).error, error);
    assertEquals(calls.consents.length, 0);
  }
});

Deno.test("a request that cannot be recorded stops the payment; the metadata write does not", async () => {
  const failing = fakeDeps({ recordWithdrawalConsent: () => Promise.reject(new Error("insert failed")) });
  const res = await handleStudioCheckout(request({ consent_client_secret: SECRET }), failing.deps);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "server_error");

  const metadata = fakeDeps({ markSessionConsent: () => Promise.reject(new Error("stripe down")) });
  const ok = await handleStudioCheckout(request({ consent_client_secret: SECRET }), metadata.deps);
  assertEquals(ok.status, 200);
  assertEquals(metadata.calls.consents, [USER.id]);
});

Deno.test("leaving the step expires only the member's own open session", async () => {
  const own = fakeDeps();
  const res = await handleStudioCheckout(request({ release_client_secret: SECRET }), own.deps);
  assertEquals(await res.json(), { status: "released" });
  assertEquals(own.calls.expiredSessions, [SESSION_ID]);

  const other = fakeDeps({ retrieveSession: () => Promise.resolve({ ...OPEN_SESSION, userId: "bbbbbbbb-0000-4000-8000-000000000002" }) });
  assertEquals((await handleStudioCheckout(request({ release_client_secret: SECRET }), other.deps)).status, 200);
  assertEquals(other.calls.expiredSessions.length, 0);

  const complete = fakeDeps({ retrieveSession: () => Promise.resolve({ ...OPEN_SESSION, status: "complete" }) });
  await handleStudioCheckout(request({ release_client_secret: SECRET }), complete.deps);
  assertEquals(complete.calls.expiredSessions.length, 0);
});

Deno.test("return addresses follow an allowed origin, else production", async () => {
  const { deps, calls } = fakeDeps();
  await handleStudioCheckout(request(ARTIST_YEAR, TOKEN, "http://localhost:3000"), deps);
  await handleStudioCheckout(request(ARTIST_YEAR, TOKEN, "https://evil.example"), deps);
  assert(calls.sessions[0].returnUrl.startsWith("http://localhost:3000/"));
  assert(calls.sessions[1].returnUrl.startsWith(`${SITE}/`));
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
  assertEquals((await handleStudioCheckout(request({ consent_client_secret: SECRET }, "other.jwt.sig"), deps)).status, 401);
  assertEquals(calls.consents.length, 0);
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
