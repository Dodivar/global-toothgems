import type { Product } from "../../data/products";
import { pick } from "../../data/types";
import { localizedPath, type Locale } from "../localeRoutes";
import { SITE_NAME } from "../pageMeta";
import { parseRichText, type RichInline } from "../richText";
import { toMinorUnits } from "./money";
import { productSlug } from "./productSlugs";

/**
 * What the server says about a product page (docs/migration-nextjs.md, phase
 * 3.2): its title, description, addresses in both languages and its
 * structured data (schema.org `Product`). Only what the page itself shows:
 * the product's name, description (or the line the page shows without one),
 * photos, price and availability. Pure, unit-tested.
 */

/** Search engines show about this many characters of a description. */
const DESCRIPTION_LENGTH = 160;

function inlineText(nodes: RichInline[]): string {
  return nodes.map((node) => (node.type === "text" ? node.text : inlineText(node.children))).join("");
}

/** A rich-text description (`lib/richText.ts`) as one line of plain text. */
export function richTextToPlain(source: string): string {
  return parseRichText(source)
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "quote":
          return block.lines.map(inlineText).join(" ");
        case "heading":
          return inlineText(block.content);
        case "list":
          return block.items.map(inlineText).join(" ");
        case "rule":
          return "";
      }
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut at a word boundary, with an ellipsis, when longer than `max`. */
export function truncate(text: string, max = DESCRIPTION_LENGTH): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

export function productAddresses(product: Product): Record<Locale, string> {
  return {
    fr: localizedPath("product", "fr", { id: productSlug(product, "fr") }),
    en: localizedPath("product", "en", { id: productSlug(product, "en") }),
  };
}

export function productTitle(product: Product, locale: Locale): string {
  return `${pick(product.name, locale)} · ${SITE_NAME}`;
}

/** The description the page shows, else its fallback line (`ProductDetail`). */
export function productDescription(product: Product, locale: Locale): string {
  const name = pick(product.name, locale);
  const text = product.description != null ? richTextToPlain(pick(product.description, locale)) : "";
  return truncate(text || `${name} — ${pick(product.subtitle, locale)}.`);
}

/** Exact decimal string of a display price ("49.00"), through minor units. */
function priceText(price: number): string {
  const minor = toMinorUnits(price);
  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

const AVAILABILITY = {
  out: "https://schema.org/OutOfStock",
  low: "https://schema.org/LimitedAvailability",
  in: "https://schema.org/InStock",
} as const;

/** schema.org `Product` for the page, with absolute URLs. */
export function productJsonLd(product: Product, locale: Locale, base: URL): Record<string, unknown> {
  const absolute = (path: string) => new URL(path, base).toString();
  const url = absolute(productAddresses(product)[locale]);
  const images = (product.gallery?.map((g) => g.src) ?? [product.image]).filter(Boolean).map(absolute);
  const currency = product.currency ?? "EUR";
  const prices = product.variants?.length ? product.variants.map((v) => v.price) : [product.price];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const availability = AVAILABILITY[product.stock ?? "in"];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pick(product.name, locale),
    description: productDescription(product, locale),
    ...(images.length > 0 ? { image: images } : {}),
    url,
    offers:
      low === high
        ? { "@type": "Offer", price: priceText(low), priceCurrency: currency, availability, url }
        : { "@type": "AggregateOffer", lowPrice: priceText(low), highPrice: priceText(high), offerCount: prices.length, priceCurrency: currency, availability, url },
    ...(product.reviewCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount } }
      : {}),
  };
}

/** JSON for an inline `<script type="application/ld+json">`: `<` escaped so text cannot close the tag. */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
