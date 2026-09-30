import type { NextConfig } from "next";

/**
 * Phase 1 of docs/migration-nextjs.md: the React Router app runs client-side
 * inside the catch-all page `app/[[...slug]]`. Deployed on Vercel as a regular
 * Next.js app (no `output: "export"`): the catch-all answers every path, so
 * no rewrite file is needed, and later phases need the server (proxy, SSR).
 */
const nextConfig: NextConfig = {};

export default nextConfig;
