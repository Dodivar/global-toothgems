import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isKnownPath, parsePath } from "../../src/lib/localeRoutes";
import { pageMeta } from "../../src/lib/pageMeta";
import { ClientOnly } from "./client";

/**
 * Every address of the site, during the migration: the React Router app
 * decides what to show (docs/migration-nextjs.md). The server already gives
 * each public page its `<head>` — title, description, canonical, the other
 * language (hreflang) and Open Graph — keeps private areas out of search
 * engines, and answers 404 for an address the app has no screen for.
 */
type Props = { params: Promise<{ slug?: string[] }> };

const pathOf = async ({ params }: Props) => `/${((await params).slug ?? []).join("/")}`;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const parsed = parsePath(await pathOf(props));
  const meta = pageMeta(parsed);
  const robots = meta.indexed ? undefined : { index: false, follow: false };
  if (!meta.alternates || !meta.locale) return { title: meta.title, robots };

  const canonical = meta.alternates[meta.locale];
  return {
    title: meta.title,
    description: meta.description,
    robots,
    alternates: {
      canonical,
      // x-default: the language-negotiating home, else the English page (the fallback language).
      languages: { fr: meta.alternates.fr, en: meta.alternates.en, "x-default": parsed.route?.id === "home" ? "/" : meta.alternates.en },
    },
    openGraph: {
      type: "website",
      siteName: "Global Toothgems",
      title: meta.title,
      description: meta.description,
      url: canonical,
      locale: meta.locale === "fr" ? "fr_FR" : "en_GB",
      alternateLocale: meta.locale === "fr" ? "en_GB" : "fr_FR",
    },
  };
}

export default async function Page(props: Props) {
  if (!isKnownPath(await pathOf(props))) notFound();
  return <ClientOnly />;
}
