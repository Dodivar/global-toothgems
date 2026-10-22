/**
 * The layout content of the back-in-stock e-mail (decision 90): the product as a
 * card with its picture when it has one, and the button to its page. Pure; the
 * template body (staff-written) says the rest. Labels are fr/en; anything else
 * falls back to English, as the layout chrome does.
 */
import { type Block, details, paragraph, productCard } from "./components.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";

export interface RestockedProduct {
  productName: string;
  /** The option the customer asked for (colour, size…), when the product sells options. */
  variantName: string | null;
  /** The product's slug in the request's language. */
  productSlug: string;
  /** Object path in the public `product-media` bucket, or null. */
  imagePath: string | null;
}

const LABELS = {
  fr: {
    eyebrow: "De retour en boutique",
    badge: "Disponible",
    viewProduct: "Voir le produit",
    oneOff: "Cette alerte était unique : vous ne recevrez plus d'e-mail pour cet article.",
  },
  en: {
    eyebrow: "Back in the shop",
    badge: "Available",
    viewProduct: "View the product",
    oneOff: "This alert was a one-off: you will not get another e-mail about this item.",
  },
} as const;

/** "Name — Option", as the e-mail and its subject name the item. */
export function restockedItemName(item: Pick<RestockedProduct, "productName" | "variantName">): string {
  return item.variantName ? `${item.productName} — ${item.variantName}` : item.productName;
}

/** The product page in the e-mail's language (the site redirects an outdated slug). */
export function productPageUrl(siteUrl: string, locale: string, slug: string): string {
  const lang = chromeLocale(locale);
  return `${siteUrl.replace(/\/+$/, "")}/${lang}/${lang === "fr" ? "boutique" : "shop"}/${encodeURIComponent(slug)}`;
}

/** Public address of a `product-media` object; null without an https base or a path. */
export function productImageUrl(mediaBaseUrl: string | undefined, path: string | null): string | null {
  if (!mediaBaseUrl?.startsWith("https://") || !path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${mediaBaseUrl.replace(/\/+$/, "")}/${encoded}`;
}

export function backInStockContent(
  item: RestockedProduct,
  locale: string,
  siteUrl: string,
  mediaBaseUrl?: string,
): EmailContent {
  const l = LABELS[chromeLocale(locale)];
  const name = restockedItemName(item);
  const link = { label: l.viewProduct, url: productPageUrl(siteUrl, locale, item.productSlug) };
  const imageUrl = productImageUrl(mediaBaseUrl, item.imagePath);
  const blocks: Block[] = [];
  if (imageUrl) blocks.push(productCard({ imageUrl, imageAlt: name, name, badge: { label: l.badge, tone: "success" }, link }));
  blocks.push(paragraph(l.oneOff));
  return { eyebrow: l.eyebrow, primaryAction: link, blocks };
}

/** One line of the daily stock digest (decision 106): a product, or one of its options. */
export interface StockDigestItem {
  productName: string;
  variantName: string | null;
  sku: string | null;
  status: "out_of_stock" | "low_stock";
  /** Sellable quantity: on hand minus the reservations of orders awaiting payment. */
  available: number;
  threshold: number;
}

/** Items listed per section; the rest is counted ("and 12 more"), the back office has the full list. */
const DIGEST_LIST_CAP = 100;

const DIGEST_LABELS = {
  fr: {
    eyebrow: "Stock",
    out: "Rupture de stock",
    low: "Stock bas",
    outValue: "0 disponible",
    lowValue: (available: number, threshold: number) => `${available} disponible${available > 1 ? "s" : ""} (seuil ${threshold})`,
    more: (n: number) => `… et ${n} autre${n > 1 ? "s" : ""} : voir la liste complète dans l’administration.`,
    open: "Ouvrir les produits",
  },
  en: {
    eyebrow: "Stock",
    out: "Out of stock",
    low: "Low stock",
    outValue: "0 available",
    lowValue: (available: number, threshold: number) => `${available} available (threshold ${threshold})`,
    more: (n: number) => `… and ${n} more: see the full list in the back office.`,
    open: "Open the products",
  },
} as const;

/** "Name — Option (SKU)", as the digest names an item. */
export function digestItemName(item: Pick<StockDigestItem, "productName" | "variantName" | "sku">): string {
  const name = item.variantName ? `${item.productName} — ${item.variantName}` : item.productName;
  return item.sku ? `${name} (${item.sku})` : name;
}

/** Counts per status, for the subject and the body of the template. */
export function stockDigestCounts(items: StockDigestItem[]): { out: number; low: number } {
  const out = items.filter((i) => i.status === "out_of_stock").length;
  return { out, low: items.length - out };
}

/** The two lists (out of stock first) and the button to the products screen. Pure. */
export function stockDigestContent(items: StockDigestItem[], locale: string, siteUrl: string): EmailContent {
  const l = DIGEST_LABELS[chromeLocale(locale)];
  const blocks: Block[] = [];
  const section = (title: string, list: StockDigestItem[], value: (i: StockDigestItem) => string) => {
    if (list.length === 0) return;
    blocks.push(details({
      title: `${title} · ${list.length}`,
      rows: list.slice(0, DIGEST_LIST_CAP).map((i) => ({ label: digestItemName(i), value: value(i) })),
    }));
    if (list.length > DIGEST_LIST_CAP) blocks.push(paragraph(l.more(list.length - DIGEST_LIST_CAP)));
  };
  section(l.out, items.filter((i) => i.status === "out_of_stock"), () => l.outValue);
  section(l.low, items.filter((i) => i.status === "low_stock"), (i) => l.lowValue(i.available, i.threshold));
  return {
    eyebrow: l.eyebrow,
    primaryAction: { label: l.open, url: `${siteUrl.replace(/\/+$/, "")}/admin/produits` },
    blocks,
  };
}
