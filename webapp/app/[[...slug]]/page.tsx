import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isKnownPath, parsePath } from "../../src/lib/localeRoutes";
import { pageMeta } from "../../src/lib/pageMeta";
import { loadCatalogSeed } from "../../src/lib/catalog/serverCatalog";
import { publicPageMetadata } from "../_public/metadata";
import { searchOf } from "../_public/search";
import { ClientOnly, ServerRendered } from "./client";

/**
 * Every address of the site without a page of its own yet, during the
 * migration: the React Router app decides what to show
 * (docs/migration-nextjs.md). The server already gives each public page its
 * `<head>` — title, description, canonical, the other language (hreflang) and
 * Open Graph — keeps private areas out of search engines, and answers 404 for
 * an address the app has no screen for. Public pages are rendered on the
 * server (their content is in the HTML) and hydrated in the browser; the
 * other areas still render in the browser only. Product pages have their own
 * segments (`app/fr/boutique/[slug]`, `app/en/shop/[slug]`).
 */
type Props = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pathOf = async ({ params }: Props) => `/${((await params).slug ?? []).join("/")}`;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const parsed = parsePath(await pathOf(props));
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

export default async function Page(props: Props) {
  const path = await pathOf(props);
  if (!isKnownPath(path)) notFound();
  const { locale, route } = parsePath(path);
  if (!locale || !route) return <ClientOnly />;
  return (
    <ServerRendered address={`${path}${searchOf(await props.searchParams)}`} locale={locale} catalog={await loadCatalogSeed(route.id)} />
  );
}
