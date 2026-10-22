import { assertEquals } from "jsr:@std/assert@1";
import {
  type PendingBackInStock,
  type PendingEnrolment,
  type PendingRefund,
  type PendingShipping,
  type PendingSource,
  type PendingStockDigest,
  sendBackInStockEmails,
  sendCourseEnrolmentEmails,
  sendPendingEmails,
  sendRefundEmails,
  sendShippingEmails,
  sendStockDigestEmail,
  sendStudioSubscriptionEmails,
  sendStudioWithdrawalEmails,
  type PendingStudioSubscription,
  type PendingStudioWithdrawal,
  trackingLinkFor,
} from "./events.ts";
import type { Claim, EmailDeps, EmailStore } from "./send.ts";
import { CREDIT_ROW, INVOICE_ROW } from "./invoicePdf_fixtures.ts";

const SITE = "https://globaltoothgems.com";

function setup(options: { claim?: (eventKey: string) => Claim; resendFails?: boolean } = {}) {
  const seen = {
    claims: [] as { eventKey: string; templateKey: string; orderId?: string }[],
    requests: [] as Record<string, unknown>[],
    locales: [] as string[],
  };
  const store: EmailStore = {
    loadTemplate: (key, locale) => {
      seen.locales.push(locale);
      return Promise.resolve({
        locale,
        subject: `Mail ${key}`,
        preheader: null,
        body: "Hello",
        variables: [],
      });
    },
    claim: (entry) => {
      seen.claims.push({ eventKey: entry.eventKey, templateKey: entry.templateKey, orderId: entry.orderId });
      return Promise.resolve(options.claim?.(entry.eventKey) ?? { claimed: true as const, attempt: 1 });
    },
    markSent: () => Promise.resolve(),
    markFailed: () => Promise.resolve(),
  };
  const deps: EmailDeps = {
    store,
    resend: {
      apiKey: "re_test",
      fetch: async (input, init) => {
        const request = new Request(input as string, init);
        seen.requests.push(await request.json());
        return options.resendFails ? new Response("{}", { status: 422 }) : Response.json({ id: `em_${seen.requests.length}` });
      },
    },
    from: "Global Tooth Gems <no-reply@globaltoothgems.com>",
    layout: { brandName: "Global Tooth Gems", siteUrl: SITE },
  };
  return { deps, seen };
}

const base = { orderId: "o-1", orderNumber: "GT-100042", email: "camille@example.com", locale: "en", firstName: "Camille" };
const parcel = (over: Partial<PendingShipping> = {}): PendingShipping => ({
  ...base,
  shipmentId: "s-1",
  userId: "u-1",
  trackingUrl: "https://track.example/TRK1",
  ...over,
});
const enrolment = (over: Partial<PendingEnrolment> = {}): PendingEnrolment => ({
  ...base,
  entitlementId: "e-1",
  courseName: "Foundations",
  ...over,
});
const refund = (over: Partial<PendingRefund> = {}): PendingRefund => ({
  ...base,
  refundId: "r-1",
  amount: 4.5,
  currency: "EUR",
  ...over,
});

function source(over: Partial<PendingSource> = {}): PendingSource {
  return {
    shipping: () => Promise.resolve([]),
    courseEnrolments: () => Promise.resolve([]),
    refunds: () => Promise.resolve([]),
    backInStock: () => Promise.resolve([]),
    studioSubscriptions: () => Promise.resolve([]),
    studioWithdrawals: () => Promise.resolve([]),
    stockDigest: () => Promise.resolve(null),
    ...over,
  };
}

Deno.test("tracking link: the parcel's own, else the member's orders page, else nothing for a guest", () => {
  assertEquals(trackingLinkFor(parcel(), SITE), "https://track.example/TRK1");
  assertEquals(trackingLinkFor(parcel({ trackingUrl: null }), SITE), `${SITE}/compte/commandes`);
  assertEquals(trackingLinkFor(parcel({ trackingUrl: null, userId: null }), SITE), null);
});

