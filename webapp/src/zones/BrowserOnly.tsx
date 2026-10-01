"use client";

import type { ReactNode } from "react";
import { useHydrated } from "../lib/useHydrated";

/**
 * Content rendered in the browser only, as it always was: screens that read
 * `window`, `document` or `localStorage` from their first render (sign-in,
 * registration, recovery, system pages, the private zones). The server sends
 * the page without it; a client-side navigation renders it at once.
 */
export function BrowserOnly({ children }: { children: ReactNode }) {
  return useHydrated() ? children : null;
}
