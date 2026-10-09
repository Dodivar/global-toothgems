import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { AdminOrder } from "../data/adminOrders";
import type { OrderInvoice } from "./invoiceMapping";
import { invoiceDocument, invoiceFileName } from "./documents/invoiceDocument";
import { useDocumentFormat } from "./documents/useDocumentFormat";
import { useDocumentDownload } from "./documents/useDocumentDownload";
import { useToast } from "./toast";

/**
 * Printing and downloading invoices from the back office: the legal invoice
 * the database issued when each order was paid, drawn from its frozen
 * snapshot (`invoices`, read with the order). Several orders print as one
 * file, each invoice with its own pages. An order without an invoice (unpaid,
 * cancelled before payment, or paid before invoicing existed) is said so,
 * never replaced by a document that would look like one.
 */

export function invoiceOf(order: Pick<AdminOrder, "invoices">): OrderInvoice | undefined {
  return order.invoices?.find((doc) => doc.kind === "invoice");
}

export function creditNotesOf(order: Pick<AdminOrder, "invoices">): OrderInvoice[] {
  return (order.invoices ?? []).filter((doc) => doc.kind === "creditNote");
}

export function useAdminInvoices() {
  const { t } = useTranslation();
  const fmt = useDocumentFormat();
  const { showToast } = useToast();
  const { status, download, print } = useDocumentDownload();

  const failed = useCallback(
    (ok: boolean) => {
      if (!ok) showToast(t("admin.orders.invoiceErrorTitle"), t("admin.orders.invoiceErrorBody"), "error");
    },
    [showToast, t],
  );

  /** The invoices of these orders, printed or saved as one file. */
  const invoices = useCallback(
    (orders: AdminOrder[], mode: "print" | "download") => {
      const found = orders.flatMap((order) => invoiceOf(order) ?? []);
      if (found.length === 0) {
        showToast(
          t("admin.orders.noInvoiceTitle"),
          t(orders.length === 1 ? "admin.orders.noInvoiceBody" : "admin.orders.noInvoicesBody"),
          "info",
        );
        return;
      }
      if (found.length < orders.length) {
        showToast(t("admin.orders.someWithoutInvoiceTitle"), t("admin.orders.someWithoutInvoiceBody", { count: orders.length - found.length }), "warning");
      }
      const documents = found.map((invoice) => invoiceDocument(invoice, t, fmt));
      const fileName =
        found.length === 1 ? invoiceFileName(found[0], t) : `${t("admin.orders.invoicesFileName")}-${new Date().toISOString().slice(0, 10)}.pdf`;
      void (mode === "print" ? print : download)(async () => ({ documents, fileName })).then(failed);
    },
    [download, print, failed, fmt, showToast, t],
  );

  /** One credit note, saved, drawn against the invoice it credits. */
  const creditNote = useCallback(
    (order: AdminOrder, note: OrderInvoice) => {
      void download(async () => ({ document: invoiceDocument(note, t, fmt, invoiceOf(order)), fileName: invoiceFileName(note, t) })).then(failed);
    },
    [download, failed, fmt, t],
  );

  return { working: status === "working", invoices, creditNote };
}
