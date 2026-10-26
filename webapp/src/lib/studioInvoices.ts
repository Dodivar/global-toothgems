"use client";

import { INVOICE_SELECT, mapInvoice, type InvoiceRow, type OrderInvoice } from "./documents/invoiceModel";
import { supabase } from "./supabase/client";

/**
 * The persistence boundary of the 3D Studio legal documents (decision 115):
 * the FA- invoices the database issues when a subscription invoice is paid
 * and the AV- credit notes of withdrawals, read from `invoices` under RLS
 * (the owner reads theirs, active staff all). Stripe collects the money; its
 * own invoice documents are not shown. Without Supabase (mock mode) there are
 * no documents.
 */

/** Newest first. */
function newestFirst(rows: InvoiceRow[]): OrderInvoice[] {
  return rows.map(mapInvoice).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.number.localeCompare(a.number));
}

/**
 * The signed-in member's own Studio documents. Filtered by their own paid
 * Stripe invoices: a staff member reads every document, but this page lists
 * only theirs.
 */
export async function fetchMyStudioDocuments(userId: string): Promise<OrderInvoice[]> {
  if (!supabase) return [];
  const own = await supabase
    .from("studio_subscription_invoices")
    .select("stripe_invoice_id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (own.error) throw own.error;
  const ids = (own.data ?? []).map((row) => row.stripe_invoice_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("invoices").select(INVOICE_SELECT).in("studio_invoice_id", ids);
  if (error) throw error;
  return newestFirst((data ?? []) as InvoiceRow[]);
}

/** Back office: every Studio document issued in [start, end), for staff to print. */
export async function fetchStudioDocumentsIssued(range: { start: Date; end: Date }): Promise<OrderInvoice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .not("studio_invoice_id", "is", null)
    .gte("issued_at", range.start.toISOString())
    .lt("issued_at", range.end.toISOString())
    .order("issued_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return newestFirst((data ?? []) as InvoiceRow[]);
}

/** The invoice a credit note credits, when it is in the list (drawn against it). */
export function creditedInvoice(documents: OrderInvoice[], note: OrderInvoice): OrderInvoice | undefined {
  if (note.kind !== "creditNote") return undefined;
  return documents.find((doc) => doc.kind === "invoice" && doc.number === note.payment.creditedNumber);
}