Deno.test("shipping: one e-mail per parcel, keyed by the parcel, in the order's language", async () => {
  const { deps, seen } = setup();
  const report = await sendShippingEmails(
    deps,
    source({ shipping: () => Promise.resolve([parcel(), parcel({ shipmentId: "s-2", orderId: "o-1" })]) }),
  );
  assertEquals(report, { examined: 2, sent: 2, inFlight: 0, gaveUp: 0, failed: 0, skipped: 0 });
  assertEquals(seen.claims.map((c) => [c.eventKey, c.templateKey, c.orderId]), [
    ["shipping:s-1", "shipping_notification", "o-1"],
    ["shipping:s-2", "shipping_notification", "o-1"],
  ]);
  assertEquals(seen.locales, ["en", "en"]);
});

Deno.test("shipping: a guest parcel without a tracking link is skipped, not sent", async () => {
  const { deps, seen } = setup();
  const report = await sendShippingEmails(
    deps,
    source({ shipping: () => Promise.resolve([parcel({ trackingUrl: null, userId: null })]) }),
  );
  assertEquals(report.skipped, 1);
  assertEquals(report.sent, 0);
  assertEquals(seen.claims.length, 0);
});

Deno.test("course enrolment: keyed by the entitlement, optionally for one order", async () => {
  const { deps, seen } = setup();
  const asked: unknown[] = [];
  const report = await sendCourseEnrolmentEmails(
    deps,
    source({
      courseEnrolments: (options) => {
        asked.push(options);
        return Promise.resolve([enrolment()]);
      },
    }),
    { orderId: "o-1" },
  );
  assertEquals(asked, [{ orderId: "o-1", limit: 25 }]);
  assertEquals(report.sent, 1);
  assertEquals(seen.claims[0].eventKey, "course_enrolment:e-1");
  assertEquals(seen.claims[0].templateKey, "course_enrolment");
});

Deno.test("refund: keyed by the refund, with the amount formatted for the order's language and currency", async () => {
  const fr = setup();
  const en = setup();
  // The template here has no {{amount}}: check the variable through a template that uses it.
  for (const [ctx, locale] of [[fr, "fr"], [en, "en"]] as const) {
    ctx.deps.store.loadTemplate = (_k, l) =>
      Promise.resolve({ locale: l, subject: "Refund {{amount}}", preheader: null, body: "{{amount}}", variables: ["amount", "first_name", "order_number"] });
    await sendRefundEmails(
      ctx.deps,
      source({ refunds: () => Promise.resolve([refund({ locale, amount: 1234.5 })]) }),
    );
  }
  assertEquals(fr.seen.claims[0].eventKey, "refund:r-1");
  const frSubject = fr.seen.requests[0].subject as string;
  const enSubject = en.seen.requests[0].subject as string;
  assertEquals(/1\s?234,50\s?€/.test(frSubject.replace(/[  ]/g, " ")), true, frSubject);
  assertEquals(enSubject, "Refund €1,234.50");
});

Deno.test("an event already sent is not re-sent; in-flight and capped ones are told apart", async () => {
  const claims: Record<string, Claim> = {
    "shipping:s-1": { claimed: false, status: "delivered" },
    "shipping:s-2": { claimed: false, status: "pending" },
    "shipping:s-3": { claimed: false, status: "failed" },
  };
  const { deps, seen } = setup({ claim: (key) => claims[key] });
  const report = await sendShippingEmails(
    deps,
    source({
      shipping: () => Promise.resolve([parcel(), parcel({ shipmentId: "s-2" }), parcel({ shipmentId: "s-3" })]),
    }),
  );
  assertEquals(report, { examined: 3, sent: 0, inFlight: 1, gaveUp: 1, failed: 0, skipped: 1 });
  assertEquals(seen.requests.length, 0);
});

Deno.test("a provider failure is counted and never thrown; the other rows still go out", async () => {
  const { deps } = setup({ resendFails: true });
  const logs: unknown[] = [];
  const report = await sendRefundEmails(
    deps,
    source({ refunds: () => Promise.resolve([refund(), refund({ refundId: "r-2" })]) }),
    { log: (m, d) => logs.push([m, d]) },
  );
  assertEquals(report.failed, 2);
  assertEquals(JSON.stringify(logs).includes("camille@example.com"), false);
});

