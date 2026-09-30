import type { MetadataRoute } from "next";
import { localizedPath, PUBLIC_ROUTES } from "../src/lib/localeRoutes";
import { siteUrl } from "../src/lib/siteUrl";

/**
 * The indexed public pages, each in French and English with its alternate.
 * Product and course pages join once they are rendered on the server with
 * their data (phase 3.2 of docs/migration-nextjs.md).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  return PUBLIC_ROUTES.filter((route) => route.indexed && !route.fr.includes(":")).flatMap((route) =>
    (["fr", "en"] as const).map((locale) => ({
      url: url(localizedPath(route.id, locale)),
      alternates: { languages: { fr: url(localizedPath(route.id, "fr")), en: url(localizedPath(route.id, "en")) } },
    })),
  );
}
