import type { ReactNode } from "react";
import { PublicChrome } from "../../src/zones/public";

/**
 * The public zone (docs/migration-nextjs.md, phases 4–5): public pages
 * (`/fr/…`, `/en/…`), sign-in, registration and recovery, system pages, in
 * the storefront's chrome, rendered on the server with the page.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