Deno.test("a crash on one row does not stop the next", async () => {
  const { deps, seen } = setup();
  let first = true;
  deps.store.claim = (entry) => {
    if (first) {
      first = false;
      throw new Error("db down");
    }
    seen.claims.push({ eventKey: entry.eventKey, templateKey: entry.templateKey });
    return Promise.resolve({ claimed: true as const, attempt: 1 });
  };
  const report = await sendShippingEmails(
    deps,
    source({ shipping: () => Promise.resolve([parcel(), parcel({ shipmentId: "s-2" })]) }),
  );
  assertEquals(report.failed, 1);
  assertEquals(report.sent, 1);
});

Deno.test("the sweep runs the three kinds; one sweep failing does not stop the others", async () => {
  const { deps } = setup();
  const logs: unknown[] = [];
  const report = await sendPendingEmails(
    deps,
    source({
      shipping: () => Promise.reject(new Error("rpc down")),
      courseEnrolments: () => Promise.resolve([enrolment()]),
      refunds: () => Promise.resolve([refund()]),
    }),
    { log: (m, d) => logs.push([m, d]) },
  );
  assertEquals(report.shipping.failed, 1);
  assertEquals(report.courseEnrolment.sent, 1);
  assertEquals(report.refund.sent, 1);
  assertEquals(logs.length, 1);
});

Deno.test("a refund e-mail carries the credit note its refund issued; without one it leaves bare", async () => {
  const { deps, seen } = setup();
  await sendRefundEmails(deps, source({ refunds: () => Promise.resolve([refund(), refund({ refundId: "r-9" })]) }), {
    invoices: { documentsOfOrder: () => Promise.resolve([INVOICE_ROW, CREDIT_ROW]) },
  });
  const [withNote, bare] = seen.requests as { attachments?: { filename: string }[]; text: string }[];
  assertEquals(withNote.attachments?.map((a) => a.filename), ["credit-note-AV-2026-000001.pdf"]);
  assertEquals(withNote.text.includes("The matching credit note AV-2026-000001 is attached to this e-mail (PDF)."), true);
  assertEquals(withNote.text.includes("no credit is added to your account"), true);
  assertEquals(bare.attachments, undefined);
});

const restock = (over: Partial<PendingBackInStock> = {}): PendingBackInStock => ({
  requestId: "b-1",
  email: "visitor@example.com",
  locale: "fr",
  productName: "Strass cristal",
  variantName: "SS6",
  productSlug: "strass-cristal",
  imagePath: "products/strass-cristal/01.jpg",
  ...over,
});

Deno.test("back in stock: one e-mail per request, keyed by the request, naming the option", async () => {
  const { deps, seen } = setup();
  const report = await sendBackInStockEmails(
    deps,
    source({ backInStock: () => Promise.resolve([restock(), restock({ requestId: "b-2", variantName: null, locale: "en" })]) }),
    { mediaBaseUrl: "https://media.example/storage/v1/object/public/product-media" },
  );
  assertEquals(report, { examined: 2, sent: 2, inFlight: 0, gaveUp: 0, failed: 0, skipped: 0 });
  assertEquals(seen.claims.map((c) => [c.eventKey, c.templateKey, c.orderId]), [
    ["back_in_stock:b-1", "back_in_stock", undefined],
    ["back_in_stock:b-2", "back_in_stock", undefined],
  ]);
  const [fr, en] = seen.requests as { to: string[]; html: string; text: string }[];
  assertEquals(fr.text.includes(`Voir le produit: ${SITE}/fr/boutique/strass-cristal`), true);
  assertEquals(fr.text.includes("Strass cristal — SS6"), true);
  assertEquals(fr.html.includes("https://media.example/storage/v1/object/public/product-media/products/strass-cristal/01.jpg"), true);
  assertEquals(en.text.includes(`View the product: ${SITE}/en/shop/strass-cristal`), true);
});

