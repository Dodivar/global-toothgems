/**
 * Business e-mails driven by rows in the database rather than by a request:
 * shipping, course enrolment and refund (decision 79), back in stock (decision 90),
 * 3D Studio subscription confirmation (decision 94 (a)).
 *
 * The `send-pending-emails` Edge Function runs `sendPendingEmails()` from
 * pg_cron every few minutes; the payment hook (`notifyOrderPaid`) runs
 * `sendCourseEnrolmentEmails()` for the order it just saw paid, so a student
 * hears about the access at once and the sweep only catches what failed.
 *
 * What is pending is decided in SQL (`pending_*_emails()`, last 7 days, minus
 * what `email_log` already holds); sending is exactly-once through the claim
 * in email_log, keyed:
 *   shipping:<shipment id>   course_enrolment:<entitlement id>   refund:<refund id>
 *   back_in_stock:<request id>   studio_subscription:<subscription id>
 * One row never stops the others, and nothing here throws for a failed e-mail.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { formatAmount } from "./format.ts";
import { type AttachedDocument, type InvoiceSource, refundCreditNote } from "./invoicePdf.ts";
import { refundContent, shippingContent } from "./orderContent.ts";
import { type EmailDeps, type SendResult, sendTemplatedEmail } from "./send.ts";
import { backInStockContent, type RestockedProduct, restockedItemName } from "./stockContent.ts";
import { type StudioSubscriptionMail, studioPlanName, studioSubscriptionContent } from "./studioContent.ts";
import { STUDIO_INTERVALS, STUDIO_PLANS, type StudioInterval, type StudioPlan } from "../studioBilling.ts";

type Log = (message: string, detail?: unknown) => void;

interface MailTarget {
  orderId: string;
  orderNumber: string;
  email: string;
  locale: string;
  firstName: string;
}

export interface PendingShipping extends MailTarget {
  shipmentId: string;
  /** The member the order belongs to; null for a guest order. */
  userId: string | null;
  trackingUrl: string | null;
}
export interface PendingEnrolment extends MailTarget {
  entitlementId: string;
  courseName: string;
}
export interface PendingRefund extends MailTarget {
  refundId: string;
  amount: number;
  currency: string;
}

/** A customer's back-in-stock request whose product (or option) can be bought again. */
export interface PendingBackInStock extends RestockedProduct {
  requestId: string;
  email: string;
  locale: string;
}

/** A new Studio subscription whose first invoice is paid, with the immediate-access request it was bought under. */
export interface PendingStudioSubscription extends StudioSubscriptionMail {
  subscriptionId: string;
  email: string;
  locale: string;
}

export interface PendingSource {
  shipping(limit: number): Promise<PendingShipping[]>;
  courseEnrolments(options: { orderId?: string; limit: number }): Promise<PendingEnrolment[]>;
  refunds(limit: number): Promise<PendingRefund[]>;
  backInStock(limit: number): Promise<PendingBackInStock[]>;
  studioSubscriptions(limit: number): Promise<PendingStudioSubscription[]>;
}

export interface EventReport {
  examined: number;
  sent: number;
  /** Being sent by another run right now. */
  inFlight: number;
  /** Failed too many times: left for the team (email_log status failed). */
  gaveUp: number;
  /** Failed; the next run tries again. */
  failed: number;
  /** Nothing to send to yet (e.g. a parcel without a usable tracking link), no template, or an unusable address. */
  skipped: number;
}

export interface SweepReport {
  shipping: EventReport;
  courseEnrolment: EventReport;
  refund: EventReport;
  backInStock: EventReport;
  studioSubscription: EventReport;
}

const SENT_OR_DONE = new Set(["sent", "delivered", "opened", "bounced", "complained"]);

const emptyReport = (): EventReport => ({ examined: 0, sent: 0, inFlight: 0, gaveUp: 0, failed: 0, skipped: 0 });

function tally(report: EventReport, result: SendResult, what: string, id: string, log: Log): void {
  switch (result.status) {
    case "sent":
      report.sent++;
      break;
    case "duplicate":
      if (result.previous === "failed") report.gaveUp++;
      else if (SENT_OR_DONE.has(result.previous)) report.skipped++;
      else report.inFlight++;
      break;
    case "failed":
      log(`${what} e-mail failed`, { id, error: result.error, retryable: result.retryable });
      report.failed++;
      break;
    default:
      log(`${what} e-mail ${result.status}`, { id });
      report.skipped++;
  }
}

/** Runs `send` for each row; a throwing row counts as failed and never stops the others. */
async function sendEach<T>(
  rows: T[],
  what: string,
  idOf: (row: T) => string,
  send: (row: T) => Promise<SendResult | null>,
  log: Log,
): Promise<EventReport> {
  const report = emptyReport();
  for (const row of rows) {
    report.examined++;
    try {
      const result = await send(row);
      if (result === null) report.skipped++;
      else tally(report, result, what, idOf(row), log);
    } catch (error) {
      log(`${what} e-mail crashed`, { id: idOf(row), error: error instanceof Error ? error.message : error });
      report.failed++;
    }
  }
  return report;
}

