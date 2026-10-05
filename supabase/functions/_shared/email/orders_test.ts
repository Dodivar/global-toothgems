import { assertEquals } from "jsr:@std/assert@1";
import { type OrderMailRow, sendOrderConfirmation } from "./orders.ts";
import type { EmailDeps, EmailStore } from "./send.ts";

const ORDER: OrderMailRow = {
  id: "11111111-1111-4111-8111-111111111111",
  orderNumber: "GT-100042",
  email: "camille@example.com",
  locale: "en",
  firstName: "Camille",
  paymentStatus: "paid",
};

function setup() {
  const seen = { claims: [] as string[], requests: [] as Request[], locales: [] as string[] };
  const store: EmailStore = {
    loadTemplate: (_key, locale) => {
      seen.locales.push(locale);
      return Promise.resolve({
        locale,
        subject: "Order {{order_number}}",
        preheader: null,
        body: "Hello {{first_name}}",
        variables: ["order_number", "first_name"],
      });
    },
    claim: (entry) => {
      seen.claims.push(entry.eventKey);
      return Promise.resolve({ claimed: true as const, attempt: 1 });
    },
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  };
  const deps: EmailDeps = {
    store,
    resend: {
      apiKey: "re_test",
      fetch: (input, init) => {
        seen.requests.push(new Request(input as string, init));
        return Promise.resolve(Response.json({ id: "em_1" }));
      },
    },
    from: "Global Tooth Gems <no-reply@globaltoothgems.com>",
    layout: { brandName: "Global Tooth Gems", siteUrl: "https://globaltoothgems.com" },
  };
  return { deps, seen };
}

Deno.test("a paid order gets its confirmation in the order's language, keyed by the order", async () => {
  const { deps, seen } = setup();
  const result = await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve(ORDER) }, ORDER.id);
  assertEquals(result, { status: "sent", id: "em_1" });
  assertEquals(seen.locales, ["en"]);
  assertEquals(seen.claims, [`order_confirmation:${ORDER.id}`]);
  const body = await seen.requests[0].json();
  assertEquals(body.to, ["camille@example.com"]);
  assertEquals(body.subject, "Order GT-100042");
});

Deno.test("an unpaid or unknown order sends nothing", async () => {
  const unpaid = setup();
  assertEquals(
    await sendOrderConfirmation(unpaid.deps, { loadOrder: () => Promise.resolve({ ...ORDER, paymentStatus: "pending" }) }, ORDER.id),
    { status: "skipped", reason: "not_paid" },
  );
  const unknown = setup();
  assertEquals(
    await sendOrderConfirmation(unknown.deps, { loadOrder: () => Promise.resolve(null) }, ORDER.id),
    { status: "skipped", reason: "order_not_found" },
  );
  assertEquals(unpaid.seen.requests.length + unknown.seen.requests.length, 0);
});
