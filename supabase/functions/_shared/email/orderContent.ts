/**
 * The layout content of the order e-mails (confirmation, shipping, refund): the
 * blocks around the staff-written template body. Pure functions over the
 * order's snapshot — amounts are those frozen on the order, formatted here and
 * never recomputed. Labels are fr/en; anything else falls back to English, as
 * the layout chrome does.
 */
import { details, type DetailRow, notice, type OrderLine, orderSummary, type OrderTotal } from "./components.ts";
import { formatAmount } from "./format.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";

export interface OrderLineSnapshot {
  productName: string;
  variantName: string | null;
  quantity: number;
  /** order_items.subtotal_amount (unit price × quantity), as stored. */
  subtotal: number;
}

export interface AddressSnapshot {
  first_name?: unknown;
  last_name?: unknown;
  company?: unknown;
  address_line1?: unknown;
  address_line2?: unknown;
  postal_code?: unknown;
  city?: unknown;
  country_code?: unknown;
}

export interface OrderSnapshot {
  orderNumber: string;
  /** The member the order belongs to; null for a guest order. */
  userId: string | null;
  currency: string;
  paidAt: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  giftCard: number;
  amountDue: number;
  pricesIncludeTax: boolean;
  shippingMethodName: string | null;
  shippingAddress: AddressSnapshot | null;
  lines: OrderLineSnapshot[];
}

