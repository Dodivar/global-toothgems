"use client";

import dynamic from "next/dynamic";
import ClientApp, { ServerApp } from "../../src/ClientApp";
import type { Locale } from "../../src/lib/localeRoutes";

/* The public zone's app rendered in the browser only, for its pages that are
   not rendered on the server yet (sign-in, registration, recovery, system
   pages, the 404 page): they read `window`, `document` and `localStorage`
   from the first render. */
const BrowserOnlyApp = dynamic(() => import("../../src/ClientApp"), { ssr: false });

export function ClientOnly() {
  return <BrowserOnlyApp />;
}

/**
 * A public page (phase 3.2): the React Router app rendered on the server at
 * this address, in this language, from the catalogue the server read (the
 * stores of the root layout), then hydrated by the browser — the content is
 * in the HTML the server sends.
 */
export function ServerRendered({ address, locale }: { address: string; locale: Locale }) {
  return typeof window === "undefined" ? <ServerApp address={address} locale={locale} /> : <ClientApp />;
}
