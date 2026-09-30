"use client";

import dynamic from "next/dynamic";

/* The whole React Router app, rendered in the browser only: it reads
   `window`, `document` and `localStorage` from the first render. */
const ClientApp = dynamic(() => import("../../src/ClientApp"), { ssr: false });

export function ClientOnly() {
  return <ClientApp />;
}
