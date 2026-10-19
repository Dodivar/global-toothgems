import { assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { handlePortal, type PortalDeps } from "./handler.ts";

const USER = "aaaaaaaa-0000-4000-8000-000000000001";
const SITE = "https://global-toothgems.example";

function fakeDeps(overrides: Partial<PortalDeps> = {}) {
  const calls: { customerId: string; returnUrl: string; locale: string }[] = [];
  const deps: PortalDeps = {
    origins: readSiteOrigins(SITE, undefined),
    userFromToken: (token) => Promise.resolve(token === "member.jwt.sig" ? USER : null),
    customerOf: (userId) => Promise.resolve(userId === USER ? "cus_test000001" : null),
    createPortalSession: (args) => {
      calls.push(args);
      return Promise.resolve({ url: "https://billing.stripe.com/p/session/test_1" });
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

const request = (body: string, token: string | null = "member.jwt.sig") =>
  new Request("https://fn.example/studio-billing-portal", {
    method: "POST",
    headers: { origin: SITE, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });

Deno.test("a member with a Stripe customer gets a portal session returning to the account page", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handlePortal(request('{"locale":"en"}'), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { url: "https://billing.stripe.com/p/session/test_1" });
  assertEquals(calls, [{ customerId: "cus_test000001", returnUrl: `${SITE}/compte/studio`, locale: "en" }]);
});

Deno.test("visitors, expired tokens, members without a customer, bad bodies", async () => {
  const { deps, calls } = fakeDeps();
  assertEquals((await handlePortal(request("", null), deps)).status, 401);
  assertEquals((await handlePortal(request("", "other.jwt.sig"), deps)).status, 401);
  assertEquals((await handlePortal(request('{"customer":"cus_x"}'), deps)).status, 400);
  assertEquals((await handlePortal(request('{"locale":"de"}'), deps)).status, 400);
  const none = fakeDeps({ customerOf: () => Promise.resolve(null) });
  const res = await handlePortal(request(""), none.deps);
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, "no_subscription");
  assertEquals(calls.length, 0);
});

Deno.test("Stripe failure is a portal_unavailable answer", async () => {
  const { deps } = fakeDeps({ createPortalSession: () => Promise.reject(new Error("down")) });
  const res = await handlePortal(request(""), deps);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "portal_unavailable");
});