Deno.test("back in stock: without a picture the e-mail still carries the product link", async () => {
  const { deps, seen } = setup();
  await sendBackInStockEmails(deps, source({ backInStock: () => Promise.resolve([restock({ imagePath: null })]) }));
  const [mail] = seen.requests as { html: string; text: string }[];
  assertEquals(mail.html.includes("<img src=\"https://media"), false);
  assertEquals(mail.text.includes(`${SITE}/fr/boutique/strass-cristal`), true);
});

Deno.test("back in stock: a request already sent is not sent again", async () => {
  const { deps, seen } = setup({ claim: () => ({ claimed: false, status: "sent" }) });
  const report = await sendBackInStockEmails(deps, source({ backInStock: () => Promise.resolve([restock()]) }));
  assertEquals(report.sent, 0);
  assertEquals(report.skipped, 1);
  assertEquals(seen.requests.length, 0);
});

const studioSub = (over: Partial<PendingStudioSubscription> = {}): PendingStudioSubscription => ({
  subscriptionId: "sub-1",
  email: "member@example.com",
  locale: "fr",
  plan: "artist",
  interval: "year",
  amount: 199,
  currency: "EUR",
  consentVersion: "studio-withdrawal-2026-10",
  consentedAt: "2026-10-18T14:00:00Z",
  ...over,
});

Deno.test("studio subscription: one confirmation per subscription, restating the request accepted", async () => {
  const { deps, seen } = setup();
  const report = await sendStudioSubscriptionEmails(
    deps,
    source({ studioSubscriptions: () => Promise.resolve([studioSub(), studioSub({ subscriptionId: "sub-2", locale: "en", interval: "month", amount: 19.9 })]) }),
  );
  assertEquals(report, { examined: 2, sent: 2, inFlight: 0, gaveUp: 0, failed: 0, skipped: 0 });
  assertEquals(seen.claims.map((c) => [c.eventKey, c.templateKey]), [
    ["studio_subscription:sub-1", "studio_subscription_confirmation"],
    ["studio_subscription:sub-2", "studio_subscription_confirmation"],
  ]);
  const [fr, en] = seen.requests as { text: string }[];
  assertEquals(fr.text.includes("je paierai la part de l’abonnement correspondant à la période déjà utilisée"), true);
  assertEquals(fr.text.includes("Acceptée le 18 octobre 2026"), true);
  assertEquals(fr.text.includes("Artiste"), true);
  assertEquals(en.text.includes("I will pay the share of the subscription for the period already used"), true);
  assertEquals(en.text.includes(`${SITE}/compte/studio`), true);
});

Deno.test("studio subscription: an unknown wording version is never quoted as accepted", async () => {
  const { deps, seen } = setup();
  await sendStudioSubscriptionEmails(deps, source({ studioSubscriptions: () => Promise.resolve([studioSub({ consentVersion: "other" })]) }));
  const [mail] = seen.requests as { text: string }[];
  assertEquals(mail.text.includes("période déjà utilisée"), false);
});

const withdrawal = (over: Partial<PendingStudioWithdrawal> = {}): PendingStudioWithdrawal => ({
  withdrawalId: "w-1",
  email: "member@example.com",
  locale: "fr",
  plan: "artist",
  requestedAt: "2026-10-21T09:00:00Z",
  usedDays: 3,
  periodDays: 30,
  paidAmount: 19.9,
  usedAmount: 1.99,
  refundAmount: 17.91,
  currency: "EUR",
  ...over,
});

Deno.test("studio withdrawal: one acknowledgement per withdrawal, with the refund worked out", async () => {
  const { deps, seen } = setup();
  const report = await sendStudioWithdrawalEmails(
    deps,
    source({ studioWithdrawals: () => Promise.resolve([withdrawal(), withdrawal({ withdrawalId: "w-2", locale: "en" })]) }),
  );
  assertEquals(report.sent, 2);
  assertEquals(seen.claims.map((c) => [c.eventKey, c.templateKey]), [
    ["studio_withdrawal:w-1", "studio_withdrawal_confirmation"],
    ["studio_withdrawal:w-2", "studio_withdrawal_confirmation"],
  ]);
  const [fr, en] = seen.requests as { text: string }[];
  assertEquals(fr.text.includes("Jours utilisés (3 sur 30)"), true);
  assertEquals(fr.text.includes("17,91"), true);
  assertEquals(en.text.includes("Days used (3 of 30)"), true);
  assertEquals(en.text.includes(`${SITE}/compte/studio`), true);
});

