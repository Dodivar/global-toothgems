import type { Metadata } from "next";
import { NotFoundScreen, PublicChrome } from "../src/zones/public";

/*
 * An address the site has no page for: HTTP 404, and the usual 404 screen in
 * the storefront's chrome (docs/migration-nextjs.md, phases 3.1 and 5).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <PublicChrome>
      <NotFoundScreen />
    </PublicChrome>
  );
}
