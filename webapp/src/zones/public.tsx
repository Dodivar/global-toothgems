"use client";

import type { ReactNode } from "react";
import { AppShell } from "../AppShell";

/**
 * The storefront's chrome — header, footer, cookie banner — around the public
 * zone's pages (`app/(public)`: public pages, sign-in, registration and
 * recovery, system pages) and the 404 page, rendered on the server with the
 * page (docs/migration-nextjs.md, phase 5).
 */
export function PublicChrome({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
