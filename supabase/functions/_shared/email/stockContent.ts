/**
 * The layout content of the back-in-stock e-mail (decision 90): the product as a
 * card with its picture when it has one, and the button to its page. Pure; the
 * template body (staff-written) says the rest. Labels are fr/en; anything else
 * falls back to English, as the layout chrome does.
 */
import { type Block, paragraph, productCard } from "./components.ts";
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
