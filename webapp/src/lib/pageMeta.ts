import { resources } from "../i18n/resources";
import { COOKIE_POLICY } from "../data/legal/cookies";
import { LEGAL_NOTICE } from "../data/legal/legalNotice";
import { PRIVACY } from "../data/legal/privacy";
import { RETURNS } from "../data/legal/returns";
import { SHIPPING } from "../data/legal/shipping";
import { TERMS } from "../data/legal/terms";
import type { LegalDocument } from "../data/legal/types";
import { alternates, parsePath, type Locale, type ParsedPath, type PublicRouteId } from "./localeRoutes";

/**
 * Title and description of each public page, in each language — for the
 * server's `<head>` (canonical, hreflang, Open Graph: `app/[[...slug]]/page.tsx`)
 * and for the tab title while the app navigates (`App.tsx`). Only text the
 * pages already show is used (their heading and introduction); no copy is
 * written for search engines. Product pages are titled by their product
 * (`lib/catalog/productMeta.ts`); course pages keep the site name for now.
 */

export const SITE_NAME = "Global Toothgems";

type Text = { key: string } | { legal: LegalDocument } | { keys: string[] };

const PAGES: Partial<Record<PublicRouteId, { title: Text; description?: Text }>> = {
  home: { title: { key: "homeAlt.pageTitle" }, description: { key: "legal.about.intro" } },
  shop: { title: { key: "shop.title" }, description: { key: "shop.body" } },
  shapes: { title: { key: "shapesPage.title" }, description: { key: "shapesPage.body" } },
  colours: { title: { key: "colorsPage.title" }, description: { key: "colorsPage.body" } },
  cart: { title: { key: "cart.cartTitle" } },
  loyalty: { title: { key: "loyalty.heroTitle" }, description: { key: "loyalty.journeyBody" } },
  giftCard: { title: { keys: ["promo.store.headlineA", "promo.store.headlineB"] } },
  studio: { title: { key: "studio.hero.title" }, description: { key: "studio.hero.body" } },
  studioSubscribe: { title: { key: "studio.subscribe.title" }, description: { key: "studio.subscribe.body" } },
  academy: { title: { key: "academy.title" }, description: { key: "academy.body" } },
  help: { title: { key: "legal.hub.title" }, description: { key: "legal.hub.intro" } },
  faq: { title: { key: "legal.faq.title" }, description: { key: "legal.faq.intro" } },
  contact: { title: { key: "legal.contact.title" }, description: { key: "legal.contact.intro" } },
  about: { title: { key: "legal.about.title" }, description: { key: "legal.about.intro" } },
  legalNotice: { title: { legal: LEGAL_NOTICE }, description: { legal: LEGAL_NOTICE } },
  terms: { title: { legal: TERMS }, description: { legal: TERMS } },
  privacy: { title: { legal: PRIVACY }, description: { legal: PRIVACY } },
  cookies: { title: { legal: COOKIE_POLICY }, description: { legal: COOKIE_POLICY } },
  shipping: { title: { legal: SHIPPING }, description: { legal: SHIPPING } },
  returns: { title: { legal: RETURNS }, description: { legal: RETURNS } },
};

/** A UI string by its dotted key, as plain text (no markup, no line breaks). */
export function uiText(locale: Locale, key: string): string {
  let node: unknown = resources[locale].translation;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string") throw new Error(`Missing UI string ${locale}:${key}`);
  return node.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function read(text: Text, part: "title" | "intro", locale: Locale): string {
  if ("legal" in text) return text.legal[part][locale];
  if ("keys" in text) return text.keys.map((key) => uiText(locale, key)).join(" ");
  return uiText(locale, text.key);
}

export interface PageMeta {
  title: string;
  description?: string;
  /** Both languages of the page, when it is a public page. */
  alternates: Record<Locale, string> | null;
  locale: Locale | null;
  /** Public page meant to be indexed. */
  indexed: boolean;
}

export function pageMeta(parsed: ParsedPath): PageMeta {
  const { route, locale } = parsed;
  const page = route ? PAGES[route.id] : undefined;
  if (!route || !locale || !page) {
    return { title: SITE_NAME, alternates: alternates(parsed), locale, indexed: Boolean(route?.indexed) };
  }
  const heading = read(page.title, "title", locale).replace(/[.!]$/, "");
  return {
    title: route.id === "home" ? heading : `${heading} · ${SITE_NAME}`,
    description: page.description ? read(page.description, "intro", locale) : undefined,
    alternates: alternates(parsed),
    locale,
    indexed: route.indexed,
  };
}

/** The tab title for an address. */
export function titleFor(address: string | ParsedPath): string {
  return pageMeta(typeof address === "string" ? parsePath(address) : address).title;
}
