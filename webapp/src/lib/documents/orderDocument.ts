import type { StoreDetails } from "../../data/adminSettings";
import type { Order, OrderAddress } from "../../data/orders";
import { pick } from "../../data/types";
import { addressLines } from "../storeDetails";
import type { BusinessDocument, DocumentBlock, DocumentParty, DocumentTotalRow } from "./template.ts";
import { legalFooterLines, type DocumentFormat, type Translate } from "./legal.ts";

export type { DocumentFormat, Translate } from "./legal.ts";

/**
 * A member's order as the "bon de commande" PDF: the lines frozen at
 * purchase time and every amount the database recorded (nothing is
 * recomputed), the store as seller, the billing and delivery addresses, the
 * refunds, and the notice that this is not an invoice — invoices need the
 * legal sequential numbering the database does not have yet. Pure: the
 * caller passes the translator and the formatters of the page's language.
 */


/**
 * The order's amounts in the order they add up, labelled — shared by the
 * order page and the PDF so the two always read the same.
 */
export function orderAmountRows(order: Order, t: Translate, money: (minor: number) => string): (DocumentTotalRow & { key: string })[] {
  const { amounts } = order;
  const goodsDiscounts = order.discounts.filter((d) => d.goodsAmount > 0);
  const shippingDiscounts = order.discounts.filter((d) => d.shippingAmount > 0);
  const otherDiscount = amounts.discount - goodsDiscounts.reduce((sum, d) => sum + d.goodsAmount, 0);
  const rows: (DocumentTotalRow & { key: string })[] = [
    { key: "subtotal", label: t("account.orderDetail.subtotal"), value: money(amounts.subtotal) },
    ...goodsDiscounts.map((d, i) => ({ key: `d${i}`, label: d.code ? `${d.label} (${d.code})` : d.label, value: `−${money(d.goodsAmount)}` })),
  ];
  // A discount not itemised in order_discounts (should not happen): shown as one line so the sum still reads.
  if (otherDiscount > 0) rows.push({ key: "discount", label: t("account.orderDetail.discount"), value: `−${money(otherDiscount)}` });
  if (order.ships) {
    rows.push({
      key: "shipping",
      label: t("account.orderDetail.shipping"),
      value: amounts.shipping === 0 ? t("account.orderDetail.shippingFree") : money(amounts.shipping),
    });
  }
  shippingDiscounts.forEach((d, i) =>
    rows.push({ key: `s${i}`, emphasis: "muted", label: t("account.orderDetail.shippingDiscount", { label: d.label }), value: `−${money(d.shippingAmount)}` }),
  );
  if (!amounts.taxIncluded && amounts.tax > 0) rows.push({ key: "tax", label: t("account.orderDetail.tax"), value: money(amounts.tax) });
  rows.push({ key: "total", emphasis: "strong", label: t("account.orderDetail.total"), value: money(amounts.total) });
  if (amounts.taxIncluded && amounts.tax > 0) rows.push({ key: "taxIncluded", emphasis: "muted", label: t("account.orderDetail.taxIncluded"), value: money(amounts.tax) });
  if (amounts.giftCard > 0) {
    rows.push({ key: "giftCard", label: t("account.orderDetail.giftCard"), value: money(amounts.giftCard) });
    rows.push({ key: "charged", label: t("account.orderDetail.charged"), value: money(amounts.charged) });
  }
  if (amounts.refunded > 0) rows.push({ key: "refunded", label: t("account.orderDetail.refunded"), value: `−${money(amounts.refunded)}` });
  return rows;
}

function addressParty(title: string, address: OrderAddress | undefined, fmt: DocumentFormat): DocumentParty | null {
  if (!address) return null;
  return {
    title,
    lines: [
      address.name,
      address.company ?? "",
      ...address.lines,
      [address.postalCode, address.city].filter(Boolean).join(" "),
      address.region ?? "",
      address.countryCode ? fmt.country(address.countryCode) : "",
      address.phone ?? "",
    ],
  };
}

/** The store as the seller block; only what Settings holds, nothing invented. */
export function sellerParty(store: StoreDetails | null, t: Translate, fmt: DocumentFormat): DocumentParty {
  if (!store) return { title: t("documents.seller"), lines: ["Global Toothgems"] };
  return {
    title: t("documents.seller"),
    lines: [
      store.legalName.trim() || store.storeName.trim(),
      ...addressLines(store),
      store.country ? fmt.country(store.country) : "",
      store.supportEmail.trim() || store.businessEmail.trim(),
      store.showPhone ? store.phone.trim() : "",
    ],
  };
}

