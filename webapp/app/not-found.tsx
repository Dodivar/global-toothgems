import type { Metadata } from "next";
import { PublicChrome } from "../src/zones/public";
import { BrowserOnly } from "../src/zones/BrowserOnly";
import { NotFound as NotFoundScreen } from "../src/screens/NotFound";

/*
 * An address the site has no page for: HTTP 404, and the usual 404 screen in
 * the storefront's chrome (docs/migration-nextjs.md, phases 3.1 and 5), shown
 * once in the browser: it names the address and offers "back" when the
 * visitor came from another page of the site.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <PublicChrome>
      <BrowserOnly>
        <NotFoundScreen />
      </BrowserOnly>
    </PublicChrome>
  );
}