/** The tracking link of a parcel, else the member's order page; a guest parcel without a link waits for one. */
export function trackingLinkFor(parcel: Pick<PendingShipping, "trackingUrl" | "userId">, siteUrl: string): string | null {
  if (parcel.trackingUrl) return parcel.trackingUrl;
  return parcel.userId ? `${siteUrl}/compte/commandes` : null;
}

export function sendShippingEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: { limit?: number; log?: Log } = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  return source.shipping(options.limit ?? 25).then((rows) =>
    sendEach(rows, "shipping", (r) => r.shipmentId, (parcel) => {
      const link = trackingLinkFor(parcel, deps.layout.siteUrl);
      if (!link) return Promise.resolve(null);
      return sendTemplatedEmail(deps, {
        templateKey: "shipping_notification",
        to: parcel.email,
        locale: parcel.locale,
        variables: { first_name: parcel.firstName, order_number: parcel.orderNumber, tracking_url: link },
        eventKey: `shipping:${parcel.shipmentId}`,
        orderId: parcel.orderId,
        content: (locale) => shippingContent(
          { orderNumber: parcel.orderNumber, trackingLink: link, userId: parcel.userId },
          locale,
          deps.layout.siteUrl,
        ),
      });
    }, log)
  );
}

export function sendCourseEnrolmentEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: { orderId?: string; limit?: number; log?: Log } = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  return source.courseEnrolments({ orderId: options.orderId, limit: options.limit ?? 25 }).then((rows) =>
    sendEach(rows, "course enrolment", (r) => r.entitlementId, (enrolment) =>
      sendTemplatedEmail(deps, {
        templateKey: "course_enrolment",
        to: enrolment.email,
        locale: enrolment.locale,
        variables: { first_name: enrolment.firstName, course_name: enrolment.courseName },
        eventKey: `course_enrolment:${enrolment.entitlementId}`,
        orderId: enrolment.orderId,
      }), log)
  );
}

/** The credit note of the refund, or null; a failure to draw it is logged and never blocks the e-mail. */
async function creditNoteFor(invoices: InvoiceSource | undefined, refund: PendingRefund, log: Log): Promise<AttachedDocument | null> {
  if (!invoices) return null;
  try {
    return await refundCreditNote(invoices, refund.orderId, refund.refundId, refund.locale);
  } catch (error) {
    log("credit note PDF not attached", { refundId: refund.refundId, error: error instanceof Error ? error.message : error });
    return null;
  }
}

/** Each refund e-mail carries the credit note the confirmed refund issued (PDF), when the order was invoiced. */
export function sendRefundEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: { limit?: number; log?: Log; invoices?: InvoiceSource } = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  return source.refunds(options.limit ?? 25).then((rows) =>
    sendEach(rows, "refund", (r) => r.refundId, async (refund) => {
      const creditNote = await creditNoteFor(options.invoices, refund, log);
      return sendTemplatedEmail(deps, {
        templateKey: "order_refunded",
        to: refund.email,
        locale: refund.locale,
        variables: {
          first_name: refund.firstName,
          order_number: refund.orderNumber,
          amount: formatAmount(refund.amount, refund.currency, refund.locale),
        },
        eventKey: `refund:${refund.refundId}`,
        orderId: refund.orderId,
        attachments: creditNote ? [creditNote.attachment] : undefined,
        content: (locale) => refundContent(refund, locale, creditNote?.number),
      });
    }, log)
  );
}

/**
 * One e-mail per back-in-stock request, ever (the request is closed by the
 * database once its e-mail is sent). `mediaBaseUrl`: public address of the
 * `product-media` bucket, for the product's picture.
 */
export function sendBackInStockEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: { limit?: number; log?: Log; mediaBaseUrl?: string } = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  return source.backInStock(options.limit ?? 25).then((rows) =>
    sendEach(rows, "back in stock", (r) => r.requestId, (request) =>
      sendTemplatedEmail(deps, {
        templateKey: "back_in_stock",
        to: request.email,
        locale: request.locale,
        variables: { product_name: restockedItemName(request) },
        eventKey: `back_in_stock:${request.requestId}`,
        content: (locale) => backInStockContent(request, locale, deps.layout.siteUrl, options.mediaBaseUrl),
      }), log)
  );
}

/**
 * One confirmation per new Studio subscription: the durable copy of the request
 * for immediate access the member ticked (L221-25), with the plan and the first
 * payment. Sent by the sweep (every 5 minutes) once the first invoice is paid.
 */
