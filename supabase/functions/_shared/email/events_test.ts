import { assertEquals } from "jsr:@std/assert@1";
import {
  type PendingEnrolment,
  type PendingRefund,
  type PendingShipping,
  type PendingSource,
  sendCourseEnrolmentEmails,
  sendPendingEmails,
  sendRefundEmails,
  sendShippingEmails,
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
  assertEquals(bare.attachments, undefined);
});
