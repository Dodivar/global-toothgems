/**
 * The site's public origin, for absolute URLs in metadata, the sitemap and
 * robots.txt. `SITE_URL` when set (server-only, e.g. the custom domain), else
 * the production domain Vercel provides, else the local dev server.
 */
export function siteUrl(): URL {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return new URL(configured);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  return new URL(`http://localhost:${process.env.PORT || 5173}`);
}
