import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { jsonLdScript } from "../../src/lib/catalog/productMeta";
import { directoryCities, type DirectoryEntry } from "../../src/lib/glowbookDirectory";
import { localizedPath, parsePath, type Locale } from "../../src/lib/localeRoutes";
import { pageMeta, SITE_NAME, uiText } from "../../src/lib/pageMeta";
import { siteUrl } from "../../src/lib/siteUrl";
import { approximateVisitorOrigin, listDirectoryArtists } from "../../src/lib/studioWorkspace/serverDirectory";
import { ArtistDirectory } from "../../src/screens/ArtistDirectory";
import { publicPageMetadata } from "./metadata";

/**
 * The artist directory (decision 145): `/fr/artistes` · `/en/artists`, and
 * one page per city, `/fr/artistes/<city>` · `/en/artists/<city>` (same slug
 * in both languages). The server reads the listed artists on every request
 * (`serverDirectory.ts`) and renders the list — on the main page sorted from
 * the visitor's approximate area when the host knows it (decision 145 (j));
 * the map and the precise distance sorting are the browser's. A city nobody lists answers 404; a slug written
 * with capitals moves (308) to its lower-case address.
 *
 * JSON-LD: an `ItemList` of the artists' Glowbook pages — no address data,
 * since an area is only a rounded point, not a business address.
 */
export type DirectoryCityProps = { params: Promise<{ id: string }> };

async function cityFor(props: DirectoryCityProps, locale: Locale) {
  const { id } = await props.params;
  const key = decodeURIComponent(id);
  const artists = await listDirectoryArtists();
  const slug = key.toLowerCase();
  const city = directoryCities(artists).find((c) => c.slug === slug);
  if (!city) notFound();
  if (slug !== key) permanentRedirect(localizedPath("artistsCity", locale, { id: slug }));
  return { city, artists: artists.filter((a) => a.citySlug === slug), all: artists };
}

function itemList(artists: readonly DirectoryEntry[], locale: Locale, name: string) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: artists.length,
    itemListElement: artists.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: a.displayName,
      url: new URL(localizedPath("glowbook", locale, { id: a.handle }), base).toString(),
    })),
  };
}

export async function directoryMetadata(locale: Locale): Promise<Metadata> {
  const meta = pageMeta(parsePath(localizedPath("artists", locale)));
  return publicPageMetadata({
    title: meta.title,
    description: meta.description,
    locale,
    alternates: { fr: localizedPath("artists", "fr"), en: localizedPath("artists", "en") },
  });
}

export async function DirectoryPage({ locale }: { locale: Locale }) {
  const artists = await listDirectoryArtists();
  const approxOrigin = await approximateVisitorOrigin(artists);
  return (
    <>
      {artists.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList(artists, locale, uiText(locale, "directory.title"))) }} />
      )}
      <ArtistDirectory artists={artists} cities={directoryCities(artists)} city={null} approxOrigin={approxOrigin} />
    </>
  );
}

export async function directoryCityMetadata(props: DirectoryCityProps, locale: Locale): Promise<Metadata> {
  const { city } = await cityFor(props, locale);
  const fill = (key: string) => uiText(locale, key).replace("{{city}}", city.name).replace("{{count}}", String(city.count));
  return publicPageMetadata({
    title: `${fill("directory.city.metaTitle")} · ${SITE_NAME}`,
    description: fill("directory.city.metaDescription"),
    locale,
    alternates: {
      fr: localizedPath("artistsCity", "fr", { id: city.slug }),
      en: localizedPath("artistsCity", "en", { id: city.slug }),
    },
  });
}

export async function DirectoryCityPage({ props, locale }: { props: DirectoryCityProps; locale: Locale }) {
  const { city, artists, all } = await cityFor(props, locale);
  const name = uiText(locale, "directory.city.title").replace("{{city}}", city.name);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList(artists, locale, name)) }} />
      <ArtistDirectory artists={artists} cities={directoryCities(all)} city={city} />
    </>
  );
}
