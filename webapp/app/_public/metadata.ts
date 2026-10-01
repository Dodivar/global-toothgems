import type { Metadata } from "next";
import { parsePath, type Locale } from "../../src/lib/localeRoutes";
import { pageMeta } from "../../src/lib/pageMeta";

/**
 * The `<head>` of an indexed public page, in its language: canonical, the
 * other language (hreflang, x-default: the language-negotiating home, else
 * the English page), Open Graph. Shared by the catch-all page and the native
 * public pages (docs/migration-nextjs.md, phases 3.1–3.2).
 */
export function publicPageMetadata(page: {
  title: string;
  description?: string;
  locale: Locale;
  alternates: Record<Locale, string>;
  home?: boolean;
  indexed?: boolean;
  image?: string;
}): Metadata {
  const canonical = page.alternates[page.locale];
  return {
    title: page.title,
    description: page.description,
    robots: page.indexed === false ? { index: false, follow: false } : undefined,
    alternates: {
      canonical,
      languages: { fr: page.alternates.fr, en: page.alternates.en, "x-default": page.home ? "/" : page.alternates.en },
    },
    openGraph: {
      type: "website",
      siteName: "Global Toothgems",
      title: page.title,
      description: page.description,
      url: canonical,
      locale: page.locale === "fr" ? "fr_FR" : "en_GB",
      alternateLocale: page.locale === "fr" ? "en_GB" : "fr_FR",
      ...(page.image ? { images: [page.image] } : {}),
    },
  };
}

/**
 * The `<head>` of the page at an address, from the table of public pages
 * (`lib/pageMeta.ts`): a public page's own, else the site name and, for a
 * page search engines should not list, `noindex`.
 */
export function addressMetadata(path: string): Metadata {
  const parsed = parsePath(path);
  const meta = pageMeta(parsed);
  if (!meta.alternates || !meta.locale) {
    return { title: meta.title, robots: meta.indexed ? undefined : { index: false, follow: false } };
  }
  return publicPageMetadata({
    title: meta.title,
    description: meta.description,
    locale: meta.locale,
    alternates: meta.alternates,
    home: parsed.route?.id === "home",
    indexed: meta.indexed,
  });
}
