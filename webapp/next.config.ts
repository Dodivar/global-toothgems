import type { NextConfig } from "next";

/**
 * See docs/migration-nextjs.md. Deployed on Vercel as a regular Next.js app
 * (no `output: "export"`): the catch-all page `app/[[...slug]]` answers every
 * path without a page of its own, so no rewrite file is needed, and the
 * server runs the proxy, `/auth/confirm` and the server-rendered public pages.
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
};

export default nextConfig;
