import type { MetadataRoute } from "next";
import { productSlug } from "../src/lib/catalog/productSlugs";
import { listPublicProductSlugs } from "../src/lib/catalog/serverCatalog";
import { LOCALES, localizedPath, PUBLIC_ROUTES } from "../src/lib/localeRoutes";
import { siteUrl } from "../src/lib/siteUrl";

/**
 * The indexed public pages and every product page, each in French and
 * English with its alternate (a product with its slug in each language).
 * Course pages join once the Academy has real data (docs/migration-nextjs.md,
 * phase 3.2). Rendered per request: the catalogue changes without a deploy.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  const entry = (paths: Record<(typeof LOCALES)[number], string>) =>
    LOCALES.map((locale) => ({ url: url(paths[locale]), alternates: { languages: { fr: url(paths.fr), en: url(paths.en) } } }));

  const pages = PUBLIC_ROUTES.filter((route) => route.indexed && !route.fr.includes(":")).flatMap((route) =>
    entry({ fr: localizedPath(route.id, "fr"), en: localizedPath(route.id, "en") }),
  );
  const products = (await listPublicProductSlugs()).flatMap((product) =>
    entry({
      fr: localizedPath("product", "fr", { id: productSlug(product, "fr") }),
      en: localizedPath("product", "en", { id: productSlug(product, "en") }),
    }),
  );
  return [...pages, ...products];
}
