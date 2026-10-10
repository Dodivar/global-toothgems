// Generated from webapp/src/lib/documents/invoiceDocument.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
import type { InvoiceLine, InvoiceSeller, OrderInvoice } from "./invoiceModel.ts";
import { legalFooterLines, type DocumentFormat, type Translate } from "./legal.ts";
import type { BusinessDocument, DocumentBlock, DocumentParty, DocumentTotalRow } from "./template.ts";

/**
 * A legal invoice or credit note as a PDF, drawn from the snapshot the
 * database froze when it issued the number (`invoices`): the seller's identity
 * and legal mentions as they were then — not as Settings holds them today —,
 * the buyer, each line with its unit price excluding VAT, VAT rate and totals,
 * the VAT breakdown per rate and how it was paid or refunded. The template
 * only lays it out; nothing is recomputed. Pure.
 */

export interface InvoiceFormat extends DocumentFormat {
  /** A VAT rate in basis points as a percentage: 2000 → "20 %". */
  percent: (basisPoints: number) => string;
}

function sellerParty(seller: InvoiceSeller, t: Translate, fmt: InvoiceFormat): DocumentParty {
  return {
    title: t("documents.seller"),
    lines: [
      seller.legalName || seller.storeName || "Global Toothgems",
      ...seller.addressLines,
      seller.countryCode ? fmt.country(seller.countryCode) : "",
      seller.email,
      seller.registrationNumber && t("documents.footer.registration", { number: seller.registrationNumber }),
      seller.vatNumber && t("documents.footer.vat", { number: seller.vatNumber }),
    ],
  };
}

function buyerParty(invoice: OrderInvoice, t: Translate, fmt: InvoiceFormat): DocumentParty {
  const a = invoice.buyer.address;
  return {
    title: t("documents.invoice.buyer"),
    lines: a
      ? [
          a.name,
          a.company ?? "",
          ...a.lines,
          [a.postalCode, a.city].filter(Boolean).join(" "),
          a.region ?? "",
          a.countryCode ? fmt.country(a.countryCode) : "",
          invoice.buyer.email,
        ]
      : [invoice.buyer.email],
  };
}

function lineLabel(line: InvoiceLine, t: Translate): string {
  if (line.kind === "shipping") {
    return line.description ? t("documents.invoice.shippingNamed", { method: line.description }) : t("documents.invoice.shipping");
  }
  if (line.kind === "adjustment") return t("documents.invoice.adjustment");
  return line.description;
}

