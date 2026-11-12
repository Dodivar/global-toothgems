import type { NextConfig } from "next";
import { POSTHOG_PROXY_PATH, posthogCloudHosts } from "./src/lib/posthogConfig";
import { assertProductionConfig } from "./src/lib/supabase/productionGuard";

// A production deployment never falls back to the mock data (AGENTS.md §4):
// without the Supabase variables the app would serve demo products, a demo
// payment and mock accounts. Vercel production builds stop here instead.
assertProductionConfig(process.env);

/**
 * See docs/migration-nextjs.md. Deployed on Vercel as a regular Next.js app
 * (no `output: "export"`): every screen is an App Router segment, and the
 * server runs the proxy, `/auth/confirm`, the session checks of the private
 * pages and the server-rendered public pages.
 */
const nextConfig: NextConfig = {
  // Only the Playwright auth tests set it, to run a second dev server beside
  // the first (two servers cannot share one build folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Metadata in the `<head>` of every response, not streamed in after the
  // body (phase 3.2): a hydrated page can change its language (and title)
  // before a streamed title arrives and overwrites it. The pages await the
  // same data as their metadata, so this costs no extra wait.
  htmlLimitedBots: /.*/,
  // PostHog's own addresses end with a slash (`/i/v0/e/`): Next.js must not
  // redirect them. The pages keep their slash-less address: `proxy.ts` does
  // that redirect itself (308), as Next.js did.
  skipTrailingSlashRedirect: true,
  // PostHog through our own domain (`instrumentation-client.ts`): ad blockers
  // cut requests to posthog.com, not to the site itself. Only for PostHog Cloud.
  async rewrites() {
    const cloud = posthogCloudHosts(process.env.NEXT_PUBLIC_POSTHOG_HOST);
    if (!cloud) return [];
    return [
      { source: `${POSTHOG_PROXY_PATH}/static/:path*`, destination: `${cloud.assets}/static/:path*` },
      { source: `${POSTHOG_PROXY_PATH}/array/:path*`, destination: `${cloud.assets}/array/:path*` },
      { source: `${POSTHOG_PROXY_PATH}/:path*`, destination: `${cloud.ingest}/:path*` },
    ];
  },
};

export default nextConfig;
