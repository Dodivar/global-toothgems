"use client";

import type { ReactNode } from "react";
import { AppShell } from "../AppShell";
import { BrowserOnly } from "./BrowserOnly";

/**
 * The chrome of a private zone whose screens are App Router segments
 * (docs/migration-nextjs.md, phase 5), rendered in the browser only, as the
 * zone apps of phase 4 were: these screens read `window`, `document` and `localStorage`
 * from their first render. The server sends the page without its content; a
 * client-side navigation renders it at once.
 */
export function ZoneChrome({ children }: { children: ReactNode }) {
  return (
    <BrowserOnly>
      <AppShell>{children}</AppShell>
    </BrowserOnly>
  );
}