function lineDetail(line: InvoiceLine, t: Translate, money: (minor: number) => string): string | undefined {
  const parts = [
    line.kind === "shipping" ? undefined : line.detail,
    line.kind === "gift_card" ? t("documents.invoice.giftCardVat") : undefined,
    line.discountIncl > 0 ? t("documents.invoice.lineDiscount", { amount: money(line.discountIncl) }) : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

export function invoiceDocument(invoice: OrderInvoice, t: Translate, fmt: InvoiceFormat, credited?: OrderInvoice): BusinessDocument {
  const money = (minor: number) => fmt.money(minor, invoice.currency);
  const isCredit = invoice.kind === "creditNote";
  const scope = isCredit ? "documents.creditNote" : "documents.invoice";
  const title = t(`${scope}.title`);

  const meta = [
    { label: t(`${scope}.number`), value: invoice.number },
    { label: t("documents.invoice.issuedOn"), value: fmt.date(invoice.issuedAt) },
    isCredit
      ? { label: t("documents.creditNote.credits"), value: invoice.payment.creditedNumber ?? credited?.number ?? "" }
      : { label: t("documents.invoice.saleDate"), value: fmt.date(invoice.saleDate) },
    { label: t("documents.meta.order"), value: invoice.buyer.orderNumber },
  ].filter((row) => row.value);

  const blocks: DocumentBlock[] = [
    {
      kind: "table",
      columns: [
        { label: t("documents.columns.item"), width: 0.35 },
        { label: t("documents.columns.qty"), width: 0.07, align: "end" },
        { label: t("documents.columns.unitPriceExcl"), width: 0.14, align: "end" },
        { label: t("documents.columns.vatRate"), width: 0.1, align: "end" },
        { label: t("documents.columns.totalExcl"), width: 0.17, align: "end" },
        { label: t("documents.columns.totalIncl"), width: 0.17, align: "end" },
      ],
      rows: invoice.lines.map((line) => ({
        cells: [
          lineLabel(line, t),
          line.quantity === undefined ? "—" : String(line.quantity),
          line.unitPriceExcl === undefined ? "—" : money(line.unitPriceExcl),
          fmt.percent(line.vatRateBp),
          money(line.totalExcl),
          money(line.totalIncl),
        ],
        detail: lineDetail(line, t, money),
      })),
    },
  ];

  const totals: DocumentTotalRow[] = [
    { label: t("documents.invoice.totalExcl"), value: money(invoice.totalExcl) },
    { label: t("documents.invoice.totalVat"), value: money(invoice.totalTax) },
    { label: t(`${scope}.totalIncl`), value: money(invoice.totalIncl), emphasis: "strong" },
  ];
  if (!isCredit && invoice.payment.giftCard > 0) {
    totals.push(
      { label: t("documents.invoice.paidGiftCard"), value: money(invoice.payment.giftCard) },
      { label: t("documents.invoice.paidCard"), value: money(invoice.payment.charged) },
    );
  }
  blocks.push({ kind: "totals", rows: totals });

  blocks.push(
    { kind: "heading", text: t("documents.invoice.vatTitle") },
    {
      kind: "table",
      columns: [
        { label: t("documents.columns.vatRate"), width: 1 },
        { label: t("documents.columns.base"), width: 1, align: "end" },
        { label: t("documents.columns.vat"), width: 1, align: "end" },
        { label: t("documents.columns.totalIncl"), width: 1, align: "end" },
      ],
      rows: invoice.vat.map((row) => ({
        cells: [fmt.percent(row.vatRateBp), money(row.totalExcl), money(row.vatAmount), money(row.totalIncl)],
      })),
    },
  );

  if (isCredit) {
    const refundedOn = invoice.payment.refundedAt ? fmt.date(invoice.payment.refundedAt) : fmt.date(invoice.issuedAt);
    blocks.push({
      kind: "paragraph",
      tone: "notice",
      text: [
        t("documents.creditNote.notice", {
          invoice: invoice.payment.creditedNumber ?? credited?.number ?? "",
          date: credited ? fmt.date(credited.issuedAt) : fmt.date(invoice.saleDate),
          refundedOn,
        }),
        invoice.payment.refundMethod === "gift_card" ? t("documents.creditNote.toGiftCard") : t("documents.creditNote.toCard"),
      ].join(" "),
    });
  } else {
    blocks.push({
      kind: "paragraph",
      tone: "notice",
      text: t("documents.invoice.paid", { date: fmt.date(invoice.payment.paidAt ?? invoice.saleDate) }),
    });
    if (invoice.lines.some((line) => line.kind === "gift_card")) {
      blocks.push({ kind: "paragraph", tone: "muted", text: t("documents.invoice.giftCardNote") });
    }
    blocks.push({ kind: "paragraph", tone: "muted", text: t("documents.invoice.latePayment") });
  }

  const s = invoice.seller;
  return {
    lang: fmt.lang,
    title,
    meta,
    parties: [sellerParty(s, t, fmt), buyerParty(invoice, t, fmt)],
    blocks,
    footer: legalFooterLines(
      {
        name: s.legalName || s.storeName || "Global Toothgems",
        legalForm: s.legalForm,
        shareCapital: s.shareCapital,
        registrationNumber: s.registrationNumber,
        vatNumber: s.vatNumber,
        address: s.addressLines.join(", "),
        email: s.email,
      },
      t,
    ),
    pageLabel: (page, count) => t("documents.page", { page, count }),
    info: { title: `${title} ${invoice.number}`, author: s.legalName || s.storeName || "Global Toothgems" },
  };
}

/** "facture-FA-2026-000001.pdf" / "credit-note-AV-2026-000001.pdf". */
export function invoiceFileName(invoice: OrderInvoice, t: Translate): string {
  const scope = invoice.kind === "creditNote" ? "documents.creditNote" : "documents.invoice";
  const safe = invoice.number.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
  return `${t(`${scope}.fileName`)}-${safe}.pdf`;
}
