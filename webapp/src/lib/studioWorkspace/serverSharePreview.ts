import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "../supabase/env";
import { createPublicServerSupabase } from "../supabase/publicServer";
import { BUCKETS } from "../supabase/storage";
import { SHARE_TOKEN_PATTERN } from "./share";
import { findPublicGlowbook } from "./serverGlowbook";
import type { SharePreview } from "./sharePreview";

/** Link previews fetch the image later: the signed render lasts as long as the Glowbook's. */
const RENDER_URL_TTL_SECONDS = 7 * 24 * 3600;

/**
 * What a share link's viewer page tells link previews: the creation's name,
 * description and render, read as a visitor (`studio_shared_creation_preview`,
 * migration 20261021172034; the render signed through "anyone reads renders of
 * shared creations"). Null for an unknown or revoked link, or in mock mode.
 */
export const findSharedCreationPreview = cache(async (token: string): Promise<SharePreview | null> => {
  if (!isSupabaseConfigured || !SHARE_TOKEN_PATTERN.test(token)) return null;
  const client = createPublicServerSupabase();
  const { data, error } = await client.rpc("studio_shared_creation_preview", { p_token: token });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  let imageUrl: string | null = null;
  if (typeof row.thumbnail_path === "string" && row.thumbnail_path) {
    const { data: signed } = await client.storage.from(BUCKETS.studioThumbnails).createSignedUrl(row.thumbnail_path, RENDER_URL_TTL_SECONDS);
    imageUrl = signed?.signedUrl ?? null;
  }
  return { name: typeof row.name === "string" ? row.name : "", description: typeof row.description === "string" ? row.description : "", imageUrl };
});

/** The same for a creation of a public Glowbook, from the page's own public read. */
export async function findGlowbookCreationPreview(handle: string, itemId: string): Promise<SharePreview | null> {
  if (!isSupabaseConfigured || !/^[a-z0-9._-]{3,30}$/i.test(handle)) return null;
  const glowbook = await findPublicGlowbook(handle.toLowerCase()).catch(() => null);
  const item = glowbook?.items.find((i) => i.id === itemId);
  if (!glowbook || !item) return null;
  return { name: item.name, description: item.description, imageUrl: item.imageUrl, author: glowbook.displayName || glowbook.handle };
}
