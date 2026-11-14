import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { type BalanceDeps, handleBalance, type LookupResult, normaliseCode, readLookup } from "./handler.ts";

const SITE = "https://globaltoothgems.com";
const CARD = { status: "active", balance: 32.5, currency: "EUR", expires_at: "2027-11-13T10:00:00Z", last4: "WXYZ" } as const;

function makeDeps(overrides: Partial<BalanceDeps> = {}) {
  const ips: string[] = [];
  const lookups: [string, string][] = [];
  const captchas: string[] = [];
  const logs: unknown[] = [];
  const deps: BalanceDeps = {
    origins: { site: SITE, allowed: new Set([SITE]) },
    captchaConfigured: false,
    verifyCaptcha: (token) => (captchas.push(token), Promise.resolve(token === "good-token")),
    ipAllowed: (hash) => (ips.push(hash), Promise.resolve(true)),
    lookup: (code, hash) => {
      lookups.push([code, hash]);
      return Promise.resolve<LookupResult>(code === "GT-ABCD-EFGH-WXYZ" ? { found: true, card: { ...CARD } } : { found: false });
    },
    log: (m, d) => logs.push([m, d]),
    ...overrides,
  };
  return { deps, ips, lookups, captchas, logs };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://x.supabase.co/functions/v1/gift-card-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json", "sb-forwarded-for": "203.0.113.7", Origin: SITE, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("a known code answers the card, with the address hashed", async () => {
  const { deps, ips, lookups } = makeDeps();
  const res = await handleBalance(post({ code: " gt-abcd-efgh-wxyz " }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { found: true, card: CARD });
  assertEquals(ips.length, 1);
  assertMatch(ips[0], /^[0-9a-f]{64}$/);
  assertEquals(lookups, [["GT-ABCD-EFGH-WXYZ", ips[0]]]);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), SITE);
});

Deno.test("an unknown code answers found=false", async () => {
  const { deps } = makeDeps();
  const res = await handleBalance(post({ code: "GT-2222-3333-4444" }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { found: false });
});

Deno.test("a malformed body or code is refused before any database call", async () => {
  for (const body of ["not json", { code: "hello" }, { code: 42 }, { code: "GT-0000-OOOO-1111" }, { code: "GT-ABCD-EFGH-WXYZ", captcha: "x".repeat(3000) }]) {
    const { deps, ips, lookups } = makeDeps();
    const res = await handleBalance(post(body), deps);
    assertEquals(res.status, 400);
    assertEquals(await res.json(), { error: "invalid_request" });
    assertEquals(ips.length + lookups.length, 0);
  }
});

Deno.test("the honeypot answers found=false without a lookup", async () => {
  const { deps, lookups } = makeDeps();
  const res = await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ", website: "spam" }), deps);
  assertEquals(await res.json(), { found: false });
  assertEquals(lookups.length, 0);
});

Deno.test("an address over its limit is refused before the captcha and the lookup", async () => {
  const { deps, lookups, captchas } = makeDeps({ captchaConfigured: true, ipAllowed: () => Promise.resolve(false) });
  const res = await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ", captcha: "good-token" }), deps);
  assertEquals(res.status, 429);
  assertEquals(await res.json(), { error: "rate_limited" });
  assertEquals(lookups.length + captchas.length, 0);
});

Deno.test("with the captcha configured, a missing or failing token is refused", async () => {
  const { deps, lookups } = makeDeps({ captchaConfigured: true });
  let res = await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ" }), deps);
  assertEquals(await res.json(), { error: "captcha_required" });
  res = await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ", captcha: "bad-token" }), deps);
  assertEquals(await res.json(), { error: "captcha_failed" });
  assertEquals(lookups.length, 0);
  res = await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ", captcha: "good-token" }), deps);
  assertEquals(res.status, 200);
  assertEquals(lookups.length, 1);
});

Deno.test("the database's refusal throttle becomes rate_limited; failures never leak", async () => {
  let { deps } = makeDeps({ lookup: () => Promise.resolve({ error: "too_many_attempts" }) });
  let res = await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ" }), deps);
  assertEquals(res.status, 429);
  ({ deps } = makeDeps({ lookup: () => Promise.reject(new Error("permission denied for function")) }));
  res = await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ" }), deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
});

Deno.test("the code is never logged", async () => {
  const { deps, logs } = makeDeps({ lookup: () => Promise.reject(new Error("boom")) });
  await handleBalance(post({ code: "GT-ABCD-EFGH-WXYZ" }), deps);
  assertEquals(JSON.stringify(logs).includes("ABCD"), false);
});

Deno.test("OPTIONS and other methods", async () => {
  const { deps } = makeDeps();
  assertEquals((await handleBalance(new Request("https://x/f", { method: "OPTIONS", headers: { Origin: SITE } }), deps)).status, 204);
  assertEquals((await handleBalance(new Request("https://x/f", { method: "GET" }), deps)).status, 405);
});

Deno.test("normaliseCode and readLookup", () => {
  assertEquals(normaliseCode("gtabcdefghwxyz"), "GTABCDEFGHWXYZ");
  assertEquals(normaliseCode("GT-ABCD-EFGH-WXY"), null);
  assertEquals(readLookup({ ok: false, error: "too_many_attempts" }), { error: "too_many_attempts" });
  assertEquals(readLookup({ ok: false, error: "unavailable" }), { error: "unavailable" });
  assertEquals(readLookup({ ok: true, found: false }), { found: false });
  assertEquals(readLookup({ ok: true, found: true, card: { ...CARD, status: "weird" } }), { error: "unavailable" });
  assertEquals(readLookup({ ok: true, found: true, card: { ...CARD, balance: "32.50" } }), { found: true, card: { ...CARD } });
  assertEquals(readLookup(null), { error: "unavailable" });
});
