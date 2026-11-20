import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { isSupabaseConfigured } from "../supabase/env";
import { createPublicServerSupabase } from "../supabase/publicServer";
import { BUCKETS } from "../supabase/storage";
import { approximateOriginFromHeaders, toDirectoryArtists, usableApproximateOrigin, type ApproximateOrigin, type DirectoryEntry } from "../glowbookDirectory";

/**
 * The artist directory as the server reads it (decision 145):
 * `glowbook_directory()` with the publishable key — exactly the artists an
 * anonymous visitor may see — and their pictures signed through the storage
 * policies that already open them on their Glowbook (approved profile
 * picture, approved creation renders).
 *
 * Read on every request, never cached: an artist who leaves the directory, a
 * moderator's take-down or the end of the plan must show at once, and the
 * picture links expire. In mock mode the directory is empty (no fixtures).
 */

const PICTURE_URL_TTL_SECONDS = 7 * 24 * 3600;

async function sign(client: ReturnType<typeof createPublicServerSupabase>, bucket: string, paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data } = await client.storage.from(bucket).createSignedUrls(paths, PICTURE_URL_TTL_SECONDS);
  for (const entry of data ?? []) if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  return urls;
}

export const listDirectoryArtists = cache(async (): Promise<DirectoryEntry[]> => {
  await connection();
  if (!isSupabaseConfigured) return [];
  const client = createPublicServerSupabase();
  const { data, error } = await client.rpc("glowbook_directory");
  if (error) throw new Error(`glowbook_directory failed: ${error.code ?? "unknown"}`);
  const artists = toDirectoryArtists(data);
  // A picture that cannot be signed falls back to the card's placeholder.
  const [covers, avatars] = await Promise.all([
    sign(client, BUCKETS.studioThumbnails, artists.flatMap((a) => (a.coverPath ? [a.coverPath] : []))),
    sign(client, BUCKETS.glowbookMedia, artists.flatMap((a) => (a.avatarPath ? [a.avatarPath] : []))),
  ]);
  return artists.map(({ avatarPath, coverPath, ...a }) => ({
    ...a,
    avatarUrl: avatarPath ? (avatars.get(avatarPath) ?? null) : null,
    coverUrl: coverPath ? (covers.get(coverPath) ?? null) : null,
  }));
});

/**
 * Decision 145 (j), to confirm (owner's request 2026-11-20, "target where the
 * visitor is"): the main page sorts from the approximate area the host
 * derives from the visitor's IP address. Read from the request headers on
 * the server, used for this response only, never stored or logged. Set to
 * false to go back to the list sorted by name until the visitor searches.
 */
export const SORT_FROM_APPROXIMATE_AREA = true;

/** The visitor's approximate area for this request, when known and near at least one listed artist. */
export async function approximateVisitorOrigin(artists: readonly DirectoryEntry[]): Promise<ApproximateOrigin | null> {
  if (!SORT_FROM_APPROXIMATE_AREA || !artists.length) return null;
  const list = await headers();
  return usableApproximateOrigin(
    approximateOriginFromHeaders((name) => list.get(name)),
    artists,
  );
}
