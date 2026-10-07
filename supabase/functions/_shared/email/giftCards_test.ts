import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { type DueGiftCard, deliverGiftCards, type GiftCardSource } from "./giftCards.ts";
import type { Claim, EmailDeps, EmailStore } from "./send.ts";
import type { TemplateRow } from "./render.ts";

const NOW = new Date("2026-10-05T10:00:00Z");

const TEMPLATE: TemplateRow = {
  locale: "fr",
  subject: "Une carte cadeau vous attend",
  preheader: "{{amount}}",
  body: "{{sender_name}} vous offre {{amount}}.\n\n{{message}}\n\nCode : {{code}}\nExpiration : {{expires_on}}\n\n{{shop_url}}",
  variables: ["sender_name", "amount", "message", "code", "expires_on", "shop_url"],
};

const CARD: DueGiftCard = {
  id: "c1",
  recipientEmail: "lea@example.com",
  recipientName: "Léa",
  senderName: "Camille",
  message: "Joyeux anniversaire !",
  design: "blush",
  currency: "EUR",
  amount: 50,
  expiresAt: "2027-10-05T00:00:00Z",
  orderId: "o1",
  locale: "fr",
};

function setup(options: { claim?: (key: string) => Claim; resendStatus?: number; code?: string | null } = {}) {
  const seen = {
    claims: [] as string[],
    bodies: [] as Record<string, unknown>[],
    recorded: [] as string[],
    logged: [] as unknown[],
  };
  const store: EmailStore = {
    loadTemplate: (_key, locale) => Promise.resolve({ ...TEMPLATE, locale }),
    claim: (entry) => {
      seen.claims.push(entry.eventKey);
      return Promise.resolve(options.claim ? options.claim(entry.eventKey) : { claimed: true as const, attempt: 1 });
    },
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  };
  const deps: EmailDeps = {
    store,
    resend: {
      apiKey: "re_test",
      fetch: async (input, init) => {
        seen.bodies.push(await new Request(input as string, init).json());
        return options.resendStatus && options.resendStatus >= 400
          ? Response.json({ message: "nope" }, { status: options.resendStatus })
          : Response.json({ id: "em_1" });
      },
    },
    from: "Global Tooth Gems <no-reply@globaltoothgems.com>",
    layout: { brandName: "Global Tooth Gems", siteUrl: "https://globaltoothgems.com" },
  };
  const source = (cards: DueGiftCard[]): GiftCardSource => ({
    listDue: () => Promise.resolve(cards),
    codeFor: () => Promise.resolve(options.code === undefined ? "GT-ABCD-EFGH-JKLM" : options.code),
    recordSent: (id) => {
      seen.recorded.push(id);
      return Promise.resolve();
    },
  });
  return { deps, seen, source, log: (m: string, d?: unknown) => seen.logged.push([m, d]) };
}

Deno.test("a due card is e-mailed with its code, then recorded as sent", async () => {
  const { deps, seen, source, log } = setup();
  const report = await deliverGiftCards(deps, source([CARD]), { now: NOW, log });
  assertEquals(report, { examined: 1, sent: 1, healed: 0, inFlight: 0, failed: 0, gaveUp: 0, skipped: 0 });
  assertEquals(seen.claims, ["gift_card:c1"]);
  assertEquals(seen.recorded, ["c1"]);
  const mail = seen.bodies[0];
  assertEquals(mail.to, ["lea@example.com"]);
  const text = mail.text as string;
  assertStringIncludes(text, "Camille vous offre");
  assertStringIncludes(text, "50,00");
  assertStringIncludes(text, "Joyeux anniversaire !");
  assertStringIncludes(text, "GT-ABCD-EFGH-JKLM");
  assertStringIncludes(text, "5 octobre 2027");
  assertStringIncludes(text, "https://globaltoothgems.com/fr");
  // The card is drawn in the buyer's design, with their names and message.
  const html = mail.html as string;
  assertStringIncludes(html, "#f59cc7");
  assertStringIncludes(html, "Pour Léa");
  assertStringIncludes(html, "De la part de Camille");
  assertStringIncludes(html, "Joyeux anniversaire !");
  // The code never reaches the logs.
  assertEquals(JSON.stringify(seen.logged).includes("GT-ABCD"), false);
});

Deno.test("no sender, no message, no expiry: readable defaults, no empty paragraph", async () => {
  const { deps, seen, source } = setup();
  await deliverGiftCards(
    deps,
    source([{ ...CARD, senderName: null, message: null, expiresAt: null, locale: "en" }]),
    { now: NOW },
  );
  const text = seen.bodies[0].text as string;
  assertStringIncludes(text, "Someone vous offre");
  assertStringIncludes(text, "Expiration : none");
  assertEquals(text.includes("\n\n\n"), false);
  assertStringIncludes(text, "https://globaltoothgems.com/en");
});

Deno.test("an e-mail already sent by an earlier run is not sent again; the card is brought up to date", async () => {
  const { deps, seen, source } = setup({ claim: () => ({ claimed: false, status: "sent" }) });
  const report = await deliverGiftCards(deps, source([CARD]), { now: NOW });
  assertEquals(report.healed, 1);
  assertEquals(report.sent, 0);
  assertEquals(seen.bodies.length, 0);
  assertEquals(seen.recorded, ["c1"]);
});

Deno.test("in flight, and given up after too many failures, are counted and left alone", async () => {
  const flight = setup({ claim: () => ({ claimed: false, status: "pending" }) });
  assertEquals((await deliverGiftCards(flight.deps, flight.source([CARD]), { now: NOW })).inFlight, 1);
  const gaveUp = setup({ claim: () => ({ claimed: false, status: "failed" }) });
  assertEquals((await deliverGiftCards(gaveUp.deps, gaveUp.source([CARD]), { now: NOW })).gaveUp, 1);
  assertEquals(flight.seen.recorded.length + gaveUp.seen.recorded.length, 0);
});

Deno.test("a Resend failure is counted, the card stays due, the next card is still tried", async () => {
  const { deps, seen, source, log } = setup({ resendStatus: 503 });
  const report = await deliverGiftCards(deps, source([CARD, { ...CARD, id: "c2" }]), { now: NOW, log });
  assertEquals(report.failed, 2);
  assertEquals(seen.recorded, []);
  assertEquals(seen.bodies.length, 2);
});

Deno.test("an expired card or one without a deliverable code is skipped", async () => {
  const expired = setup();
  const r1 = await deliverGiftCards(
    expired.deps,
    expired.source([{ ...CARD, expiresAt: "2026-10-01T00:00:00Z" }]),
    { now: NOW },
  );
  assertEquals(r1.skipped, 1);
  const noCode = setup({ code: null });
  const r2 = await deliverGiftCards(noCode.deps, noCode.source([CARD]), { now: NOW });
  assertEquals(r2.skipped, 1);
  assertEquals(expired.seen.bodies.length + noCode.seen.bodies.length, 0);
});

Deno.test("a crash on one card (database error) does not stop the others", async () => {
  const { deps, seen, source } = setup();
  const base = source([CARD, { ...CARD, id: "c2" }]);
  let first = true;
  const flaky: GiftCardSource = {
    ...base,
    codeFor: (id) => {
      if (first) {
        first = false;
        return Promise.reject(new Error("db down"));
      }
      return base.codeFor(id);
    },
  };
  const report = await deliverGiftCards(deps, flaky, { now: NOW });
  assertEquals([report.failed, report.sent], [1, 1]);
  assertEquals(seen.recorded, ["c2"]);
});
