// Generated from webapp/src/lib/documents/invoiceModel.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
import { toMinorUnits } from "../money.ts";

/**
 * `invoices` rows → the member area's `OrderInvoice`. An invoice (or credit
 * note) is the frozen snapshot the database issued when the order was paid
 * (or the refund confirmed): seller, buyer, lines and VAT as they were then,
 * numbered `FA-YYYY-NNNNNN` / `AV-YYYY-NNNNNN` (supabase/README.md,
 * "Invoices"). Nothing is recomputed here; amounts become integer minor units
 * of the invoice currency. Pure, unit-tested in `invoiceDocument.test.ts`.
 *
 * Shared with the Edge Functions that e-mail the PDFs: `npm run sync:documents`
 * copies this folder's portable modules to `supabase/functions/_shared/documents/`
 * (`npm run sync:documents`, `scripts/sync-documents.mjs`), so they import nothing outside it but the money helper.
 */

/** A JSON value as PostgREST returns it (same shape as the generated `Json`). */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** An address snapshot (`orders.billing_address`), as the documents print it. */
export interface InvoiceAddress {
  name: string;
  company?: string;
  lines: string[];
  postalCode?: string;
  city: string;
  region?: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  phone?: string;
}

export type InvoiceLineKind = "product" | "course" | "gift_card" | "shipping" | "adjustment";

export interface InvoiceLine {
  kind: InvoiceLineKind;
  description: string;
  detail?: string;
  /** Absent on a credit note line that credits an amount rather than units. */
  quantity?: number;
  unitPriceExcl?: number;
  unitPriceIncl?: number;
  /** Discount on the line, VAT included. */
  discountIncl: number;
  vatRateBp: number;
  totalExcl: number;
  vatAmount: number;
  totalIncl: number;
}

export interface InvoiceVatRow {
  vatRateBp: number;
  totalExcl: number;
  vatAmount: number;
  totalIncl: number;
}

/** The seller as Settings held it when the document was issued. */
export interface InvoiceSeller {
  storeName: string;
  legalName: string;
  legalForm: string;
  shareCapital: string;
  registrationNumber: string;
  vatNumber: string;
  email: string;
  addressLines: string[];
  countryCode: string;
}

export interface OrderInvoice {
  id: string;
  kind: "invoice" | "creditNote";
  number: string;
  /** ISO timestamp of issue. */
  issuedAt: string;
  /** ISO date of the sale (payment). */
  saleDate: string;
  currency: string;
  totalExcl: number;
  totalTax: number;
  totalIncl: number;
  seller: InvoiceSeller;
  buyer: { email: string; orderNumber: string; address?: InvoiceAddress };
  lines: InvoiceLine[];
  vat: InvoiceVatRow[];
  payment: {
    paidAt?: string;
    giftCard: number;
    charged: number;
    refundedAt?: string;
    refundMethod?: "card" | "gift_card";
    reason?: string;
    creditedNumber?: string;
  };
}

export interface InvoiceRow {
  id: string;
  kind: string;
  invoice_number: string;
  issued_at: string;
  sale_date: string;
  currency: string;
  total_excl_tax: number | string;
  total_tax: number | string;
  total_incl_tax: number | string;
  seller: Json;
  buyer: Json;
  lines: Json;
  vat_breakdown: Json;
  payment: Json;
}

/** What the member's order query selects of its invoices. */
export const INVOICE_SELECT =
  "id, kind, invoice_number, issued_at, sale_date, currency, total_excl_tax, total_tax, total_incl_tax, seller, buyer, lines, vat_breakdown, payment";

type Obj = Record<string, Json | undefined>;
const LINE_KINDS: readonly InvoiceLineKind[] = ["product", "course", "gift_card", "shipping", "adjustment"];

