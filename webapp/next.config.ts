import type { NextConfig } from "next";

/**
 * Phase 1 of docs/migration-nextjs.md: the React Router app runs client-side
 * inside the catch-all page `app/[[...slug]]`. Deployed on Vercel as a regular
 * Next.js app (no `output: "export"`): the catch-all answers every path, so
 * no rewrite file is needed, and the server runs the proxy and `/auth/confirm`.
 */
const nextConfig: NextConfig = {
  // Only the Playwright auth tests set it, to run a second dev server beside
  // the first (two servers cannot share one build folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
