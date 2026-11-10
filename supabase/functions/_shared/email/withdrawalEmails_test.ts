import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { renderEmail } from "./render.ts";
import { type PendingOrderWithdrawal, returnByDate, sendOrderWithdrawalEmails, withdrawalContent } from "./withdrawalEmails.ts";
import type { EmailDeps, EmailStore } from "./send.ts";

const MAIL: PendingOrderWithdrawal = {
  withdrawalId: "w-1",
  orderId: "o-1",
  orderNumber: "GT-100042",
  email: "lea@example.com",
  locale: "fr",
  customerName: "Léa Martin",
  declaredAt: "2026-11-09T19:05:00Z",
  isMember: false,
  items: [{ name: "Gem Crystal", variant: "SS5", quantity: 2 }],
  returnAddress: "PIMP TON SMILE, 1 rue Exemple, 67000 Strasbourg, FR",
};

const TEMPLATE = {
  key: "order_withdrawal_confirmation",
  locale: "fr",
  subject: "Votre rétractation pour la commande {{order_number}} est enregistrée",
  preheader: "Accusé de réception.",
  body: "Bonjour {{customer_name}},\n\nNous avons bien reçu votre rétractation.",
  variables: ["customer_name", "order_number"],
};

Deno.test("the acknowledgement states the declaration, its date and time, and how to return", () => {
  const content = withdrawalContent(MAIL, "fr", "https://site.example");
  const rendered = renderEmail(TEMPLATE, { customer_name: MAIL.customerName, order_number: MAIL.orderNumber }, {
    brandName: "Global Toothgems",
    siteUrl: "https://site.example",
  }, content);
  assertStringIncludes(rendered.text, "GT-100042");
  assertStringIncludes(rendered.text, "Gem Crystal × 2");
  assertStringIncludes(rendered.text, "20:05"); // Paris time
  assertStringIncludes(rendered.text, "23 novembre 2026"); // 14 days to send the goods back
  assertStringIncludes(rendered.text, "1 rue Exemple");
  // A guest has no account page to follow.
  assertEquals(content.primaryAction, undefined);
});

Deno.test("a member gets a link to their orders; no address means a reply asks for it", () => {
  const content = withdrawalContent({ ...MAIL, isMember: true, returnAddress: null, locale: "en" }, "en", "https://site.example/");
  assertEquals(content.primaryAction?.url, "https://site.example/compte/commandes");
  assert(content.blocks?.some((b) => b.text.includes("Reply to this e-mail")));
});

Deno.test("return-by date is the declaration + 14 days", () => {
  assertEquals(returnByDate("2026-11-09T19:05:00Z", "en"), "23 November 2026");
});

Deno.test("the sweep sends once per declaration and only the one asked for", async () => {
  const claimed: string[] = [];
  const store: EmailStore = {
    loadTemplate: () => Promise.resolve(TEMPLATE),
    claim: (entry) => {
      claimed.push(entry.eventKey);
      return Promise.resolve({ claimed: true, attempt: 1 });
    },
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  };
  const deps: EmailDeps = {
    store,
    resend: { apiKey: "re_test", fetch: () => Promise.resolve(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })) },
    from: "Global Toothgems <no-reply@example.com>",
    layout: { brandName: "Global Toothgems", siteUrl: "https://site.example" },
  } as unknown as EmailDeps;
  const source = { pending: () => Promise.resolve([MAIL, { ...MAIL, withdrawalId: "w-2" }]) };
  const report = await sendOrderWithdrawalEmails(deps, source, { only: "w-2" });
  assertEquals(report.examined, 1);
  assertEquals(claimed, ["order_withdrawal:w-2"]);
});