/** The store's legal mentions as Settings holds them today (the order form). */
export function legalFooter(store: StoreDetails | null, t: Translate): string[] {
  if (!store) return ["Global Toothgems"];
  return legalFooterLines(
    {
      name: store.legalName.trim() || store.storeName.trim(),
      legalForm: store.legalForm.trim(),
      shareCapital: store.shareCapital.trim(),
      registrationNumber: store.registrationNumber.trim(),
      vatNumber: store.vatNumber.trim(),
      address: addressLines(store).join(", "),
      email: store.supportEmail.trim() || store.businessEmail.trim(),
    },
    t,
  );
}

export function orderDocument(order: Order, store: StoreDetails | null, t: Translate, fmt: DocumentFormat, issuedOn: string): BusinessDocument {
  const money = (minor: number) => fmt.money(minor, order.currency);
  const anyDiscount = order.lines.some((line) => line.discountAmount > 0);
  const title = t("documents.order.title");

  const lines: DocumentBlock = {
    kind: "table",
    columns: [
      { label: t("documents.columns.item"), width: anyDiscount ? 0.44 : 0.53 },
      { label: t("documents.columns.qty"), width: 0.09, align: "end" },
      { label: t("documents.columns.unitPrice"), width: 0.16, align: "end" },
      ...(anyDiscount ? [{ label: t("documents.columns.discount"), width: 0.14, align: "end" as const }] : []),
      { label: t("documents.columns.total"), width: 0.17, align: "end" },
    ],
    rows: order.lines.map((line) => ({
      cells: [
        pick(line.name, fmt.lang),
        String(line.qty),
        money(line.unitAmount),
        ...(anyDiscount ? [line.discountAmount > 0 ? `−${money(line.discountAmount)}` : "—"] : []),
        money(line.totalAmount),
      ],
      detail: line.variant ? pick(line.variant, fmt.lang) : undefined,
    })),
  };

  const blocks: DocumentBlock[] = [
    { kind: "heading", text: t("account.orderDetail.itemsTitle") },
    lines,
    { kind: "totals", rows: orderAmountRows(order, t, money).map(({ key: _key, ...row }) => row) },
  ];

  if (order.refunds.length > 0) {
    blocks.push(
      { kind: "heading", text: t("account.orderDetail.refundsTitle") },
      {
        kind: "table",
        columns: [
          { label: t("documents.columns.date"), width: 0.2 },
          { label: t("documents.columns.reason"), width: 0.4 },
          { label: t("documents.columns.status"), width: 0.2 },
          { label: t("documents.columns.amount"), width: 0.2, align: "end" },
        ],
        rows: order.refunds.map((refund) => ({
          cells: [
            fmt.date(refund.processedOn ?? refund.requestedOn),
            t(`account.orderDetail.refundReason.${refund.reason}`),
            t(`account.orderDetail.refundStatus.${refund.status}`),
            money(refund.amount),
          ],
        })),
      },
    );
  }

  if (order.ships && order.shippingMethod) {
    blocks.push({ kind: "paragraph", text: t("account.orderDetail.shippingMethod", { method: order.shippingMethod }) });
  }
  blocks.push({ kind: "paragraph", tone: "notice", text: t("documents.order.notice") });

  const parties = [
    sellerParty(store, t, fmt),
    addressParty(t("account.orderDetail.billingAddress"), order.billingAddress, fmt),
    order.ships ? addressParty(t("account.orderDetail.shippingAddress"), order.shippingAddress, fmt) : null,
  ].filter((p): p is DocumentParty => p !== null);

  return {
    lang: fmt.lang,
    title,
    meta: [
      { label: t("documents.meta.reference"), value: order.reference },
      { label: t("documents.meta.orderDate"), value: fmt.date(order.placedOn) },
      { label: t("documents.meta.issuedOn"), value: fmt.date(issuedOn) },
    ],
    parties,
    blocks,
    footer: legalFooter(store, t),
    pageLabel: (page, count) => t("documents.page", { page, count }),
    info: { title: `${title} ${order.reference}`, author: store?.legalName.trim() || store?.storeName.trim() || "Global Toothgems" },
  };
}

/** "bon-de-commande-GT-1042.pdf" / "order-form-GT-1042.pdf". */
export function orderDocumentFileName(reference: string, t: Translate): string {
  const safe = reference.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "order";
  return `${t("documents.order.fileName")}-${safe}.pdf`;
}
