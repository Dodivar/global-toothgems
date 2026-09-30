import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { isLocale } from "../src/lib/localeRoutes";
import { LOCALE_HEADER } from "../src/lib/localeHeader";
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
  // The page's language, from the proxy (address prefix, else the visitor's preference).
  const locale = (await headers()).get(LOCALE_HEADER);
  return (
    <html lang={isLocale(locale) ? locale : "fr"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap"
        />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
