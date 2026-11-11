import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { declareRefusal, type DeclareInput, handleOrderWithdrawal, type OrderWithdrawalDeps, parseItems } from "./handler.ts";

const SITE = "https://global-toothgems.example";
const JWT = "member.jwt.sig";
const TOKEN = "a".repeat(64);
const ORDER = "11111111-2222-4333-8444-555555555555";
const LINE = "99999999-8888-4777-8666-555555555555";

function fake(overrides: Partial<OrderWithdrawalDeps> = {}) {
  const calls = { declared: [] as DeclareInput[], links: [] as { to: string; url: string }[], acks: [] as string[], linkRequests: 0 };
  const deps: OrderWithdrawalDeps = {
    origins: readSiteOrigins(SITE, undefined),
    captchaConfigured: false,
    verifyCaptcha: () => Promise.resolve(true),
    ipAllowed: () => Promise.resolve(true),
    userFromToken: (token) => Promise.resolve(token === JWT ? "user-1" : null),
    requestLink: (orderNumber, email) => {
      calls.linkRequests++;
      return Promise.resolve(
        orderNumber === "GT-100001" && email === "buyer@example.com"
          ? { status: "ok", linkId: "link-1", token: TOKEN, orderId: ORDER, orderNumber, email, locale: "fr" }
          : { status: "none" },
      );
    },
    optionsByToken: (token) => Promise.resolve(token === TOKEN ? { order_id: ORDER, open: true } : null),
    declare: (input) => {
      calls.declared.push(input);
      return Promise.resolve({ id: "w-1", declaredAt: "2026-11-09T20:00:00Z" });
    },
    sendLinkEmail: (args) => {
      calls.links.push({ to: args.to, url: args.url });
      return Promise.resolve();
    },
    acknowledge: (id) => {
      calls.acks.push(id);
      return Promise.resolve();
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://fn.example/order-withdrawal", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const declareBody = (extra: Record<string, unknown> = {}) => ({
  action: "declare",
  customer_name: "Léa Martin",
  items: [{ order_item_id: LINE, quantity: 1, seal_opened: false }],
  as_consumer: true,
  locale: "fr",
  ...extra,
});

Deno.test("the guest link answers the same whether or not the order exists", async () => {
  const { deps, calls } = fake();
  const found = await handleOrderWithdrawal(post({ action: "request_link", order_number: "gt-100001", email: "Buyer@example.com" }), deps);
  const missing = await handleOrderWithdrawal(post({ action: "request_link", order_number: "GT-999999", email: "x@example.com" }), deps);
  assertEquals([found.status, missing.status], [200, 200]);
  assertEquals(await found.json(), { status: "sent" });
  assertEquals(await missing.json(), { status: "sent" });
  assertEquals(calls.links.length, 1);
  assertEquals(calls.links[0].to, "buyer@example.com");
  // The token travels in the fragment, never to a server log.
  assertEquals(calls.links[0].url, `${SITE}/fr/retours-remboursements/retractation#t=${TOKEN}`);
});

Deno.test("the honeypot, the address throttle and the captcha guard the link", async () => {
  const bot = fake();
  const res = await handleOrderWithdrawal(post({ action: "request_link", order_number: "GT-100001", email: "buyer@example.com", website: "x" }), bot.deps);
  assertEquals(await res.json(), { status: "sent" });
  assertEquals(bot.calls.linkRequests, 0);

  const throttled = fake({ ipAllowed: () => Promise.resolve(false) });
  const limited = await handleOrderWithdrawal(
    post({ action: "request_link", order_number: "GT-100001", email: "buyer@example.com" }, { "sb-forwarded-for": "203.0.113.9" }),
    throttled.deps,
  );
  assertEquals(limited.status, 429);
  assertEquals(throttled.calls.linkRequests, 0);

  const captcha = fake({ captchaConfigured: true, verifyCaptcha: (token) => Promise.resolve(token === "good") });
  const without = await handleOrderWithdrawal(post({ action: "request_link", order_number: "GT-100001", email: "buyer@example.com" }), captcha.deps);
  assertEquals([without.status, (await without.json()).error], [400, "captcha_required"]);
  const wrong = await handleOrderWithdrawal(post({ action: "request_link", order_number: "GT-100001", email: "buyer@example.com", captcha: "bad" }), captcha.deps);
  assertEquals((await wrong.json()).error, "captcha_failed");
  const good = await handleOrderWithdrawal(post({ action: "request_link", order_number: "GT-100001", email: "buyer@example.com", captcha: "good" }), captcha.deps);
  assertEquals(good.status, 200);
  assertEquals(captcha.calls.links.length, 1);
});

Deno.test("an invalid e-mail or order number is refused before the database", async () => {
  const { deps, calls } = fake();
  const res = await handleOrderWithdrawal(post({ action: "request_link", order_number: "GT 1", email: "nope" }), deps);
  assertEquals(res.status, 400);
  assertEquals(calls.linkRequests, 0);
});

Deno.test("options need a valid link", async () => {
  const { deps } = fake();
  assertEquals((await handleOrderWithdrawal(post({ action: "options", token: "short" }), deps)).status, 404);
  assertEquals((await handleOrderWithdrawal(post({ action: "options", token: "b".repeat(64) }), deps)).status, 404);
  const ok = await handleOrderWithdrawal(post({ action: "options", token: TOKEN }), deps);
  assertEquals(await ok.json(), { options: { order_id: ORDER, open: true } });
});

Deno.test("a member declares on their order and the acknowledgement leaves at once", async () => {
  const { deps, calls } = fake();
  const res = await handleOrderWithdrawal(post(declareBody({ order_id: ORDER }), { authorization: `Bearer ${JWT}` }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { withdrawal: { id: "w-1", declared_at: "2026-11-09T20:00:00Z" } });
  assertEquals(calls.declared[0].userId, "user-1");
  assertEquals(calls.declared[0].orderId, ORDER);
  assertEquals(calls.declared[0].token, null);
  assertEquals(calls.acks, ["w-1"]);
});

Deno.test("a guest declares through the link: the order comes from the token, never from the body", async () => {
  const { deps, calls } = fake();
  const res = await handleOrderWithdrawal(post(declareBody({ token: TOKEN, order_id: "00000000-0000-4000-8000-000000000000" })), deps);
  assertEquals(res.status, 200);
  assertEquals(calls.declared[0].orderId, ORDER);
  assertEquals(calls.declared[0].userId, null);
});

Deno.test("without a session or a link nothing is declared", async () => {
  const { deps, calls } = fake();
  assertEquals((await handleOrderWithdrawal(post(declareBody({ order_id: ORDER })), deps)).status, 401);
  assertEquals((await handleOrderWithdrawal(post(declareBody({ order_id: ORDER }), { authorization: "Bearer other.jwt.sig" }), deps)).status, 401);
  assertEquals((await handleOrderWithdrawal(post(declareBody({ token: "c".repeat(64) })), deps)).status, 404);
  assertEquals(calls.declared.length, 0);
});

Deno.test("database refusals become short codes", async () => {
  const { deps } = fake({
    declare: () => Promise.resolve({ error: { code: "23514", message: "order_withdrawal: deadline_passed" } }),
  });
  const res = await handleOrderWithdrawal(post(declareBody({ token: TOKEN })), deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "deadline_passed" });
  assertEquals(declareRefusal({ code: "42501", message: "x" }), { code: "not_allowed", status: 403 });
  assertEquals(declareRefusal({ code: "22023", message: "order_withdrawal: seal_answer_required" }).code, "seal_answer_required");
  assertEquals(declareRefusal({ code: "23514", message: "something else" }).code, "refused");
  assertEquals(declareRefusal({ code: "XX000", message: "boom" }).code, "server_error");
});

Deno.test("a failed acknowledgement does not undo the declaration", async () => {
  const { deps } = fake({ acknowledge: () => Promise.reject(new Error("resend down")) });
  const res = await handleOrderWithdrawal(post(declareBody({ token: TOKEN })), deps);
  assertEquals(res.status, 200);
});

Deno.test("items are validated strictly", () => {
  assertEquals(parseItems([]), null);
  assertEquals(parseItems([{ order_item_id: LINE, quantity: 0 }]), null);
  assertEquals(parseItems([{ order_item_id: LINE, quantity: 1.5 }]), null);
  assertEquals(parseItems([{ order_item_id: LINE, quantity: 1, seal_opened: "no" }]), null);
  assertEquals(parseItems([{ order_item_id: LINE, quantity: 1 }, { order_item_id: LINE.toUpperCase(), quantity: 1 }]), null);
  assertEquals(parseItems([{ order_item_id: LINE, quantity: 2, seal_opened: null }]), [{ order_item_id: LINE, quantity: 2 }]);
});

Deno.test("only POST and OPTIONS", async () => {
  const { deps } = fake();
  const res = await handleOrderWithdrawal(new Request("https://fn.example/order-withdrawal", { method: "GET" }), deps);
  assertEquals(res.status, 405);
  assertStringIncludes(res.headers.get("allow") ?? "", "POST");
});
