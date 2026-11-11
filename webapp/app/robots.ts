import type { MetadataRoute } from "next";
import { siteUrl } from "../src/lib/siteUrl";

/**
 * Private areas stay out of search engines (their pages also say `noindex`).
 * The back office is not listed (decided 2026-11-11): robots.txt is public,
 * and naming it would advertise an address that answers 404 to anyone but staff.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/compte", "/auth/", "/academy/lecon", "/academy/mes-formations/", "/studio-3d/atelier", "/fr/panier", "/en/cart"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