export function sendStudioSubscriptionEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: { limit?: number; log?: Log } = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  return source.studioSubscriptions(options.limit ?? 25).then((rows) =>
    sendEach(rows, "studio subscription", (r) => r.subscriptionId, (sub) =>
      sendTemplatedEmail(deps, {
        templateKey: "studio_subscription_confirmation",
        to: sub.email,
        locale: sub.locale,
        variables: { plan_name: studioPlanName(sub.plan, sub.locale) },
        eventKey: `studio_subscription:${sub.subscriptionId}`,
        content: (locale) => studioSubscriptionContent(sub, locale, deps.layout.siteUrl),
      }), log)
  );
}

/** The five sweeps; one failing (a database error, say) does not prevent the others. */
export async function sendPendingEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: { limit?: number; log?: Log; invoices?: InvoiceSource; mediaBaseUrl?: string } = {},
): Promise<SweepReport> {
  const log = options.log ?? (() => {});
  const guard = async (what: string, run: () => Promise<EventReport>): Promise<EventReport> => {
    try {
      return await run();
    } catch (error) {
      log(`${what} sweep failed`, error instanceof Error ? error.message : error);
      return { ...emptyReport(), failed: 1 };
    }
  };
  return {
    shipping: await guard("shipping", () => sendShippingEmails(deps, source, { ...options, log })),
    courseEnrolment: await guard("course enrolment", () => sendCourseEnrolmentEmails(deps, source, { ...options, log })),
    refund: await guard("refund", () => sendRefundEmails(deps, source, { ...options, log })),
    backInStock: await guard("back in stock", () => sendBackInStockEmails(deps, source, { ...options, log })),
    studioSubscription: await guard("studio subscription", () => sendStudioSubscriptionEmails(deps, source, { ...options, log })),
  };
}

interface TargetRow {
  order_id: string;
  order_number: string;
  email: string;
  locale: string;
  first_name: string;
}

const target = (row: TargetRow): MailTarget => ({
  orderId: row.order_id,
  orderNumber: row.order_number,
  email: row.email,
  locale: row.locale,
  firstName: row.first_name,
});

export function supabasePendingSource(db: SupabaseClient): PendingSource {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(`${name} failed: ${error.message}`);
    return (data ?? []) as T[];
  }
  return {
    async shipping(limit) {
      const rows = await rpc<TargetRow & { shipment_id: string; user_id: string | null; tracking_url: string | null }>(
        "pending_shipping_emails",
        { p_limit: limit },
      );
      return rows.map((row) => ({ ...target(row), shipmentId: row.shipment_id, userId: row.user_id, trackingUrl: row.tracking_url }));
    },
    async courseEnrolments({ orderId, limit }) {
      const rows = await rpc<TargetRow & { entitlement_id: string; course_name: string }>(
        "pending_course_enrolment_emails",
        { p_order_id: orderId ?? null, p_limit: limit },
      );
      return rows.map((row) => ({ ...target(row), entitlementId: row.entitlement_id, courseName: row.course_name }));
    },
    async refunds(limit) {
      const rows = await rpc<TargetRow & { refund_id: string; amount: number | string; currency: string }>(
        "pending_refund_emails",
        { p_limit: limit },
      );
      return rows.map((row) => ({ ...target(row), refundId: row.refund_id, amount: Number(row.amount), currency: row.currency }));
    },
    async backInStock(limit) {
      const rows = await rpc<{
        request_id: string;
        email: string;
        locale: string;
        product_name: string;
        variant_name: string | null;
        product_slug: string;
        image_path: string | null;
      }>("pending_back_in_stock_emails", { p_limit: limit });
      return rows.map((row) => ({
        requestId: row.request_id,
        email: row.email,
        locale: row.locale,
        productName: row.product_name,
        variantName: row.variant_name,
        productSlug: row.product_slug,
        imagePath: row.image_path,
      }));
    },
    async studioSubscriptions(limit) {
      const rows = await rpc<{
        subscription_id: string;
        email: string;
        locale: string;
        plan: string;
        billing_interval: string;
        amount: number | string;
        currency: string;
        consent_version: string;
        consented_at: string;
      }>("pending_studio_subscription_emails", { p_limit: limit });
      return rows
        .filter((row) =>
          (STUDIO_PLANS as readonly string[]).includes(row.plan) && (STUDIO_INTERVALS as readonly string[]).includes(row.billing_interval)
        )
        .map((row) => ({
          subscriptionId: row.subscription_id,
          email: row.email,
          locale: row.locale,
          plan: row.plan as StudioPlan,
          interval: row.billing_interval as StudioInterval,
          amount: Number(row.amount),
          currency: row.currency,
          consentVersion: row.consent_version,
          consentedAt: row.consented_at,
        }));
    },
  };
}
