import type { MetadataRoute } from "next";
import { siteUrl } from "../src/lib/siteUrl";

/** Private areas stay out of search engines (their pages also say `noindex`). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/compte", "/admin", "/auth/", "/academy/lecon", "/academy/mes-formations/", "/studio-3d/atelier", "/fr/panier", "/en/cart"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
