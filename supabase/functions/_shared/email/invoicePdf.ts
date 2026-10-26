/**
 * The invoice and credit note PDFs attached to the order e-mails: the
 * confirmation carries the invoice the database issued when the order was
 * paid, the refund e-mail the credit note issued when the refund was
 * confirmed (supabase/README.md, "Invoices and credit notes"). The 3D Studio
 * e-mails carry the FA- invoice of a paid subscription invoice and the AV-
 * credit note of a withdrawal the same way (decision 115).
 *
 * Drawn by the same template as the member's download (`_shared/documents/`,
 * a generated copy of webapp/src/lib/documents/), from the frozen `invoices`
 * row, in the order's language. Rendering is local and synchronous; only the
 * row is read from the database.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { invoiceDocument, invoiceFileName, type InvoiceFormat } from "../documents/invoiceDocument.ts";
import { INVOICE_SELECT, type InvoiceRow, mapInvoice, type OrderInvoice } from "../documents/invoiceModel.ts";
import type { Translate } from "../documents/legal.ts";
import { DOCUMENT_MESSAGES } from "../documents/messages.generated.ts";
import { renderDocument } from "../documents/template.ts";

export interface MailAttachment {
  filename: string;
  /** Base64, as Resend takes it. */
  content: string;
}

/** A document ready to attach, and its number for the e-mail's text. */
export interface AttachedDocument {
  number: string;
  attachment: MailAttachment;
}

type DocumentLang = keyof typeof DOCUMENT_MESSAGES;

function documentLang(locale: string): DocumentLang {
  return locale.toLowerCase().startsWith("en") ? "en" : "fr";
}

/** The webapp's i18next lookup for the documents' keys: dotted path, `{{name}}` interpolation. */
export function documentTranslator(locale: string): Translate {
  const messages: unknown = DOCUMENT_MESSAGES[documentLang(locale)];
  return (key, params = {}) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
    if (typeof value !== "string") throw new Error(`missing document string ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ""));
  };
}

/** Same locales as the webapp (`formatLocale`): fr-FR, en-IE; dates in Paris time. */
export function documentFormat(locale: string): InvoiceFormat {
  const lang = documentLang(locale);
  const intl = lang === "en" ? "en-IE" : "fr-FR";
  const percent = new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 2 });
  const day = new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return {
    lang,
    // Display only: integer minor units shown as major units, like the webapp's formatMoney.
    money: (minor, currency) =>
      new Intl.NumberFormat(intl, {
        style: "currency",
        currency,
        minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(minor / 100),
    date: (iso) => day.format(new Date(iso)),
    country: (code) => {
      try {
        return new Intl.DisplayNames([intl], { type: "region" }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    percent: (basisPoints) => percent.format(basisPoints / 10000),
  };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** One invoice or credit note as a PDF attachment, in `locale`. */
export function attachDocument(doc: OrderInvoice, locale: string, credited?: OrderInvoice): AttachedDocument {
  const t = documentTranslator(locale);
  const bytes = renderDocument(invoiceDocument(doc, t, documentFormat(locale), credited));
  return { number: doc.number, attachment: { filename: invoiceFileName(doc, t), content: toBase64(bytes) } };
}

export interface InvoiceRowWithRefund extends InvoiceRow {
  refund_id: string | null;
}

export interface InvoiceSource {
  /** Every invoice and credit note of an order. */
  documentsOfOrder(orderId: string): Promise<InvoiceRowWithRefund[]>;
}

export interface StudioInvoiceRow extends InvoiceRow {
  studio_invoice_id: string | null;
  studio_withdrawal_id: string | null;
}

export interface StudioInvoiceSource {
  /** The FA- invoice of a paid Stripe invoice and the credit notes against it. */
  documentsOfStudioInvoice(stripeInvoiceId: string): Promise<StudioInvoiceRow[]>;
  /** The credit note of a withdrawal and the invoice it credits (empty when not issued yet). */
  documentsOfStudioWithdrawal(withdrawalId: string): Promise<StudioInvoiceRow[]>;
}

const STUDIO_SELECT = `${INVOICE_SELECT}, studio_invoice_id, studio_withdrawal_id`;

export function supabaseInvoiceSource(db: SupabaseClient): InvoiceSource & StudioInvoiceSource {
  const studioRows = async (column: "studio_invoice_id" | "studio_withdrawal_id", value: string) => {
    const { data, error } = await db.from("invoices").select(STUDIO_SELECT).eq(column, value);
    if (error) throw new Error(`invoice lookup failed: ${error.message}`);
    return (data ?? []) as StudioInvoiceRow[];
  };
  return {
    async documentsOfOrder(orderId) {
      const { data, error } = await db.from("invoices").select(`${INVOICE_SELECT}, refund_id`).eq("order_id", orderId);
      if (error) throw new Error(`invoice lookup failed: ${error.message}`);
      return (data ?? []) as InvoiceRowWithRefund[];
    },
    documentsOfStudioInvoice: (stripeInvoiceId) => studioRows("studio_invoice_id", stripeInvoiceId),
    async documentsOfStudioWithdrawal(withdrawalId) {
      const notes = await studioRows("studio_withdrawal_id", withdrawalId);
      const credited = notes[0]?.studio_invoice_id;
      return credited ? [...notes, ...(await studioRows("studio_invoice_id", credited)).filter((r) => r.kind === "invoice")] : notes;
    },
  };
}

/** The order's invoice, or null (unpaid, or paid before invoicing existed). */
export async function orderInvoice(source: InvoiceSource, orderId: string, locale: string): Promise<AttachedDocument | null> {
  const row = (await source.documentsOfOrder(orderId)).find((r) => r.kind === "invoice");
  return row ? attachDocument(mapInvoice(row), locale) : null;
}

/** The credit note of a refund, drawn against its invoice, or null (no invoice to credit). */
export async function refundCreditNote(
  source: InvoiceSource,
  orderId: string,
  refundId: string,
  locale: string,
): Promise<AttachedDocument | null> {
  const rows = await source.documentsOfOrder(orderId);
  const note = rows.find((r) => r.kind === "credit_note" && r.refund_id === refundId);
  if (!note) return null;
  const invoice = rows.find((r) => r.kind === "invoice");
  return attachDocument(mapInvoice(note), locale, invoice ? mapInvoice(invoice) : undefined);
}

/** The FA- invoice of a paid Studio invoice, or null (not issued: recorded before Studio invoicing, or a zero total). */
export async function studioInvoice(source: StudioInvoiceSource, stripeInvoiceId: string, locale: string): Promise<AttachedDocument | null> {
  const row = (await source.documentsOfStudioInvoice(stripeInvoiceId)).find((r) => r.kind === "invoice");
  return row ? attachDocument(mapInvoice(row), locale) : null;
}

/** The credit note of a Studio withdrawal, drawn against its invoice, or null (refund not confirmed yet). */
export async function studioCreditNote(source: StudioInvoiceSource, withdrawalId: string, locale: string): Promise<AttachedDocument | null> {
  const rows = await source.documentsOfStudioWithdrawal(withdrawalId);
  const note = rows.find((r) => r.kind === "credit_note" && r.studio_withdrawal_id === withdrawalId);
  if (!note) return null;
  const invoice = rows.find((r) => r.kind === "invoice");
  return attachDocument(mapInvoice(note), locale, invoice ? mapInvoice(invoice) : undefined);
}
