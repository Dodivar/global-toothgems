import { feedItems, renderProductFeed, type FeedLocale } from "../../../src/lib/catalog/productFeed";
import { listFeedCatalog } from "../../../src/lib/catalog/serverCatalog";
import { siteUrl } from "../../../src/lib/siteUrl";

/**
 * The product feeds for Google Merchant Center (free listings) and the Meta
 * catalogue, one per language: `/feeds/google-fr.xml` (French pages) and
 * `/feeds/google-en.xml` (English pages). Read with the publishable key, so
 * only what any visitor may read (`lib/catalog/productFeed.ts` decides what
 * goes in). Rendered per request from the cached catalogue reads (60 s), and
 * kept by the CDN for a few minutes: the platforms fetch it once a day.
 * Mock mode has no feed (the fixtures are not products to advertise).
 * German comes later (`docs/product-feeds.md`).
 */
export const dynamic = "force-dynamic";

const FEEDS: Record<string, FeedLocale> = {
  "google-fr.xml": "fr",
  "google-en.xml": "en",
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const locale = FEEDS[(await params).file];
  if (!locale) return new Response("Not found", { status: 404 });
  let catalog: Awaited<ReturnType<typeof listFeedCatalog>>;
  try {
    catalog = await listFeedCatalog();
  } catch (error) {
    // A feed with wrong prices or a missing half is worse than none: the platforms keep the last good fetch.
    console.error("[feeds] catalogue read failed", error instanceof Error ? error.message : error);
    return new Response("Feed temporarily unavailable", { status: 503, headers: { "Retry-After": "600" } });
  }
  if (!catalog) return new Response("Not found", { status: 404 });
  const base = siteUrl();
  const items = feedItems(catalog.products, { locale, base, ...catalog });
  return new Response(renderProductFeed(items, { locale, base }), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600",
      "X-Robots-Tag": "noindex",
    },
  });
}