const digest = (over: Partial<PendingStockDigest> = {}): PendingStockDigest => ({
  date: "2026-10-22",
  supportEmail: "support@globaltoothgems.com",
  items: [
    { productName: "Strass cristal", variantName: "Pack de 10 · SS6", sku: "STR-P10-SS6", status: "out_of_stock", available: 0, threshold: 5 },
    { productName: "Étoile 2,2 mm", variantName: null, sku: null, status: "low_stock", available: 3, threshold: 5 },
  ],
  ...over,
});

Deno.test("stock digest: one e-mail a day to the support address, out of stock before low stock", async () => {
  const { deps, seen } = setup();
  const report = await sendStockDigestEmail(deps, source({ stockDigest: () => Promise.resolve(digest()) }));
  assertEquals(report, { examined: 1, sent: 1, inFlight: 0, gaveUp: 0, failed: 0, skipped: 0 });
  assertEquals(seen.claims.map((c) => [c.eventKey, c.templateKey]), [["stock_digest:2026-10-22", "stock_digest"]]);
  const [mail] = seen.requests as { to: string[]; text: string }[];
  assertEquals(mail.to, ["support@globaltoothgems.com"]);
  const out = mail.text.indexOf("Strass cristal — Pack de 10 · SS6 (STR-P10-SS6)");
  const low = mail.text.indexOf("Étoile 2,2 mm");
  assertEquals(out >= 0 && low > out, true);
  assertEquals(mail.text.includes("0 disponible"), true);
  assertEquals(mail.text.includes("3 disponibles (seuil 5)"), true);
  assertEquals(mail.text.includes(`${SITE}/admin/produits`), true);
});

Deno.test("stock digest: nothing to report, nothing sent", async () => {
  const { deps, seen } = setup();
  assertEquals((await sendStockDigestEmail(deps, source())).examined, 0);
  assertEquals((await sendStockDigestEmail(deps, source({ stockDigest: () => Promise.resolve(digest({ items: [] })) }))).examined, 0);
  assertEquals(seen.requests.length, 0);
});

Deno.test("stock digest: without a support e-mail it falls back to the reply-to address, else it is skipped", async () => {
  const { deps, seen } = setup();
  const noSupport = source({ stockDigest: () => Promise.resolve(digest({ supportEmail: null })) });
  const skipped = await sendStockDigestEmail(deps, noSupport);
  assertEquals([skipped.sent, skipped.skipped], [0, 1]);
  assertEquals(seen.requests.length, 0);
  const sent = await sendStockDigestEmail({ ...deps, replyTo: "contact@globaltoothgems.com" }, noSupport);
  assertEquals(sent.sent, 1);
  assertEquals((seen.requests[0] as { to: string[] }).to, ["contact@globaltoothgems.com"]);
});

Deno.test("stock digest: a digest already sent today is not sent again", async () => {
  const { deps, seen } = setup({ claim: () => ({ claimed: false, status: "sent" }) });
  const report = await sendStockDigestEmail(deps, source({ stockDigest: () => Promise.resolve(digest()) }));
  assertEquals([report.sent, report.skipped], [0, 1]);
  assertEquals(seen.requests.length, 0);
});

Deno.test("stock digest: a long list is cut and the rest counted", async () => {
  const { deps, seen } = setup();
  const items = Array.from({ length: 103 }, (_, i) => ({
    productName: `Produit ${i}`,
    variantName: null,
    sku: null,
    status: "low_stock" as const,
    available: 1,
    threshold: 5,
  }));
  await sendStockDigestEmail(deps, source({ stockDigest: () => Promise.resolve(digest({ items })) }));
  const [mail] = seen.requests as { text: string }[];
  assertEquals(mail.text.includes("Produit 99"), true);
  assertEquals(mail.text.includes("Produit 100"), false);
  assertEquals(mail.text.includes("… et 3 autres"), true);
});
