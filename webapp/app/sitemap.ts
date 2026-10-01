import type { MetadataRoute } from "next";
import { productSlug } from "../src/lib/catalog/productSlugs";
import { listPublicProductSlugs } from "../src/lib/catalog/serverCatalog";
import { courseSlug } from "../src/lib/academy/publicCourse";
import { listPublicCourses } from "../src/lib/academy/serverAcademy";
import { LOCALES, localizedPath, PUBLIC_ROUTES } from "../src/lib/localeRoutes";
import { siteUrl } from "../src/lib/siteUrl";

/**
 * The indexed public pages, every product page and every published course's
 * sales page, each in French and English with its alternate (with its slug in
 * each language). Rendered per request: the catalogue and the Academy change
 * without a deploy.
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
  const courses = (await listPublicCourses()).flatMap((course) =>
    entry({
      fr: localizedPath("course", "fr", { id: courseSlug(course, "fr") }),
      en: localizedPath("course", "en", { id: courseSlug(course, "en") }),
    }),
  );
  return [...pages, ...products, ...courses];
}
