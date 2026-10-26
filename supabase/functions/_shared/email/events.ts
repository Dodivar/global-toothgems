/**
 * Business e-mails driven by rows in the database rather than by a request:
 * shipping, course enrolment and refund (decision 79), back in stock (decision 90),
 * 3D Studio subscription confirmation (decision 94 (a)), withdrawal
 * acknowledgement (decision 95) and the daily low-stock digest for the support
 * inbox (decision 106).
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
 *   studio_withdrawal:<withdrawal id>   stock_digest:<Paris date>
 *   studio_invoice:<Stripe invoice id>   studio_credit_note:<withdrawal id>
 * The Studio e-mails carry our legal documents as PDFs (decision 115): the
 * confirmation its first FA- invoice, a renewal or plan change its own
 * (`studio_invoice`); the withdrawal's AV- credit note follows the
 * acknowledgement on its own (`studio_credit_note`) once the refund is
 * confirmed — never attached to the acknowledgement, which may race it.
 * One row never stops the others, and nothing here throws for a failed e-mail.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { formatAmount } from "./format.ts";
import {
  type AttachedDocument,
  type InvoiceSource,
  refundCreditNote,
  studioCreditNote,
  studioInvoice,
  type StudioInvoiceSource,
} from "./invoicePdf.ts";
import { refundContent, shippingContent } from "./orderContent.ts";
import { type EmailDeps, type SendResult, sendTemplatedEmail } from "./send.ts";
import {
  backInStockContent,
  type RestockedProduct,
  restockedItemName,
  type StockDigestItem,
  stockDigestContent,
  stockDigestCounts,
} from "./stockContent.ts";
import {
  studioDocumentContent,
  type StudioSubscriptionMail,
  type StudioWithdrawalMail,
  studioPlanName,
  studioSubscriptionContent,
  studioWithdrawalContent,
} from "./studioContent.ts";
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
  /** The first paid Stripe invoice: its FA- invoice is attached. */
  stripeInvoiceId: string | null;
  email: string;
  locale: string;
}

/** A paid Studio renewal or plan change whose FA- invoice is issued. */
export interface PendingStudioInvoice {
  stripeInvoiceId: string;
  email: string;
  locale: string;
  plan: StudioPlan;
  invoiceNumber: string;
}

/** A withdrawal credit note issued after the acknowledgement went out. */
export interface PendingStudioCreditNote {
  withdrawalId: string;
  email: string;
  locale: string;
  plan: StudioPlan;
  invoiceNumber: string;
}

/** A Studio withdrawal Stripe has (refund sent, or none due), to acknowledge. */
export interface PendingStudioWithdrawal extends StudioWithdrawalMail {
  withdrawalId: string;
  email: string;
  locale: string;
}

/** Today's low-stock digest: what to report and where to send it (null address: none configured). */
export interface PendingStockDigest {
  /** The Paris calendar day, YYYY-MM-DD: the e-mail is sent once per day. */
  date: string;
  items: StockDigestItem[];
  /** The store's support e-mail; the sender falls back to the reply-to address. */
  supportEmail: string | null;
}

export interface PendingSource {
  shipping(limit: number): Promise<PendingShipping[]>;
  courseEnrolments(options: { orderId?: string; limit: number }): Promise<PendingEnrolment[]>;
  refunds(limit: number): Promise<PendingRefund[]>;
  backInStock(limit: number): Promise<PendingBackInStock[]>;
  studioSubscriptions(limit: number): Promise<PendingStudioSubscription[]>;
  studioWithdrawals(limit: number): Promise<PendingStudioWithdrawal[]>;
  studioInvoices(limit: number): Promise<PendingStudioInvoice[]>;
  studioCreditNotes(limit: number): Promise<PendingStudioCreditNote[]>;
  /** Null when the digest is not due today or there is nothing to report. */
  stockDigest(): Promise<PendingStockDigest | null>;
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
  studioWithdrawal: EventReport;
  studioInvoice: EventReport;
  studioCreditNote: EventReport;
  stockDigest: EventReport;
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
/** A Studio document as a PDF, or null; a failure to draw it is logged and never blocks the e-mail. */
async function studioDocument(
  what: string,
  id: string,
  load: () => Promise<AttachedDocument | null>,
  log: Log,
): Promise<AttachedDocument | null> {
  try {
    return await load();
  } catch (error) {
    log(`${what} PDF not attached`, { id, error: error instanceof Error ? error.message : error });
    return null;
  }
}

type StudioOptions = { limit?: number; log?: Log; studioDocuments?: StudioInvoiceSource };

export function sendStudioSubscriptionEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: StudioOptions = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  const docs = options.studioDocuments;
  return source.studioSubscriptions(options.limit ?? 25).then((rows) =>
    sendEach(rows, "studio subscription", (r) => r.subscriptionId, async (sub) => {
      const invoiceId = sub.stripeInvoiceId;
      const invoice = docs && invoiceId
        ? await studioDocument("studio invoice", invoiceId, () => studioInvoice(docs, invoiceId, sub.locale), log)
        : null;
      return sendTemplatedEmail(deps, {
        templateKey: "studio_subscription_confirmation",
        to: sub.email,
        locale: sub.locale,
        variables: { plan_name: studioPlanName(sub.plan, sub.locale) },
        eventKey: `studio_subscription:${sub.subscriptionId}`,
        attachments: invoice ? [invoice.attachment] : undefined,
        content: (locale) => studioSubscriptionContent(sub, locale, deps.layout.siteUrl, invoice?.number),
      });
    }, log)
  );
}

