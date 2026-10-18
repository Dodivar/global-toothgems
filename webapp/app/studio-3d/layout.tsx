import type { ReactNode } from "react";
import { ZoneChrome } from "../../src/zones/ZoneChrome";

/**
 * The Studio workspace — the editor and a shared design's viewer
 * (docs/migration-nextjs.md, phases 4–5), rendered in the browser only (WebGL
 * exists nowhere else). The editor shows its own access screens (trial,
 * sign-in, plans; decision 93) rather than a server redirect. The
 * sales and subscription pages are public pages (`/fr/studio-3d`).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <ZoneChrome>{children}</ZoneChrome>;
}
