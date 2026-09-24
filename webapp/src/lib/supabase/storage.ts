import { requireSupabase } from "./client";

/**
 * Storage buckets, as created by the migrations in `supabase/migrations`.
 *
 * | bucket          | visibility | read access                                         |
 * |-----------------|------------|-----------------------------------------------------|
 * | product-media   | public     | anyone, by URL (no listing)                         |
 * | avatars         | private    | owner and admins, through signed URLs               |
 * | review-photos   | private    | author and admins; anyone once the review is public |
 *
 * Paths stored in the database are object paths inside the bucket
 * (`products/<slug>/01.jpg`, `<user_id>/<file>`), never full URLs, so the
 * project or CDN can change without a data migration.
 */
export const BUCKETS = {
  productMedia: "product-media",
  avatars: "avatars",
  reviewPhotos: "review-photos",
} as const;

export type PrivateBucket = typeof BUCKETS.avatars | typeof BUCKETS.reviewPhotos;

/** Signed URLs live long enough for a page view, not long enough to be shared around. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Public URL of a catalogue image or video. No network call: the URL is
 * derived from the project URL and the path.
 */
export function productMediaUrl(path: string): string {
  return requireSupabase().storage.from(BUCKETS.productMedia).getPublicUrl(path).data.publicUrl;
}

/**
 * Signed URLs for objects of a private bucket, in one round trip.
 *
 * Storage RLS decides what the current user may read: a path they have no
 * right to simply comes back without a URL, and is left out of the result.
 */
export async function signedUrls(
  bucket: PrivateBucket,
  paths: string[],
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  const { data, error } = await requireSupabase().storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) throw error;
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

/** Signed URL of a single private object, or `null` when it is not readable. */
export async function signedUrl(
  bucket: PrivateBucket,
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  return (await signedUrls(bucket, [path], expiresIn)).get(path) ?? null;
}
