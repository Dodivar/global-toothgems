"use client";

import type { ReactNode } from "react";
import { AppShell } from "../AppShell";
import type { AppZone } from "../lib/appZones";
import { useHydrated } from "../lib/useHydrated";

/**
 * The chrome of a private zone whose screens are App Router segments
 * (docs/migration-nextjs.md, phase 5), rendered in the browser only, as the
 * zone apps were: these screens read `window`, `document` and `localStorage`
 * from their first render. The server sends the page without its content; a
 * client-side navigation renders it at once.
 */
export function ZoneChrome({ zone, children }: { zone: AppZone; children: ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <AppShell zone={zone}>{children}</AppShell>;
}
