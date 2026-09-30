import type { Metadata } from "next";
import { ClientOnly } from "./[[...slug]]/client";

/*
 * An address the app has no screen for: HTTP 404, and the app renders its
 * own 404 screen, exactly as it always did (docs/migration-nextjs.md, phase 3).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  return <ClientOnly />;
}
