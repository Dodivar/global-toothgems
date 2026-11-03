/**
 * Brand constants shared by the page metadata. The artwork itself lives in
 * `assets/logo/vector/` (SVG masters, reconstructed from the original PNGs on
 * 2026-11-02, sparkle in the site's main blue `--gt-blue-300`); the icons, the share card and the e-mail logo are exports of it.
 */

/** The share card used when a page has no picture of its own (`public/og-default.png`). */
export const DEFAULT_SHARE_IMAGE = {
  url: "/og-default.png",
  width: 1200,
  height: 630,
  alt: "Global Toothgems",
} as const;
