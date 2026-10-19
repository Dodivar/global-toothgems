import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { isSupabaseConfigured } from "../supabase/env";
import { createPublicServerSupabase } from "../supabase/publicServer";
import { BUCKETS } from "../supabase/storage";
import { toPublicGlowbook, type PublicGlowbook, type PublicGlowbookItem } from "./glowbook";

/**
 * An artist's Glowbook as the server reads it for its public page (decision
 * 99): `studio_public_showcase(handle)` with the publishable key, exactly what
 * an anonymous visitor may see — approved page, approved creations, author
 * with Studio access — and the renders signed through the storage policy
 * that opens exactly those files.
 *
 * Read on every request, never cached: edits of approved creations are live,
 * a moderator's take-down or the end of the author's access must show at
 * once, and the render links are signed (they expire). In mock mode there is
 * no Glowbook (no fixtures): the page answers 404.
 */

/** Renders stay signed this long: the page's images and its Open Graph image (link previews fetch it later). */
const RENDER_URL_TTL_SECONDS = 7 * 24 * 3600;

export interface PublicGlowbookPage extends Omit<PublicGlowbook, "items"> {
  items: (PublicGlowbookItem & { imageUrl: string | null })[];
  /** The approved profile picture and banner (decision 100), signed; null for none. */
  avatarUrl: string | null;
  bannerUrl: string | null;
}

export const findPublicGlowbook = cache(async (handle: string): Promise<PublicGlowbookPage | null> => {
  await connection();
  if (!isSupabaseConfigured) return null;
  const key = handle.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(key)) return null;
  const client = createPublicServerSupabase();
  const { data, error } = await client.rpc("studio_public_showcase", { p_handle: key });
  if (error) throw new Error(`studio_public_showcase failed: ${error.code ?? "unknown"}`);
  const glowbook = toPublicGlowbook(data);
  if (!glowbook) return null;

  const paths = glowbook.items.flatMap((i) => (i.thumbnailPath ? [i.thumbnailPath] : []));
  const urls = new Map<string, string>();
  if (paths.length) {
    // A render that cannot be signed falls back to the page's placeholder.
    const { data: signed } = await client.storage.from(BUCKETS.studioThumbnails).createSignedUrls(paths, RENDER_URL_TTL_SECONDS);
    for (const entry of signed ?? []) if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  // The approved pictures, signed through "anyone reads public Glowbook pictures".
  const media = [glowbook.look?.avatarPath, glowbook.look?.bannerPath].filter((p): p is string => !!p);
  const mediaUrls = new Map<string, string>();
  if (media.length) {
    const { data: signed } = await client.storage.from(BUCKETS.glowbookMedia).createSignedUrls(media, RENDER_URL_TTL_SECONDS);
    for (const entry of signed ?? []) if (entry.path && entry.signedUrl && !entry.error) mediaUrls.set(entry.path, entry.signedUrl);
  }
  const signedMedia = (path: string | null | undefined) => (path ? (mediaUrls.get(path) ?? null) : null);
  return {
    ...glowbook,
    avatarUrl: signedMedia(glowbook.look?.avatarPath),
    bannerUrl: signedMedia(glowbook.look?.bannerPath),
    items: glowbook.items.map((i) => ({ ...i, imageUrl: i.thumbnailPath ? (urls.get(i.thumbnailPath) ?? null) : null })),
  };
});