const LABELS = {
  fr: {
    order: (n: string) => `Commande ${n}`,
    shippingEyebrow: "Expédition",
    refundEyebrow: "Remboursement",
    summary: "Récapitulatif",
    paid: "Payée",
    quantity: (n: number) => `Qté ${n}`,
    subtotal: "Sous-total",
    discount: "Remise",
    shipping: "Livraison",
    free: "Offerte",
    giftCard: "Carte cadeau",
    totalInclTax: "Total TTC",
    totalExclTax: "Total HT",
    tax: (amount: string) => `dont TVA ${amount}`,
    vat: "TVA",
    amountPaid: "Montant payé",
    paymentConfirmed: "Paiement confirmé",
    paymentBody: (amount: string) => `Nous avons bien reçu votre paiement de ${amount}.`,
    paidWithGiftCard: "Votre commande est entièrement réglée par carte cadeau.",
    delivery: "Livraison",
    address: "Adresse",
    method: "Mode",
    viewOrder: "Voir ma commande",
    keepShopping: "Continuer mes achats",
    trackParcel: "Suivre mon colis",
    refundTitle: (amount: string) => `Remboursement de ${amount} effectué`,
    refundBody: "Le délai d’apparition sur votre relevé dépend de votre banque.",
    orderLabel: "Commande",
    amountLabel: "Montant",
  },
  en: {
    order: (n: string) => `Order ${n}`,
    shippingEyebrow: "Shipping",
    refundEyebrow: "Refund",
    summary: "Summary",
    paid: "Paid",
    quantity: (n: number) => `Qty ${n}`,
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Shipping",
    free: "Free",
    giftCard: "Gift card",
    totalInclTax: "Total incl. VAT",
    totalExclTax: "Total excl. VAT",
    tax: (amount: string) => `incl. VAT ${amount}`,
    vat: "VAT",
    amountPaid: "Amount paid",
    paymentConfirmed: "Payment confirmed",
    paymentBody: (amount: string) => `We have received your payment of ${amount}.`,
    paidWithGiftCard: "Your order is fully paid with a gift card.",
    delivery: "Delivery",
    address: "Address",
    method: "Method",
    viewOrder: "View my order",
    keepShopping: "Continue shopping",
    trackParcel: "Track my parcel",
    refundTitle: (amount: string) => `Refund of ${amount} issued`,
    refundBody: "How soon it shows on your statement depends on your bank.",
    orderLabel: "Order",
    amountLabel: "Amount",
  },
} as const;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function formatDate(iso: string | null, locale: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Paris" }).format(date);
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** The shipping address as a few lines, or null when the snapshot has no street (course-only order). */
export function addressLines(address: AddressSnapshot | null, locale: string): string | null {
  if (!address || !text(address.address_line1)) return null;
  const name = [text(address.first_name), text(address.last_name)].filter(Boolean).join(" ");
  const city = [text(address.postal_code), text(address.city)].filter(Boolean).join(" ");
  const country = text(address.country_code);
  return [
    name,
    text(address.company),
    text(address.address_line1),
    text(address.address_line2),
    [city, country ? countryName(country, locale) : ""].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");
}

export function memberOrderUrl(siteUrl: string, orderNumber: string): string {
  return `${siteUrl}/compte/commandes/${encodeURIComponent(orderNumber)}`;
}

function shopUrl(siteUrl: string, lang: "fr" | "en"): string {
  return `${siteUrl}/${lang}/${lang === "fr" ? "boutique" : "shop"}`;
}

export function orderConfirmationContent(order: OrderSnapshot, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const money = (amount: number) => formatAmount(amount, order.currency, lang);
  const minus = (amount: number) => `−${money(amount)}`;

  const lines: OrderLine[] = order.lines.map((line) => ({
    name: line.productName,
    detail: line.variantName ?? undefined,
    quantity: line.quantity,
    amount: money(line.subtotal),
  }));

  const totals: OrderTotal[] = [{ label: l.subtotal, amount: money(order.subtotal) }];
  if (order.discount > 0) totals.push({ label: l.discount, amount: minus(order.discount) });
  if (order.shippingMethodName || order.shipping > 0) {
    totals.push({ label: l.shipping, amount: order.shipping > 0 ? money(order.shipping) : l.free });
  }
  if (!order.pricesIncludeTax && order.tax > 0) totals.push({ label: l.vat, amount: money(order.tax) });
  const totalLabel = order.pricesIncludeTax ? l.totalInclTax : l.totalExclTax;
  if (order.giftCard > 0) {
    totals.push({ label: totalLabel, amount: money(order.total) });
    totals.push({ label: l.giftCard, amount: minus(order.giftCard) });
    totals.push({ label: l.amountPaid, amount: money(order.amountDue), strong: true });
  } else {
    totals.push({ label: totalLabel, amount: money(order.total), strong: true });
  }
  if (order.pricesIncludeTax && order.tax > 0) totals.push({ label: l.tax(money(order.tax)), amount: "" });

  const reference = [order.orderNumber, formatDate(order.paidAt, lang)].filter(Boolean).join(" · ");
  const blocks = [
    notice({
      tone: "success",
      title: l.paymentConfirmed,
      body: order.amountDue > 0 ? l.paymentBody(money(order.amountDue)) : l.paidWithGiftCard,
    }),
    orderSummary({
      title: l.summary,
      reference,
      status: { label: l.paid, tone: "success" },
      lines,
      totals,
      quantityLabel: l.quantity,
    }),
  ];

  const address = addressLines(order.shippingAddress, lang);
  if (address) {
    const rows: DetailRow[] = [{ label: l.address, value: address }];
    if (order.shippingMethodName) rows.push({ label: l.method, value: order.shippingMethodName });
    blocks.push(details({ title: l.delivery, rows }));
  }

  return {
    eyebrow: l.order(order.orderNumber),
    primaryAction: order.userId
      ? { label: l.viewOrder, url: memberOrderUrl(siteUrl, order.orderNumber) }
      : { label: l.keepShopping, url: shopUrl(siteUrl, lang) },
    secondaryAction: order.userId ? { label: l.keepShopping, url: shopUrl(siteUrl, lang) } : undefined,
    blocks,
  };
}

export function shippingContent(
  parcel: { orderNumber: string; trackingLink: string },
  locale: string,
): EmailContent {
  const l = LABELS[chromeLocale(locale)];
  return {
    eyebrow: `${l.shippingEyebrow} · ${l.order(parcel.orderNumber)}`,
    primaryAction: { label: l.trackParcel, url: parcel.trackingLink },
  };
}

export function refundContent(
  refund: { orderNumber: string; amount: number; currency: string },
  locale: string,
): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const amount = formatAmount(refund.amount, refund.currency, lang);
  return {
    eyebrow: `${l.refundEyebrow} · ${l.order(refund.orderNumber)}`,
    blocks: [
      notice({ tone: "info", title: l.refundTitle(amount), body: l.refundBody }),
      details({ rows: [{ label: l.orderLabel, value: refund.orderNumber }, { label: l.amountLabel, value: amount }] }),
    ],
  };
}
