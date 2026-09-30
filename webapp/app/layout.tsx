import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { isLocale, parsePath } from "../src/lib/localeRoutes";
import { LOCALE_HEADER, PATH_HEADER } from "../src/lib/localeHeader";
import { loadCatalogSeed } from "../src/lib/catalog/serverCatalog";
import { AppProviders } from "../src/AppProviders";
import { siteUrl } from "../src/lib/siteUrl";
import "../src/index.css";

/* What `index.html` carried under Vite. Next.js adds the charset and viewport
   tags itself. Each page adds its own title and description. */
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Global Toothgems",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  // The page's language, from the proxy (address prefix, else the visitor's preference).
  const asked = requestHeaders.get(LOCALE_HEADER);
  const locale = isLocale(asked) ? asked : "fr";
  // What the stores start from on a public page: the part of the catalogue it
  // shows (`loadCatalogSeed`), read for the address the proxy saw. Read once
  // per page load: a later client-side navigation keeps what the stores hold
  // and they load the rest themselves.
  const route = parsePath((requestHeaders.get(PATH_HEADER) ?? "/").split("?")[0]).route;
  const catalog = route ? await loadCatalogSeed(route.id) : undefined;
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap"
        />
      </head>
      <body>
        <div id="root">
          <AppProviders locale={locale} catalog={catalog}>
            {children}
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