/** Each paid renewal or plan change: its FA- invoice (Stripe's own e-mails are off). No PDF yet: skipped, the next run retries. */
export function sendStudioInvoiceEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: StudioOptions = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  const docs = options.studioDocuments;
  return source.studioInvoices(options.limit ?? 25).then((rows) =>
    sendEach(rows, "studio invoice", (r) => r.stripeInvoiceId, async (row) => {
      if (!docs) return null;
      const invoice = await studioInvoice(docs, row.stripeInvoiceId, row.locale);
      if (!invoice) return null;
      return sendTemplatedEmail(deps, {
        templateKey: "studio_invoice",
        to: row.email,
        locale: row.locale,
        variables: { plan_name: studioPlanName(row.plan, row.locale), invoice_number: invoice.number },
        eventKey: `studio_invoice:${row.stripeInvoiceId}`,
        attachments: [invoice.attachment],
        content: (locale) => studioDocumentContent({ kind: "invoice", plan: row.plan, number: invoice.number }, locale, deps.layout.siteUrl),
      });
    }, log)
  );
}

/** A withdrawal's credit note, once issued and the acknowledgement has gone out. */
export function sendStudioCreditNoteEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: StudioOptions = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  const docs = options.studioDocuments;
  return source.studioCreditNotes(options.limit ?? 25).then((rows) =>
    sendEach(rows, "studio credit note", (r) => r.withdrawalId, async (row) => {
      if (!docs) return null;
      const note = await studioCreditNote(docs, row.withdrawalId, row.locale);
      if (!note) return null;
      return sendTemplatedEmail(deps, {
        templateKey: "studio_credit_note",
        to: row.email,
        locale: row.locale,
        variables: { plan_name: studioPlanName(row.plan, row.locale), invoice_number: note.number },
        eventKey: `studio_credit_note:${row.withdrawalId}`,
        attachments: [note.attachment],
        content: (locale) => studioDocumentContent({ kind: "creditNote", plan: row.plan, number: note.number }, locale, deps.layout.siteUrl),
      });
    }, log)
  );
}

/**
 * One acknowledgement per Studio withdrawal (L221-21: on a durable medium,
 * without delay): sent by `studio-withdraw` right after the request, else by
 * the sweep.
 */
export function sendStudioWithdrawalEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: StudioOptions = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  return source.studioWithdrawals(options.limit ?? 25).then((rows) =>
    sendEach(rows, "studio withdrawal", (r) => r.withdrawalId, (withdrawal) =>
      sendTemplatedEmail(deps, {
        templateKey: "studio_withdrawal_confirmation",
        to: withdrawal.email,
        locale: withdrawal.locale,
        variables: { plan_name: studioPlanName(withdrawal.plan, withdrawal.locale) },
        eventKey: `studio_withdrawal:${withdrawal.withdrawalId}`,
        content: (locale) => studioWithdrawalContent(withdrawal, locale, deps.layout.siteUrl),
      }), log)
  );
}

