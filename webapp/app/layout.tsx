import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../src/index.css";

/* What `index.html` carried under Vite. Next.js adds the charset and viewport
   tags itself. Pages that set their own title still do it client-side. */
export const metadata: Metadata = {
  title: "Global Toothgems",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
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
