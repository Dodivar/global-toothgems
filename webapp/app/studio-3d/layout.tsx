import type { ReactNode } from "react";
import { ZoneChrome } from "../../src/zones/ZoneChrome";

/**
 * The Studio workspace — the editor and a shared design's viewer
 * (docs/migration-nextjs.md, phases 4–5): open to every visitor during the
 * preview, rendered in the browser only (WebGL exists nowhere else). The
 * sales and subscription pages are public pages (`/fr/studio-3d`).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <ZoneChrome zone="studio">{children}</ZoneChrome>;
}
