import type { NextConfig } from "next";

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
};

export default nextConfig;