/** "22 octobre 2026" for a YYYY-MM-DD day. */
function digestDateLabel(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * At most one stock digest a day, to the support inbox, only when something is
 * out of stock or low (the database decides: not before 08:00 Paris time, not
 * once today's is sent). Written in French, the team's language.
 */
export async function sendStockDigestEmail(
  deps: EmailDeps,
  source: PendingSource,
  options: { log?: Log } = {},
): Promise<EventReport> {
  const log = options.log ?? (() => {});
  const digest = await source.stockDigest();
  if (!digest || digest.items.length === 0) return emptyReport();
  const to = digest.supportEmail ?? deps.replyTo;
  if (!to) {
    log("stock digest: no support e-mail (store settings) nor EMAIL_REPLY_TO");
    return { ...emptyReport(), examined: 1, skipped: 1 };
  }
  const counts = stockDigestCounts(digest.items);
  return sendEach([digest], "stock digest", (d) => d.date, (d) =>
    sendTemplatedEmail(deps, {
      templateKey: "stock_digest",
      to,
      locale: "fr",
      variables: { date: digestDateLabel(d.date), out_count: String(counts.out), low_count: String(counts.low) },
      eventKey: `stock_digest:${d.date}`,
      content: (locale) => stockDigestContent(d.items, locale, deps.layout.siteUrl),
    }), log);
}

/** The sweeps; one failing (a database error, say) does not prevent the others. */
export async function sendPendingEmails(
  deps: EmailDeps,
  source: PendingSource,
  options: { limit?: number; log?: Log; invoices?: InvoiceSource; studioDocuments?: StudioInvoiceSource; mediaBaseUrl?: string } = {},
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
    studioWithdrawal: await guard("studio withdrawal", () => sendStudioWithdrawalEmails(deps, source, { ...options, log })),
    studioInvoice: await guard("studio invoice", () => sendStudioInvoiceEmails(deps, source, { ...options, log })),
    studioCreditNote: await guard("studio credit note", () => sendStudioCreditNoteEmails(deps, source, { ...options, log })),
    stockDigest: await guard("stock digest", () => sendStockDigestEmail(deps, source, { log })),
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
        stripe_invoice_id: string | null;
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
          stripeInvoiceId: row.stripe_invoice_id ?? null,
        }));
    },
    async studioInvoices(limit) {
      const rows = await rpc<{ stripe_invoice_id: string; email: string; locale: string; plan: string; invoice_number: string }>(
        "pending_studio_invoice_emails",
        { p_limit: limit },
      );
      return rows
        .filter((row) => (STUDIO_PLANS as readonly string[]).includes(row.plan))
        .map((row) => ({
          stripeInvoiceId: row.stripe_invoice_id,
          email: row.email,
          locale: row.locale,
          plan: row.plan as StudioPlan,
          invoiceNumber: row.invoice_number,
        }));
    },
    async studioCreditNotes(limit) {
      const rows = await rpc<{ withdrawal_id: string; email: string; locale: string; plan: string; invoice_number: string }>(
        "pending_studio_credit_note_emails",
        { p_limit: limit },
      );
      return rows
        .filter((row) => (STUDIO_PLANS as readonly string[]).includes(row.plan))
        .map((row) => ({
          withdrawalId: row.withdrawal_id,
          email: row.email,
          locale: row.locale,
          plan: row.plan as StudioPlan,
          invoiceNumber: row.invoice_number,
        }));
    },
    async studioWithdrawals(limit) {
      const rows = await rpc<{
        withdrawal_id: string;
        email: string;
        locale: string;
        plan: string;
        requested_at: string;
        used_days: number;
        period_days: number;
        paid_amount: number | string;
        used_amount: number | string;
        refund_amount: number | string;
        currency: string;
      }>("pending_studio_withdrawal_emails", { p_limit: limit });
      return rows
        .filter((row) => (STUDIO_PLANS as readonly string[]).includes(row.plan))
        .map((row) => ({
          withdrawalId: row.withdrawal_id,
          email: row.email,
          locale: row.locale,
          plan: row.plan as StudioPlan,
          requestedAt: row.requested_at,
          usedDays: row.used_days,
          periodDays: row.period_days,
          paidAmount: Number(row.paid_amount),
          usedAmount: Number(row.used_amount),
          refundAmount: Number(row.refund_amount),
          currency: row.currency,
        }));
    },
    async stockDigest() {
      const rows = await rpc<{
        digest_date: string;
        product_name: string;
        variant_name: string | null;
        sku: string | null;
        stock_status: string;
        available: number;
        threshold: number;
      }>("pending_stock_digest", {});
      if (rows.length === 0) return null;
      const { data, error } = await db.from("store_settings").select("support_email").limit(1).maybeSingle();
      if (error) throw new Error(`store_settings read failed: ${error.message}`);
      return {
        date: rows[0].digest_date,
        supportEmail: data?.support_email?.trim() || null,
        items: rows.map((row) => ({
          productName: row.product_name,
          variantName: row.variant_name,
          sku: row.sku,
          status: row.stock_status === "out_of_stock" ? "out_of_stock" as const : "low_stock" as const,
          available: row.available,
          threshold: row.threshold,
        })),
      };
    },
  };
}