function obj(value: Json | undefined): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : {};
}
function list(value: Json | undefined): Obj[] {
  return Array.isArray(value) ? value.map(obj) : [];
}
function str(value: Json | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
function opt(value: Json | undefined): string | undefined {
  return str(value) || undefined;
}
function money(value: Json | undefined): number {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? toMinorUnits(value) : 0;
}
function optMoney(value: Json | undefined): number | undefined {
  return value === null || value === undefined ? undefined : money(value);
}
function int(value: Json | undefined): number {
  return typeof value === "number" ? Math.round(value) : Number.parseInt(str(value), 10) || 0;
}

/** Same shape as the order's address snapshots (`orders.billing_address`). */
function address(value: Json | undefined): InvoiceAddress | undefined {
  const a = obj(value);
  const name = [str(a.first_name), str(a.last_name)].filter(Boolean).join(" ");
  const lines = [str(a.address_line1), str(a.address_line2)].filter(Boolean);
  if (!name && lines.length === 0) return undefined;
  return {
    name,
    company: opt(a.company),
    lines,
    postalCode: opt(a.postal_code),
    city: str(a.city),
    region: opt(a.region),
    countryCode: str(a.country_code).toUpperCase(),
    phone: opt(a.phone),
  };
}

function seller(value: Json | undefined): InvoiceSeller {
  const s = obj(value);
  const town = [str(s.postal_code), str(s.city)].filter(Boolean).join(" ");
  return {
    storeName: str(s.store_name),
    legalName: str(s.legal_name),
    legalForm: str(s.legal_form),
    shareCapital: str(s.share_capital),
    registrationNumber: str(s.registration_number),
    vatNumber: str(s.vat_number),
    email: str(s.email),
    addressLines: [[str(s.address_line1), str(s.address_line2)].filter(Boolean).join(", "), [town, str(s.region)].filter(Boolean).join(", ")].filter(
      Boolean,
    ),
    countryCode: str(s.country_code).toUpperCase(),
  };
}

function line(l: Obj): InvoiceLine {
  const kind = str(l.kind) as InvoiceLineKind;
  return {
    kind: LINE_KINDS.includes(kind) ? kind : "product",
    description: str(l.description),
    detail: opt(l.detail),
    quantity: typeof l.quantity === "number" ? l.quantity : undefined,
    unitPriceExcl: optMoney(l.unit_price_excl),
    unitPriceIncl: optMoney(l.unit_price_incl),
    discountIncl: money(l.discount_incl),
    vatRateBp: int(l.vat_rate_bp),
    totalExcl: money(l.total_excl),
    vatAmount: money(l.vat_amount),
    totalIncl: money(l.total_incl),
  };
}

export function mapInvoice(row: InvoiceRow): OrderInvoice {
  const buyer = obj(row.buyer);
  const payment = obj(row.payment);
  const method = str(payment.refund_method);
  return {
    id: row.id,
    kind: row.kind === "credit_note" ? "creditNote" : "invoice",
    number: row.invoice_number,
    issuedAt: row.issued_at,
    saleDate: row.sale_date.slice(0, 10),
    currency: row.currency,
    totalExcl: toMinorUnits(row.total_excl_tax),
    totalTax: toMinorUnits(row.total_tax),
    totalIncl: toMinorUnits(row.total_incl_tax),
    seller: seller(row.seller),
    buyer: { email: str(buyer.email), orderNumber: str(buyer.order_number), address: address(buyer.address) },
    lines: list(row.lines).map(line),
    vat: list(row.vat_breakdown).map((v) => ({
      vatRateBp: int(v.vat_rate_bp),
      totalExcl: money(v.total_excl),
      vatAmount: money(v.vat_amount),
      totalIncl: money(v.total_incl),
    })),
    payment: {
      paidAt: opt(payment.paid_at),
      giftCard: money(payment.gift_card_amount),
      charged: money(payment.charged_amount),
      refundedAt: opt(payment.refunded_at),
      refundMethod: method === "card" || method === "gift_card" ? method : undefined,
      reason: opt(payment.reason),
      creditedNumber: opt(payment.credited_invoice_number),
    },
  };
}

/** Invoices first, then credit notes, each in number order. */
export function sortInvoices(invoices: OrderInvoice[]): OrderInvoice[] {
  return [...invoices].sort((a, b) => (a.kind === b.kind ? a.number.localeCompare(b.number) : a.kind === "invoice" ? -1 : 1));
}
