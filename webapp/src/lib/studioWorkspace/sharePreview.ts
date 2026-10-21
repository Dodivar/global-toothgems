import type { Metadata } from "next";

/**
 * The `<head>` of a read-only viewer page that social networks read for their
 * preview card (Facebook, X, Threads, WhatsApp, Pinterest — decision 101,
 * addendum 2026-10-21): the creation's name and description, its card render
 * as the Open Graph and Twitter image. Still kept out of search engines.
 *
 * Pure: the server modules fetch the row and sign the render.
 */

export interface SharePreview {
  name: string;
  description: string;
  /** Signed URL of the card render (480 × 360 JPEG), or null without one. */
  imageUrl: string | null;
  /** By whom, for a Glowbook creation ("Nova"). */
  author?: string | null;
}

const SITE = "Global Toothgems";
const RENDER_SIZE = { width: 480, height: 360 };

export function sharePreviewMetadata(preview: SharePreview): Metadata {
  const name = preview.name.trim();
  const parts = [name, preview.author?.trim() ?? "", SITE].filter(Boolean);
  const title = parts.join(" · ");
  const description = preview.description.trim().slice(0, 200) || undefined;
  const images = preview.imageUrl ? [{ url: preview.imageUrl, ...RENDER_SIZE, alt: name || SITE }] : undefined;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: SITE, title, description, ...(images ? { images } : {}) },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, ...(images ? { images: [images[0].url] } : {}) },
  };
}
