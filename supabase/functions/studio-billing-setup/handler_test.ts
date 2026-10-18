import { assertEquals } from "jsr:@std/assert@1";
import { handleSetup, parseSetupInput, type SetupDeps } from "./handler.ts";

const BODY = {
  currency: "EUR",
  prices: [
    { plan: "essential", interval: "month", amount_minor: 500 },
    { plan: "essential", interval: "year", amount_minor: 5000 },
  ],
};

function fakeDeps(overrides: Partial<SetupDeps> = {}) {
  const calls = { recorded: [] as unknown[], portal: [] as unknown[] };
  const deps: SetupDeps = {
    authorized: (req) => Promise.resolve(req.headers.get("x-internal-secret") === "s3cret"),
    testMode: true,
    ensureProduct: (plan) => Promise.resolve(`prod_${plan}`),
    ensurePrice: ({ plan, interval }) => Promise.resolve(`price_${plan}_${interval}`),
    ensurePortal: (products) => {
      calls.portal.push(products);
      return Promise.resolve("bpc_1");
    },
    smokeSubscribe: () => Promise.resolve({ subscriptionId: "sub_smoke00001", status: "active" }),
    smokeCancel: () => Promise.resolve({ status: "active", cancelAtPeriodEnd: true }),
    subscribeWebhookEvents: () => Promise.resolve({ endpoint: "we_1", events: ["invoice.paid"] }),
    recordPrice: (args) => {
      calls.recorded.push(args);
      return Promise.resolve();
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

const request = (body: unknown, secret = "s3cret") =>
  new Request("https://fn.example/studio-billing-setup", {
    method: "POST",
    headers: { "x-internal-secret": secret, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

Deno.test("input: integer minor amounts, known plans, no duplicates", () => {
  assertEquals(parseSetupInput(BODY)?.prices.length, 2);
  assertEquals(parseSetupInput({ ...BODY, currency: "eur" }), null);
  assertEquals(parseSetupInput({ currency: "EUR", prices: [{ plan: "essential", interval: "month", amount_minor: 4.99 }] }), null);
  assertEquals(parseSetupInput({ currency: "EUR", prices: [{ plan: "gold", interval: "month", amount_minor: 500 }] }), null);
  assertEquals(parseSetupInput({ currency: "EUR", prices: [BODY.prices[0], BODY.prices[0]] }), null);
});

Deno.test("creates the prices, records them and the portal configuration", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleSetup(request(BODY), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    status: "ok",
    prices: { essential_month: "price_essential_month", essential_year: "price_essential_year" },
    portal: "bpc_1",
  });
  assertEquals(calls.recorded.length, 2);
  assertEquals(calls.portal, [[{ productId: "prod_essential", priceIds: ["price_essential_month", "price_essential_year"] }]]);
});

Deno.test("refused without the internal secret, in live mode, or with a bad body", async () => {
  assertEquals((await handleSetup(request(BODY, "wrong"), fakeDeps().deps)).status, 401);
  assertEquals((await handleSetup(request(BODY), fakeDeps({ testMode: false }).deps)).status, 403);
  assertEquals((await handleSetup(request({ currency: "EUR", prices: [] }), fakeDeps().deps)).status, 400);
});

Deno.test("smoke actions: validated, test mode only", async () => {
  const { deps } = fakeDeps();
  const ok = await handleSetup(request({ action: "smoke_subscribe", user_id: "aaaaaaaa-0000-4000-8000-000000000001", plan: "artist", interval: "month" }), deps);
  assertEquals((await ok.json()).subscriptionId, "sub_smoke00001");
  assertEquals((await handleSetup(request({ action: "smoke_subscribe", user_id: "x", plan: "artist", interval: "month" }), deps)).status, 400);
  assertEquals((await handleSetup(request({ action: "smoke_cancel", subscription_id: "nope" }), deps)).status, 400);
  assertEquals((await handleSetup(request({ action: "smoke_cancel", subscription_id: "sub_smoke00001" }), deps)).status, 200);
  assertEquals((await handleSetup(request({ action: "smoke_cancel", subscription_id: "sub_smoke00001" }), fakeDeps({ testMode: false }).deps)).status, 403);
});
