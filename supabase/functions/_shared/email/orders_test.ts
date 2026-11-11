import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { type OrderMailRow, sendOrderConfirmation } from "./orders.ts";
import type { EmailDeps, EmailStore } from "./send.ts";
import { failingRender, testTermsProvider } from "./termsPdf_fixtures.ts";
import { TERMS_OF_SALE_VERSION } from "./termsPdf.ts";

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
  const result = await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve(ORDER) }, ORDER.id, testTermsProvider().terms);
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
    await sendOrderConfirmation(unpaid.deps, { loadOrder: () => Promise.resolve({ ...ORDER, paymentStatus: "pending" }) }, ORDER.id, testTermsProvider().terms),
    { status: "skipped", reason: "not_paid" },
  );
  const unknown = setup();
  assertEquals(
    await sendOrderConfirmation(unknown.deps, { loadOrder: () => Promise.resolve(null) }, ORDER.id, testTermsProvider().terms),
    { status: "skipped", reason: "order_not_found" },
  );
  assertEquals(unpaid.seen.requests.length + unknown.seen.requests.length, 0);
});

Deno.test("the confirmation carries the order summary, the address and a button to the member's order", async () => {
  const { deps, seen } = setup();
  await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve(ORDER) }, ORDER.id, testTermsProvider().terms);
  const body = await seen.requests[0].json();
  assertStringIncludes(body.html, "Heart &lt;Crystal&gt;");
  assertStringIncludes(body.html, "€59.60");
  assertStringIncludes(body.html, "Lyon, France");
  assertStringIncludes(body.html, 'href="https://globaltoothgems.com/compte/commandes/GT-100042"');
  assertStringIncludes(body.text, "View my order: https://globaltoothgems.com/compte/commandes/GT-100042");
  assertStringIncludes(body.text, "Total incl. VAT: €59.60");
});

Deno.test("the confirmation carries no invoice but the terms of sale, for members and guests alike", async () => {
  for (const userId of [ORDER.userId, null]) {
    const { deps, seen } = setup();
    await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve({ ...ORDER, userId }) }, ORDER.id, testTermsProvider().terms);
    const body = await seen.requests[0].json();
    assertEquals(body.attachments.map((a: { filename: string }) => a.filename), [`terms-of-sale-${TERMS_OF_SALE_VERSION}.pdf`]);
    assertEquals(body.text.includes("invoice"), false);
  }
});

Deno.test("the terms of sale are in the order's language, for that order, and the footer names their version", async () => {
  const { deps, seen } = setup();
  const provider = testTermsProvider();
  await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve({ ...ORDER, locale: "fr" }) }, ORDER.id, provider.terms);
  assertEquals(provider.asked, [{ locale: "fr", reference: "Commande GT-100042" }]);
  const body = await seen.requests[0].json();
  const [pdf] = body.attachments;
  assertEquals(pdf.filename, `conditions-generales-de-vente-${TERMS_OF_SALE_VERSION}.pdf`);
  const bytes = atob(pdf.content);
  assertEquals(bytes.slice(0, 5), "%PDF-");
  assertStringIncludes(bytes, "/Lang <FEFF00660072>");
  assertStringIncludes(body.text, "Conditions générales de vente jointes à cet e-mail (PDF) : version du 10 novembre 2026.");
  assertStringIncludes(body.html, "version du 10 novembre 2026");
});

Deno.test("a PDF that cannot be drawn puts the full terms into the e-mail, never an e-mail without them", async () => {
  const { deps, seen } = setup();
  const logged: string[] = [];
  const provider = testTermsProvider({ render: failingRender, log: (message) => logged.push(message) });
  await sendOrderConfirmation(deps, { loadOrder: () => Promise.resolve(ORDER) }, ORDER.id, provider.terms);
  const body = await seen.requests[0].json();
  assertEquals(body.attachments, undefined);
  assertStringIncludes(body.text, "TERMS OF SALE — VERSION OF 10 NOVEMBER 2026");
  assertStringIncludes(body.text, "1. Scope");
  assertStringIncludes(body.text, "PIMP TON SMILE — Ada Test, Entrepreneur individuel (EI)");
  assertStringIncludes(body.text, "Terms of sale reproduced in this email: version of 10 November 2026.");
  assertEquals(logged, ["terms of sale PDF not drawn: the text goes into the e-mail"]);
});

Deno.test("an order placed under another version is still confirmed with the version in force, and logged", async () => {
  const { deps, seen } = setup();
  const logged: string[] = [];
  await sendOrderConfirmation(
    deps,
    { loadOrder: () => Promise.resolve({ ...ORDER, termsVersion: "2026-01-01" }) },
    ORDER.id,
    testTermsProvider().terms,
    (message) => logged.push(message),
  );
  assertEquals(seen.requests.length, 1);
  assertEquals(logged, ["order accepted another terms of sale version than the one attached"]);
});
