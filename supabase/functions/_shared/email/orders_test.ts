import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { type OrderMailRow, sendOrderConfirmation } from "./orders.ts";
import { INVOICE_ROW } from "./invoicePdf_fixtures.ts";
import type { EmailDeps, EmailStore } from "./send.ts";

const ORDER: OrderMailRow = {
  id: "11111111-1111-4111-8111-111111111111",
  orderNumber: "GT-100042",
  email: "camille@example.com",
  locale: "en",
  firstName: "Camille",
  paymentStatus: "paid",
  userId: "22222222-2222-4222-8222-222222222222",
  currency: "EUR",
  paidAt: "2026-10-07T10:00:00Z",
  subtotal: 54.7,
  discount: 0,
  shipping: 4.9,
  tax: 9.94,
  total: 59.6,
  giftCard: 0,
  amountDue: 59.6,
  pricesIncludeTax: true,
  shippingMethodName: "Colissimo",
  shippingAddress: { first_name: "Camille", last_name: "Martin", address_line1: "2 rue X", postal_code: "69002", city: "Lyon", country_code: "FR" },
  lines: [{ productName: "Heart <Crystal>", variantName: "2 mm", quantity: 2, subtotal: 54.7 }],
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

Deno.test("the confirmation carries the order summary, the address and a button to the member's order", async () => {
  const { deps, seen } = setup();
  await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve(ORDER) }, ORDER.id);
  const body = await seen.requests[0].json();
  assertStringIncludes(body.html, "Heart &lt;Crystal&gt;");
  assertStringIncludes(body.html, "€59.60");
  assertStringIncludes(body.html, "Lyon, France");
  assertStringIncludes(body.html, 'href="https://globaltoothgems.com/compte/commandes/GT-100042"');
  assertStringIncludes(body.text, "View my order: https://globaltoothgems.com/compte/commandes/GT-100042");
  assertStringIncludes(body.text, "Total incl. VAT: €59.60");
});

Deno.test("the invoice issued at payment is attached and named in the e-mail, for members and guests alike", async () => {
  for (const userId of [ORDER.userId, null]) {
    const { deps, seen } = setup();
    await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve({ ...ORDER, userId }) }, ORDER.id, {
      invoices: { documentsOfOrder: () => Promise.resolve([INVOICE_ROW]) },
    });
    const body = await seen.requests[0].json();
    assertEquals(body.attachments.map((a: { filename: string }) => a.filename), ["invoice-FA-2026-000001.pdf"]);
    assertEquals(atob(body.attachments[0].content).slice(0, 8), "%PDF-1.4");
    assertStringIncludes(body.text, "Your invoice FA-2026-000001 is attached to this e-mail (PDF).");
  }
});

Deno.test("without an invoice, or when it cannot be drawn, the confirmation still leaves, without attachment", async () => {
  const none = setup();
  await sendOrderConfirmation(none.deps, { loadOrder: () => Promise.resolve(ORDER) }, ORDER.id, {
    invoices: { documentsOfOrder: () => Promise.resolve([]) },
  });
  assertEquals((await none.seen.requests[0].json()).attachments, undefined);

  const broken = setup();
  const logged: string[] = [];
  const result = await sendOrderConfirmation(broken.deps, { loadOrder: () => Promise.resolve(ORDER) }, ORDER.id, {
    invoices: { documentsOfOrder: () => Promise.reject(new Error("database down")) },
    log: (message) => logged.push(message),
  });
  assertEquals(result, { status: "sent", id: "em_1" });
  assertEquals((await broken.seen.requests[0].json()).attachments, undefined);
  assertEquals(logged, ["invoice PDF not attached"]);
});
