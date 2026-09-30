import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { jsonLdScript, productAddresses, productDescription, productJsonLd, productTitle } from "../../src/lib/catalog/productMeta";
import { productSlug } from "../../src/lib/catalog/productSlugs";
import { findPublicProduct, loadCatalogSeed } from "../../src/lib/catalog/serverCatalog";
import { localizedPath, type Locale } from "../../src/lib/localeRoutes";
import { siteUrl } from "../../src/lib/siteUrl";
import { ServerRendered } from "../[[...slug]]/client";
import { publicPageMetadata } from "./metadata";
import { searchOf } from "./search";

/**
 * A product page, `/fr/boutique/<French slug>` and `/en/shop/<English slug>`
 * (per-language slugs, decided 2026-09-30). The server finds the product
 * (publishable key, RLS; the fixtures in mock mode) and:
 * - answers 404 when the shop does not sell it;
 * - moves (308) an address naming it by another language's slug, an older
 *   slug or its row id to its address in this language, query kept;
 * - gives the page its title, description, hreflang to the other language's
 *   slug, Open Graph image and structured data (schema.org Product).
 * The page itself is the React Router app's `ProductDetail`, rendered on the
 * server and hydrated in the browser.
 */
export type ProductPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function productFor(props: ProductPageProps, locale: Locale) {
  const { slug } = await props.params;
  const key = decodeURIComponent(slug);
  const product = await findPublicProduct(key);
  if (!product) notFound();
  const own = productSlug(product, locale);
  const address = `${localizedPath("product", locale, { id: own })}${searchOf(await props.searchParams)}`;
  if (own !== key) permanentRedirect(address);
  return { product, address };
}

export async function productMetadata(props: ProductPageProps, locale: Locale): Promise<Metadata> {
  const { product } = await productFor(props, locale);
  const image = product.gallery?.[0]?.src ?? product.image;
  return publicPageMetadata({
    title: productTitle(product, locale),
    description: productDescription(product, locale),
    locale,
    alternates: productAddresses(product),
    image: image || undefined,
  });
}

export async function ProductPage({ props, locale }: { props: ProductPageProps; locale: Locale }) {
  const { product, address } = await productFor(props, locale);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(product, locale, siteUrl())) }} />
      <ServerRendered address={address} locale={locale} catalog={await loadCatalogSeed("product")} />
    </>
  );
}
