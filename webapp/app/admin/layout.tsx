import type { ReactNode } from "react";
import { ZoneChrome } from "../../src/zones/ZoneChrome";

/**
 * The back office, rendered in the browser only (docs/migration-nextjs.md,
 * phases 4–5). The staff pages have their own layout, which answers 404 to
 * anyone who is not staff on the server.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <ZoneChrome>{children}</ZoneChrome>;
}
