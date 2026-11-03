import type { MetadataRoute } from "next";

/**
 * The web app manifest (`/manifest.webmanifest`): the name and icons a phone
 * uses when the site is added to its home screen. Icons are exports of
 * `assets/logo/vector/app-icon.svg`; the maskable one keeps the mark inside
 * Android's safe zone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Global Toothgems",
    short_name: "Global Toothgems",
    start_url: "/",
    display: "browser",
    background_color: "#fafaf8",
    theme_color: "#fafaf8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
